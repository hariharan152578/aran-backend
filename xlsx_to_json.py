"""
xlsx_to_json.py
---------------
Extracts manufacturing model data and formula dependencies from any .xlsx file and saves as JSON.
Supports two output modes:
  - raw   : flat cell-by-cell dump (original behaviour)
  - smart : compiler-style dependency resolver and manufacturing category extractor

Usage:
    python xlsx_to_json.py <file.xlsx> [output.json] [--mode raw|smart]

Examples:
    python xlsx_to_json.py MyFile.xlsx                         # raw mode (default)
    python xlsx_to_json.py MyFile.xlsx result.json --mode smart
    python xlsx_to_json.py MyFile.xlsx --mode smart
"""

import sys
import json
import os
import re
from datetime import datetime, date
from openpyxl import load_workbook
from openpyxl.formula import Tokenizer
from openpyxl.utils import range_boundaries, get_column_letter, column_index_from_string


# ── Helpers ──────────────────────────────────────────────────────────────────

def safe_value(val):
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return str(val)
    if isinstance(val, float):
        return int(val) if val == int(val) else val
    return val


# ── Raw extraction (original behaviour) ──────────────────────────────────────

def extract_sheet_raw(ws_data, ws_formula):
    cells = []
    formula_summary = {}

    for row in ws_formula.iter_rows():
        for cell_f in row:
            cell_d    = ws_data.cell(row=cell_f.row, column=cell_f.column)
            raw_value   = cell_d.value
            raw_formula = cell_f.value

            if raw_value is None and raw_formula is None:
                continue

            is_formula  = isinstance(raw_formula, str) and raw_formula.startswith("=")
            formula_str = raw_formula if is_formula else None
            col_letter  = get_column_letter(cell_f.column)

            entry = {
                "cell":       cell_f.coordinate,
                "row":        cell_f.row,
                "col":        cell_f.column,
                "col_letter": col_letter,
                "value":      safe_value(raw_value),
                "formula":    formula_str,
                "data_type":  type(raw_value).__name__ if raw_value is not None else "null",
                "is_formula": is_formula,
            }
            cells.append(entry)
            if is_formula:
                formula_summary[cell_f.coordinate] = formula_str

    return cells, formula_summary


# ── Smart Dependency & Category Extraction ───────────────────────────────────

def parse_reference(ref_str, current_sheet):
    """Parses a cell reference string into (sheet_name, is_range, start, end)."""
    if "!" in ref_str:
        sheet_part, cell_part = ref_str.split("!", 1)
        sheet_name = sheet_part.strip("'")
    else:
        sheet_name = current_sheet
        cell_part = ref_str

    if ":" in cell_part:
        start, end = cell_part.split(":", 1)
        return sheet_name, True, start, end
    else:
        return sheet_name, False, cell_part, None


def expand_reference(ref_str, current_sheet):
    """Expands a single or range reference into a list of (sheet_name, coordinate) tuples."""
    sheet_name, is_range, start, end = parse_reference(ref_str, current_sheet)
    if not is_range:
        return [(sheet_name, start)]
    cell_part = f"{start}:{end}"
    min_col, min_row, max_col, max_row = range_boundaries(cell_part)
    cells = []
    for r in range(min_row, max_row + 1):
        for c in range(min_col, max_col + 1):
            col_letter = get_column_letter(c)
            cells.append((sheet_name, f"{col_letter}{r}"))
    return cells


def find_referenced_cells(cell_db):
    """Finds all cell coordinates that are referenced by formulas in the cell database."""
    referenced = set()
    for sheet_name, sheet_cells in cell_db.items():
        for coord, info in sheet_cells.items():
            if info["formula"]:
                try:
                    tok = Tokenizer(info["formula"])
                    for token in tok.items:
                        if token.type == "OPERAND" and token.subtype == "RANGE":
                            expanded = expand_reference(token.value, sheet_name)
                            for ref_sheet, ref_coord in expanded:
                                referenced.add((ref_sheet, ref_coord))
                except Exception:
                    pass
    return referenced


def clean_header_name(h_str):
    """Converts a header label string into a clean alphanumeric variable name."""
    if not h_str:
        return "input"
    s = re.sub(r'\(.*?\)', '', h_str)
    s = re.sub(r'[^a-zA-Z0-9_\s]', '', s)
    s = s.strip().lower()
    s = re.sub(r'\s+', '_', s)
    return s or "input"


def find_parent_header_search_left(sheet_cells, row, col):
    """Searches left in the specified row for the first non-empty cell value (handles merged cells)."""
    for c in range(col, 0, -1):
        cell = sheet_cells.get(f"{get_column_letter(c)}{row}")
        if cell and cell["value"] is not None:
            return str(cell["value"])
    return None


