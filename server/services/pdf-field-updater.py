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


def get_field_page(field_ref, page_map):
    """
    Return the 1-based page number of a field's first widget annotation.
    Returns None if the page cannot be determined.
    """
    try:
        if '/Kids' in field_ref:
            for kid_ref in field_ref['/Kids']:
                kid = kid_ref.get_object() if hasattr(kid_ref, 'get_object') else kid_ref
                if '/T' not in kid and hasattr(kid, 'objgen'):
                    page = page_map.get(kid.objgen[0])
                    if page is not None:
                        return page
        if hasattr(field_ref, 'objgen'):
            return page_map.get(field_ref.objgen[0])
    except Exception:
        pass
    return None


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


def split_multi_widget_field(field_ref, n_needed, acroform, pdf):
    """
    Split a terminal field that has multiple widget annotations into n_needed independent fields.

    The first widget stays inside field_ref (the original field node).
    Each extra widget gets a NEW sibling field node attached directly to AcroForm /Fields
    (root-level flat, so it is independent of the original field's parent hierarchy).

    Returns a list of n_needed field objects in widget annotation order:
      [field_ref, new_field_1, new_field_2, ...]
    """
    if '/Kids' not in field_ref:
        return [field_ref]

    # Collect only widget annotation children (no /T -> not a named field group)
    widget_entries = []
    for kid_ref in field_ref['/Kids']:
        kid = kid_ref.get_object() if hasattr(kid_ref, 'get_object') else kid_ref
        if '/T' not in kid:  # widget annotation (not a named field group)
            widget_entries.append((kid_ref, kid))

    if len(widget_entries) <= 1:
        return [field_ref]  # nothing to split

    # Trim to exactly n_needed widgets
    widget_entries = widget_entries[:n_needed]

    # Keep first widget in the original field
    first_ref, _ = widget_entries[0]
    field_ref['/Kids'] = pikepdf.Array([first_ref])

    result = [field_ref]

    for split_num, (extra_ref, extra_obj) in enumerate(widget_entries[1:], start=1):
        new_field = pikepdf.Dictionary()

        # Copy field-level properties from the original
        for prop_key in ['/FT', '/Ff', '/DA', '/Q', '/MK', '/DV', '/AA']:
            if prop_key in field_ref:
                new_field[prop_key] = field_ref[prop_key]

        # Temporary /T — will be immediately overwritten by the rename pass
        new_field['/T'] = f'__mw_split_{split_num}__'
        new_field['/Kids'] = pikepdf.Array([extra_ref])
        # No /Parent: add as root-level to avoid entangling with original's parent hierarchy

        new_obj = pdf.make_indirect(new_field)

        # Re-point the widget's /Parent to the new independent field node
        extra_obj['/Parent'] = new_obj

        # Register with AcroForm as a root-level field
        acroform['/Fields'].append(new_obj)

        result.append(new_field)
        print(f"[field-updater] [SPLIT] Created split field {split_num}/{n_needed - 1} "
              f"(root-level, temp '__mw_split_{split_num}__')")

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

        # Compare against the ACTUAL current field name (not suggestion's original_field_name).
        # After a pre-split, new field nodes have temp names like "__mw_split_1__" even though
        # their suggestion still says original_field_name="responsible_party.text.60".
        # Using suggestion original_field_name would give name_changed=False and leave the
        # temp name in the PDF.  Using the real current /T name catches this correctly.
        actual_current_name = build_full_field_name(field_ref)
        name_changed = (new_code != actual_current_name)

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

        # 2b. Ensure signature fields have an /AP (appearance) dict.
        # ALIS eSign requires /AP to be present on signature fields to recognize them as
        # placeholders. The working WA template has an empty /AP={} on every sig field;
        # the MT source PDF had none, which caused "Failed to send for signature."
        ft_val = str(field_ref.get('/FT', '')) if '/FT' in field_ref else ''
        if 'sig' in ft_val.lower() and '/AP' not in field_ref:
            field_ref['/AP'] = pikepdf.Dictionary()
            print(f"[field-updater] [SUCCESS] Added empty /AP to signature field {new_code}")

        # 3. Hover text (/TU): ALIS requires this to be blank (Form Markup 101 guide).
        # Actively strip /TU from the field node and all widget annotation kids so that
        # any stale value from a previous markup pass doesn't survive into the output.
        def _strip_tu(node):
            try:
                if '/TU' in node:
                    del node['/TU']
            except Exception:
                pass

        _strip_tu(field_ref)
        if '/Kids' in field_ref:
            kids = field_ref['/Kids']
            kid_objs = [k.get_object() if hasattr(k, 'get_object') else k for k in kids]
            for kid_obj in kid_objs:
                if '/T' not in kid_obj:   # widget annotation kids only
                    _strip_tu(kid_obj)
        print(f"[field-updater] [SUCCESS] Stripped hover text (/TU)")

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

            # ── Build page_map: annotation object ID → 1-based page number ─────────
            # Mirrors the detector's approach so we can do page-aware suggestion matching.
            page_map = {}
            for page_num, page in enumerate(pdf.pages, start=1):
                if '/Annots' in page:
                    for annot in page['/Annots']:
                        try:
                            annot_obj = annot.get_object() if hasattr(annot, 'get_object') else annot
                            if hasattr(annot_obj, 'objgen'):
                                page_map[annot_obj.objgen[0]] = page_num
                        except Exception:
                            pass

            # ── PASS 1: Snapshot all field names before any modification ──────────
            all_field_refs = []
            for field_ref_proxy in fields:
                field_obj = field_ref_proxy.get_object() if hasattr(field_ref_proxy, 'get_object') else field_ref_proxy
                collect_all_fields(field_obj, all_field_refs)

            pdf_field_names = [name for name, _ in all_field_refs]
            print(f"[field-updater] Collected {len(all_field_refs)} leaf fields for matching", file=sys.stderr, flush=True)
            print(f"[field-updater] All PDF field names (including nested): {pdf_field_names}", file=sys.stderr, flush=True)
            print(f"[field-updater] Suggestion field names to match: {sorted([s.get('original_field_name') or s.get('field_name') for s in suggestions])}", file=sys.stderr, flush=True)

            # ── PRE-SPLIT: Expand multi-widget fields when multiple approved suggestions ──
            # When the detector emitted N records for one logical field (all sharing the
            # same original_field_name but needing N different suggested_codes), the PDF
            # still holds ONE field with N widget annotations.  We must split it into N
            # independent field nodes BEFORE the rename pass so each suggestion can target
            # a distinct field object.
            #
            # Strategy:
            #   1. Group approved suggestions by original_field_name.
            #   2. For any original_field_name that appears 2+ times, find that field_ref
            #      in all_field_refs, split it into N nodes (one per widget), then replace
            #      the single entry with N entries in all_field_refs.
            #   3. Sort the N suggestions by field_page then y (document order) so they
            #      align with the widget order produced by the split.

            from collections import defaultdict
            sug_groups = defaultdict(list)
            for idx, sug in enumerate(suggestions):
                if sug.get('approval_status') != 'approved':
                    continue
                ofn = sug.get('original_field_name') or sug.get('field_name')
                sug_groups[ofn].append(idx)

            # Sort groups by (field_page, y) so split refs and suggestions both go
            # top-to-bottom through the document when page-aware matching is used.
            for ofn, idx_list in sug_groups.items():
                if len(idx_list) > 1:
                    idx_list.sort(key=lambda i: (
                        suggestions[i].get('field_page', 1),
                        suggestions[i].get('y', 0)
                    ))

            # Rebuild all_field_refs, expanding multi-widget entries
            expanded_field_refs = []
            split_field_names = set()
            for field_name_entry, field_ref_entry in all_field_refs:
                sug_idx_list = sug_groups.get(field_name_entry, [])
                if len(sug_idx_list) > 1 and field_name_entry not in split_field_names:
                    # If all suggestions share the same suggested_code, the user wants a
                    # single field with multiple widgets (native PDF repeat behavior).
                    # Do NOT split — just rename the one field object once and let all
                    # widget annotations continue sharing it.
                    unique_codes = set(suggestions[i].get('suggested_code', '') for i in sug_idx_list)

                    # Signature fields must always be split — ALIS eSign cannot collect
                    # a signature on a multi-widget field. Only text/check/date are safe
                    # to keep as shared multi-widget.
                    ft = None
                    try:
                        if '/FT' in field_ref_entry:
                            ft = str(field_ref_entry['/FT']).lower()
                    except Exception:
                        pass
                    is_esign_field = ft is not None and 'sig' in ft

                    if len(unique_codes) == 1 and not is_esign_field:
                        print(f"[field-updater] [SPLIT] '{field_name_entry}': all {len(sug_idx_list)} widgets "
                              f"share code '{next(iter(unique_codes))}' — keeping as single multi-widget field")
                        expanded_field_refs.append((field_name_entry, field_ref_entry))
                        split_field_names.add(field_name_entry)
                        continue

                    # Split this field into one node per suggestion
                    n = len(sug_idx_list)
                    print(f"[field-updater] [SPLIT] '{field_name_entry}': splitting into {n} independent widget fields")
                    split_refs = split_multi_widget_field(field_ref_entry, n, acroform, pdf)
                    if len(split_refs) < n:
                        print(f"[field-updater] [SPLIT] WARNING: only {len(split_refs)} widgets found "
                              f"(expected {n}); unmatched suggestions will get NO MATCH")
                    for sr in split_refs:
                        expanded_field_refs.append((field_name_entry, sr))
                    split_field_names.add(field_name_entry)
                    # Re-snapshot after split (the new fields were added to /Fields above)
                else:
                    expanded_field_refs.append((field_name_entry, field_ref_entry))

            if split_field_names:
                print(f"[field-updater] Pre-split complete: {len(split_field_names)} field(s) split; "
                      f"all_field_refs expanded from {len(all_field_refs)} to {len(expanded_field_refs)} entries")
                all_field_refs = expanded_field_refs

            # Reorder suggestions so multi-widget groups are interleaved correctly:
            # for each group, the suggestions at sug_groups[ofn] need to be consumed
            # in the same relative order as the split refs (document order).
            # The existing used_suggestion_indices mechanism handles this naturally as
            # long as the suggestions list has the grouped entries in the right order.
            # We enforce that by building a sorted suggestions list:
            multi_sug_indices_ordered = []  # flat list: suggestion index in desired match order
            processed_in_groups = set()
            for field_name_entry, _ in expanded_field_refs:
                if field_name_entry in sug_groups and len(sug_groups[field_name_entry]) > 1:
                    for si in sug_groups[field_name_entry]:
                        if si not in processed_in_groups:
                            multi_sug_indices_ordered.append(si)
                            processed_in_groups.add(si)

            # Reorder suggestions: multi-widget groups first (in document order), then the rest
            other_indices = [i for i in range(len(suggestions)) if i not in processed_in_groups]
            ordered_suggestion_indices = multi_sug_indices_ordered + other_indices
            ordered_suggestions = [suggestions[i] for i in ordered_suggestion_indices]
            # Map back: when we mark a suggestion as used, we use its position in ordered_suggestions
            suggestions = ordered_suggestions

            # ── PASS 2: Match pre-collected refs → apply updates ──────────────────
            # Two-round matching per field_ref:
            #   Round 1 — page-aware: require both field name AND page number to match.
            #             This correctly routes per-page edits when the same logical field
            #             name appears on multiple pages (e.g. "Printed Name" on pp 14,17,18).
            #   Round 2 — name-only fallback: used when page info is unavailable or when
            #             a field has only one candidate (no ambiguity).
            used_suggestion_indices = set()
            for field_name, field_ref in all_field_refs:
                matched = False
                field_page = get_field_page(field_ref, page_map)

                # Round 1: name + page match
                if field_page is not None:
                    for i, suggestion in enumerate(suggestions):
                        if i in used_suggestion_indices:
                            continue
                        if suggestion.get('approval_status') != 'approved':
                            continue
                        suggestion_field_name = suggestion.get('original_field_name') or suggestion.get('field_name')
                        if field_name == suggestion_field_name and suggestion.get('field_page') == field_page:
                            matched = True
                            used_suggestion_indices.add(i)
                            updated_count += apply_single_field_update(field_ref, suggestion, acroform)
                            break

                # Round 2: name-only fallback (no page info, or no page-exact match found)
                if not matched:
                    for i, suggestion in enumerate(suggestions):
                        if i in used_suggestion_indices:
                            continue
                        if suggestion.get('approval_status') != 'approved':
                            continue
                        suggestion_field_name = suggestion.get('original_field_name') or suggestion.get('field_name')
                        if field_name == suggestion_field_name:
                            matched = True
                            used_suggestion_indices.add(i)
                            updated_count += apply_single_field_update(field_ref, suggestion, acroform)
                            break

                if not matched:
                    print(f"[field-updater] [NO MATCH] PDF field '{field_name}' did not match any suggestion")

            # Clear SigFlags so ALIS eSign doesn't treat this as an already-signed document.
            if '/SigFlags' in acroform:
                del acroform['/SigFlags']
                print("[field-updater] Cleared SigFlags from AcroForm")

            # ── Repair AcroForm hierarchy for ALIS eSign compatibility ────────────
            # ALIS eSign requires a clean 3-group top-level structure:
            #   [alis, responsible_party, community_representative]
            # Two problems accumulate over edit cycles and must be fixed before save:
            #
            # 1. DUPLICATE SIGNER GROUPS — multiple top-level nodes with the same /T
            #    (e.g. three separate "responsible_party" groups). Merge them into one.
            # 2. FLAT ROOT FIELDS — leaf fields with dots in their /T sitting at root
            #    (e.g. /T="responsible_party.text.20") instead of being nested under
            #    the proper signer > type > leaf hierarchy. Re-nest them.
            #
            # Both issues cause ALIS eSign "Failed to send for signature" — confirmed
            # by comparing a broken MT template against the known-working WA template.

            def _find_or_create_subgroup(signer_ref, signer_obj, subgroup_name):
                for kid_ref in signer_obj.get('/Kids', []):
                    kid = kid_ref.get_object() if hasattr(kid_ref, 'get_object') else kid_ref
                    if '/T' in kid and str(kid['/T']) == subgroup_name:
                        return kid_ref, kid
                new_grp = pikepdf.Dictionary(
                    T=pikepdf.String(subgroup_name),
                    Kids=pikepdf.Array(),
                    Parent=signer_ref
                )
                new_ref = pdf.make_indirect(new_grp)
                signer_obj['/Kids'].append(new_ref)
                return new_ref, new_grp

            fields_list = list(acroform['/Fields'])

            # Pass A: merge duplicate signer group nodes
            group_objs = {}   # name -> first group obj
            group_refs = {}   # name -> first group ref
            keep = []
            for fref in fields_list:
                f = fref.get_object() if hasattr(fref, 'get_object') else fref
                if '/T' not in f:
                    keep.append(fref)
                    continue
                name = str(f['/T'])
                kids = list(f.get('/Kids', []))
                kid_objs = [k.get_object() if hasattr(k, 'get_object') else k for k in kids]
                is_group = any('/T' in k for k in kid_objs)
                if is_group and '.' not in name:
                    if name not in group_refs:
                        group_refs[name] = fref
                        group_objs[name] = f
                        keep.append(fref)
                    else:
                        # Merge kids into the first group, combining same-named subgroups
                        for kid_ref in f.get('/Kids', []):
                            kid = kid_ref.get_object() if hasattr(kid_ref, 'get_object') else kid_ref
                            kname = str(kid.get('/T', ''))
                            sub_ref, sub_obj = _find_or_create_subgroup(
                                group_refs[name], group_objs[name], kname)
                            for leaf_ref in kid.get('/Kids', []):
                                leaf = leaf_ref.get_object() if hasattr(leaf_ref, 'get_object') else leaf_ref
                                leaf['/Parent'] = sub_ref
                                sub_obj['/Kids'].append(leaf_ref)
                        print(f"[field-updater] Merged duplicate '{name}' group into primary")
                else:
                    keep.append(fref)

            merged_dupes = len(fields_list) - len(keep)
            if merged_dupes:
                print(f"[field-updater] Hierarchy repair: merged {merged_dupes} duplicate signer group(s)")

            # Pass B: re-nest flat root fields (dots in /T)
            flat_fields = [(fref, str((fref.get_object() if hasattr(fref,'get_object') else fref)['/T']))
                           for fref in keep
                           if '/T' in (fref.get_object() if hasattr(fref,'get_object') else fref)
                           and '.' in str((fref.get_object() if hasattr(fref,'get_object') else fref)['/T'])]
            flat_objgens = {
                (f.get_object() if hasattr(f, 'get_object') else f).objgen
                for f, _ in flat_fields
                if hasattr(f.get_object() if hasattr(f, 'get_object') else f, 'objgen')
            }
            keep_clean = [
                fref for fref in keep
                if not (
                    hasattr(fref.get_object() if hasattr(fref, 'get_object') else fref, 'objgen')
                    and (fref.get_object() if hasattr(fref, 'get_object') else fref).objgen in flat_objgens
                )
            ]

            if flat_fields:
                # Ensure alis group exists
                if 'alis' not in group_refs:
                    alis_obj = pikepdf.Dictionary(T=pikepdf.String('alis'), Kids=pikepdf.Array())
                    alis_ref = pdf.make_indirect(alis_obj)
                    keep_clean.insert(0, alis_ref)
                    group_refs['alis'] = alis_ref
                    group_objs['alis'] = alis_obj

                renested = 0
                for fref, dotted_name in flat_fields:
                    parts = dotted_name.split('.')
                    if len(parts) < 2:
                        keep_clean.append(fref)
                        continue
                    signer = parts[0]
                    subgroup = parts[1]
                    leaf = '.'.join(parts[2:]) if len(parts) > 2 else parts[1]
                    if signer not in group_refs:
                        sg_obj = pikepdf.Dictionary(T=pikepdf.String(signer), Kids=pikepdf.Array())
                        sg_ref = pdf.make_indirect(sg_obj)
                        keep_clean.append(sg_ref)
                        group_refs[signer] = sg_ref
                        group_objs[signer] = sg_obj
                    sub_ref, sub_obj = _find_or_create_subgroup(
                        group_refs[signer], group_objs[signer], subgroup)
                    f = fref.get_object() if hasattr(fref, 'get_object') else fref
                    f['/T'] = pikepdf.String(leaf)
                    f['/Parent'] = sub_ref
                    sub_obj['/Kids'].append(fref)
                    renested += 1

                acroform['/Fields'] = pikepdf.Array(keep_clean)
                print(f"[field-updater] Hierarchy repair: re-nested {renested} flat root field(s)")
            elif merged_dupes:
                acroform['/Fields'] = pikepdf.Array(keep_clean)

            top_groups = [str((fref.get_object() if hasattr(fref,'get_object') else fref).get('/T','?'))
                          for fref in acroform['/Fields']
                          if any('/T' in (k.get_object() if hasattr(k,'get_object') else k)
                                 for k in (fref.get_object() if hasattr(fref,'get_object') else fref).get('/Kids',[]))]
            print(f"[field-updater] Final top-level groups: {top_groups}")

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
