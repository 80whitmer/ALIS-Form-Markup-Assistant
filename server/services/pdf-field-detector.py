#!/usr/bin/env python3
"""
PDF Field Detector
Detects form fields in PDF documents using pikepdf.
Extracts field names, types, positions, and page numbers.

Usage:
  python pdf-field-detector.py <input.pdf>

Output: JSON with detected fields and page numbers
  {
    "status": "success",
    "total_pages": 5,
    "fields": [
      {
        "field_name": "Signature1",
        "field_type": "signature",
        "field_page": 1,
        "x": 100,
        "y": 200,
        "width": 80,
        "height": 20
      }
    ]
  }
"""

import sys
import json
import argparse
import subprocess
from pathlib import Path

try:
    import pikepdf
except ImportError:
    print("[field-detector] pikepdf not found, attempting to install...", file=sys.stderr)
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pikepdf', '--quiet'])
        import pikepdf
        print("[field-detector] pikepdf installed successfully", file=sys.stderr)
    except Exception as e:
        print(f"[field-detector] ERROR: Could not install pikepdf: {e}", file=sys.stderr)
        print(f"[field-detector] Please install manually: {sys.executable} -m pip install pikepdf", file=sys.stderr)
        sys.exit(1)


def build_full_field_name(field_ref):
    """
    Build the full hierarchical field name by walking up the /Parent chain.
    Example: "alis.resident.full_name" instead of just "full_name"

    Args:
        field_ref: Field reference object

    Returns:
        str: Full qualified field name
    """
    try:
        names = []
        current = field_ref

        # Walk up the parent chain
        while current is not None:
            if '/T' in current:
                names.insert(0, str(current['/T']))

            # Get parent if exists
            if '/Parent' in current:
                parent = current['/Parent']
                current = parent.get_object() if hasattr(parent, 'get_object') else parent
            else:
                current = None

        # Join names with dots, lowercase, remove quotes
        full_name = '.'.join(names)
        full_name = full_name.replace('"', '').replace("'", '')
        return full_name if full_name else 'unnamed'
    except Exception as e:
        # Fallback to leaf name if hierarchy walking fails
        try:
            return str(field_ref['/T']).replace('"', '').replace("'", '')
        except:
            return 'unnamed'


def process_field_recursive(field_ref, field_index, fields, page_map):
    """
    Recursively process fields, including nested fields in groups.

    Args:
        field_ref: Field reference to process
        field_index: Current field index counter
        fields: List to accumulate results
        page_map: Map of object IDs to page numbers
    """
    try:
        # Get field name (full hierarchical path)
        if '/T' not in field_ref:
            return field_index

        field_name = build_full_field_name(field_ref)

        # Determine field type
        field_type = 'unknown'
        if '/FT' in field_ref:
            ft = str(field_ref['/FT']).lower()
            if 'sig' in ft:
                field_type = 'signature'
            elif 'tx' in ft:
                field_type = 'text'
            elif 'ch' in ft:
                field_type = 'checkbox'
            elif 'btn' in ft:
                field_type = 'button'

        # Get field position and page number
        x, y, width, height = 0, 0, 0, 0
        field_page = 1

        # Check for widget annotations to get position
        if '/Kids' in field_ref:
            kids = field_ref['/Kids']
            kid_objs = []
            for kid in kids:
                if isinstance(kid, pikepdf.Object):
                    kid_objs.append(kid.get_object() if hasattr(kid, 'get_object') else kid)

            # Distinguish between:
            #   (a) field GROUP: kids have /T (child fields) → recurse
            #   (b) terminal field with widget annotations: kids have no /T → add this field
            has_field_children = any('/T' in k for k in kid_objs)

            if has_field_children:
                # Field group - process child fields recursively
                for kid_obj in kid_objs:
                    field_index = process_field_recursive(kid_obj, field_index, fields, page_map)
                return field_index
            else:
                # Terminal field whose /Kids are widget annotations.
                #
                # Non-alis fields with MULTIPLE widgets: emit one record per widget so
                # every visual box gets its own page/position and a unique suggested name.
                # This lets the user review and name each occurrence individually before apply.
                #
                # alis.* fields intentionally repeat the same DB value across all widgets
                # (e.g. the resident name printed on every page) — keep them as one record.
                is_alis = field_name.startswith('alis.')
                widget_count = len(kid_objs)

                if not is_alis and widget_count > 1:
                    for widget_index, kid_obj in enumerate(kid_objs):
                        wx, wy, ww, wh = 0, 0, 0, 0
                        w_page = 1
                        if '/Rect' in kid_obj:
                            rect = kid_obj['/Rect']
                            wx = float(rect[0])
                            wy = float(rect[1])
                            ww = float(rect[2]) - float(rect[0])
                            wh = float(rect[3]) - float(rect[1])
                        try:
                            if hasattr(kid_obj, 'objgen') and kid_obj.objgen[0] in page_map:
                                w_page = page_map[kid_obj.objgen[0]]
                        except:
                            pass
                        ff = int(field_ref['/Ff']) if '/Ff' in field_ref else 0
                        fields.append({
                            'field_name': field_name,
                            'field_type': field_type,
                            'field_page': w_page,
                            'field_index': field_index,
                            'x': int(wx),
                            'y': int(wy),
                            'width': int(ww),
                            'height': int(wh),
                            'widget_index': widget_index,
                            'widget_count': widget_count,
                            'required': bool(ff & 0x2),
                            'read_only': bool(ff & 0x1),
                        })
                        field_index += 1
                    return field_index

                # Single widget OR alis.* field: use first widget only (original behaviour)
                for kid_obj in kid_objs:
                    if '/Rect' in kid_obj:
                        rect = kid_obj['/Rect']
                        x = float(rect[0])
                        y = float(rect[1])
                        width = float(rect[2]) - float(rect[0])
                        height = float(rect[3]) - float(rect[1])
                        break

                for kid_obj in kid_objs:
                    try:
                        if hasattr(kid_obj, 'objgen') and kid_obj.objgen[0] in page_map:
                            field_page = page_map[kid_obj.objgen[0]]
                            break
                    except:
                        pass
        else:
            # Leaf field (no /Kids) - extract position directly from field dict
            if '/Rect' in field_ref:
                rect = field_ref['/Rect']
                x = float(rect[0])
                y = float(rect[1])
                width = float(rect[2]) - float(rect[0])
                height = float(rect[3]) - float(rect[1])

            # Try to determine page from page map
            try:
                if hasattr(field_ref, 'objgen'):
                    obj_id = field_ref.objgen[0]
                    if obj_id in page_map:
                        field_page = page_map[obj_id]
            except:
                pass

        ff = int(field_ref['/Ff']) if '/Ff' in field_ref else 0
        fields.append({
            'field_name': field_name,
            'field_type': field_type,
            'field_page': field_page,
            'field_index': field_index,
            'x': int(x),
            'y': int(y),
            'width': int(width),
            'height': int(height),
            'widget_index': 0,   # single widget (or alis.* multi-widget kept as one record)
            'widget_count': 1,
            'required': bool(ff & 0x2),
            'read_only': bool(ff & 0x1),
        })

        return field_index + 1

    except Exception as e:
        print(f"[field-detector] Warning: Could not process field: {e}", file=sys.stderr)
        return field_index


