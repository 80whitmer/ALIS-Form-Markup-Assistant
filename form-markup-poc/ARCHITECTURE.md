# System Architecture

## Overview

The ALIS Form Markup PoC is a Node.js application that intelligently detects form fields in pre-marked PDFs and suggests ALIS field codes based on nearby text labels.

```
┌─────────────────────────────────────────────────────────────┐
│                      Input: PDF File                        │
│          (Tungsten/Kofax marked with form fields)           │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │  1. Field Detection     │  (field-detector.js)
        │  - Read AcroForm fields │
        │  - Extract positions    │
        │  - Determine types      │
        └────────────┬────────────┘
                     │
        ┌────────────▼──────────────────┐
        │  2. Label Extraction (OCR)    │  (label-extractor.js)
        │  - Run Tesseract.js OCR       │
        │  - Find nearby text (100px)   │
        │  - Combine adjacent words     │
        │  - Return with confidence     │
        └────────────┬──────────────────┘
                     │
        ┌────────────▼────────────────────┐
        │  3. Code Matching              │  (code-matcher.js)
        │  ┌──────────────────────────┐  │
        │  │ Priority 1: Template     │  │
        │  │ Priority 2: Exact Match  │  │
        │  │ Priority 3: Fuzzy Match  │  │
        │  │ Priority 4: Patterns     │  │
        │  └──────────────────────────┘  │
        │  - Returns code + confidence    │
        └────────────┬────────────────────┘
                     │
        ┌────────────▼────────────────┐
        │  4. Property Generation     │  (property-suggester.js)
        │  - Create property objects  │
        │  - Assign approval status   │
        │  - Generate summary         │
        └────────────┬────────────────┘
                     │
        ┌────────────▼──────────────────────┐
        │  Output: Suggestions + Summary    │
        │  - Console tables (formatted)     │
        │  - JSON file (optional)           │
        │  - Statistics & breakdown         │
        └──────────────────────────────────┘
```

## Data Flow

### Field Detection Phase

```
PDF File
   │
   ├─→ pdf-lib: Load PDF
   │
   ├─→ Read AcroForm
   │   └─→ Get field definitions
   │       ├─ field_0: text @ (100, 200, 300x30)
   │       ├─ field_1: checkbox @ (100, 250, 20x20)
   │       └─ field_2: signature @ (100, 300, 500x50)
   │
   └─→ Output: DetectedFields[]
       {
         id: "field_0",
         name: "f0",
         type: "text",
         position: {x, y, width, height}
       }
```

### Label Extraction Phase

```
PDF + Detected Fields
   │
   ├─→ Tesseract.js: OCR entire PDF
   │   └─→ Extract all words with positions
   │       [
   │         {text: "Resident", bbox: {x0, y0, x1, y1}, confidence: 0.98},
   │         {text: "Name", bbox: {x0, y0, x1, y1}, confidence: 0.95},
   │         ...
   │       ]
   │
   ├─→ For each detected field:
   │   ├─ Calculate field center (x, y)
   │   ├─ Find words within search radius (100px)
   │   ├─ Prefer words above/left of field
   │   └─ Combine adjacent words
   │
   └─→ Output: FieldLabels[]
       {
         field_id: "field_0",
         detected_label: "Resident Name",
         confidence: 0.96
       }
```

### Code Matching Phase

```
Field Labels + Master List Map
   │
   ├─→ For each label, try matching in order:
   │
   │   1. TEMPLATE MATCH (if template provided)
   │      master-list-map.formMappings[template][label]
   │      → Returns: code with 0.95+ confidence
   │
   │   2. EXACT MATCH
   │      master-list-map.alisFields.find(f => f.label === label)
   │      → Returns: code with 0.99 confidence
   │
   │   3. FUZZY MATCH (Fuse.js)
   │      - Compare label to all ALIS field labels
   │      - Threshold: 60% match (0.40 Fuse score)
   │      - Returns: closest match with 0.65-0.95 confidence
   │
   │   4. GENERIC PATTERN MATCH
   │      - Check if label includes patterns
   │      - "allerg" → generic.text_allergies.1
   │      - "signature" → generic.signature_*
   │      - Returns: pattern code with 0.70-0.98 confidence
   │
   └─→ Output: CodeMatches[]
       {
         code: "alis.resident.full_name",
         confidence: 0.99,
         match_type: "exact",
         read_only: true,
         required: true
       }
```

