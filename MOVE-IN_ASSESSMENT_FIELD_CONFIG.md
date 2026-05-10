# Move-In Physician's Assessment Form
## Complete Field Property Configuration

**Use this document while marking up the actual PDF.** Copy each field configuration row-by-row.

---

## FACILITY INFORMATION SECTION

### Community Name
```
Field Name:    alis.facility.name
Hover Text:    Community Name-0
Font:          Helvetica, 10pt, Black
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☑️  Required: ☐  Protected: ☑️
Notes:         Pulls from ALIS facility data (read-only)
```

### Address
```
Field Name:    alis.facility.full_address
Hover Text:    Address-0
Font:          Helvetica, 10pt, Black
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☑️  Required: ☐  Protected: ☑️
Notes:         Full facility address from ALIS
```

### City
```
Field Name:    alis.facility.city
Hover Text:    City-0
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☑️  Required: ☐  Protected: ☑️
Notes:         Part of facility address
```

### State
```
Field Name:    alis.facility.state
Hover Text:    State-0
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☑️  Required: ☐  Protected: ☑️
Notes:         Two-letter state code
```

### Zip
```
Field Name:    alis.facility.zip
Hover Text:    Zip-0
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☑️  Required: ☐  Protected: ☑️
Notes:         Facility ZIP code
```

### Phone Number
```
Field Name:    alis.facility.phone
Hover Text:    Phone Number-0
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☑️  Required: ☐  Protected: ☑️
Notes:         Main facility phone
```

### Fax
```
Field Name:    alis.facility.fax
Hover Text:    Fax-0
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☑️  Required: ☐  Protected: ☑️
Notes:         Main facility fax
```

---

## RESIDENT INFORMATION SECTION

### Resident Name
```
Field Name:    alis.resident.full_name
Hover Text:    Resident Name-0
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☑️  Required: ☑️  Protected: ☑️
Notes:         Composite field (first + middle + last from ALIS)
```

### Assessment Date
```
Field Name:    generic.date_assessment.1
Hover Text:    Assessment Date-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☑️  Protected: ☐
Notes:         Physician fills in during visit (critical field)
```

### D.O.B. (Date of Birth)
```
Field Name:    alis.resident.dob
Hover Text:    D.O.B.-0
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☑️  Required: ☐  Protected: ☑️
Notes:         Date of birth from ALIS resident profile
```

---

## VITAL SIGNS SECTION

### Weight
```
Field Name:    generic.text_weight.1
Hover Text:    Weight-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Physician entry (lbs or kg—specify in instructions)
```

### Height
```
Field Name:    generic.text_height.1
Hover Text:    Height-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Physician entry
```

### BP (Blood Pressure)
```
Field Name:    generic.text_bp.1
Hover Text:    BP-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Systolic/Diastolic format (e.g., 120/80)
```

### Pulse
```
Field Name:    generic.text_pulse.1
Hover Text:    Pulse-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Beats per minute
```

### Temp (Temperature)
```
Field Name:    generic.text_temp.1
Hover Text:    Temp-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Fahrenheit or Celsius—specify
```

---

## CLINICAL INFORMATION SECTION

### Allergies
```
Field Name:    generic.text_allergies.1
Hover Text:    Allergies-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☑️  Protected: ☐
Notes:         CRITICAL SAFETY FIELD—mark Required
Format:        "None known" or list (e.g., "Penicillin, latex")
```

### DNR (Do Not Resuscitate)
```
Field Name:    generic.check_dnr.1
Hover Text:    DNR-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Two checkboxes: YES / NO
```

### Diagnosis
```
Field Name:    generic.text_diagnosis.1
Hover Text:    Diagnosis-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Multi-line text area, physician entry
```

### Health History
```
Field Name:    generic.text_health_history.1
Hover Text:    Health History-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Multi-line text area, physician entry
```

### Recent Mantoux Test
```
Field Name:    generic.text_mantoux.1
Hover Text:    Recent Mantoux Test-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Format: "mm/Induration" (e.g., "5mm/10")
```

### Date of Last Chest X-Ray
```
Field Name:    generic.date_chest_xray.1
Hover Text:    Date of Last Chest X-Ray-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Date entry
```

### Evidence of Pulmonary Tuberculosis
```
Field Name:    generic.check_tb_evidence.1
Hover Text:    Evidence of Pulmonary Tuberculosis-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Two checkboxes: YES / NO
```