def detect_form_fields(pdf_path):
    """
    Detect form fields in a PDF document, including nested fields.

    Args:
        pdf_path: Path to input PDF file

    Returns:
        dict: Detection results with fields list and page count
    """
    try:
        print(f"[field-detector] Opening PDF: {pdf_path}", file=sys.stderr)

        with pikepdf.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            print(f"[field-detector] PDF has {total_pages} pages", file=sys.stderr)

            # Build map of object IDs to page numbers
            page_map = {}
            for page_num, page in enumerate(pdf.pages, start=1):
                if '/Annots' in page:
                    for annot in page['/Annots']:
                        try:
                            if hasattr(annot, 'objgen'):
                                page_map[annot.objgen[0]] = page_num
                        except:
                            pass

            fields = []
            field_index = 0

            # Check if PDF has an AcroForm (form fields)
            if '/AcroForm' not in pdf.Root:
                print("[field-detector] No AcroForm found in PDF", file=sys.stderr)
                return {
                    'status': 'success',
                    'total_pages': total_pages,
                    'fields': []
                }

            acroform = pdf.Root['/AcroForm']
            if '/Fields' not in acroform:
                print("[field-detector] No form fields found in PDF", file=sys.stderr)
                return {
                    'status': 'success',
                    'total_pages': total_pages,
                    'fields': []
                }

            field_refs = acroform['/Fields']

            # Process each top-level field recursively (handles nested fields in groups)
            for field_ref in field_refs:
                field_index = process_field_recursive(field_ref, field_index, fields, page_map)

            print(f"[field-detector] Total fields detected: {len(fields)}", file=sys.stderr)

            return {
                'status': 'success',
                'total_pages': total_pages,
                'fields': fields
            }

    except Exception as e:
        print(f"[field-detector] ERROR: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {
            'status': 'error',
            'error': str(e),
            'total_pages': 0,
            'fields': []
        }


def main():
    parser = argparse.ArgumentParser(description='Detect form fields in a PDF document')
    parser.add_argument('pdf_path', help='Path to input PDF file')

    args = parser.parse_args()

    # Check if file exists
    pdf_path = args.pdf_path
    if not Path(pdf_path).exists():
        print(f"[field-detector] ERROR: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[field-detector] Starting field detection: {pdf_path}", file=sys.stderr)

    result = detect_form_fields(pdf_path)

    # Output as JSON to stdout
    print(json.dumps(result, indent=2))

    if result.get('status') == 'success':
        print(f"[field-detector] ✓ Field detection completed successfully", file=sys.stderr)
        sys.exit(0)
    else:
        print(f"[field-detector] ✗ Field detection failed: {result.get('error')}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
