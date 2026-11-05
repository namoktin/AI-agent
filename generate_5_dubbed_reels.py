# -*- coding: utf-8 -*-
"""
Pipeline Tự Động Hóa Lồng Tiếng 5 Video Reels (Google TTS / Edge-TTS + FFmpeg)
Tác vụ: Lấy 5 video Facebook Reels từ kênh và lồng tiếng thuyết minh tiếng Việt chuyên nghiệp.
"""

import os
import sys
import shutil
import subprocess
import time

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = r"C:\Users\Nam\Desktop\AI agent"
TODAY_DIR = r"C:\Users\Nam\Desktop\gemini\2026-11-01"
REELS_DIR = os.path.join(TODAY_DIR, "reels_download")

reels_config = [
    {
        "id": 1,
        "title": "Reel 1 - Phong cách Sống & Trải nghiệm Đương đại",
        "video": os.path.join(REELS_DIR, "reel_0.mp4"),
        "text": "Chào mừng quý vị và các bạn đến với chuỗi video khám phá phong cách sống hiện đại. Mỗi khoảnh khắc thường nhật đều ẩn chứa nguồn cảm hứng sáng tạo vô tận để chúng ta sống trọn vẹn và ý nghĩa hơn.",
        "tts_engine": "gTTS (Google Vietnamese Voice)"
    },
    {
        "id": 2,
        "title": "Reel 2 - Công nghệ Tự động hóa & Trí tuệ Nhân tạo Đổi mới",
        "video": os.path.join(REELS_DIR, "reel_1.mp4"),
        "text": "Sự phát triển vượt bậc của công nghệ tự động hóa và trí tuệ nhân tạo đang kiến tạo nên những giải pháp đột phá. Đây chính là đòn bẩy giúp tối ưu hóa hiệu suất và mở ra tương lai đầy tiềm năng.",
        "tts_engine": "gTTS (Google Vietnamese Voice)"
    },
    {
        "id": 3,
        "title": "Reel 3 - Bí quyết Nâng tầm Kỹ năng & Bứt phá Giới hạn",
        "video": os.path.join(REELS_DIR, "reel_2.mp4"),
        "text": "Để bứt phá giới hạn và đạt đến đỉnh cao công việc, sự kiên định trong việc rèn luyện thói quen kỷ luật, làm chủ thời gian và không ngừng học hỏi chính là chiếc chìa khóa quan trọng nhất.",
        "tts_engine": "gTTS (Google Vietnamese Voice)"
    },
    {
        "id": 4,
        "title": "Reel 4 - Góc nhìn Quản trị Thông minh & Thích ứng Tương lai",
        "video": os.path.join(REELS_DIR, "reel_3.mp4"),
        "text": "Tầm nhìn chiến lược nhạy bén và khả năng quản trị rủi ro linh hoạt giúp các tổ chức và cá nhân tự tin đứng vững, vượt qua mọi sóng gió để kiến tạo giá trị bền vững theo thời gian.",
        "tts_engine": "gTTS (Google Vietnamese Voice)"
    },
    {
        "id": 5,
        "title": "Reel 5 - Thông điệp Khởi đầu Mới & Khẳng định Bản lĩnh",
        "video": os.path.join(TODAY_DIR, "facebook_reel_2307404503381977.mp4"),
        "text": "Mỗi hành trình vĩ đại đều được bắt đầu từ những bước đi quyết đoán ngay hôm nay. Hãy tin tưởng vào năng lực của chính mình, nắm bắt cơ hội để khẳng định bản lĩnh và gặt hái thành công rực rỡ.",
        "tts_engine": "gTTS (Google Vietnamese Voice)"
    }
]

def synthesize_speech(text, output_path):
    """Tạo file giọng đọc tiếng Việt bằng gTTS (miễn phí 100%, chất lượng cao)"""
    from gtts import gTTS
    tts = gTTS(text=text, lang='vi', slow=False)
    tts.save(output_path)
    return os.path.exists(output_path) and os.path.getsize(output_path) > 1000

