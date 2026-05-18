#!/usr/bin/env python3
"""
pdf-border-styler.py

Uses pikepdf to set outline/border colors on PDF form fields.
Handles advanced PDF dictionary manipulation that pdf-lib can't do.

Usage:
    python pdf-border-styler.py <input_pdf> <output_pdf> [--no-outline] [--field-types text,signature]
"""

import sys
import json
import argparse
import subprocess
from pathlib import Path

try:
    import pikepdf
except ImportError:
    # Try to auto-install pikepdf
    print("[border-styler] pikepdf not found, attempting to install...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pikepdf', '--quiet'])
        import pikepdf
        print("[border-styler] pikepdf installed successfully")
    except Exception as e:
        print(f"[border-styler] ERROR: Could not install pikepdf: {e}")
        print(f"[border-styler] Please install manually: {sys.executable} -m pip install pikepdf")
        sys.exit(1)


def set_field_border_properties(pdf_path, output_path, no_outline=True, field_types=None):
    """
    Set border/outline properties on form fields in a PDF.

    Args:
        pdf_path: Path to input PDF
        output_path: Path to save modified PDF
        no_outline: If True, removes outline color (sets to transparent)
        field_types: List of field types to modify (default: ['text', 'signature'])
    """

    if field_types is None:
        field_types = ['text', 'signature']

    try:
        # Open the PDF with allow_overwriting_input if input and output are the same
        allow_overwrite = (pdf_path == output_path)
        with pikepdf.open(pdf_path, allow_overwriting_input=allow_overwrite) as pdf:
            # Get the AcroForm (form fields) if it exists
            if '/AcroForm' not in pdf.Root:
                print(f"[border-styler] No form fields found in PDF")
                return False

            acro_form = pdf.Root['/AcroForm']

            if '/Fields' not in acro_form:
                print(f"[border-styler] No form fields in AcroForm")
                return False

            fields = acro_form['/Fields']
            field_count = len(fields)
            modified_count = 0
            error_count = 0

            print(f"[border-styler] Processing {field_count} fields...")

            for i, field_ref in enumerate(fields):
                try:
                    # Try to get field object, with fallback if get_object() fails
                    field = None
                    try:
                        if hasattr(field_ref, 'get_object'):
                            field = field_ref.get_object()
                        else:
                            field = field_ref
                    except Exception as get_obj_err:
                        # Fallback: use field_ref directly as dict-like object
                        print(f"[border-styler] WARNING: get_object() failed for field {i+1}, using fallback: {get_obj_err}")
                        field = field_ref

                    if field is None:
                        print(f"[border-styler] WARNING: Field {i+1} is None, skipping")
                        error_count += 1
                        continue

                    # Get field type
                    field_type = None
                    if '/FT' in field:
                        ft = field['/FT']
                        if ft == '/Tx':
                            field_type = 'text'
                        elif ft == '/Sig':
                            field_type = 'signature'
                        elif ft == '/Ch':
                            field_type = 'choice'
                        elif ft == '/Btn':
                            field_type = 'button'

                    # Check if we should modify this field
                    if field_type not in field_types:
                        continue

                    field_name_obj = field.get('/T', None)
                    if field_name_obj is None:
                        field_name = 'unnamed'
                    else:
                        field_name = str(field_name_obj)

                    # Set border style
                    if no_outline:
                        # Create or update Border Style dictionary
                        bs_dict = pikepdf.Dictionary(
                            Type=pikepdf.Name('/Border'),
                            W=0,  # Border width 0 = no visible border
                            S=pikepdf.Name('/S')  # Solid style
                        )
                        field['/BS'] = bs_dict

                        # Also set the old-style Border array to [0, 0, 0] (no border)
                        field['/Border'] = pikepdf.Array([0, 0, 0])

                        # Remove any C (color) entry
                        if '/C' in field:
                            del field['/C']

                        modified_count += 1
                        print(f"[border-styler] SUCCESS: Field {i+1}/{field_count}: {field_name} ({field_type}) - outline removed")

                except Exception as field_err:
                    print(f"[border-styler] ERROR: Could not modify field {i+1}: {field_err}")
                    error_count += 1
                    continue

            # Save the modified PDF
            pdf.save(output_path)

            print(f"[border-styler] Modified {modified_count} fields")
            if error_count > 0:
                print(f"[border-styler] WARNING: {error_count} fields had errors")
            print(f"[border-styler] Saved to {output_path}")

            return True

    except Exception as err:
        print(f"[border-styler] ERROR: {err}")
        import traceback
        traceback.print_exc()
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Set border/outline properties on PDF form fields'
    )
    parser.add_argument('input_pdf', help='Input PDF file path')
    parser.add_argument('output_pdf', help='Output PDF file path')
    parser.add_argument(
        '--no-outline',
        action='store_true',
        default=True,
        help='Remove outline color from fields (default: True)'
    )
    parser.add_argument(
        '--field-types',
        default='text,signature',
        help='Comma-separated field types to modify (default: text,signature)'
    )

    args = parser.parse_args()

    input_path = Path(args.input_pdf)
    output_path = Path(args.output_pdf)

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}")
        sys.exit(1)

    field_types = [ft.strip() for ft in args.field_types.split(',')]

    success = set_field_border_properties(
        str(input_path),
        str(output_path),
        no_outline=args.no_outline,
        field_types=field_types
    )

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
