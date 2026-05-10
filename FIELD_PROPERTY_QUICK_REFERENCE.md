# Field Property Quick Reference Card
**Print this. Keep it beside your PDF editor.**

---

## STEP 1: Identify What Type of Field You're Creating

```
┌─ Does the data come from ALIS system (resident, facility, contact)?
│  ├─ YES → Go to Step 2A (ALIS Field)
│  └─ NO → Go to Step 2B (Generic Field)
```

---

## STEP 2A: ALIS FIELD (Data from System)

**Field Name Lookup:**
1. Open Master Tag List spreadsheet
2. Find your field (e.g., "resident name")
3. Copy the exact code (e.g., `alis.resident.full_name`)
4. Check the "Read/Write Status" column
   - **Read Only** = system data, user can't edit
   - **Read/Write** = system provides value but user can change

**Property Settings:**

| Setting | Value |
|---|---|
| Field Name | `alis.[exactly as in Master List]` |
| Hover Text | `[Label from form]-0` |
| Font Size | `10pt` |
| Font | `Helvetica` |
| Text Color | `Black` |
| Visible | `☑️` |
| Print | `☑️` |
| Read Only | `☑️` (if Master List says so) |
| Required | `☐` (leave unchecked) |
| Protected | `☑️` (system data) |

**Copy from Master List? Use this format:**
- `alis.resident.full_name`
- `alis.resident.dob`
- `alis.facility.name`
- `alis.facility.phone`
- `alis.associated_contact.physician.1.person_full_name`

---

## STEP 2B: GENERIC FIELD (Custom/Physician Entry)

**Field Name Format:**
```
generic.[TYPE]_[DESCRIPTION].[NUMBER]

TYPE options:
  • text_ = freeform text
  • check_ = yes/no checkbox
  • signature_ = signature
  • date_ = date entry
  • initial_ = initials only

DESCRIPTION: short description (no spaces)
NUMBER: 1, 2, 3, etc. (sequential for each type)

Examples:
  generic.text_allergies.1
  generic.check_dnr.1
  generic.signature_physician.1
  generic.date_assessment.1
```

**Property Settings:**

| Setting | Value |
|---|---|
| Field Name | `generic.[TYPE]_[description].[n]` |
| Hover Text | `[Label from form]-[n]` |
| Font Size | `10pt` |
| Font | `Helvetica` |
| Text Color | `Black` |
| Line Style | `Solid` |
| Line Thickness | `Thin` |
| Visible | `☑️` |
| Print | `☑️` |
| Read Only | `☐` (user fills this) |
| Required | `☑️` if **critical**, else `☐` |
| Protected | `☐` (unless field locked after submit) |

**When to Mark as Required (`☑️`):**
- Assessment Date ✓
- Resident Name ✓
- Physician/Staff Signature ✓
- Allergies ✓
- Everything else: ☐

---

## SPEED HACK: Bulk Copy Pattern

### For Text Fields (all same type)
1. Create field #1 with **all** properties set correctly
2. Copy it: `Ctrl+C`
3. Paste multiple times: `Ctrl+V`
4. Edit each copy: **only change**
   - Field Name (increment: `.1` → `.2`)
   - Hover Text (increment: `.1` → `.2`)
   - Position on form
5. Leave everything else identical

### For Checkboxes
- Same process as text fields
- All use `generic.check_` prefix
- All use Solid, Thin lines
- All use same font/colors

---

## PROPERTY DEFAULTS (Copy-Paste These)

### All Text Fields
```
Font: Helvetica, 10pt, Black
Lines: Solid, Thin
Visibility: ☑️ Visible, ☑️ Print
```

### All Checkboxes
```
Line Style: Solid, Thin
Visibility: ☑️ Visible, ☑️ Print
```

### All Signatures
```
Required: ☑️ (always)
Visibility: ☑️ Visible, ☑️ Print
```

### All ALIS Fields
```
Read Only: ☑️ (always—check Master List)
Protected: ☑️ (system data)
Font: Helvetica, 10pt, Black
```

---

## 60-SECOND FIELD CREATION

1. **Type** → Text / Checkbox / Signature / ALIS?
2. **Name** → Copy from Master List OR follow `generic.[type]_[desc].[n]`
3. **Label** → Add Hover Text from form label
4. **Properties** → Use template from above
5. **Done** → Move to next field

---

## Common Field Examples (Copy-Ready)

### ALIS System Data (Read-Only)
```
Field Name: alis.resident.full_name
Hover Text: Resident Name-0
Read Only: ☑️ Protected: ☑️
```

### Physician Freetext Entry
```
Field Name: generic.text_allergies.1
Hover Text: Allergies-1
Required: ☑️ (safety field)
```

### Yes/No Checkbox
```
Field Name: generic.check_dnr.1
Hover Text: DNR-1
```

### Signature
```
Field Name: generic.signature_physician.1
Hover Text: Physician Signature-1
Required: ☑️
```

### Date Entry
```
Field Name: generic.date_assessment.1
Hover Text: Assessment Date-1
Required: ☑️
```

---

## Validation Checklist (Before Submitting)

- [ ] All field names follow format (no spaces, lowercase)
- [ ] All Hover Text populated (not blank)
- [ ] Font 10pt Helvetica across all fields
- [ ] Text color: Black (not red, not blue)
- [ ] Lines: Solid, Thin (consistent look)
- [ ] ☑️ Visible + ☑️ Print checked on every field
- [ ] Signature fields marked ☑️ Required
- [ ] ALIS fields marked ☑️ Read Only + ☑️ Protected
- [ ] Field numbers sequential (no gaps, no duplicates)
- [ ] Form layout: no overlapping fields
- [ ] Colors match document sections (green facility / red safety areas)

---

**Remember: KISS**
- Use templates—don't invent
- Copy/paste for speed
- Test after markup
- Refer to Master List for ALIS codes