def detect_input_groups(cell_db, referenced_cells, sheet_names):
    """Identifies and groups contiguous non-formula cells referenced by formulas as inputs."""
    input_cells = set()
    for ref_sheet, ref_coord in referenced_cells:
        cell_info = cell_db.get(ref_sheet, {}).get(ref_coord)
        if cell_info and not cell_info["formula"]:
            val = cell_info["value"]
            if isinstance(val, str):
                val_clean = val.strip().lower()
                if (not re.match(r'^\d+$', val_clean) and 
                    "order" not in val_clean and 
                    "date" not in val_clean and 
                    not any(kw in val_clean for kw in ["width", "height"])):
                    continue
            input_cells.add((ref_sheet, ref_coord))

    input_groups = []
    for sheet_name in sheet_names:
        sheet_cells = cell_db.get(sheet_name, {})
        if not sheet_cells:
            continue
        max_col = max(c["col"] for c in sheet_cells.values())
        max_row = max(c["row"] for c in sheet_cells.values())

        for col in range(1, max_col + 1):
            col_letter = get_column_letter(col)
            col_inputs = []
            for r in range(1, max_row + 1):
                coord = f"{col_letter}{r}"
                if (sheet_name, coord) in input_cells:
                    col_inputs.append(r)
            
            if not col_inputs:
                continue
            
            col_inputs.sort()
            ranges = []
            start_row = col_inputs[0]
            prev_row = col_inputs[0]
            for row in col_inputs[1:]:
                if row == prev_row + 1:
                    prev_row = row
                else:
                    ranges.append((start_row, prev_row))
                    start_row = row
                    prev_row = row
            ranges.append((start_row, prev_row))
            
            for start, end in ranges:
                header_val = None
                for hr in range(start - 1, 0, -1):
                    cell_h = sheet_cells.get(f"{col_letter}{hr}")
                    if cell_h and cell_h["value"] is not None:
                        header_val = str(cell_h["value"])
                        break
                
                if not header_val and col > 1:
                    left_col = get_column_letter(col - 1)
                    cell_h = sheet_cells.get(f"{left_col}{start}")
                    if cell_h and cell_h["value"] is not None:
                        header_val = str(cell_h["value"])
                
                clean_name = clean_header_name(header_val)
                base_name = clean_name
                counter = 1
                while any(ig["name"] == clean_name and ig["sheet"] == sheet_name for ig in input_groups):
                    clean_name = f"{base_name}_{counter}"
                    counter += 1
                    
                input_groups.append({
                    "name":       clean_name,
                    "sheet":      sheet_name,
                    "col_letter": col_letter,
                    "start_row":  start,
                    "end_row":    end,
                    "header":     header_val or f"col_{col_letter}",
                    "range":      f"{col_letter}{start}:{col_letter}{end}" if start != end else f"{col_letter}{start}",
                    "type":       "array" if start != end else "scalar"
                })
    return input_groups


def strip_excel_if_empty(expr):
    """Strips Excel's outer IF empty check like IF(width='','',...) or IF(height='','',...)."""
    match = re.match(r'^IF\(\w+=""\s*,\s*""\s*,\s*(.*)\)$', expr, re.IGNORECASE)
    if match:
        inner = match.group(1)
        if inner.startswith("(") and inner.endswith(")"):
            inner = inner[1:-1]
        return inner
    return expr


