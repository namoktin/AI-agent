#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
📄 UNIVERSAL DOCUMENT & PRESENTATION ENGINE
Supports:
- PDF inspection (pypdf, pdfplumber): page count, keyword search per page, table & text extraction
- PowerPoint inspection (python-pptx): slide count, keyword search per slide, shape/table text extraction
- Word inspection (python-docx): paragraph count, table extraction, full text
"""

import sys
import os
import re
import json
import argparse
from pathlib import Path

# Force UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

def inspect_pdf(file_path, action="summary", keyword=None, page_num=None):
    from pypdf import PdfReader
    reader = PdfReader(file_path)
    total_pages = len(reader.pages)
    
    if action == "page_count":
        return {"success": True, "file": str(file_path), "total_pages": total_pages}
        
    elif action == "search_keyword":
        if not keyword:
            return {"success": False, "error": "Thiếu keyword để tìm kiếm"}
        kw_lower = keyword.strip().lower()
        matching_pages = []
        for idx, page in enumerate(reader.pages):
            txt = page.extract_text() or ""
            if kw_lower in txt.lower():
                matching_pages.append(idx + 1)
        return {
            "success": True,
            "file": str(file_path),
            "keyword": keyword,
            "total_pages": total_pages,
            "matching_page_count": len(matching_pages),
            "matching_pages": matching_pages
        }
        
    elif action == "extract_page":
        p_idx = int(page_num or 1) - 1
        if 0 <= p_idx < total_pages:
            txt = reader.pages[p_idx].extract_text() or ""
            return {"success": True, "file": str(file_path), "page": p_idx + 1, "text": txt}
        return {"success": False, "error": f"Trang {page_num} nằm ngoài phạm vi (1-{total_pages})"}

    elif action in ("all_pages", "extract_all"):
        pages_data = []
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                for idx, page in enumerate(pdf.pages):
                    txt = (page.extract_text() or "").strip()
                    tables = page.extract_tables() or []
                    tables_formatted = []
                    for t in tables:
                        t_clean = [" | ".join([(c or "").strip().replace("\n", " ") for c in row]) for row in t if any(row)]
                        if t_clean:
                            tables_formatted.append("\n".join(t_clean))
                    pages_data.append({
                        "page": idx + 1,
                        "text": txt[:2500],
                        "tables": tables_formatted
                    })
        except Exception:
            for idx, page in enumerate(reader.pages):
                txt = (page.extract_text() or "").strip()
                pages_data.append({
                    "page": idx + 1,
                    "text": txt[:2000] # Cap per page to avoid token overflow
                })
        return {
            "success": True,
            "file": str(file_path),
            "type": "PDF",
            "total_pages": total_pages,
            "pages": pages_data
        }
        
    else: # summary
        preview = (reader.pages[0].extract_text() or "")[:1000] if total_pages > 0 else ""
        return {
            "success": True,
            "file": str(file_path),
            "type": "PDF",
            "total_pages": total_pages,
            "first_page_preview": preview
        }

def inspect_pptx(file_path, action="summary", keyword=None, slide_num=None):
    from pptx import Presentation
    prs = Presentation(file_path)
    total_slides = len(prs.slides)
    
    if action in ("slide_count", "page_count"):
        return {"success": True, "file": str(file_path), "total_slides": total_slides}
        
    elif action == "search_keyword":
        if not keyword:
            return {"success": False, "error": "Thiếu keyword để tìm kiếm"}
        kw_lower = keyword.strip().lower()
        matching_slides = []
        for idx, slide in enumerate(prs.slides):
            slide_text = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for paragraph in shape.text_frame.paragraphs:
                        slide_text.append(paragraph.text)
                if shape.has_table:
                    for row in shape.table.rows:
                        for cell in row.cells:
                            slide_text.append(cell.text)
            full_txt = " ".join(slide_text)
            if kw_lower in full_txt.lower():
                matching_slides.append(idx + 1)
        return {
            "success": True,
            "file": str(file_path),
            "keyword": keyword,
            "total_slides": total_slides,
            "matching_slide_count": len(matching_slides),
            "matching_slides": matching_slides
        }
        
    elif action == "extract_slide":
        s_idx = int(slide_num or 1) - 1
        if 0 <= s_idx < total_slides:
            slide = prs.slides[s_idx]
            lines = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    lines.append(shape.text_frame.text)
            return {"success": True, "file": str(file_path), "slide": s_idx + 1, "text": "\n".join(lines)}
        return {"success": False, "error": f"Slide {slide_num} nằm ngoài phạm vi (1-{total_slides})"}
        
    elif action in ("all_slides", "extract_all"):
        slides_data = []
        for idx, slide in enumerate(prs.slides):
            texts = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    texts.append(shape.text_frame.text)
                if shape.has_table:
                    for row in shape.table.rows:
                        for cell in row.cells:
                            texts.append(cell.text)
            slides_data.append({
                "slide": idx + 1,
                "text": " // ".join([t.strip().replace("\n", " ") for t in texts if t.strip()])
            })
        return {
            "success": True,
            "file": str(file_path),
            "type": "PPTX",
            "total_slides": total_slides,
            "slides": slides_data
        }
        
    else: # summary
        return {
            "success": True,
            "file": str(file_path),
            "type": "PPTX",
            "total_slides": total_slides
        }

def inspect_docx(file_path, action="summary", keyword=None):
    import docx
    doc = docx.Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    
    # Extract all tables into structured Markdown and lists
    tables_data = []
    for t_idx, table in enumerate(doc.tables):
        table_rows = []
        for row in table.rows:
            row_cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
            table_rows.append(row_cells)
        if table_rows:
            tables_data.append({
                "table_index": t_idx + 1,
                "row_count": len(table_rows),
                "col_count": len(table_rows[0]),
                "headers": table_rows[0],
                "rows": table_rows[1:] if len(table_rows) > 1 else [],
                "markdown": "\n".join([" | ".join(r) for r in table_rows])
            })
            
    full_narrative = "\n\n".join(paragraphs)
    full_tables_text = "\n\n".join([f"--- TABLE {t['table_index']} ---\n" + t["markdown"] for t in tables_data])
    full_content = (full_narrative + "\n\n" + full_tables_text).strip()

    if action in ("extract_all", "all", "read", "full"):
        return {
            "success": True,
            "type": "DOCX",
            "total_paragraphs": len(paragraphs),
            "total_tables": len(tables_data),
            "paragraphs": paragraphs,
            "tables": tables_data,
            "full_content": full_content[:15000]
        }

    if action == "search_keyword":
        kw_lower = (keyword or "").strip().lower()
        matches_p = [p for p in paragraphs if kw_lower in p.lower()]
        matches_t = []
        for t in tables_data:
            if kw_lower in t["markdown"].lower():
                matches_t.append(t["markdown"])
        return {
            "success": True,
            "keyword": keyword,
            "matching_paragraphs_count": len(matches_p),
            "matching_tables_count": len(matches_t),
            "matches": matches_p[:10] + matches_t[:5]
        }

    return {
        "success": True,
        "type": "DOCX",
        "total_paragraphs": len(paragraphs),
        "total_tables": len(tables_data),
        "preview": "\n".join(paragraphs[:5]),
        "tables_summary": [{"table_index": t["table_index"], "rows": t["row_count"], "cols": t["col_count"]} for t in tables_data]
    }

def inspect_text_container(file_path, action="summary", keyword=None):
    """Universal reader for plain text, markdown, CSV, TSV, JSON, XML, HTML, and other delimited files."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="latin-1", errors="replace") as f:
            content = f.read()

    lines = content.splitlines()
    total_lines = len(lines)
    ext = file_path.suffix.lower()

    if action in ("extract_all", "all", "read", "full"):
        return {
            "success": True,
            "type": ext.upper().lstrip("."),
            "file": str(file_path),
            "total_lines": total_lines,
            "full_content": content[:25000]
        }

    if action == "search_keyword":
        if not keyword:
            return {"success": False, "error": "Thiếu keyword để tìm kiếm"}
        kw_lower = keyword.strip().lower()
        matching_lines = [{"line_num": idx + 1, "text": l.strip()} for idx, l in enumerate(lines) if kw_lower in l.lower()]
        return {
            "success": True,
            "keyword": keyword,
            "matching_lines_count": len(matching_lines),
            "matches": matching_lines[:30]
        }

    return {
        "success": True,
        "type": ext.upper().lstrip("."),
        "file": str(file_path),
        "total_lines": total_lines,
        "preview": "\n".join(lines[:15]),
        "total_chars": len(content)
    }

