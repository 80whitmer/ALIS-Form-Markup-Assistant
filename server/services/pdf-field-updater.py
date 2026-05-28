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
    - Strips any PDF pipe-group suffix (e.g. 'full_name|alis' → 'full_name')
    - Translates 'button' type to 'check'
    Valid types: signature, date, initial, check, text
    """
    # Strip pipe-separated group suffix that some PDF tools embed (|anchor_name)
    normalized = suggested_code.split('|')[0].strip()
    # Convert button to check
    normalized = normalized.replace('.button.', '.check.')
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

    # STRATEGY:
    # 1) Flat field (1 named level, multiple segments): assign full dot-joined string to that level.
    # 2) Exact match (named levels == segments): distribute one segment per level.
    # 3) Mismatch: only update the leaf (last named level) with the last segment so parent
    #    nodes — which may contain dots in their own /T value — are never corrupted.
    if len(named_levels) == 1 and len(segments) > 1:
        full_name = '.'.join(segments)
        named_levels[0]['/T'] = full_name
        result = full_name
    elif len(named_levels) == len(segments):
        for i, level in enumerate(named_levels):
            level['/T'] = segments[i]
        new_names = []
        for level in named_levels:
            try:
                name_obj = level['/T']
                if name_obj is not None:
                    new_names.append(str(name_obj).replace('"', '').replace("'", ''))
                else:
                    new_names.append('(None)')
            except:
                new_names.append('(error)')
        result = '.'.join(new_names)
    elif len(segments) > len(named_levels):
        # More segments than hierarchy levels.
        # Distribute the first (N-1) segments one-per-level, then pack all remaining
        # segments (dot-joined) into the leaf so the full path reads as the complete
        # suggested_code.
        # Example: 3 levels [alis, associated_contact, person_full_name],
        #          5 segments [alis, associated_contact, power_of_attorney, 1, person_full_name]
        #   → level[0]='alis', level[1]='associated_contact',
        #     level[2]='power_of_attorney.1.person_full_name'
        #   → full path: alis.associated_contact.power_of_attorney.1.person_full_name ✓
        print(f"[field-updater] [DEBUG]   More segments ({len(segments)}) than levels ({len(named_levels)}) — distributing, packing tail into leaf")
        for i in range(len(named_levels) - 1):
            named_levels[i]['/T'] = segments[i]
        named_levels[-1]['/T'] = '.'.join(segments[len(named_levels) - 1:])
        result = suggested_code
    else:
        # Fewer segments than hierarchy levels: only update the leaf with the last
        # segment to avoid corrupting shared parent nodes.
        print(f"[field-updater] [DEBUG]   Fewer segments ({len(segments)}) than levels ({len(named_levels)}) — updating leaf only")
        named_levels[-1]['/T'] = segments[-1]
        result = '.'.join(segments)

    print(f"[field-updater] [DEBUG]   Result: {result}")


def collect_all_fields(field_ref, result=None):
    """
    PASS 1: Recursively collect all leaf field refs and their full names.
    Returns a list of (full_name, field_ref) tuples.

    MUST be called before any renaming — names are read from the unmodified PDF.
    This avoids the shared-hierarchy corruption where renaming one field changes
    a shared parent /T node, causing sibling fields to appear under the wrong name
    when build_full_field_name is called for them afterwards.
    """
    if result is None:
        result = []

    try:
        if '/Kids' in field_ref:
            kids = field_ref['/Kids']
            kid_objs = [k.get_object() if hasattr(k, 'get_object') else k for k in kids]

            if any('/T' in k for k in kid_objs):
                # Field group — recurse into child fields
                for kid_obj in kid_objs:
                    collect_all_fields(kid_obj, result)
                return result
            # else: /Kids are widget annotations → treat this node as a terminal field

        if '/T' not in field_ref:
            return result

        full_name = build_full_field_name(field_ref)
        result.append((full_name, field_ref))

    except Exception as e:
        print(f"[field-updater] Warning: Error collecting field: {e}")

    return result


def apply_single_field_update(field_ref, suggestion):
    """
    PASS 2: Apply suggestion (rename, flags, tooltip) to a single pre-matched field_ref.
    Returns 1 if the field was successfully processed, 0 on error.
    """
    try:
        old_name = suggestion.get('original_field_name') or suggestion.get('field_name')
        new_code = suggestion.get('suggested_code')

        if not new_code:
            print(f"[field-updater] WARNING: suggested_code is empty for field {old_name}, skipping")
            return 0

        # Normalize: strip any pre-existing |pipe suffix, convert button→check
        new_code = normalize_suggested_code(new_code)

        # Skip rename step if the name isn't actually changing (avoids dirtying the hierarchy)
        name_changed = (new_code != old_name)

        # Build hover-text tooltip if a signer is provided.
        # Guard against None signer (fields the user left without a signer assignment).
        signer = suggestion.get('signer')
        if signer:
            tooltip_code = f"{new_code}|{new_code}"
            tooltip = f"[{signer}] {tooltip_code}"
        else:
            tooltip = None

        required = suggestion.get('required', False)
        read_only = suggestion.get('read_only', False)

        # 1. Write clean field name (NO pipe suffix) into the PDF hierarchy
        if name_changed:
            update_hierarchy_holistically(field_ref, new_code)
            print(f"[field-updater] [SUCCESS] Renamed: {old_name} -> {new_code}")
        else:
            print(f"[field-updater] [SKIP rename] {old_name} (name unchanged)")

        # 2. Set required/read_only flags (Ff field flags)
        # Bit 0 (0x1) = ReadOnly,  Bit 1 (0x2) = Required
        flags = field_ref['/Ff'] if '/Ff' in field_ref else 0
        if isinstance(flags, pikepdf.Object):
            flags = int(flags)
        else:
            flags = int(flags) if flags else 0

        if required:
            flags |= 0x2   # Set Required bit
        else:
            flags &= ~0x2  # Clear Required bit

        if read_only:
            flags |= 0x1   # Set ReadOnly bit
        else:
            flags &= ~0x1  # Clear ReadOnly bit

        field_ref['/Ff'] = flags
        print(f"[field-updater] [SUCCESS] Set flags (required={required}, read_only={read_only})")

        # 3. Add tooltip (TU) to the field node AND any widget annotation kids.
        # PDF viewers (e.g. Acrobat) read /TU from the widget annotation, not the
        # parent field node, so we propagate it to widget kids for multi-widget fields.
        if tooltip:
            field_ref['/TU'] = tooltip
            if '/Kids' in field_ref:
                kids = field_ref['/Kids']
                kid_objs = [k.get_object() if hasattr(k, 'get_object') else k for k in kids]
                # Only update widget annotation kids (no /T), not child fields
                for kid_obj in kid_objs:
                    if '/T' not in kid_obj:
                        kid_obj['/TU'] = tooltip
            print(f"[field-updater] [SUCCESS] Added tooltip: {tooltip}")

        return 1

    except Exception as e:
        print(f"[field-updater] Warning: Error applying updates to field: {e}")
        return 0


def update_fields(pdf_path, suggestions, output_path):
    """
    Update form fields in a PDF with all properties and new names.

    Two-pass strategy to prevent shared-hierarchy corruption:
      PASS 1 — collect_all_fields: Walk the entire AcroForm tree and snapshot every
               leaf field's full name (build_full_field_name) into a list BEFORE any
               renaming occurs. Since update_hierarchy_holistically mutates shared
               parent /T nodes, doing name-reads and renames in the same loop causes
               sibling fields to appear under a corrupted name on their turn → [NO MATCH].
      PASS 2 — apply_single_field_update: Iterate the pre-collected list, match each
               field against suggestions by original_field_name, and apply rename/flags/
               tooltip. No build_full_field_name calls happen here, so shared-parent
               mutations from earlier iterations don't corrupt later matches.

    Args:
        pdf_path: Path to input PDF
        suggestions: List of suggestion dicts with field properties
        output_path: Path to save modified PDF

    Returns:
        Number of fields successfully updated
    """
    try:
        allow_overwrite = (pdf_path == output_path)
        with pikepdf.open(pdf_path, allow_overwriting_input=allow_overwrite) as pdf:
            updated_count = 0

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

            # ── PASS 1: Snapshot all field names before any modification ──────────
            all_field_refs = []
            for field_ref_proxy in fields:
                field_obj = field_ref_proxy.get_object() if hasattr(field_ref_proxy, 'get_object') else field_ref_proxy
                collect_all_fields(field_obj, all_field_refs)

            pdf_field_names = [name for name, _ in all_field_refs]
            print(f"[field-updater] Collected {len(all_field_refs)} leaf fields for matching", file=sys.stderr, flush=True)
            print(f"[field-updater] All PDF field names (including nested): {pdf_field_names}", file=sys.stderr, flush=True)
            print(f"[field-updater] Suggestion field names to match: {sorted([s.get('original_field_name') or s.get('field_name') for s in suggestions])}", file=sys.stderr, flush=True)

            # ── PASS 2: Match pre-collected refs → apply updates ──────────────────
            for field_name, field_ref in all_field_refs:
                matched = False
                for suggestion in suggestions:
                    if suggestion.get('approval_status') != 'approved':
                        continue
                    # Match against original_field_name (immutable original PDF name).
                    # Fall back to field_name for backward compatibility.
                    suggestion_field_name = suggestion.get('original_field_name') or suggestion.get('field_name')
                    if field_name == suggestion_field_name:
                        matched = True
                        updated_count += apply_single_field_update(field_ref, suggestion)
                        break  # each PDF field matches at most one suggestion

                if not matched:
                    print(f"[field-updater] [NO MATCH] PDF field '{field_name}' did not match any suggestion")

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
