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


def detach_field_from_parent(field_ref, acroform):
    """
    Remove a field from its current parent hierarchy and re-add it as a
    root-level flat field in AcroForm /Fields.

    This is called when a rename requires changing a shared parent node that
    has multiple named children. Modifying such a shared parent would corrupt
    sibling fields — detaching avoids touching any shared node.

    After this call, set field_ref['/T'] = full_dotted_name.
    """
    if '/Parent' not in field_ref:
        # Already root-level — nothing to detach
        return

    parent_proxy = field_ref['/Parent']
    parent = parent_proxy.get_object() if hasattr(parent_proxy, 'get_object') else parent_proxy

    if '/Kids' in parent:
        original_kids = list(parent['/Kids'])
        new_kids = []
        removed = False

        # Snapshot the leaf /T value so we can fall back to name-matching
        try:
            leaf_t = str(field_ref['/T']).replace('"', '').replace("'", '') if '/T' in field_ref else None
        except:
            leaf_t = None

        for kid_ref in original_kids:
            kid = kid_ref.get_object() if hasattr(kid_ref, 'get_object') else kid_ref

            is_target = False
            if not removed:
                # Strategy 1: Python object identity (works when pikepdf caches resolved objects)
                if kid is field_ref:
                    is_target = True
                # Strategy 2: pikepdf object number comparison (objgen tuple)
                elif hasattr(kid, 'objgen') and hasattr(field_ref, 'objgen'):
                    if kid.objgen == field_ref.objgen:
                        is_target = True
                # Strategy 3: match by leaf /T value (last resort — only if leaf is unique in this parent)
                elif leaf_t is not None and '/T' in kid:
                    try:
                        kid_t = str(kid['/T']).replace('"', '').replace("'", '')
                        if kid_t == leaf_t:
                            # Only use this if there's exactly one kid with this /T
                            siblings_with_same_t = sum(
                                1 for k in [x.get_object() if hasattr(x,'get_object') else x for x in original_kids]
                                if '/T' in k and str(k['/T']).replace('"','').replace("'",'') == leaf_t
                            )
                            if siblings_with_same_t == 1:
                                is_target = True
                    except:
                        pass

            if is_target and not removed:
                removed = True
                continue  # exclude this kid (removes it from the parent)
            new_kids.append(kid_ref)

        if removed:
            parent['/Kids'] = pikepdf.Array(new_kids)
            print(f"[field-updater] [DEBUG]   Removed from parent /Kids, parent now has {len(new_kids)} named kids")
        else:
            print(f"[field-updater] [DEBUG]   WARNING: Could not locate field in parent /Kids for detach")

    # Sever the upward link
    del field_ref['/Parent']

    # Clean up any intermediate parent nodes that are now empty.
    # If removing this field left the parent with no named children, that parent
    # would be treated as a phantom leaf field by PDF walkers — recurse up and
    # remove it from its own parent too.
    _cleanup_empty_parent(parent)

    # Re-add as a root-level AcroForm field
    acroform['/Fields'].append(field_ref)
    print(f"[field-updater] [DEBUG]   Re-attached as root-level AcroForm field")


