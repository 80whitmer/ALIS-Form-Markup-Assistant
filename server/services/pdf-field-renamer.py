#!/usr/bin/env python3
"""
PDF Field Renamer
Renames form fields in a PDF using pikepdf to direct PDF dictionary manipulation.

Usage:
  python pdf-field-renamer.py <input.pdf> <output.pdf> [--fields field_map.json]

The field_map.json should be an array of objects:
  [
    {"old_name": "Signature1", "new_name": "FAC.RES.SIG.1|admin.signature.1"},
    {"old_name": "Text2", "new_name": "FAC.RES.DATE.1|admin.date.1"}
  ]
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
    print("[field-renamer] pikepdf not found, attempting to install...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pikepdf', '--quiet'])
        import pikepdf
        print("[field-renamer] ✓ pikepdf installed successfully")
    except Exception as e:
        print(f"[field-renamer] ERROR: Could not install pikepdf: {e}")
        print(f"[field-renamer] Please install manually: {sys.executable} -m pip install pikepdf")
        sys.exit(1)


def rename_fields(pdf_path, field_mappings, output_path):
    """
    Rename form fields in a PDF.

    Args:
        pdf_path: Path to input PDF
        field_mappings: List of dicts with 'old_name' and 'new_name' keys
        output_path: Path to save modified PDF

    Returns:
        Number of fields successfully renamed
    """
    try:
        # Open the PDF with allow_overwriting_input if input and output are the same
        allow_overwrite = (pdf_path == output_path)
        with pikepdf.open(pdf_path, allow_overwriting_input=allow_overwrite) as pdf:
            renamed_count = 0

            # Check if PDF has an AcroForm (form fields)
            if '/AcroForm' not in pdf.Root:
                print("[field-renamer] No AcroForm found in PDF")
                pdf.save(output_path)
                return 0

            acroform = pdf.Root['/AcroForm']
            if '/Fields' not in acroform:
                print("[field-renamer] No form fields found in PDF")
                pdf.save(output_path)
                return 0

            fields = acroform['/Fields']

            # Iterate through fields and rename matching ones
            for field_ref in fields:
                field = field_ref.objgen[0]  # Get the actual object

                if '/T' not in field:
                    continue

                current_name = str(field['/T'])

                # Check if this field matches any mapping
                for mapping in field_mappings:
                    if current_name == mapping['old_name']:
                        old_name = mapping['old_name']
                        new_name = mapping['new_name']

                        # Rename the field by updating the /T (field name) entry
                        field['/T'] = new_name

                        print(f"[field-renamer] ✓ Renamed: {old_name} → {new_name}")
                        renamed_count += 1
                        break

            # Save the modified PDF
            pdf.save(output_path)
            print(f"[field-renamer] ✓ Saved modified PDF to {output_path}")
            return renamed_count

    except Exception as e:
        print(f"[field-renamer] ERROR: {str(e)}")
        return -1


def main():
    parser = argparse.ArgumentParser(description='Rename form fields in a PDF')
    parser.add_argument('input_pdf', help='Input PDF file path')
    parser.add_argument('output_pdf', help='Output PDF file path')
    parser.add_argument('--fields', help='JSON file with field mappings')
    parser.add_argument('--field-data', help='Direct JSON field mapping data')

    args = parser.parse_args()

    # Get field mappings
    field_mappings = []

    if args.field_data:
        try:
            field_mappings = json.loads(args.field_data)
        except json.JSONDecodeError as e:
            print(f"[field-renamer] ERROR: Invalid JSON in field-data: {e}")
            sys.exit(1)
    elif args.fields:
        try:
            with open(args.fields, 'r') as f:
                field_mappings = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"[field-renamer] ERROR: Cannot read fields file: {e}")
            sys.exit(1)

    if not field_mappings:
        print("[field-renamer] WARNING: No field mappings provided")

    # Rename fields
    renamed = rename_fields(args.input_pdf, field_mappings, args.output_pdf)

    if renamed < 0:
        sys.exit(1)
    elif renamed > 0:
        print(f"[field-renamer] ✓ Successfully renamed {renamed} field(s)")
        sys.exit(0)
    else:
        print("[field-renamer] No fields were renamed")
        sys.exit(0)


if __name__ == '__main__':
    main()
