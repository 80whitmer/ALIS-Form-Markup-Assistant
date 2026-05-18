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


def build_full_field_name(field_ref):
    """
    Build the full hierarchical field name by walking up the /Parent chain.
    Example: "alis.resident.full_name" instead of just "full_name"
    """
    try:
        names = []
        current = field_ref

        # Walk up the parent chain
        while current is not None:
            if '/T' in current:
                field_name_obj = current['/T']
                if field_name_obj is not None:
                    names.insert(0, str(field_name_obj).replace('"', '').replace("'", ''))

            # Get parent if exists
            if '/Parent' in current:
                parent = current['/Parent']
                if parent is not None:
                    current = parent.get_object() if hasattr(parent, 'get_object') else parent
                else:
                    current = None
            else:
                current = None

        # Join names with dots
        full_name = '.'.join(names)
        full_name = full_name.replace('"', '').replace("'", '')
        return full_name if full_name else 'unnamed'
    except Exception as e:
        # Fallback to leaf name if hierarchy walking fails
        try:
            field_name_obj = field_ref['/T']
            if field_name_obj is not None:
                return str(field_name_obj).replace('"', '').replace("'", '')
        except:
            pass
        return 'unnamed'


def normalize_suggested_code(suggested_code):
    """
    Normalize suggested_code to follow ALIS naming convention.
    Rule: Translate 'button' type to 'check' (buttons are checkboxes)
    Format: {signer}.{type}.{instance}
    Valid types: signature, date, initial, check, text
    """
    # Convert button to check
    normalized = suggested_code.replace('.button.', '.check.')
    return normalized


def update_hierarchy_holistically(field_ref, suggested_code):
    """
    Completely replace the entire field hierarchy with suggested_code segments.
    Walks the full parent chain, identifies all named levels, and overwrites them completely.

    Example: If hierarchy is [AcroForm, alis, resident, full_name] and suggested_code is 'resident.text.4'
    Result: alis='resident', resident='text', full_name='4' -> 'resident.text.4'
    """
    if suggested_code is None:
        print(f"[field-updater] WARNING: suggested_code is None, skipping hierarchy update")
        return

    segments = suggested_code.split('.')

    # Collect the ENTIRE hierarchy from leaf back to root
    hierarchy = []
    current = field_ref
    while current is not None:
        hierarchy.insert(0, current)
        if '/Parent' in current:
            parent = current['/Parent']
            if parent is not None:
                current = parent.get_object() if hasattr(parent, 'get_object') else parent
            else:
                current = None
        else:
            current = None

    # Find all named levels (levels that have /T field)
    named_levels = []
    named_indices = []
    for idx, level in enumerate(hierarchy):
        if '/T' in level:
            level_name = level['/T']
            if level_name is not None:
                named_levels.append(level)
                named_indices.append(idx)

    # DEBUG: Log before update
    old_names = []
    for level in named_levels:
        try:
            name_obj = level['/T']
            if name_obj is not None:
                name = str(name_obj).replace('"', '').replace("'", '')
                old_names.append(name)
            else:
                old_names.append('(None)')
        except:
            old_names.append('(error)')

    print(f"[field-updater] [DEBUG] Completely replacing hierarchy for '{suggested_code}':")
    print(f"[field-updater] [DEBUG]   Old structure: {' -> '.join(old_names)}")
    print(f"[field-updater] [DEBUG]   New segments:  {' -> '.join(segments)}")
    print(f"[field-updater] [DEBUG]   Named levels: {len(named_levels)}, Segments: {len(segments)}")

    # STRATEGY: If we have fewer named levels than segments (typical case),
    # join all segments and assign to the leaf field. Otherwise, distribute.
    if len(named_levels) == 1 and len(segments) > 1:
        # Single named level with multiple segments: use full dot-separated name
        full_name = '.'.join(segments)
        named_levels[0]['/T'] = full_name
        result = full_name
    else:
        # Multiple named levels or single segment: distribute as before
        for i, level in enumerate(named_levels):
            if i < len(segments):
                level['/T'] = segments[i]
        # Build result string for logging
        new_names = []
        for level in named_levels:
            try:
                name_obj = level['/T']
                if name_obj is not None:
                    name = str(name_obj).replace('"', '').replace("'", '')
                    new_names.append(name)
                else:
                    new_names.append('(None)')
            except:
                new_names.append('(error)')
        result = '.'.join(new_names)

    print(f"[field-updater] [DEBUG]   Result: {result}")