def _cleanup_empty_parent(node):
    """
    If `node` has no remaining named children (/Kids that contain /T),
    remove it from its own parent's /Kids recursively up the tree.
    Stops when a node still has named children or has no parent.
    """
    if '/Kids' not in node:
        return  # Not a group node — nothing to clean up

    kids = [k.get_object() if hasattr(k, 'get_object') else k for k in node['/Kids']]
    named_kids = [k for k in kids if '/T' in k]
    if named_kids:
        return  # Still has named descendants — leave it alone

    # No named children left. Remove this node from its parent.
    if '/Parent' not in node:
        return  # Root-level node, can't remove further

    grandparent_proxy = node['/Parent']
    grandparent = grandparent_proxy.get_object() if hasattr(grandparent_proxy, 'get_object') else grandparent_proxy

    if '/Kids' not in grandparent:
        return

    gp_kids = list(grandparent['/Kids'])
    new_gp_kids = []
    removed = False

    # Snapshot node's leaf /T for fallback matching
    try:
        node_t = str(node['/T']).replace('"', '').replace("'", '') if '/T' in node else None
    except:
        node_t = None

    for kid_ref in gp_kids:
        kid = kid_ref.get_object() if hasattr(kid_ref, 'get_object') else kid_ref
        is_match = False
        if not removed:
            if kid is node:
                is_match = True
            elif hasattr(kid, 'objgen') and hasattr(node, 'objgen') and kid.objgen == node.objgen:
                is_match = True
            elif node_t and '/T' in kid:
                try:
                    kt = str(kid['/T']).replace('"', '').replace("'", '')
                    if kt == node_t:
                        count = sum(1 for k in [x.get_object() if hasattr(x,'get_object') else x for x in gp_kids]
                                    if '/T' in k and str(k['/T']).replace('"','').replace("'",'') == node_t)
                        if count == 1:
                            is_match = True
                except:
                    pass
        if is_match and not removed:
            removed = True
            continue
        new_gp_kids.append(kid_ref)

    if removed:
        grandparent['/Kids'] = pikepdf.Array(new_gp_kids)
        if '/Parent' in node:
            del node['/Parent']
        print(f"[field-updater] [DEBUG]   Cleaned up empty intermediate parent node")
        # Continue cleaning up the grandparent if it is now also empty
        _cleanup_empty_parent(grandparent)


