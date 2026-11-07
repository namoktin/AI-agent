import sys
import os
import json
import argparse
from pathlib import Path

# Force UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

def classify_color(hex_str):
    """Classify standard 6-digit hex color into human-readable color family."""
    if not hex_str or not isinstance(hex_str, str) or len(hex_str) != 6:
        return "unknown"
    try:
        r = int(hex_str[0:2], 16)
        g = int(hex_str[2:4], 16)
        b = int(hex_str[4:6], 16)
        if r > 230 and g > 230 and b > 230:
            return "white"
        if r < 30 and g < 30 and b < 30:
            return "black"
        if (b > r + 20 and b > g + 10) or (b >= 180 and r < 80):
            return "blue"
        if g > r + 20 and g > b + 20:
            return "green"
        if r > 200 and g > 200 and b < 80:
            return "yellow"
        if r > 200 and g < 160 and b > 130:
            return "pink"
        if r > 180 and g < 80 and b < 80:
            return "red"
        if r > 200 and g > 100 and b < 50:
            return "orange"
        if r > 100 and g < 80 and b > 140:
            return "purple"
        return "mixed"
    except Exception:
        return "unknown"

def get_hex_color(color_obj):
    """Safely extract 6-char HEX color string from openpyxl Color object."""
    if not color_obj:
        return None
    try:
        # Check rgb (often ARGB like 'FFF478A7' or 'F478A7')
        rgb = getattr(color_obj, 'rgb', None)
        if rgb and isinstance(rgb, str):
            # If 8 chars (ARGB), take last 6 chars for RGB
            if len(rgb) == 8:
                return rgb[2:].upper()
            return rgb.upper()
        
        # Check theme/indexed fallback
        theme = getattr(color_obj, 'theme', None)
        indexed = getattr(color_obj, 'indexed', None)
        if theme is not None:
            return f"THEME_{theme}"
        if indexed is not None:
            return f"INDEXED_{indexed}"
    except Exception:
        pass
    return None