def process_field_recursive(field_ref, suggestions):
    """
    Recursively process fields, including nested fields in groups.
    Returns the number of fields updated.
    """
    updated_count = 0

    try:
        # If this is a field group with children, process them recursively
        if '/Kids' in field_ref:
            kids = field_ref['/Kids']
            for kid in kids:
                kid_obj = kid.get_object() if hasattr(kid, 'get_object') else kid
                updated_count += process_field_recursive(kid_obj, suggestions)
            return updated_count

        # If this is a leaf field, check if it has a name
        if '/T' not in field_ref:
            return 0

        # Build full hierarchical field name
        field_name = build_full_field_name(field_ref)

        # Check if this field matches any suggestion
        for suggestion in suggestions:
            if suggestion.get('approval_status') != 'approved':
                continue

            # CRITICAL: Match against original_field_name if available (immutable original PDF field name)
            # Fall back to field_name for backward compatibility (for suggestions created before original_field_name was added)
            suggestion_field_name = suggestion.get('original_field_name') or suggestion.get('field_name')

            if field_name == suggestion_field_name:
                old_name = suggestion_field_name  # Use the original field name for logging
                new_code = suggestion.get('suggested_code')

                # Validate new_code is not None
                if new_code is None:
                    print(f"[field-updater] WARNING: suggested_code is None for field {old_name}, skipping")
                    continue

                # Normalize the suggested code (e.g., button -> check)
                new_code = normalize_suggested_code(new_code)
                signer = suggestion['signer']
                required = suggestion.get('required', True)
                read_only = suggestion.get('read_only', False)

                # 1. Update entire hierarchy holistically with suggested_code segments
                update_hierarchy_holistically(field_ref, new_code)
                print(f"[field-updater] [SUCCESS] Renamed: {old_name} -> {new_code}")

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
                print(f"[field-updater] [SUCCESS] Set flags (required={required}, read_only={read_only})")

                # 3. Add tooltip (TU field - Tooltip)
                tooltip = f"[{signer}] {new_code}"
                field_ref['/TU'] = tooltip
                print(f"[field-updater] [SUCCESS] Added tooltip")

                return 1  # One field updated

        return 0  # No match found

    except Exception as e:
        print(f"[field-updater] Warning: Error processing field: {e}")
        return 0


def update_fields(pdf_path, suggestions, output_path):
    """
    Update form fields in a PDF with all properties and new names.
    Handles hierarchical (nested) field structures by recursively processing field groups.

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

            print(f"[field-updater] Found {len(fields)} top-level field groups in PDF AcroForm", file=sys.stderr, flush=True)

            # Debug: Print all field names in PDF (including nested ones)
            pdf_field_names = []
            def collect_field_names(field_ref):
                try:
                    if '/Kids' in field_ref:
                        # This is a field group, recurse into children
                        kids = field_ref['/Kids']
                        for kid in kids:
                            kid_obj = kid.get_object() if hasattr(kid, 'get_object') else kid
                            collect_field_names(kid_obj)
                    elif '/T' in field_ref:
                        # This is a leaf field
                        name = build_full_field_name(field_ref)
                        pdf_field_names.append(name)
                except:
                    pass

            for field_ref in fields:
                collect_field_names(field_ref)

            print(f"[field-updater] All PDF field names (including nested): {pdf_field_names}", file=sys.stderr, flush=True)
            print(f"[field-updater] Suggestion field names to match: {sorted([s.get('field_name') for s in suggestions])}", file=sys.stderr, flush=True)

            # Recursively process all fields (handles nested fields in groups)
            for field_ref in fields:
                updated_count += process_field_recursive(field_ref, suggestions)

            # Save the modified PDF
            pdf.save(output_path)
            print(f"[field-updater] [SUCCESS] Saved modified PDF to {output_path}")
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
            print(f"[field-updater] ❌ ERROR: Suggestions file not found: {args.suggestions_file}")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"[field-updater] ❌ ERROR: Invalid JSON in suggestions file: {e}")
            sys.exit(1)
    elif args.suggestions:
        # Fallback to command-line JSON string (legacy method)
        try:
            suggestions = json.loads(args.suggestions)
        except json.JSONDecodeError as e:
            print(f"[field-updater] ❌ ERROR: Invalid JSON in suggestions: {e}")
            sys.exit(1)

    if not suggestions:
        print("[field-updater] ⚠️ WARNING: No suggestions provided")

    # Update fields
    updated = update_fields(args.input_pdf, suggestions, args.output_pdf)

    if updated < 0:
        print("[field-updater] ❌ Field update failed with exception")
        sys.exit(1)
    elif updated > 0:
        print(f"[field-updater] Successfully updated {updated} field(s)")
        sys.exit(0)
    else:
        # No fields updated - check if suggestions were provided
        if suggestions and len(suggestions) > 0:
            # Suggestions provided but none were applied - this is an error
            print(f"[field-updater] CRITICAL ERROR: {len(suggestions)} suggestions provided but 0 fields updated")
            sys.exit(1)
        else:
            # No suggestions provided, no error
            print("[field-updater] No suggestions to apply")
            sys.exit(0)


if __name__ == '__main__':
    main()