def make_generalized_recursive_expander(cell_db, col_var_name, cell_var_name, sheet_repeating_rows):
    """Creates a closure that recursively expands Excel formulas into generalized variable references."""
    def expand_cell(sheet, coord, visited=None, root=True):
        if visited is None:
            visited = set()
        
        cell_key = (sheet, coord)
        if cell_key in visited:
            return f"[Circular:{sheet}!{coord}]"
        
        visited.add(cell_key)
        cell_info = cell_db.get(sheet, {}).get(coord)
        if not cell_info:
            visited.remove(cell_key)
            return "0"
        
        # 1. Cell-level input lookup (for scalars like order_no)
        if cell_key in cell_var_name or (sheet, coord) in cell_var_name:
            visited.remove(cell_key)
            return cell_var_name.get(cell_key, cell_var_name.get((sheet, coord)))
            
        # 2. Check if this cell is inside the repeating rows of the grid (excluding root expansion itself)
        rep_rows = sheet_repeating_rows.get(sheet, set())
        if not root and cell_info["row"] in rep_rows:
            col = cell_info["col"]
            if (sheet, col) in col_var_name:
                visited.remove(cell_key)
                return col_var_name[(sheet, col)]
                
        if not cell_info["formula"]:
            # Check if this cell's column is an input column
            col = cell_info["col"]
            if (sheet, col) in col_var_name:
                visited.remove(cell_key)
                return col_var_name[(sheet, col)]
                
            val = cell_info["value"]
            visited.remove(cell_key)
            if val is None:
                return "0"
            if isinstance(val, str):
                return f'"{val}"'
            return str(val)
            
        tok = Tokenizer(cell_info["formula"])
        expanded_tokens = []
        
        for token in tok.items:
            if token.type == "OPERAND" and token.subtype == "RANGE":
                ref_str = token.value
                ref_sheet, is_range, start, end = parse_reference(ref_str, sheet)
                rep_rows_ref = sheet_repeating_rows.get(ref_sheet, set())
                
                if is_range:
                    min_col, min_row, max_col, max_row = range_boundaries(f"{start}:{end}")
                    if min_row in rep_rows_ref and max_row in rep_rows_ref:
                        # Map full column range to generalized variable name
                        var_name = col_var_name.get((ref_sheet, min_col), ref_str)
                        expanded_tokens.append(var_name)
                    else:
                        ref_cells = expand_reference(ref_str, sheet)
                        expanded_strs = [expand_cell(rs, rc, visited, root=False) for rs, rc in ref_cells]
                        expanded_tokens.append(", ".join(expanded_strs))
                else:
                    min_col, min_row, _, _ = range_boundaries(start)
                    # If this single cell reference falls within repeating rows and maps to repeating variable
                    if min_row in rep_rows_ref and (ref_sheet, min_col) in col_var_name:
                        var_name = col_var_name[(ref_sheet, min_col)]
                        expanded_tokens.append(var_name)
                    else:
                        ref_cells = expand_reference(ref_str, sheet)
                        ref_sheet, ref_coord = ref_cells[0]
                        expanded_tokens.append(f"({expand_cell(ref_sheet, ref_coord, visited, root=False)})")
            else:
                expanded_tokens.append(token.value)
                
        visited.remove(cell_key)
        formula_expr = "".join(expanded_tokens)
        if formula_expr.startswith("="):
            formula_expr = formula_expr[1:]
        return formula_expr

    return expand_cell


def get_category_from_title(title):
    if not title:
        return "other"
    t = title.lower()
    if "profile" in t:
        return "profiles"
    if "hardware" in t:
        return "hardware"
    if "steel" in t:
        return "steel"
    if "glass" in t:
        return "glass"
    return "other"


def find_parent_title(cell_db, sheet_name, col_start, col_end, max_header_row=5):
    """Scans rows 1-5 for labels matching category keywords in the given column block."""
    for r in range(1, max_header_row + 1):
        for c in range(col_start, col_end + 1):
            val = cell_db[sheet_name].get(f"{get_column_letter(c)}{r}", {}).get("value")
            if val is not None:
                val_str = str(val).strip()
                if any(kw in val_str.lower() for kw in ["profile", "hardware", "steel", "glass"]):
                    return val_str
    return None


def determine_uom(desc, category):
    """Identifies Unit of Measure from description text clues."""
    desc_clean = desc.lower()
    if "(nos)" in desc_clean or "roller" in desc_clean or "stay" in desc_clean or ("lock" in desc_clean and "interlock" not in desc_clean) or "handle" in desc_clean or "handel" in desc_clean:
        return "Nos"
    if "(set)" in desc_clean:
        return "Set"
    if "(m)" in desc_clean:
        return "M"
    if category == "glass":
        return "Sq.ft"
    return "Length"


def determine_formula_type(uom):
    """Determines formula type (length, count, area) from Unit of Measure."""
    if uom in ["Length", "M"]:
        return "length"
    if uom in ["Nos", "Set"]:
        return "count"
    if uom in ["Sq.ft", "Sq.m"]:
        return "area"
    return "length"


def generate_id(name, item_type):
    """Generates an uppercase alphanumeric ID for an item based on its type and name."""
    s = re.sub(r'\(.*?\)', '', name)
    s = re.sub(r'[^a-zA-Z0-9\s_]', '', s)
    s = s.strip().upper()
    s = re.sub(r'[\s_]+', '_', s)
    
    prefix = ""
    t = item_type.lower()
    if t == "profile":
        prefix = "PROFILE_"
    elif t == "steel":
        prefix = "STEEL_"
    elif t == "hardware":
        prefix = "HW_"
    elif t == "glass":
        prefix = "GLASS_"
        
    return f"{prefix}{s}"