### TB Test Needed
```
Field Name:    generic.check_tb_test_needed.1
Hover Text:    TB Test Needed-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Two checkboxes: YES / NO (conditional on residence)
```

---

## PHYSICAL LIMITATIONS & ASSISTIVE DEVICES

### Wheelchair
```
Field Name:    generic.check_wheelchair.1
Hover Text:    Wheelchair-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Single checkbox (checked if present)
```

### Walker
```
Field Name:    generic.check_walker.1
Hover Text:    Walker-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
```

### Hearing Aids
```
Field Name:    generic.check_hearing_aids.1
Hover Text:    Hearing Aids-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
```

### Cane
```
Field Name:    generic.check_cane.1
Hover Text:    Cane-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
```

### Motorized Wheelchair
```
Field Name:    generic.check_motorized_wheelchair.1
Hover Text:    Motorized Wheelchair-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
```

### Glasses
```
Field Name:    generic.check_glasses.1
Hover Text:    Glasses-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
```

### Dentures
```
Field Name:    generic.check_dentures.1
Hover Text:    Dentures-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
```

### Other Devices
```
Field Name:    generic.check_other_devices.1
Hover Text:    Other Devices-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Followed by text field for description
```

---

## MENTAL/PSYCHOLOGICAL LIMITATIONS

### Resident Capable of Self-Administration of Medication
```
Field Name:    generic.check_self_admin_meds.1
Hover Text:    Capable of Self-Admin Medication-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Two checkboxes: YES / NO (decision point for care plan)
```

### Resident Needs Assistance with Medication Administration
```
Field Name:    generic.check_needs_med_assist.1
Hover Text:    Needs Med Assistance-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Two checkboxes: YES / NO (usually opposite of above)
```

### Medication List Attached
```
Field Name:    generic.check_med_list_attached.1
Hover Text:    Medication List Attached-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Two checkboxes: YES / NO (compliance documentation)
```

### Physical and History Attached
```
Field Name:    generic.check_history_attached.1
Hover Text:    Physical and History Attached-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Two checkboxes: YES / NO (compliance documentation)
```

---

## CARE SETTING DETERMINATION

### Assisted Living
```
Field Name:    generic.check_assisted_living.1
Hover Text:    Assisted Living-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Checkbox (mutually exclusive with Memory Care)
```

### Memory Care
```
Field Name:    generic.check_memory_care.1
Hover Text:    Memory Care-1
Line:          Solid, Thin
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☐  Protected: ☐
Notes:         Checkbox (mutually exclusive with Assisted Living)
```

---

## SIGNATURE SECTION

### Physician Signature
```
Field Name:    generic.signature_physician.1
Hover Text:    Physician Signature-1
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☑️  Protected: ☐
Notes:         Digital signature (generic) or E-sign if project requires
```

### Date (Signature Date)
```
Field Name:    generic.date_signature.1
Hover Text:    Signature Date-1
Font:          Helvetica, 10pt, Black
Visible:       ☑️  Print: ☑️
Read Only:     ☐  Required: ☑️  Protected: ☐
Notes:         Date physician signed (may auto-populate or manual)
```

---

## SUMMARY: Total Field Count

| Category | Count | Type |
|---|---|---|
| Facility/Header | 7 | ALIS (read-only) |
| Resident Info | 3 | Mixed (2 ALIS, 1 generic) |
| Vital Signs | 5 | Generic text |
| Clinical | 8 | Mixed text + checkboxes |
| Assistive Devices | 8 | Checkboxes |
| Medication | 4 | Checkboxes |
| Care Setting | 2 | Checkboxes |
| Signature | 2 | Signature + date |
| **TOTAL** | **39** | **Mixed** |

---

## Markup Order (Recommended for Speed)

1. **All ALIS fields first** (facility + resident) — quick copy/paste job
2. **All checkboxes** (group by section) — consistent properties
3. **All text fields** (group by section) — same font/color
4. **Signature fields last** (special handling)

**Estimated time per form:** 15-20 minutes once templated.

---

## Final Validation

Before submitting markup to ALIS integration:

- [ ] 39 total fields present and named
- [ ] All ALIS fields marked Read Only ☑️
- [ ] All signature fields marked Required ☑️
- [ ] Font consistent: Helvetica 10pt black
- [ ] Lines: Solid, Thin (all checkboxes)
- [ ] No field names with spaces (all lowercase + underscores)
- [ ] No blank Hover Text fields
- [ ] Visible ☑️ + Print ☑️ on every field
- [ ] Form layout: fields properly positioned, no overlap