def update_hierarchy_holistically(field_ref, acroform, suggested_code):
    """
    Rename a field to suggested_code by updating the PDF hierarchy.

    Strategy
    --------
    1. Flat field (1 named level, N segments): write the full dotted name into that one /T.
    2. Exact count match AND no shared-parent conflict: distribute segments one-per-level.
    3. Exact count match BUT a non-leaf level is SHARED (has multiple named children) AND
       needs a different value: DETACH the field from its parent hierarchy (removing it from
       the shared parent's /Kids and re-adding it to the root AcroForm /Fields), then set
       /T = suggested_code as a flat dotted name. This prevents sibling fields from being
       corrupted by a shared-parent rename.
    4. More segments than levels: distribute first (N-1) segments, pack remaining into leaf.
    5. Fewer segments than levels: update leaf only (safe — never touches shared parents).
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

    # Find all named levels (nodes that have /T)
    named_levels = []
    for level in hierarchy:
        if '/T' in level and level['/T'] is not None:
            named_levels.append(level)

    # DEBUG: log before update
    old_names = []
    for level in named_levels:
        try:
            n = str(level['/T']).replace('"', '').replace("'", '')
            old_names.append(n)
        except:
            old_names.append('(error)')

    print(f"[field-updater] [DEBUG] Replacing hierarchy for '{suggested_code}':")
    print(f"[field-updater] [DEBUG]   Old structure: {' -> '.join(old_names)}")
    print(f"[field-updater] [DEBUG]   New segments:  {' -> '.join(segments)}")
    print(f"[field-updater] [DEBUG]   Named levels: {len(named_levels)}, Segments: {len(segments)}")

    # ── Strategy 1: flat field ────────────────────────────────────────────────
    # One named level, multiple segments: write the full dotted name into that /T.
    # No shared-parent issue possible — the single level is this field's own node.
    if len(named_levels) == 1 and len(segments) > 1:
        named_levels[0]['/T'] = '.'.join(segments)
        print(f"[field-updater] [DEBUG]   Strategy: flat field, full name in /T")
        return

    # ── UNIVERSAL shared-parent / unreachable-result check ───────────────────
    # Before applying any multi-level strategy, verify two things:
    #   A) No non-leaf parent that needs a DIFFERENT value is shared (has >1 named child).
    #      Changing a shared parent corrupts all sibling fields.
    #   B) The best achievable result using the existing hierarchy will equal suggested_code.
    #      If not (e.g., fewer segments → leaf-only can't move the field to a new namespace),
    #      detach-and-flatten is the only correct option.
    needs_detach = False
    detach_reason = ''

    # Check A: shared-parent conflict in the overlapping prefix
    common_depth = min(len(named_levels) - 1, len(segments) - 1)
    for i in range(common_depth):
        current_val = str(named_levels[i]['/T']).replace('"', '').replace("'", '') if named_levels[i]['/T'] is not None else ''
        desired_val = segments[i]
        if current_val != desired_val:
            if '/Kids' in named_levels[i]:
                kids_objs = [k.get_object() if hasattr(k, 'get_object') else k for k in named_levels[i]['/Kids']]
                named_kids_count = sum(1 for k in kids_objs if '/T' in k)
                if named_kids_count > 1:
                    needs_detach = True
                    detach_reason = (f"level {i} ('{current_val}' needs '{desired_val}') "
                                     f"is shared by {named_kids_count} named children")
                    break

    # Check B: would the best strategy even produce the right name?
    if not needs_detach:
        if len(named_levels) == len(segments):
            achievable = suggested_code  # distribute strategy always achieves it
        elif len(segments) > len(named_levels):
            achievable = suggested_code  # tail-pack strategy always achieves it
        else:
            # Fewer segments: Strategy 5 (leaf only) would give:
            #   <existing parent prefix>.<new leaf>
            parent_prefix = '.'.join(str(l['/T']).replace('"','').replace("'",'') for l in named_levels[:-1])
            achievable = parent_prefix + '.' + segments[-1] if parent_prefix else segments[-1]
        if achievable != suggested_code:
            needs_detach = True
            detach_reason = f"best achievable name '{achievable}' != '{suggested_code}'"

    if needs_detach:
        print(f"[field-updater] [DEBUG]   Detach required: {detach_reason}")
        detach_field_from_parent(field_ref, acroform)
        field_ref['/T'] = suggested_code
        print(f"[field-updater] [DEBUG]   Strategy: detach+flatten, /T='{suggested_code}'")
        return

    # ── Strategy 2: exact level count, no conflicts — distribute ─────────────
    if len(named_levels) == len(segments):
        for i, level in enumerate(named_levels):
            level['/T'] = segments[i]
        print(f"[field-updater] [DEBUG]   Strategy: exact match, distributed segments")
        return

    # ── Strategy 4: more segments than levels — pack tail into leaf ───────────
    if len(segments) > len(named_levels):
        print(f"[field-updater] [DEBUG]   Strategy: {len(segments)} segments > {len(named_levels)} levels, packing tail into leaf")
        for i in range(len(named_levels) - 1):
            named_levels[i]['/T'] = segments[i]
        named_levels[-1]['/T'] = '.'.join(segments[len(named_levels) - 1:])
        return

    # ── Strategy 5: fewer segments than levels — leaf only ───────────────────
    # (Only reached when achievable == suggested_code, meaning the parent prefix
    #  already matches and only the leaf segment needs updating.)
    print(f"[field-updater] [DEBUG]   Strategy: {len(segments)} segments < {len(named_levels)} levels, leaf only")
    named_levels[-1]['/T'] = segments[-1]


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


def apply_single_field_update(field_ref, suggestion, acroform):
    """
    PASS 2: Apply suggestion (rename, flags, tooltip) to a single pre-matched field_ref.
    acroform is the PDF AcroForm dictionary, needed for detach-and-flatten renames.
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

        # Hover text matches the field name exactly — one-for-one, no extras.
        tooltip = new_code

        required = suggestion.get('required', False)
        read_only = suggestion.get('read_only', False)

        # 1. Write clean field name (NO pipe suffix) into the PDF hierarchy
        if name_changed:
            update_hierarchy_holistically(field_ref, acroform, new_code)
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
            # Use a consumed-suggestion set so that when two PDF fields share the
            # same original name (duplicate fields), each one matches a distinct
            # suggestion in order rather than both matching the first suggestion.
            used_suggestion_indices = set()
            for field_name, field_ref in all_field_refs:
                matched = False
                for i, suggestion in enumerate(suggestions):
                    if i in used_suggestion_indices:
                        continue
                    if suggestion.get('approval_status') != 'approved':
                        continue
                    # Match against original_field_name (immutable original PDF name).
                    # Fall back to field_name for backward compatibility.
                    suggestion_field_name = suggestion.get('original_field_name') or suggestion.get('field_name')
                    if field_name == suggestion_field_name:
                        matched = True
                        used_suggestion_indices.add(i)
                        updated_count += apply_single_field_update(field_ref, suggestion, acroform)
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
        print("[field-updater] Field update failed with exception")
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