def extract_smart_manufacturing(wb_data, wb_formula):
    """Crawls sheets, parses tables, resolves dependencies, and returns categorized output JSON."""
    # 1. Populate cell database
    cell_db = {}
    for sheet_name in wb_formula.sheetnames:
        cell_db[sheet_name] = {}
        ws_data = wb_data[sheet_name]
        ws_formula = wb_formula[sheet_name]
        for r in range(1, ws_formula.max_row + 1):
            for c in range(1, ws_formula.max_column + 1):
                cell_f = ws_formula.cell(row=r, column=c)
                cell_d = ws_data.cell(row=r, column=c)
                val_data = cell_d.value
                val_formula = cell_f.value
                coord = cell_f.coordinate
                
                is_formula = isinstance(val_formula, str) and val_formula.startswith("=")
                cell_db[sheet_name][coord] = {
                    "value":      safe_value(val_data),
                    "formula":    val_formula if is_formula else None,
                    "is_formula": is_formula,
                    "row":        r,
                    "col":        c,
                }

    # 2. Build dependency set and identify input groups
    referenced = find_referenced_cells(cell_db)
    input_groups = detect_input_groups(cell_db, referenced, wb_formula.sheetnames)

    # 3. Dynamic repeating rows detection and column variable mapping
    col_var_name = {}
    cell_var_name = {}
    sheet_repeating_rows = {}
    
    # Map input groups into col_var_name and cell_var_name
    for ig in input_groups:
        sheet_name = ig["sheet"]
        if sheet_name not in sheet_repeating_rows:
            sheet_repeating_rows[sheet_name] = set(range(ig["start_row"], ig["end_row"] + 1))
            
        if ig["type"] == "scalar":
            cell_var_name[(sheet_name, ig["range"])] = ig["name"]
        else:
            col_letter = ig["col_letter"]
            col_index = column_index_from_string(col_letter)
            col_var_name[(sheet_name, col_index)] = ig["name"]

    # Detect intermediate formula columns that span the entire repeating row range
    for sheet_name, rep_rows in sheet_repeating_rows.items():
        sheet_cells = cell_db.get(sheet_name, {})
        if not sheet_cells:
            continue
        max_col = max(c["col"] for c in sheet_cells.values())
        
        for col in range(1, max_col + 1):
            col_letter = get_column_letter(col)
            if (sheet_name, col) in col_var_name:
                continue
                
            # Verify if this column is a repeating grid column (contains formulas/values on all repeating rows)
            is_repeating_grid_col = True
            has_formula = False
            for r in rep_rows:
                cell = sheet_cells.get(f"{col_letter}{r}")
                if not cell or (cell["value"] is None and cell["formula"] is None):
                    is_repeating_grid_col = False
                    break
                if cell["formula"]:
                    has_formula = True
                    
            if is_repeating_grid_col and has_formula:
                # Find column subheader
                start_row = min(rep_rows)
                header_val = None
                for hr in range(start_row - 1, 0, -1):
                    cell_h = sheet_cells.get(f"{col_letter}{hr}")
                    if cell_h and cell_h["value"] is not None:
                        header_val = str(cell_h["value"])
                        break
                        
                # Parent category header (search left in row 4)
                parent_val = find_parent_header_search_left(sheet_cells, 4, col)
                
                combined_val = ""
                if parent_val and any(kw in parent_val.lower() for kw in ["shutter", "glass", "steel", "hardware", "interlock"]):
                    combined_val = f"{parent_val} {header_val or ''}"
                else:
                    combined_val = header_val or f"col_{col_letter}"
                    
                var_name = clean_header_name(combined_val)
                
                base_name = var_name
                counter = 1
                while any(name == var_name for name in col_var_name.values()):
                    var_name = f"{base_name}_{counter}"
                    counter += 1
                    
                col_var_name[(sheet_name, col)] = var_name

    # 4. Create generalized recursive expander
    expand_cell = make_generalized_recursive_expander(cell_db, col_var_name, cell_var_name, sheet_repeating_rows)

    # 5. Extract intermediate variables and clean their formula logic
    variable_units = {
        "shutter_width": "mm",
        "shutter_height": "mm",
        "interlock_height": "mm",
        "steel_sash_width": "mm",
        "glass_width": "mm",
        "glass_height": "mm",
        "glass_sqft": "Sq.ft",
        "glass_nos": "Nos"
    }

    variables = {}
    for (s, c), var_name in col_var_name.items():
        # Exclude input keys
        if any(ig["name"] == var_name and ig["sheet"] == s for ig in input_groups):
            continue
        
        # Pull formula from row 6 (or first repeating row)
        rep_rows = sheet_repeating_rows.get(s, set())
        if not rep_rows:
            continue
        start_row = min(rep_rows)
        coord = f"{get_column_letter(c)}{start_row}"
        
        raw_expr = expand_cell(s, coord, root=True)
        clean_expr = strip_excel_if_empty(raw_expr)
        variables[var_name] = {
            "formula": clean_expr,
            "unit": variable_units.get(var_name, "Nos"),
            "isInternal": True
        }

    profiles = []
    hardware = []
    steel = []
    glass_template = {}

    # 6. Detect tables and extract items sheet-by-sheet
    for sheet_name in wb_formula.sheetnames:
        sheet_cells = cell_db.get(sheet_name, {})
        if not sheet_cells:
            continue
        max_col = max(c["col"] for c in sheet_cells.values())
        max_row = max(c["row"] for c in sheet_cells.values())
        
        # Cluster contiguous columns
        col_info = {}
        for c in range(1, max_col + 1):
            col_letter = get_column_letter(c)
            has_val = False
            for r in range(1, max_row + 1):
                if sheet_cells[f"{col_letter}{r}"]["value"] is not None:
                    has_val = True
                    break
            if has_val:
                col_info[c] = col_letter
                
        columns_sorted = sorted(col_info.keys())
        if not columns_sorted:
            continue
            
        col_blocks = []
        current_block = [columns_sorted[0]]
        for col in columns_sorted[1:]:
            if col - current_block[-1] == 1:
                current_block.append(col)
            else:
                col_blocks.append(current_block)
                current_block = [col]
        col_blocks.append(current_block)
        
        for block in col_blocks:
            col_start, col_end = block[0], block[-1]
            parent_title = find_parent_title(cell_db, sheet_name, col_start, col_end)
            category = get_category_from_title(parent_title)
            
            # Check column subheaders if title keywords matched nothing
            if category == "other":
                for c in block:
                    col_letter = get_column_letter(c)
                    h4 = sheet_cells.get(f"{col_letter}4", {}).get("value")
                    h5 = sheet_cells.get(f"{col_letter}5", {}).get("value")
                    for h in [h4, h5]:
                        if h and any(kw in str(h).lower() for kw in ["profile", "hardware", "steel", "glass"]):
                            parent_title = str(h).strip()
                            category = get_category_from_title(parent_title)
                            break
                    if category != "other":
                        break
            
            if category == "other":
                continue
                
            header_rows = []
            for r in range(1, 6):
                row_has_header = False
                for c in block:
                    val = sheet_cells.get(f"{get_column_letter(c)}{r}", {}).get("value")
                    if val is not None:
                        row_has_header = True
                        break
                if row_has_header:
                    header_rows.append(r)
            
            sub_header_row = max(header_rows) if header_rows else 5
            data_start_row = sub_header_row + 1
            
            # Resolve description & quantity column indices
            desc_col = None
            qty_col = None
            sno_col = None
            
            for c in block:
                col_letter = get_column_letter(c)
                h_val = str(sheet_cells.get(f"{col_letter}{sub_header_row}", {}).get("value") or "").lower()
                if "desc" in h_val or "profile" in h_val or "hardware" in h_val:
                    desc_col = c
                elif "length" in h_val or "sq.ft" in h_val or "nos" in h_val or "qty" in h_val or "quantity" in h_val:
                    qty_col = c
                elif "s.no" in h_val or "s.no" in h_val:
                    sno_col = c
            
            # Size-based column resolution fallbacks
            if not desc_col or not qty_col:
                if len(block) == 2:
                    desc_col = block[0]
                    qty_col = block[1]
                elif len(block) == 3:
                    sno_col = block[0]
                    desc_col = block[1]
                    qty_col = block[2]
                else:
                    if not desc_col:
                        desc_col = block[1] if len(block) > 1 else block[0]
                    if not qty_col:
                        qty_col = block[-1]
            
            if category in ["profiles", "steel", "hardware"]:
                current_cat = category
                for r in range(data_start_row, max_row + 1):
                    # Check if any cell in the row indicates a section divider
                    row_vals_str = [str(sheet_cells.get(f"{get_column_letter(c)}{r}", {}).get("value") or "").strip().lower() for c in block]
                    if any(val in ["steel", "steel section", "steel details"] for val in row_vals_str):
                        current_cat = "steel"
                        continue
                    elif any(val in ["hardware", "hardware section", "hardware details"] for val in row_vals_str):
                        current_cat = "hardware"
                        continue
                    elif any(val in ["profiles", "profile", "profiles consumed", "profile consumed"] for val in row_vals_str):
                        current_cat = "profiles"
                        continue

                    desc_cell = sheet_cells.get(f"{get_column_letter(desc_col)}{r}")
                    qty_cell = sheet_cells.get(f"{get_column_letter(qty_col)}{r}")
                    
                    if not desc_cell or desc_cell["value"] is None:
                        continue
                        
                    desc_val = str(desc_cell["value"]).strip()
                    if not desc_val or desc_val.lower() == "total" or "sum" in str(desc_cell["formula"]).lower():
                        break
                        
                    if qty_cell and qty_cell["formula"] and "sum" in qty_cell["formula"].lower():
                        break

                    qty_coord = f"{get_column_letter(qty_col)}{r}"
                    
                    has_formula = qty_cell and qty_cell["formula"] is not None
                    evaluated_val = qty_cell["value"] if qty_cell else None
                    
                    # Check active status
                    is_active = False
                    if has_formula:
                        expanded_f = expand_cell(sheet_name, qty_coord, root=True)
                        if expanded_f and expanded_f not in ["0", "None"]:
                            is_active = True
                        else:
                            expanded_f = None
                    else:
                        expanded_f = None
                        if evaluated_val is not None and evaluated_val != 0 and evaluated_val != 0.0:
                            is_active = True
                            
                    # Set value to null if active and formula evaluates to 0
                    if is_active and has_formula and (evaluated_val == 0 or evaluated_val == 0.0 or evaluated_val is None):
                        evaluated_val = None
                        
                    uom = determine_uom(desc_val, current_cat)
                    form_type = determine_formula_type(uom)
                    item_type = current_cat[:-1] if current_cat.endswith("s") else current_cat
                    
                    item = {
                        "id":          generate_id(desc_val, item_type),
                        "name":        desc_val,
                        "type":        item_type,
                        "formula":     expanded_f,
                        "value":       evaluated_val,
                        "active":      is_active,
                        "uom":         uom,
                        "formulaType": form_type,
                        "sheet":       sheet_name,
                        "coordinate":  f"{sheet_name}!{qty_coord}"
                    }
                    
                    if current_cat == "profiles":
                        profiles.append(item)
                    elif current_cat == "steel":
                        steel.append(item)
                    elif current_cat == "hardware":
                        hardware.append(item)
            
            # Glass variables mapping into abstract template object
            elif category == "glass":
                glass_template = {
                    "id":          "GLASS_TEMPLATE",
                    "type":        "glass",
                    "glassWidth":  variables.get("glass_width", {}).get("formula") if isinstance(variables.get("glass_width"), dict) else variables.get("glass_width"),
                    "glassHeight": variables.get("glass_height", {}).get("formula") if isinstance(variables.get("glass_height"), dict) else variables.get("glass_height"),
                    "glassNos":    variables.get("glass_nos", {}).get("formula") if isinstance(variables.get("glass_nos"), dict) else variables.get("glass_nos"),
                    "glassSqft":   variables.get("glass_sqft", {}).get("formula") if isinstance(variables.get("glass_sqft"), dict) else variables.get("glass_sqft"),
                    "sheet":       sheet_name
                }

    # ── Centralize Formulas & Reference Mapping ───────────────────────────────
    calculations = {}
    
    def normalize_formula(f_str):
        if not f_str:
            return f_str
        f_str = f_str.strip()
        while f_str.startswith("(") and f_str.endswith(")"):
            depth = 0
            matching = True
            for i, char in enumerate(f_str):
                if char == "(":
                    depth += 1
                elif char == ")":
                    depth -= 1
                    if depth == 0 and i < len(f_str) - 1:
                        matching = False
                        break
            if matching:
                f_str = f_str[1:-1].strip()
            else:
                break
        return f_str

    def get_formula_ref(item_name, formula_str, uom, formula_type):
        if not formula_str:
            return None
        norm_f = normalize_formula(formula_str)
        # Check if identical normalized formula is already stored
        for ref, calc_info in calculations.items():
            if normalize_formula(calc_info["formula"]) == norm_f:
                return ref
        s = re.sub(r'\(.*?\)', '', item_name)
        s = re.sub(r'[^a-zA-Z0-9\s]', '', s)
        s = s.strip().lower()
        s = re.sub(r'\s+', '_', s)
        ref_key = f"{s}_calculation"
        
        base_ref = ref_key
        counter = 1
        while ref_key in calculations:
            ref_key = f"{base_ref}_{counter}"
            counter += 1
            
        calculations[ref_key] = {
            "formula": norm_f,
            "uom": uom,
            "formulaType": formula_type
        }
        return ref_key

    # Centralize in lists
    for item_list in [profiles, steel, hardware]:
        for item in item_list:
            if item["formula"]:
                ref_key = get_formula_ref(item["name"], item["formula"], item["uom"], item["formulaType"])
                item["formulaRef"] = ref_key
                item["formula"] = None
            else:
                item["formulaRef"] = None

    # Compile glass sum from repeating grid
    glass_sum_sheet = 'SL-SL(Small Sash)'
    glass_sum_coord = "U17"
    glass_sum_cell = cell_db.get(glass_sum_sheet, {}).get(glass_sum_coord)
    
    glass_total_val = glass_sum_cell["value"] if glass_sum_cell else None
    if glass_sum_cell and glass_sum_cell["is_formula"] and (glass_total_val == 0 or glass_total_val == 0.0 or glass_total_val is None):
        glass_total_val = None
        
    expanded_glass_total = expand_cell(glass_sum_sheet, glass_sum_coord, root=True)
    glass_ref_key = get_formula_ref("Glass Pane", expanded_glass_total, "Sq.ft", "area")

    # ── Remove Redundant Aliases ──────────────────────────────────────────────
    input_names = {ig["name"] for ig in input_groups}
    redundant_aliases = {}
    for var_name, var_info in list(variables.items()):
        expr = var_info["formula"]
        expr_stripped = expr.strip()
        if expr_stripped in input_names or expr_stripped in variables:
            redundant_aliases[var_name] = expr_stripped

    # Transitively resolve redundant aliases
    resolved_aliases = {}
    for var_name in redundant_aliases:
        curr = var_name
        visited = set()
        while curr in redundant_aliases and curr not in visited:
            visited.add(curr)
            curr = redundant_aliases[curr]
        resolved_aliases[var_name] = curr

    # Substitution function
    def substitute_var(expr, var_to_replace, replacement):
        pattern = r'\b' + re.escape(var_to_replace) + r'\b'
        return re.sub(pattern, replacement, expr)

    # Substitute in other variables
    for var_name, var_info in list(variables.items()):
        if var_name in resolved_aliases:
            continue
        new_expr = var_info["formula"]
        for alias, replacement in resolved_aliases.items():
            new_expr = substitute_var(new_expr, alias, replacement)
        var_info["formula"] = new_expr

    # Remove the redundant aliases from variables dictionary
    for alias in resolved_aliases:
        if alias in variables:
            del variables[alias]

    # Substitute in calculations
    for ref_key, calc_info in calculations.items():
        new_formula = calc_info["formula"]
        for alias, replacement in resolved_aliases.items():
            new_formula = substitute_var(new_formula, alias, replacement)
        calc_info["formula"] = new_formula

    # Substitute in glass template
    if glass_template:
        for k, v in list(glass_template.items()):
            if isinstance(v, str):
                new_v = v
                for alias, replacement in resolved_aliases.items():
                    new_v = substitute_var(new_v, alias, replacement)
                glass_template[k] = new_v

    # ── Catalog Deduplication ──────────────────────────────────────────────────
    def deduplicate_items(items):
        deduped = []
        seen = {}  # map (name, type) -> index in deduped list
        for item in items:
            key = (item["name"], item["type"])
            coord_only = item["coordinate"].split("!")[-1]
            if key in seen:
                existing = deduped[seen[key]]
                # Merge active
                existing["active"] = existing["active"] or item["active"]
                # Merge value
                if existing["value"] is None:
                    existing["value"] = item["value"]
                # Merge formulaRef
                if not existing["formulaRef"]:
                    existing["formulaRef"] = item["formulaRef"]
                # Merge coordinates/aliases
                if "coordinates" not in existing:
                    existing["coordinates"] = [existing.pop("coordinate")]
                existing["coordinates"].append(item["coordinate"])
                if "aliases" not in existing:
                    prev_coord_only = existing["coordinates"][0].split("!")[-1]
                    existing["aliases"] = [prev_coord_only]
                existing["aliases"].append(coord_only)
            else:
                item_copy = item.copy()
                item_copy["coordinates"] = [item["coordinate"]]
                item_copy["aliases"] = [coord_only]
                del item_copy["coordinate"]
                deduped.append(item_copy)
                seen[key] = len(deduped) - 1
        return deduped

    # Deduplicate the individual item catalogs
    profiles = deduplicate_items(profiles)
    steel = deduplicate_items(steel)
    hardware = deduplicate_items(hardware)

    # 7. Compile unified BOM (Bill of Materials) section
    bom = []
    
    # Process profiles, steel, hardware
    for list_items in [profiles, steel, hardware]:
        for item in list_items:
            # BOM lists items from master spreadsheet 'Profile & Hardwares'
            has_master_sheet = any("Profile & Hardwares" in c for c in item["coordinates"])
            if not has_master_sheet or not item["active"]:
                continue
                
            bom.append({
                "id":          item["id"],
                "item":        item["name"],
                "type":        item["type"],
                "uom":         item["uom"],
                "formulaRef":  item["formulaRef"],
                "formulaType": item["formulaType"],
                "value":       item["value"]
            })
            
    if glass_ref_key:
        bom.append({
            "id":          generate_id("Glass Pane", "glass"),
            "item":        "Glass Pane",
            "type":        "glass",
            "uom":         "Sq.ft",
            "formulaRef":  glass_ref_key,
            "formulaType": "area",
            "value":       glass_total_val
        })

    # ── Dependency Graph & Level Calculation ──────────────────────────────────
    # Create a unified list of active names (inputs, variables, calculations)
    input_names = {ig["name"] for ig in input_groups}
    
    formula_db = {}
    for name, var_info in variables.items():
        if isinstance(var_info, dict):
            formula_db[name] = var_info["formula"]
        else:
            formula_db[name] = var_info
            
    for name, calc_info in calculations.items():
        formula_db[name] = calc_info["formula"]
        
    all_possible_names = set(input_names).union(formula_db.keys())
    
    dependency_graph = {}
    for name, formula in formula_db.items():
        if formula:
            words = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', formula)
            deps = []
            for w in words:
                if w in all_possible_names and w != name:
                    deps.append(w)
            dependency_graph[name] = list(set(deps))
        else:
            dependency_graph[name] = []
            
    # Compute levels using memoized DFS
    levels = {}
    def get_level(name, path=None):
        if path is None:
            path = set()
        if name in levels:
            return levels[name]
        if name in path:
            return 1 # Break circular dependency
        if name in input_names:
            levels[name] = 1
            return 1
        
        deps = dependency_graph.get(name, [])
        if not deps:
            levels[name] = 1
            return 1
            
        new_path = path.union({name})
        max_dep_level = max(get_level(d, new_path) for d in deps)
        levels[name] = 1 + max_dep_level
        return levels[name]
        
    for name in formula_db:
        get_level(name)
        
    # Append dependsOn and level to variables and calculations
    for name, var_info in variables.items():
        if isinstance(var_info, dict):
            var_info["dependsOn"] = dependency_graph.get(name, [])
            var_info["level"] = levels.get(name, 1)
            
    for name, calc_info in calculations.items():
        calc_info["dependsOn"] = dependency_graph.get(name, [])
        calc_info["level"] = levels.get(name, 1)

    return {
        "inputs": [
            {
                "name":   ig["name"],
                "sheet":  ig["sheet"],
                "range":  ig["range"],
                "header": ig["header"],
                "type":   ig["type"]
            } for ig in input_groups
        ],
        "variables":    variables,
        "calculations": calculations,
        "profiles":     profiles,
        "steel":        steel,
        "glass":        glass_template,
        "hardware":     hardware,
        "bom":          bom
    }