### Property Generation Phase

```
Field Labels + Code Matches
   │
   ├─→ For each field:
   │   ├─ Get matched code and confidence
   │   ├─ Generate property object:
   │   │  {
   │   │    name: "alis.resident.full_name",
   │   │    hover_text: "Resident Name-0",
   │   │    font_size: 10,
   │   │    font: "Helvetica",
   │   │    text_color: "#000000",
   │   │    read_only: true,
   │   │    required: true
   │   │  }
   │   │
   │   └─ Determine approval status:
   │      ├─ confidence >= 0.95 → auto_approve 🟢
   │      ├─ confidence >= 0.80 → approve_likely 🟡
   │      ├─ confidence >= 0.70 → review_needed 🟠
   │      └─ confidence < 0.70 → manual_review 🔴
   │
   └─→ Output: Suggestions[] + Summary
       {
         auto_approve: 38,
         approve_likely: 3,
         review_needed: 1,
         manual_review: 3,
         average_confidence: 0.92
       }
```

## Module Dependencies

```
index.js (CLI entry point)
   │
   ├─→ field-detector.js
   │   └─→ pdf-lib (read PDF fields)
   │
   ├─→ label-extractor.js
   │   └─→ tesseract.js (OCR)
   │
   ├─→ code-matcher.js
   │   ├─→ master-list-map.js (code definitions)
   │   └─→ fuse.js (fuzzy matching)
   │
   ├─→ property-suggester.js
   │   └─→ code-matcher.js (for matching)
   │
   └─→ master-list-map.js (shared data)
       └─→ Field code definitions

test.js (test runner)
   └─→ index.js (via execSync)
       └─→ All above modules
```

## Data Structures

### DetectedField

```javascript
{
  id: "field_0",              // Unique identifier
  name: "f0",                 // PDF field name
  type: "text",               // text | checkbox | radio | signature
  constructor: "PDFTextField",// pdf-lib class name
  position: {
    page: 0,
    x: 100,                   // Left edge pixel
    y: 200,                   // Top edge pixel
    width: 300,               // Width in pixels
    height: 30                // Height in pixels
  },
  currentValue: null          // Current field value (if any)
}
```

### FieldLabel

```javascript
{
  field_id: "field_0",           // Reference to detected field
  detected_label: "Resident Name", // OCR-extracted text
  confidence: 0.96,              // OCR confidence (0-1)
  text_position: {x, y},         // Location of text
  nearbyWords: ["Resident", "Name"] // Debug: nearby words
}
```

### CodeMatch

```javascript
{
  code: "alis.resident.full_name",  // ALIS field code
  confidence: 0.99,                 // Match confidence (0-1)
  match_type: "exact",              // exact|fuzzy|template|pattern
  reason: "Exact match in ALIS fields",
  read_only: true,                  // From ALIS definition
  required: true                    // From ALIS definition
}
```

### PropertySuggestion

```javascript
{
  field_id: "field_0",
  detected_label: "Resident Name",
  suggested_code: "alis.resident.full_name",
  confidence: 0.99,
  match_type: "exact",
  reason: "Exact match in ALIS fields",
  status: "auto_approve",           // Status for user action
  properties: {                     // Ready to apply to PDF
    name: "alis.resident.full_name",
    hover_text: "Resident Name-0",
    font_size: 10,
    font: "Helvetica",
    text_color: "#000000",
    read_only: true,
    required: true
  },
  warning: null                     // Any warnings (if no code found)
}
```

### SummaryReport

```javascript
{
  total_fields: 45,
  matched_fields: 42,               // Fields with assigned codes
  unmatched_fields: 3,              // Needs manual review
  auto_approve: 38,                 // Ready to auto-apply
  approve_likely: 3,                // Review recommended
  review_needed: 1,                 // Should manually verify
  manual_review: 3,                 // Likely needs correction
  average_confidence: 0.92          // Mean confidence of matched fields
}
```

## Configuration & Mappings

### master-list-map.js Structure

```javascript
{
  alisFields: {
    // ALIS system field codes with metadata
    'alis.resident.full_name': {
      label: 'Resident Name',
      read_only: true,
      type: 'resident'
    },
    ...
  },

  genericPatterns: {
    // Generic codes for common field types
    'generic.text_allergies.1': {
      patterns: ['allerg', 'allergy'],
      type: 'text',
      required: true,
      confidence: 0.95
    },
    ...
  },

  formMappings: {
    // Form-specific label → code mappings
    'move-in-assessment-v1': {
      'Community Name': {
        code: 'alis.facility.name',
        confidence: 0.99,
        read_only: true
      },
      ...
    }
  }
}
```