def main():
    parser = argparse.ArgumentParser(description="Universal Document Inspection Engine")
    parser.add_argument("--file", required=True, help="Path to document file")
    parser.add_argument("--action", default="summary", help="Action to perform (summary, extract_all, all_pages, page_count, search_keyword, extract_page)")
    parser.add_argument("--keyword", default=None, help="Keyword to search in pages/slides")
    parser.add_argument("--page", type=int, default=None, help="Page or slide number to extract")
    args = parser.parse_args()

    # Normalize synonymous action names
    act = (args.action or "summary").lower()
    if act in ("all_pages", "read", "extract", "full", "read_all", "extract_all", "all"):
        act = "extract_all"
    elif act in ("page_count", "pages", "num_pages", "count"):
        act = "page_count"
    elif act in ("slide_count", "slides", "num_slides"):
        act = "slide_count"
    elif act in ("all_slides", "slides_all"):
        act = "all_slides"
    elif act in ("search", "find", "search_keyword"):
        act = "search_keyword"
    args.action = act
    
    p = Path(args.file)
    if not p.exists():
        print(json.dumps({"success": False, "error": f"File không tồn tại: {args.file}"}))
        sys.exit(1)
        
    ext = p.suffix.lower()
    try:
        if ext == ".pdf":
            res = inspect_pdf(p, action=args.action, keyword=args.keyword, page_num=args.page)
        elif ext in (".pptx", ".ppt"):
            res = inspect_pptx(p, action=args.action, keyword=args.keyword, slide_num=args.page)
        elif ext in (".docx", ".doc"):
            res = inspect_docx(p, action=args.action, keyword=args.keyword)
        elif ext in (".txt", ".md", ".csv", ".tsv", ".json", ".rtf", ".html", ".htm", ".xml", ".log", ".yaml", ".yml"):
            res = inspect_text_container(p, action=args.action, keyword=args.keyword)
        else:
            try:
                res = inspect_text_container(p, action=args.action, keyword=args.keyword)
            except Exception:
                res = {"success": False, "error": f"Định dạng chưa được hỗ trợ: {ext}"}
        print(json.dumps(res, ensure_ascii=False, indent=2))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