# ── Main orchestrator ─────────────────────────────────────────────────────────

def xlsx_to_json(xlsx_path, output_path=None, mode="raw"):
    if not os.path.exists(xlsx_path):
        print(f"ERROR: File not found → {xlsx_path}")
        sys.exit(1)

    print(f"Reading: {xlsx_path}  [mode={mode}]")

    wb_data    = load_workbook(xlsx_path, data_only=True)
    wb_formula = load_workbook(xlsx_path, data_only=False)

    if mode == "smart":
        # Run dependency extractor
        extracted = extract_smart_manufacturing(wb_data, wb_formula)
        result = {
            "fileName":     os.path.basename(xlsx_path),
            "extracted_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            **extracted
        }
        
        n_in = len(extracted["inputs"])
        n_var = len(extracted["variables"])
        n_prof = len(extracted["profiles"])
        n_steel = len(extracted["steel"])
        n_hard = len(extracted["hardware"])
        n_bom = len(extracted["bom"])
        print(f"Smart Extraction Complete:")
        print(f"  Inputs: {n_in}, Variables: {n_var}, Profiles: {n_prof}, Steel: {n_steel}, Hardware: {n_hard}, BOM Items: {n_bom}")
    else:
        # Run flat exporter (mode = raw)
        sheets_output  = []
        total_cells    = 0
        total_formulas = 0
        for sheet_name in wb_formula.sheetnames:
            ws_data    = wb_data[sheet_name]
            ws_formula = wb_formula[sheet_name]
            cells, formula_summary = extract_sheet_raw(ws_data, ws_formula)
            sheet_entry = {
                "sheet_name": sheet_name,
                "dimensions": ws_formula.dimensions,
                "max_row":    ws_formula.max_row,
                "max_col":    ws_formula.max_column,
                "mode":       "raw",
                "cells":      cells,
                "formula_summary": {
                    "total_formulas": len(formula_summary),
                    "formulas":       formula_summary,
                },
            }
            print(f"  Sheet '{sheet_name}': {len(cells)} cells, {len(formula_summary)} formulas")
            total_cells    += len(cells)
            total_formulas += len(formula_summary)
            sheets_output.append(sheet_entry)

        result = {
            "file":         os.path.basename(xlsx_path),
            "extracted_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "mode":         "raw",
            "sheets":       sheets_output,
            "summary": {
                "total_sheets":          len(sheets_output),
                "total_cells_with_data": total_cells,
                "total_formulas":        total_formulas,
            },
        }

    if not output_path:
        base        = os.path.splitext(os.path.basename(xlsx_path))[0]
        suffix      = "_smart" if mode == "smart" else ""
        output_path = os.path.join(os.path.dirname(xlsx_path), f"{base}{suffix}.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False, default=str)

    print(f"\nDone! JSON saved to: {output_path}")
    return result


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python xlsx_to_json.py <file.xlsx> [output.json] [--mode raw|smart]")
        sys.exit(1)

    args      = sys.argv[1:]
    xlsx_file = args[0]

    # Parse optional --mode flag
    mode = "raw"
    if "--mode" in args:
        idx  = args.index("--mode")
        mode = args[idx + 1] if idx + 1 < len(args) else "raw"
        args = [a for i, a in enumerate(args) if i != idx and i != idx + 1]

    output_file = args[1] if len(args) > 1 else None
    xlsx_to_json(xlsx_file, output_file, mode=mode)
