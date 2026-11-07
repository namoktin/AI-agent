import sys
import os
import re
import json
import argparse
from pathlib import Path

# Force UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

def extract_youtube_video_id(url_or_id):
    if not url_or_id:
        return ""
    url_or_id = str(url_or_id).strip()
    # Match patterns like v=ID or /ID or bare 11-char ID
    m = re.search(r'(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})', url_or_id)
    if m:
        return m.group(1)
    if len(url_or_id) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', url_or_id):
        return url_or_id
    return url_or_id

def get_youtube_transcript(video_id, search_query=None):
    from youtube_transcript_api import YouTubeTranscriptApi
    try:
        api = YouTubeTranscriptApi()
        # In version 1.2.5, api.fetch(video_id) or YouTubeTranscriptApi().fetch(video_id)
        if hasattr(api, 'fetch'):
            snippets = api.fetch(video_id)
        else:
            snippets = YouTubeTranscriptApi.get_transcript(video_id)

        segments = []
        full_text_list = []
        for s in snippets:
            t = getattr(s, 'text', '') if not isinstance(s, dict) else s.get('text', '')
            st = getattr(s, 'start', 0.0) if not isinstance(s, dict) else s.get('start', 0.0)
            dur = getattr(s, 'duration', 0.0) if not isinstance(s, dict) else s.get('duration', 0.0)
            segments.append({
                "text": t,
                "start": round(float(st), 2),
                "duration": round(float(dur), 2)
            })
            full_text_list.append(t)

        full_transcript = " ".join(full_text_list)

        matched_context = None
        if search_query:
            q_clean = search_query.strip().lower()
            # Find the segment closest to query
            for idx, seg in enumerate(segments):
                if q_clean in seg['text'].lower():
                    # Return this segment and the next 1-2 segments (replies)
                    next_segs = segments[idx+1:idx+3]
                    matched_context = {
                        "matching_segment": seg,
                        "subsequent_response": " ".join([ns['text'] for ns in next_segs]),
                        "next_segments": next_segs
                    }
                    break

        return {
            "success": True,
            "video_id": video_id,
            "total_segments": len(segments),
            "full_transcript": full_transcript[:4000],
            "matched_context": matched_context,
            "segments_sample": segments[:15]
        }
    except Exception as e:
        # Fallback to yt-dlp video metadata extraction (title, description, tags) when subtitles are disabled
        try:
            import subprocess
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            cmd = ['yt-dlp', '--dump-json', '--no-playlist', video_url]
            proc = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=25)
            if proc.returncode == 0:
                meta = json.loads(proc.stdout)
                title = meta.get('title', '')
                desc = meta.get('description', '')
                tags = meta.get('tags', [])
                full_text = f"Title: {title}\n\nDescription: {desc}\n\nTags: {', '.join(tags)}"
                return {
                    "success": True,
                    "video_id": video_id,
                    "fallback_to_metadata": True,
                    "title": title,
                    "description": desc[:3000],
                    "tags": tags,
                    "full_transcript": full_text[:4000],
                    "note": f"Subtitles unavailable. Extracted official video title, description, and metadata via yt-dlp."
                }
        except Exception:
            pass
        return {"success": False, "error": f"Transcript extraction failed: {str(e)}"}

def extract_video_frames(video_path_or_url, timestamps=None, max_frames=5, output_dir=None):
    """Extract frames from local video or download stream using ffmpeg/yt-dlp."""
    base_dir = Path(__file__).resolve().parent.parent
    if not output_dir:
        output_dir = base_dir / "output" / "frames"
    else:
        output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    local_file = Path(video_path_or_url)
    is_url = "http://" in str(video_path_or_url) or "https://" in str(video_path_or_url)

    if is_url:
        import yt_dlp
        ydl_opts = {
            'format': 'best[height<=720]/best',
            'outtmpl': str(output_dir / 'downloaded_temp.%(ext)s'),
            'quiet': True,
            'max_filesize': 50 * 1024 * 1024 # 50MB max
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_path_or_url, download=True)
                downloaded_file = ydl.prepare_filename(info)
                local_file = Path(downloaded_file)
        except Exception as ye:
            return {"success": False, "error": f"Failed to download video stream: {ye}"}

    if not local_file.exists():
        return {"success": False, "error": f"Video file not found: {local_file}"}

    # Extract frames using imageio-ffmpeg
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        import subprocess

        extracted_paths = []
        if not timestamps:
            timestamps = [1, 5, 10, 15, 20][:max_frames]

        frame_images = []
        for i, ts in enumerate(timestamps):
            out_img = output_dir / f"frame_{i+1}_t{int(ts)}.png"
            cmd = [
                ffmpeg_exe, "-ss", str(ts),
                "-i", str(local_file),
                "-frames:v", "1",
                "-q:v", "2",
                "-y", str(out_img)
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
            if out_img.exists():
                extracted_paths.append(str(out_img))
                try:
                    import base64
                    with open(out_img, 'rb') as f_img:
                        b64 = base64.b64encode(f_img.read()).decode('utf-8')
                        frame_images.append({
                            "timestamp": ts,
                            "file": str(out_img),
                            "base64": b64
                        })
                except Exception:
                    pass

        return {
            "success": True,
            "total_frames_extracted": len(extracted_paths),
            "frame_files": extracted_paths,
            "frame_images": frame_images
        }
    except Exception as fe:
        return {"success": False, "error": f"Frame extraction error: {fe}"}

def transcribe_local_audio(audio_path):
    """Transcribe local audio file using whisper or SpeechRecognition."""
    p = Path(audio_path)
    if not p.exists():
        return {"success": False, "error": f"Audio file not found: {p}"}

    try:
        import whisper
        model = whisper.load_model("tiny")
        res = model.transcribe(str(p))
        return {
            "success": True,
            "text": res.get("text", "").strip(),
            "segments": [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in res.get("segments", [])]
        }
    except Exception as we:
        return {"success": False, "error": f"Audio transcription error: {we}"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", required=True, choices=["youtube_transcript", "extract_frames", "transcribe_audio"])
    parser.add_argument("--url", default=None, help="YouTube URL or Video ID")
    parser.add_argument("--file", default=None, help="Local file path")
    parser.add_argument("--query", default=None, help="Search query within transcript")
    parser.add_argument("--timestamps", default=None, help="Comma separated timestamps in seconds")
    args = parser.parse_args()

    if args.action == "youtube_transcript":
        vid = extract_youtube_video_id(args.url or args.file)
        res = get_youtube_transcript(vid, search_query=args.query)
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.action == "extract_frames":
        ts_list = [float(x.strip()) for x in args.timestamps.split(',')] if args.timestamps else None
        res = extract_video_frames(args.file or args.url, timestamps=ts_list)
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.action == "transcribe_audio":
        res = transcribe_local_audio(args.file)
        print(json.dumps(res, indent=2, ensure_ascii=False))

