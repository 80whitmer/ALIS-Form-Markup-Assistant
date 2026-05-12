#!/usr/bin/env python3
"""
PDF Field Updater
Comprehensive field manipulation using pikepdf for direct PDF dictionary access.
Applies all field changes in a single pass: rename, required flag, read-only flag, tooltips.

Usage:
  python pdf-field-updater.py <input.pdf> <output.pdf> --suggestions <suggestions.json>

The suggestions.json should be an array of objects:
  [
    {
      "field_name": "Signature1",
      "suggested_code": "FAC.RES.SIG.1",
      "anchor_name": "admin.signature.1",
      "signer": "admin",
      "required": true,
      "read_only": false,
      "approval_status": "approved"
    }
  ]
"""

import sys
import json
import argparse
import subprocess

try:
    import pikepdf
except ImportError:
    # Try to auto-install pikepdf
    print("[field-updater] pikepdf not found, attempting to install...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pikepdf', '--quiet'])
        import pikepdf
        print("[field-updater] pikepdf installed successfully")
    except Exception as e:
        print(f"[field-updater] ERROR: Could not install pikepdf: {e}")
        print(f"[field-updater] Please install manually: {sys.executable} -m pip install pikepdf")
        sys.exit(1)


def update_fields(pdf_path, suggestions, output_path):
    """
    Update form fields in a PDF with all properties and new names.

    Args:
        pdf_path: Path to input PDF
        suggestions: List of suggestion dicts with field properties
        output_path: Path to save modified PDF

    Returns:
        Number of fields successfully updated
    """
    try:
        # Open the PDF with allow_overwriting_input if input and output are the same
        allow_overwrite = (pdf_path == output_path)
        with pikepdf.open(pdf_path, allow_overwriting_input=allow_overwrite) as pdf:
            updated_count = 0

            # Check if PDF has an AcroForm (form fields)
            if '/AcroForm' not in pdf.Root:
                print("[field-updater] No AcroForm found in PDF")
                pdf.save(output_path)
                return 0

            acroform = pdf.Root['/AcroForm']
            if '/Fields' not in acroform:
                print("[field-updater] No form fields found in PDF")
                pdf.save(output_path)
                return 0

            fields = acroform['/Fields']

            # Iterate through fields and update matching ones
            for field_ref in fields:
                try:
                    # CRITICAL FIX: Modify through the reference directly, NOT a detached copy
                    # Using field_ref.get_object() returns a detached copy - modifications are lost!
                    # Instead, modify field_ref directly to persist changes to the PDF

                    # Check if field has /T (field name)
                    if '/T' not in field_ref:
                        continue

                    current_name = str(field_ref['/T'])

                    # Check if this field matches any suggestion
                    for suggestion in suggestions:
                        if suggestion.get('approval_status') != 'approved':
                            continue

                        if current_name == suggestion.get('field_name'):
                            old_name = suggestion['field_name']
                            new_code = suggestion['suggested_code']
                            anchor = suggestion['anchor_name']
                            signer = suggestion['signer']
                            required = suggestion.get('required', True)
                            read_only = suggestion.get('read_only', False)

                            # 1. Rename field (update /T entry) - modify through reference directly
                            new_field_name = f"{new_code}|{anchor}"
                            field_ref['/T'] = new_field_name
                            print(f"[field-updater] [OK] Renamed: {old_name} -> {new_field_name}")

                            # 2. Set required flag (Ff field flags)
                            # Bit 0 (0x1) = ReadOnly
                            # Bit 1 (0x2) = Required
                            # Bit 2 (0x4) = NoExport
                            flags = field_ref['/Ff'] if '/Ff' in field_ref else 0
                            if isinstance(flags, pikepdf.Object):
                                flags = int(flags)
                            else:
                                flags = int(flags) if flags else 0

                            if required:
                                flags |= 0x2  # Set Required bit
                            else:
                                flags &= ~0x2  # Clear Required bit

                            if read_only:
                                flags |= 0x1  # Set ReadOnly bit
                            else:
                                flags &= ~0x1  # Clear ReadOnly bit

                            field_ref['/Ff'] = flags
                            print(f"[field-updater] [OK] Set flags (required={required}, read_only={read_only})")

                            # 3. Add tooltip (TU field - Tooltip)
                            tooltip = f"[{signer}] {new_code}\nAnchor: {anchor}"
                            field_ref['/TU'] = tooltip
                            print(f"[field-updater] [OK] Added tooltip")

                            updated_count += 1
                            break

                except Exception as e:
                    # Log error but continue with other fields
                    print(f"[field-updater] Warning: Error processing field: {e}")
                    continue

            # Save the modified PDF
            pdf.save(output_path)
            print(f"[field-updater] [OK] Saved modified PDF to {output_path}")
            return updated_count

    except Exception as e:
        print(f"[field-updater] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return -1


def main():
    parser = argparse.ArgumentParser(description='Update form fields in a PDF')
    parser.add_argument('input_pdf', help='Input PDF file path')
    parser.add_argument('output_pdf', help='Output PDF file path')
    parser.add_argument('--suggestions', help='JSON string with field suggestions (deprecated, use --suggestions-file)')
    parser.add_argument('--suggestions-file', help='Path to JSON file with field suggestions')

    args = parser.parse_args()

    # Get suggestions
    suggestions = []

    if args.suggestions_file:
        # Read suggestions from file (preferred method to avoid command-line length limits)
        try:
            with open(args.suggestions_file, 'r', encoding='utf-8') as f:
                suggestions = json.load(f)
            print(f"[field-updater] Loaded {len(suggestions)} suggestions from file")
        except FileNotFoundError:
            print(f"[field-updater] ERROR: Suggestions file not found: {args.suggestions_file}")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"[field-updater] ERROR: Invalid JSON in suggestions file: {e}")
            sys.exit(1)
    elif args.suggestions:
        # Fallback to command-line JSON string (legacy method)
        try:
            suggestions = json.loads(args.suggestions)
        except json.JSONDecodeError as e:
            print(f"[field-updater] ERROR: Invalid JSON in suggestions: {e}")
            sys.exit(1)

    if not suggestions:
        print("[field-updater] WARNING: No suggestions provided")

    # Update fields
    updated = update_fields(args.input_pdf, suggestions, args.output_pdf)

    if updated < 0:
        sys.exit(1)
    elif updated > 0:
        print(f"[field-updater] [OK] Successfully updated {updated} field(s)")
        sys.exit(0)
    else:
        print("[field-updater] No fields were updated")
        sys.exit(0)


if __name__ == '__main__':
    main()