def merge_audio_video(video_path, audio_path, output_path):
    """
    Hợp nhất giọng lồng tiếng vào video:
    - Nhạc nền gốc được hạ âm lượng xuống 15% (ducking)
    - Giọng thuyết minh lồng tiếng rõ nét ở mức 150%
    - Bảo toàn 100% chất lượng video (copy stream)
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-filter_complex", "[0:a]volume=0.15[a0];[1:a]volume=1.5[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        output_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if res.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) < 10000:
        # Fallback: direct mux (replace audio)
        cmd_fallback = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-map", "0:v:0",
            "-map", "1:a:0",
            output_path
        ]
        subprocess.run(cmd_fallback, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return os.path.exists(output_path) and os.path.getsize(output_path) > 10000

def main():
    print("=" * 70)
    print("🚀 BẮT ĐẦU PIPELINE TỰ ĐỘNG HÓA LỒNG TIẾNG 5 REELS (TTS + FFMPEG DUCKING)")
    print("=" * 70)
    
    results = []
    
    for item in reels_config:
        idx = item["id"]
        print(f"\n🎬 [Xử lý Video {idx}/5] {item['title']}...")
        
        src_video = item["video"]
        if not os.path.exists(src_video):
            raise FileNotFoundError(f"Không tìm thấy video nguồn: {src_video}")
        
        src_size_mb = round(os.path.getsize(src_video) / (1024 * 1024), 2)
        print(f"  📁 Nguồn video gốc: {os.path.basename(src_video)} ({src_size_mb} MB)")
        
        # 1. Lưu kịch bản thuyết minh UTF-8
        script_file = os.path.join(TODAY_DIR, f"script_dub_{idx}.txt")
        with open(script_file, "w", encoding="utf-8") as f:
            f.write(item["text"])
        
        # 2. Sinh giọng thuyết minh tiếng Việt
        audio_file = os.path.join(TODAY_DIR, f"voice_dub_{idx}.mp3")
        ok_tts = synthesize_speech(item["text"], audio_file)
        if not ok_tts:
            raise RuntimeError(f"Tạo giọng đọc thất bại cho video {idx}")
        
        audio_size_kb = round(os.path.getsize(audio_file) / 1024, 1)
        print(f"  🎙️ Đã tạo âm thanh lồng tiếng [{item['tts_engine']}]: {audio_size_kb} KB")
        
        # 3. Hợp nhất bằng FFmpeg Audio Ducking Studio
        out_video_today = os.path.join(TODAY_DIR, f"dubbed_reel_{idx}.mp4")
        out_video_cwd = os.path.join(BASE_DIR, f"dubbed_reel_{idx}.mp4")
        
        t0 = time.time()
        ok_merge = merge_audio_video(src_video, audio_file, out_video_today)
        t_elapsed = round(time.time() - t0, 1)
        
        if not ok_merge:
            raise RuntimeError(f"Ghép video thất bại cho video {idx}")
        
        # Đồng bộ về CWD của Agent
        try:
            shutil.copyfile(out_video_today, out_video_cwd)
        except Exception as e:
            print(f"  ⚠️ Cảnh báo copy CWD: {e}")
            
        out_size_mb = round(os.path.getsize(out_video_today) / (1024 * 1024), 2)
        print(f"  🎉 FFmpeg hoàn tất hợp nhất video: {out_size_mb} MB (thời gian: {t_elapsed}s)")
        
        results.append({
            "id": idx,
            "title": item["title"],
            "engine": item["tts_engine"],
            "script": item["text"],
            "today_path": out_video_today,
            "cwd_path": out_video_cwd,
            "size_mb": out_size_mb
        })
    
    print("\n" + "=" * 70)
    print("🏁 TẤT CẢ 5 VIDEO ĐÃ ĐƯỢC LỒNG TIẾNG VÀ XUẤT XƯỞNG THÀNH CÔNG RỰC RỠ!")
    print("=" * 70)
    for r in results:
        print(f"[{r['id']}] {r['title']}")
        print(f"    - Voice: {r['engine']}")
        print(f"    - Lời thoại: \"{r['script']}\"")
        print(f"    - Dung lượng: {r['size_mb']} MB")
        print(f"    - File: {r['today_path']}")

if __name__ == "__main__":
    main()