## Confidence Scoring Logic

### Template Match
- Confidence: 0.95-0.99
- Source: Direct form mapping
- Use when: Form template is known and label exists in mapping

### Exact Match
- Confidence: 0.99
- Source: String comparison (case-insensitive)
- Use when: Label exactly matches ALIS field label

### Fuzzy Match
- Confidence: 0.65-0.95
- Source: Fuse.js similarity (threshold: 0.40 = 60% match)
- Calculation: `Math.max(0.65, 1 - score)`
- Use when: No exact match but similar ALIS field exists

### Generic Pattern Match
- Confidence: 0.70-0.98
- Source: Pattern definitions in master-list-map.js
- Use when: Label contains known pattern keywords
- Example: "Patient Allergies" contains "allerg" → generic.text_allergies.1

### Approval Status Assignment
```
if confidence >= 0.95:
  status = "auto_approve"    🟢 Ready to apply
elif confidence >= 0.80:
  status = "approve_likely"  🟡 Probably correct
elif confidence >= 0.70:
  status = "review_needed"   🟠 Should verify
else:
  status = "manual_review"   🔴 Likely wrong
```

## Performance Characteristics

### Time Complexity

```
- Field Detection:    O(n)         n = number of fields (~45 typical)
- OCR:               O(pages)     ~3-8 sec per page
- Label Extraction:  O(n × w)     n = fields, w = words near field
- Code Matching:     O(n × m)     m = codes in master list (~30)
- Property Gen:      O(n)

Total: ~5-10 seconds per 1-page form
       ~15-25 seconds per 5-page form
```

### Memory Usage

```
- Field Detection:    ~5 MB (PDF in memory)
- OCR:               ~50-100 MB (Tesseract worker)
- OCR Words:         ~10-20 MB (per page)
- Master List:       ~1 MB (loaded once)

Peak: ~150 MB for typical form
```

### Accuracy Metrics

```
Typical results on move-in assessment (45 fields):
- Field Detection:    98-100% (depends on PDF quality)
- Label Extraction:   85-95% (depends on OCR quality)
- Code Matching:      90-95% (when template available)
- Auto-Approve Rate:  80-85% (fields ready immediately)
```

## Error Handling

### Graceful Degradation

1. **PDF Load Fails**
   - Catch error, log message, exit

2. **Field Detection Fails**
   - Try pdf-lib first, fallback to PDFjs
   - If both fail, exit with error

3. **OCR Fails**
   - Return empty labels (confidence = 0)
   - All fields get "manual_review" status
   - Continue pipeline, don't fail

4. **Code Matching Fails**
   - Return null code (no match)
   - Set warning message
   - Field marked for manual review

5. **Property Generation**
   - Always succeeds (validates inputs)
   - Creates basic property object
   - Returns with confidence level

## Extension Points

### Adding a New Form Template

1. Edit `master-list-map.js`
2. Add to `formMappings`:
```javascript
'new-form-v1': {
  'Label Text': {code: 'alis.field.code', confidence: 0.99},
  ...
}
```
3. Run with: `--template new-form-v1`

### Adding a New ALIS Field

1. Edit `master-list-map.js`
2. Add to `alisFields`:
```javascript
'alis.section.field_name': {
  label: 'Display Label',
  read_only: false,
  type: 'section'
}
```

### Adding a New Generic Pattern

1. Edit `master-list-map.js`
2. Add to `genericPatterns`:
```javascript
'generic.text_custom.1': {
  patterns: ['keyword1', 'keyword2'],
  type: 'text',
  required: false,
  confidence: 0.85
}
```

### Adjusting Confidence Thresholds

1. **Fuzzy matching threshold**: `code-matcher.js` line 88
   - Lower = more lenient matches
   - Higher = stricter matches

2. **Approval status thresholds**: `property-suggester.js` lines 68-73
   - Adjust confidence cutoffs per your needs

3. **OCR search radius**: Pass via CLI `--radius 100`
   - Default: 100 pixels from field center
   - Increase for distant labels
   - Decrease for crowded forms

---

This architecture enables easy iteration, testing, and expansion while maintaining clear separation of concerns.
