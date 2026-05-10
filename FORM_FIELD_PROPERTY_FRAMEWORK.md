# Form Field Property Management Framework
**ALIS Form Markup Efficiency Workflow**

---

## 1. FIELD PROPERTIES BREAKDOWN

### Properties That Get Standardized (Set Once, Apply Everywhere)
These stay **consistent across nearly all fields** on a document:

| Property | Standard Value | Why |
|----------|---|---|
| **Font Size** | 9-10 pt | ALIS requirement (from Markup 101 guide) |
| **Font** | Helvetica | Professional, readable in compliance docs |
| **Text Color** | Black (RGB: 0,0,0) | High contrast, required for legibility |
| **Line Style** | Solid | Standard form appearance |
| **Line Thickness** | Thin | Consistent visual weight |
| **Visible** | ✓ Checked | Fields must be visible to users |
| **Print** | ✓ Checked | Compliance docs must be printable |

### Properties That Vary Per Field (Requires Decision)

| Property | When to Set | Decision Logic |
|----------|---|---|
| **Field Name** | Always | Determine ALIS vs. Generic code (see Section 2) |
| **Hover Text** | Always | User-friendly label (e.g., "Community Name-0") |
| **Read Only** | Case-by-case | Use ALIS Master List "Read/Write Status" column |
| **Required** | Case-by-case | Critical compliance fields only |
| **Protected** | Rare | Only if field should never be edited post-submit |
| **Outline/Fill Color** | Document design | Match form's green/red section colors |

---

## 2. FIELD NAMING DECISION TREE

**For EVERY field, ask in this order:**

```
┌─ Is this data that comes from ALIS system?
│  └─ YES: Check Master Tag List for exact field code
│     └─ Found? Use it (e.g., alis.resident.full_name)
│     └─ Not found? Use generic code (next step)
│
└─ NO or Not in ALIS: Use Generic Code Format
   └─ generic.[TYPE]_[DESCRIPTION].[NUMBER]
   
   Types:
   • text_ = free-form text entry
   • check_ = checkbox/yes-no
   • signature_ = physician/staff signature
   • date_ = date field
   
   Examples:
   • generic.text_allergies.1
   • generic.check_medication_assistance.1
   • generic.signature_physician.1
   • generic.date_assessment.1
```

---

## 3. QUICK REFERENCE: MOVE-IN ASSESSMENT FORM

This maps the **Move-In Physician's Assessment** form fields to their property assignments:

### FACILITY/HEADER SECTION
| Form Label | Field Name | Read Only? | Notes |
|---|---|---|---|
| Community Name | alis.facility.name | Yes | Pulls from ALIS system |
| Address | alis.facility.full_address | Yes | ALIS read-only |
| City | alis.facility.city | Yes | Part of address |
| State | alis.facility.state | Yes | Part of address |
| Zip | alis.facility.zip | Yes | Part of address |
| Phone Number | alis.facility.phone | Yes | ALIS facility phone |
| Fax | alis.facility.fax | Yes | ALIS facility fax |

### RESIDENT INFORMATION SECTION
| Form Label | Field Name | Read Only? | Notes |
|---|---|---|---|
| Resident Name | alis.resident.full_name | Yes | Composite field (read-only in Master List) |
| Assessment Date | generic.date_assessment.1 | No | Manual entry, compliance-critical |
| D.O.B. | alis.resident.dob | Yes | ALIS system data |
| Weight | generic.text_weight.1 | No | Physician fills during assessment |
| Height | generic.text_height.1 | No | Physician fills during assessment |
| BP | generic.text_bp.1 | No | Vital sign—physician entry |
| Pulse | generic.text_pulse.1 | No | Vital sign—physician entry |
| Temp | generic.text_temp.1 | No | Vital sign—physician entry |

### CLINICAL SECTION
| Form Label | Field Name | Type | Read Only? | Notes |
|---|---|---|---|---|
| Allergies | generic.text_allergies.1 | Text | No | Critical safety field |
| DNR | generic.check_dnr.1 | Checkbox | No | YES / NO options |
| Diagnosis | generic.text_diagnosis.1 | Text | No | Multi-line text area |
| Health History | generic.text_health_history.1 | Text | No | Multi-line text area |
| Recent Mantoux Test | generic.text_mantoux.1 | Text | No | Measurement + date |
| TB Evidence | generic.check_tb_evidence.1 | Checkbox | No | YES / NO |
| TB Test Needed | generic.check_tb_test_needed.1 | Checkbox | No | YES / NO (conditional) |

### PHYSICAL LIMITATIONS (CHECKBOXES)
| Device | Field Name | Type | Notes |
|---|---|---|---|
| Wheelchair | generic.check_wheelchair.1 | Checkbox | Assistive device |
| Walker | generic.check_walker.1 | Checkbox | Assistive device |
| Hearing Aids | generic.check_hearing_aids.1 | Checkbox | Assistive device |
| Cane | generic.check_cane.1 | Checkbox | Assistive device |
| Motorized Wheelchair | generic.check_motorized_wheelchair.1 | Checkbox | Assistive device |
| Glasses | generic.check_glasses.1 | Checkbox | Assistive device |
| Dentures | generic.check_dentures.1 | Checkbox | Assistive device |
| Other | generic.check_other_devices.1 | Checkbox | Free-form text follows |