def inspect_spreadsheet(file_path, sheet_name=None, action="summary", target_cell=None, column=None, search_term=None):
    file_path = Path(file_path)
    if not file_path.exists():
        return {"success": False, "error": f"File not found: {file_path}"}

    ext = file_path.suffix.lower()

    if ext in ['.csv', '.tsv']:
        import pandas as pd
        sep = '\t' if ext == '.tsv' else ','
        df = pd.read_csv(file_path, sep=sep)
        cols = list(df.columns)
        summary = {
            "file_type": ext,
            "total_rows": len(df),
            "columns": cols,
            "numeric_columns": list(df.select_dtypes(include='number').columns),
            "head": df.head(5).to_dict(orient='records')
        }
        if action == "aggregate" and column and column in df.columns:
            series = pd.to_numeric(df[column], errors='coerce').dropna()
            summary["aggregation"] = {
                "column": column,
                "sum": float(series.sum()),
                "mean": float(series.mean()),
                "min": float(series.min()),
                "max": float(series.max()),
                "count": int(series.count())
            }
        return {"success": True, "data": summary}

    # Excel formats (.xlsx, .xlsm, etc.)
    import openpyxl
    try:
        wb = openpyxl.load_workbook(file_path, data_only=False)
        wb_data = openpyxl.load_workbook(file_path, data_only=True)
    except Exception as e:
        return {"success": False, "error": f"Failed to load workbook: {e}"}

    sheet_names = wb.sheetnames
    active_sheet_name = sheet_name if (sheet_name and sheet_name in sheet_names) else sheet_names[0]
    ws = wb[active_sheet_name]
    ws_data = wb_data[active_sheet_name]

    result = {
        "success": True,
        "file_name": file_path.name,
        "sheets": sheet_names,
        "active_sheet": active_sheet_name,
        "dimensions": {
            "max_row": ws.max_row,
            "max_column": ws.max_column
        }
    }

    if action == "summary":
        # Overview of all sheets and first rows of active sheet
        preview_rows = []
        for r in range(1, min(ws.max_row + 1, 10)):
            row_vals = []
            for c in range(1, min(ws.max_column + 1, 15)):
                val = ws_data.cell(row=r, column=c).value
                if val is None:
                    raw_f = ws.cell(row=r, column=c).value
                    if raw_f and str(raw_f).startswith("="):
                        val = f"[FORMULA: {raw_f}]"
                row_vals.append(str(val) if val is not None else "")
            preview_rows.append(row_vals)
        result["preview_rows"] = preview_rows
        result["total_sheets"] = len(sheet_names)

        # Automatic detection of maze / grid maps with START and END
        has_start_or_end = False
        for r in range(1, min(ws.max_row + 1, 30)):
            for c in range(1, min(ws.max_column + 1, 15)):
                val_check = str(ws_data.cell(row=r, column=c).value or "").strip().upper()
                if val_check in ["START", "END", "MAZE"]:
                    has_start_or_end = True
                    break
            if has_start_or_end:
                break
        if has_start_or_end:
            maze_res = inspect_spreadsheet(file_path, sheet_name=active_sheet_name, action="solve_maze")
            if maze_res.get("maze_solution"):
                result["maze_solution"] = maze_res["maze_solution"]

    elif action == "cell_style" or target_cell:
        # Deep style inspection for a specific cell (e.g. 'B4')
        if not target_cell:
            return {"success": False, "error": "target_cell required for cell_style action (e.g. 'A1', 'C5')"}
        
        cell = ws[target_cell]
        cell_val = ws_data[target_cell].value
        
        fill_hex = None
        if cell.fill and hasattr(cell.fill, 'start_color'):
            fill_hex = get_hex_color(cell.fill.start_color)
        if not fill_hex and cell.fill and hasattr(cell.fill, 'fgColor'):
            fill_hex = get_hex_color(cell.fill.fgColor)

        font_hex = None
        if cell.font and hasattr(cell.font, 'color'):
            font_hex = get_hex_color(cell.font.color)

        result["cell_info"] = {
            "coordinate": target_cell,
            "value": str(cell_val) if cell_val is not None else None,
            "formula": str(cell.value) if (str(cell.value or '').startswith('=')) else None,
            "fill_hex": fill_hex,
            "font_hex": font_hex,
            "font_bold": getattr(cell.font, 'bold', False),
            "font_name": getattr(cell.font, 'name', None),
            "number_format": getattr(cell, 'number_format', None)
        }

    elif action == "search_color" or action == "dump_color_grid":
        # Find all cells with non-empty fill colors or specific color
        colored_cells = []
        grid_matrix = []
        for r in range(1, ws.max_row + 1):
            row_colors = []
            for c in range(1, ws.max_column + 1):
                cl = ws.cell(row=r, column=c)
                hex_c = None
                if cl.fill and hasattr(cl.fill, 'start_color'):
                    hex_c = get_hex_color(cl.fill.start_color)
                if not hex_c and cl.fill and hasattr(cl.fill, 'fgColor'):
                    hex_c = get_hex_color(cl.fill.fgColor)
                
                # Exclude default white or transparent
                if hex_c and hex_c not in ['00000000', 'FFFFFFFF', '00FFFFFF']:
                    coord = cl.coordinate
                    val = ws_data.cell(row=r, column=c).value
                    colored_cells.append({
                        "cell": coord,
                        "value": str(val) if val is not None else None,
                        "hex_color": hex_c,
                        "color_name": classify_color(hex_c)
                    })
                row_colors.append(hex_c or "NONE")
            grid_matrix.append(row_colors)
        result["colored_cells"] = colored_cells[:500] # Full visible colored cells
        result["colored_cells_count"] = len(colored_cells)
        if action == "dump_color_grid":
            result["color_grid"] = grid_matrix

    elif action == "aggregate_all_sheets" or action == "aggregate":
        # Cross-sheet or single-sheet numerical sum / statistics
        import pandas as pd
        excel_file = pd.ExcelFile(file_path)
        aggregations = {}
        total_sum_all_sheets = 0.0

        target_sheets = sheet_names if action == "aggregate_all_sheets" else [active_sheet_name]
        for sname in target_sheets:
            try:
                df = pd.read_excel(file_path, sheet_name=sname)
                sheet_stats = {}
                for col in df.select_dtypes(include='number').columns:
                    series = df[col].dropna()
                    c_sum = float(series.sum())
                    sheet_stats[str(col)] = {
                        "sum": c_sum,
                        "mean": float(series.mean()),
                        "count": int(series.count())
                    }
                    if column and str(col).strip().lower() == str(column).strip().lower():
                        total_sum_all_sheets += c_sum
                aggregations[sname] = sheet_stats
            except Exception as se:
                aggregations[sname] = {"error": str(se)}

        result["aggregations_by_sheet"] = aggregations
        if column:
            result["total_sum_across_sheets"] = total_sum_all_sheets

    elif action == "search_text" and search_term:
        matches = []
        term_lower = str(search_term).lower()
        for sname in sheet_names:
            cur_ws = wb_data[sname]
            cur_raw_ws = wb[sname]
            for r in range(1, cur_ws.max_row + 1):
                for c in range(1, cur_ws.max_column + 1):
                    val = cur_ws.cell(row=r, column=c).value
                    raw_f = cur_raw_ws.cell(row=r, column=c).value
                    val_str = str(val) if val is not None else (str(raw_f) if raw_f is not None else "")
                    if val_str and term_lower in val_str.lower():
                        matches.append({
                            "sheet": sname,
                            "cell": cur_ws.cell(row=r, column=c).coordinate,
                            "value": val_str
                        })
        result["matches"] = matches[:50]
        result["total_matches"] = len(matches)

    elif action == "solve_maze" or action == "trace_grid":
        # Universal State-Space Search (BFS) on grid / maze
        # Finds START and END cells, avoids obstacle boundaries, and computes shortest path
        from collections import deque

        start_pos = None
        end_pos = None
        colors = {}
        for r in range(1, ws.max_row + 1):
            for c in range(1, ws.max_column + 1):
                cell = ws.cell(row=r, column=c)
                val = str(ws_data.cell(row=r, column=c).value or "").strip().upper()
                hex_c = None
                if cell.fill and hasattr(cell.fill, 'start_color'):
                    hex_c = get_hex_color(cell.fill.start_color)
                if not hex_c and cell.fill and hasattr(cell.fill, 'fgColor'):
                    hex_c = get_hex_color(cell.fill.fgColor)
                
                colors[(r, c)] = hex_c
                if val == "START":
                    start_pos = (r, c)
                elif val == "END":
                    end_pos = (r, c)

        if not start_pos:
            start_pos = (1, 1)

        start_color_name = classify_color(colors.get(start_pos))
        end_color_name = classify_color(colors.get(end_pos)) if end_pos else start_color_name

        def is_walkable(r, c):
            if (r, c) == start_pos or (r, c) == end_pos:
                return True
            c_name = classify_color(colors.get((r, c)))
            if start_color_name not in ("unknown", "white") and c_name == start_color_name:
                return True
            # Universal obstacle boundary check
            if c_name in ("blue", "black", "gray"):
                return False
            return True

        queue = deque([(start_pos, [start_pos])])
        visited_set = {start_pos}
        optimal_path = [start_pos]

        while queue:
            curr, path = queue.popleft()
            if end_pos and curr == end_pos:
                optimal_path = path
                break
            r, c = curr
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if 1 <= nr <= ws.max_row and 1 <= nc <= ws.max_column:
                    if (nr, nc) not in visited_set and is_walkable(nr, nc):
                        visited_set.add((nr, nc))
                        queue.append(((nr, nc), path + [(nr, nc)]))

        visited = optimal_path
        turns = []
        steps_per_turn = 2
        total_turns = (len(visited) - 1) // steps_per_turn
        for t in range(1, total_turns + 1):
            idx = t * steps_per_turn
            if idx < len(visited):
                pos = visited[idx]
                col = colors.get(pos)
                turns.append({
                    "turn": t,
                    "row": pos[0],
                    "column": pos[1],
                    "hex_color": col,
                    "color_name": classify_color(col)
                })

        result["maze_solution"] = {
            "start": start_pos,
            "end": end_pos,
            "path_length_steps": len(visited) - 1,
            "total_turns": total_turns,
            "turns": turns
        }

    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, help="Path to spreadsheet file")
    parser.add_argument("--sheet", default=None, help="Worksheet name")
    parser.add_argument("--action", default="summary", choices=["summary", "cell_style", "search_color", "dump_color_grid", "aggregate", "aggregate_all_sheets", "search_text", "solve_maze", "trace_grid"])
    parser.add_argument("--cell", default=None, help="Target cell (e.g. A1, B4)")
    parser.add_argument("--column", default=None, help="Column name to aggregate")
    parser.add_argument("--search", default=None, help="Text to search across sheets")
    args = parser.parse_args()

    res = inspect_spreadsheet(
        file_path=args.file,
        sheet_name=args.sheet,
        action=args.action,
        target_cell=args.cell,
        column=args.column,
        search_term=args.search
    )
    print(json.dumps(res, indent=2, ensure_ascii=False))