### MEDICATION SECTION
| Form Label | Field Name | Type | Read Only? | Notes |
|---|---|---|---|---|
| Capable of Self-Admin | generic.check_self_admin_meds.1 | Checkbox | No | YES / NO decision point |
| Needs Med Assistance | generic.check_needs_med_assist.1 | Checkbox | No | YES / NO decision point |
| Medication List Attached | generic.check_med_list_attached.1 | Checkbox | No | YES / NO |
| Physical/History Attached | generic.check_history_attached.1 | Checkbox | No | YES / NO |

### SIGNATURE SECTION
| Form Label | Field Name | Type | Notes |
|---|---|---|---|
| Physician Signature | generic.signature_physician.1 | Signature | May use E-sign if project requires |
| Date | generic.date_signature.1 | Date | Auto-populated or manual entry |

### CARE SETTING (RADIO BUTTONS / CHECKBOXES)
| Option | Field Name | Type | Notes |
|---|---|---|---|
| Assisted Living | generic.check_assisted_living.1 | Checkbox | Care level determination |
| Memory Care | generic.check_memory_care.1 | Checkbox | Care level determination |

---

## 4. PROPERTY MANAGEMENT CHECKLIST

**For each field, confirm in order:**

- [ ] **Field Name** set correctly (ALIS from Master List OR generic code)
- [ ] **Hover Text** added (matches form label + unique number, e.g., "Allergies-1")
- [ ] **Font**: Helvetica, 9-10pt, Black text
- [ ] **Line**: Solid, Thin
- [ ] **Visible**: ✓ Checked
- [ ] **Print**: ✓ Checked
- [ ] **Read Only**: Set per Master List or field type
- [ ] **Required**: Checked only for critical compliance fields
  - Assessment Date ✓
  - Resident Name ✓
  - Physician Signature ✓
- [ ] **Colors**: Match document section (confirm with design)
- [ ] **Protected**: Only if field should be locked post-submission

---

## 5. TEMPLATES FOR COMMON FIELD TYPES

### Text Field (Standard)
```
Field Name:        generic.text_[description].[n]
Hover Text:        [Label]-[n]
Font Size:         10pt
Font:              Helvetica
Text Color:        Black
Line Style:        Solid
Line Thickness:    Thin
Visible:           ✓
Print:             ✓
Read Only:         ☐ (unless marked in Master List)
Required:          ☐ (only for critical fields)
Protected:         ☐
```

### Checkbox Field (Standard)
```
Field Name:        generic.check_[description].[n]
Hover Text:        [Label]-[n]
Line Style:        Solid
Line Thickness:    Thin
Visible:           ✓
Print:             ✓
Read Only:         ☐
Required:          ☐
Protected:         ☐
```

### Signature Field
```
Field Name:        generic.signature_[role].[n]
Hover Text:        [Role] Signature-[n]
Visible:           ✓
Print:             ✓
Read Only:         ☐
Required:          ✓ (signature fields are always critical)
Protected:         ☐ (or ✓ if should be locked after signing)
```

### ALIS Pulled Field (Read-Only)
```
Field Name:        alis.[object].[property]
Hover Text:        [Label]-[n]
Font Size:         10pt
Font:              Helvetica
Text Color:        Black
Visible:           ✓
Print:             ✓
Read Only:         ✓ (always—Master List confirms)
Required:          ☐
Protected:         ✓ (system data, should not be edited)
```

---

## 6. BULK PROPERTY WORKFLOW

**When creating multiple fields of the same type:**

1. **Create first field completely** with all properties set
2. **Copy field** (Ctrl+C)
3. **Paste into all locations** (Ctrl+V)
4. **Change only:**
   - Field Name (increment the number: .1 → .2 → .3)
   - Position/size
   - Hover Text (increment the number)
5. **Keep identical:**
   - Font, colors, visibility, print settings
   - All standard properties from templates above

---

## 7. COMMON MISTAKES TO AVOID (KISS Principle)

❌ **Don't**
- Mix font sizes (use 9-10pt only)
- Forget to set Visible/Print checkboxes
- Mix field naming schemes (be consistent per form)
- Leave Hover Text blank (causes confusion during reviews)
- Mark fields as Required unless truly critical
- Use ALIS codes for data not in ALIS system

✅ **Do**
- Use templates above—never reinvent per field
- Reference Master List before assigning any ALIS code
- Copy/paste for speed on repeated field types
- Document why a field is Read Only (if unusual)
- Keep field numbers sequential and logical
- Test visibility in the compiled ALIS integration before finalizing

---

## 8. QUICK VALIDATION SCRIPT

Before submitting a marked-up document:

```
□ All text fields: 9-10pt Helvetica, black text
□ All fields have Hover Text (not blank)
□ ALIS fields: confirmed in Master List as available
□ Read Only fields: protected from accidental editing
□ Checkboxes: consistent size and spacing
□ Signature fields: marked Required
□ Field names: NO spaces, consistent naming (generic.X_Y_Z.N or alis.X.Y)
□ Page layout: fields don't overlap, all visible on printed form
□ Color scheme: matches green (facility) / red (safety) sections
```

---

## Summary: 3-Step Field Setup Process

1. **Identify field type** (text, checkbox, signature, ALIS pulled)
2. **Select template** from Section 5
3. **Apply + modify only variable parts** (name, hover text, position)

Done. Consistency. Speed. ✓
