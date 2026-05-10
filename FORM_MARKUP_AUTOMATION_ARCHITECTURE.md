# Form Markup Automation Architecture
**Smart Detection + Batch Property Application for Tungsten PDFs**

---

## Problem Statement

Tungsten-marked PDFs arrive with:
- ✅ Text boxes and signature boxes already **drawn** (positioned correctly)
- ❌ Field **properties** missing, incorrect, or non-standard (names, hover text, read-only flags, etc.)
- ❌ No ALIS field codes or generic codes assigned

**Current workflow:** Click each field → open properties → set name, hover text, read-only, required. **20+ minutes per form.**

**Desired workflow:** Upload PDF → AI suggests properties → review → apply all at once. **~10 minutes total.**

---

## Solution: Smart Detection Engine

### Three-Phase Approach

```
Phase 1: Field Detection
├─ Read Tungsten PDF
├─ Extract all drawn fields (position, type, current name)
└─ Output: Field list with positions

Phase 2: Label Detection & Matching
├─ OCR form to extract nearby labels
├─ Match labels to ALIS Master List + generic patterns
├─ Suggest: field codes, hover text, read-only, required flags
└─ Output: Suggested properties (JSON/CSV)

Phase 3: Review & Apply
├─ User reviews suggestions in web UI
├─ User edits any incorrect suggestions
├─ Script applies all properties to PDF
└─ Output: Marked PDF ready for integration
```

---

## Technical Stack

### Core Libraries

| Task | Library | Language | Why |
|---|---|---|---|
| **Read Tungsten PDF fields** | `pdf-lib` or `pdfjs-dist` | Node.js | Read form fields + annotations from PDF |
| **Extract text/labels** | `pdfjs-dist` + `Tesseract.js` | Node.js | Extract text near fields via OCR |
| **Write field properties** | `pdf-lib` | Node.js | Modify field names, flags, etc. |
| **Match labels → codes** | Custom fuzzy match | Node.js | Compare extracted labels to Master List |
| **Web UI** | React (existing in alis-hub) | TypeScript | Review/edit suggestions |

### Why This Stack

- **Node.js only** — matches alis-hub, single language
- **pdf-lib** — actively maintained, good for form field manipulation
- **Tesseract.js** — OCR in browser/Node, no external service needed
- **React** — integrates into existing alis-hub UI

---

## Data Flow

```
1. USER UPLOADS PDF + SELECTS FORM TEMPLATE
   ↓
2. FIELD DETECTION SERVICE
   ├─ Read PDF with pdf-lib
   ├─ Extract all form fields
   │  Example output:
   │  [
   │    { id: "field_1", type: "text", x: 100, y: 200, width: 200, height: 20 },
   │    { id: "field_2", type: "text", x: 100, y: 250, width: 200, height: 20 },
   │    { id: "field_3", type: "signature", x: 100, y: 600, width: 150, height: 40 }
   │  ]
   └─ Returns: Field coordinates + current properties
   ↓
3. LABEL EXTRACTION & OCR
   ├─ Use Tesseract.js to OCR entire PDF
   ├─ For each field, find nearest text label (scan radius: 50-100px)
   │  Example matches:
   │  field_1 → "Community Name" (above field)
   │  field_2 → "Address:" (to the left)
   │  field_3 → "Physician Signature" (above field)
   └─ Returns: Field → Label mapping
   ↓
4. INTELLIGENT CODE MATCHING
   ├─ Load ALIS Master List (JSON)
   ├─ For each label, fuzzy-match against:
   │  a) ALIS field codes (alis.facility.name, alis.resident.full_name, etc.)
   │  b) Generic patterns (generic.text_*, generic.check_*, generic.signature_*)
   │  c) Form template spec (if provided)
   │
   │  Example logic:
   │  "Community Name" → matches alis.facility.name (90% confidence)
   │  "Allergies" → matches generic.text_allergies.1 (85% confidence)
   │  "Physician Signature" → matches generic.signature_physician.1 (95% confidence)
   │
   └─ Returns: Suggested field codes + confidence scores
   ↓
5. PROPERTY SUGGESTION ENGINE
   ├─ For each field + suggested code:
   │  ├─ Field Name: use suggested code
   │  ├─ Hover Text: use form label + field number (e.g., "Community Name-0")
   │  ├─ Read Only: check Master List (if ALIS code) or default false (if generic)
   │  ├─ Required: check form template spec or default false
   │  ├─ Font Size: 10pt (standard)
   │  ├─ Font: Helvetica (standard)
   │  └─ Text Color: Black (standard)
   │
   │  Example output:
   │  {
   │    "field_id": "field_1",
   │    "detected_label": "Community Name",
   │    "suggested_name": "alis.facility.name",
   │    "confidence": 0.90,
   │    "suggested_properties": {
   │      "hover_text": "Community Name-0",
   │      "read_only": true,
   │      "required": false,
   │      "font_size": 10,
   │      "font": "Helvetica",
   │      "text_color": "#000000"
   │    }
   │  }
   │
   └─ Returns: Full suggestion manifest (JSON)
   ↓
6. USER REVIEW IN WEB UI
   ├─ Display table:
   │  Detected Label | Suggested Code | Confidence | Read-Only | Required | Actions
   │  Community Name | alis.facility.name | 90% | ☑️ | ☐ | [Edit] [Skip]
   │  Address | alis.facility.full_address | 92% | ☑️ | ☐ | [Edit] [Skip]
   │  Allergies | generic.text_allergies.1 | 85% | ☐ | ☑️ | [Edit] [Skip]
   │
   ├─ User can:
   │  ├─ Accept suggestion (just click through)
   │  ├─ Edit suggestion (dropdown autocomplete from Master List)
   │  ├─ Skip field (don't mark it up)
   │  └─ Reject suggestion (clear field code, mark for manual review)
   │
   └─ User clicks "Apply" when done
   ↓
7. BATCH PROPERTY APPLICATION
   ├─ Read original Tungsten PDF
   ├─ For each reviewed/approved field:
   │  ├─ Update field name property
   │  ├─ Update hover text
   │  ├─ Set read-only flag
   │  ├─ Set required flag
   │  └─ Update font/color/size
   │
   └─ Write all changes back to PDF (single operation)
   ↓
8. OUTPUT & VALIDATION
   ├─ Generate marked PDF
   ├─ Create validation report:
   │  ├─ Total fields: 39
   │  ├─ Successfully marked: 37
   │  ├─ Skipped: 2
   │  ├─ Manual review needed: 0
   │  └─ Checksum: validate properties were applied correctly
   │
   └─ Return marked PDF + report to user
```

---

## Core Module: Smart Field Detector

### Location in alis-hub

```
server/
├── automation/
│   ├── form-markup/                    # NEW MODULE
│   │   ├── field-detector.js           # Detect fields from PDF
│   │   ├── label-extractor.js          # OCR + extract nearby text
│   │   ├── code-matcher.js             # Match labels → ALIS/generic codes
│   │   ├── property-suggester.js       # Generate full property suggestions
│   │   ├── property-applier.js         # Write properties back to PDF
│   │   ├── validator.js                # Validate marked PDF
│   │   └── master-list.json            # Cached ALIS Master List
│   └── form-markup-job.js              # Main job handler
└── db/
    └── database.js                     # Add form_markup_jobs table
```

### API Endpoints

```
POST /api/jobs                          # Create new form markup job
├─ template_id: "smart-form-markup"
├─ form_template: "move-in-assessment-v1"
├─ pdf_file: <binary>
└─ Returns: { jobId, status: "queued" }

GET /api/jobs/:jobId                    # Get job status
└─ Returns: { status, fields_detected, suggestions, approved_count }

POST /api/jobs/:jobId/review            # Submit reviewed suggestions
├─ approved_fields: [{field_id, field_name, hover_text, read_only, required}]
└─ Returns: { status: "applying" }

GET /api/jobs/:jobId/download           # Download marked PDF
└─ Returns: Binary PDF file

SSE /api/stream/:jobId                  # Real-time progress
├─ field_detected: { field_id, position, type }
├─ label_detected: { field_id, label, confidence }
├─ suggestion_generated: { field_id, suggested_code }
├─ field_applied: { field_id, status }
└─ job_complete: { marked_pdf_url, validation_report }
```

### Job Template Definition (templates.json)

```json
{
  "id": "smart-form-markup",
  "name": "Smart Form Markup",
  "description": "Auto-detect fields, OCR labels, suggest ALIS codes, batch apply properties",
  "category": "compliance",
  "icon": "📄",
  "timeout": 300000,
  "scriptPath": "./form-markup-job.js",
  "inputSchema": {
    "type": "object",
    "title": "Smart Form Markup",
    "properties": {
      "form_template": {
        "type": "string",
        "title": "Form Template",
        "description": "Which form spec to use for property defaults (e.g., move-in-assessment-v1)",
        "enum": ["move-in-assessment-v1", "residency-agreement-v1", ...],
        "examples": ["move-in-assessment-v1"]
      },
      "pdf_file": {
        "type": "string",
        "title": "PDF File",
        "description": "Tungsten-marked PDF (file upload)"
      },
      "auto_apply": {
        "type": "boolean",
        "title": "Auto-Apply High-Confidence Suggestions",
        "description": "If true, auto-apply suggestions with >90% confidence, ask user for review on others",
        "default": false
      }
    },
    "required": ["form_template", "pdf_file"]
  }
}
```

---

## Database Schema Addition

```sql
CREATE TABLE IF NOT EXISTS form_markup_jobs (
  id                TEXT PRIMARY KEY,
  form_template     TEXT NOT NULL,
  pdf_filename      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'detecting',  -- detecting, reviewing, applying, done, failed
  fields_detected   INTEGER DEFAULT 0,
  suggestions_count INTEGER DEFAULT 0,
  approved_count    INTEGER DEFAULT 0,
  applied_count     INTEGER DEFAULT 0,
  error             TEXT,
  marked_pdf_path   TEXT,
  validation_report TEXT,  -- JSON with field counts, confidence stats
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS form_markup_suggestions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id            TEXT NOT NULL,
  field_id          TEXT NOT NULL,
  detected_label    TEXT,
  suggested_code    TEXT,
  confidence        REAL,
  read_only         BOOLEAN,
  required          BOOLEAN,
  approved          BOOLEAN DEFAULT FALSE,
  user_edited       BOOLEAN DEFAULT FALSE,
  notes             TEXT
);
```

---

## Algorithm: Fuzzy Label Matching

```javascript
/**
 * Match detected label to ALIS field code
 * Uses fuzzy string matching + contextual hints
 */
function matchLabelToCode(label, masterList, context) {
  const candidates = [];
  
  // 1. Exact match (highest confidence)
  const exact = masterList.find(f => 
    f.label.toLowerCase() === label.toLowerCase()
  );
  if (exact) return { code: exact.code, confidence: 1.0 };
  
  // 2. Fuzzy match using Levenshtein distance
  for (const field of masterList) {
    const similarity = levenshteinSimilarity(
      label.toLowerCase(),
      field.label.toLowerCase()
    );
    if (similarity > 0.70) {  // 70% threshold
      candidates.push({ code: field.code, confidence: similarity });
    }
  }
  
  // 3. Generic pattern matching
  if (label.includes('signature')) {
    return { code: 'generic.signature_X.1', confidence: 0.95 };
  }
  if (label.includes('checkbox') || label.includes('yes') || label.includes('no')) {
    return { code: 'generic.check_X.1', confidence: 0.90 };
  }
  if (label.includes('date')) {
    return { code: 'generic.date_X.1', confidence: 0.85 };
  }
  
  // 4. Field type context
  if (context.type === 'signature') {
    return { code: 'generic.signature_X.1', confidence: 0.80 };
  }
  
  // 5. Return best candidate or null
  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.confidence - a.confidence)[0];
  }
  
  return null;  // No match found, flag for manual review
}
```

---

## Implementation Phases

### Phase 1: Core Detection Engine (Week 1-2)
- [ ] Build field-detector.js (read Tungsten PDF fields)
- [ ] Build label-extractor.js (OCR nearby text)
- [ ] Build code-matcher.js (fuzzy match labels)
- [ ] Build property-suggester.js (generate suggestions)
- [ ] Write tests

**Output:** Node.js CLI tool that takes PDF + outputs suggestions JSON

### Phase 2: Web UI + Job Integration (Week 3)
- [ ] Add form_markup template to templates.json
- [ ] Build form-markup-job.js (alis-hub job handler)
- [ ] Add database tables
- [ ] Build React component for review UI
- [ ] Wire SSE events

**Output:** Fully integrated alis-hub template with review workflow

### Phase 3: Property Application & Validation (Week 4)
- [ ] Build property-applier.js (write to PDF)
- [ ] Build validator.js (test marked PDF)
- [ ] Add auto-apply option (high-confidence suggestions)
- [ ] Generate validation report

**Output:** Complete end-to-end workflow

### Phase 4: Form Template Specs (Ongoing)
- [ ] Create specs for top 5 forms
- [ ] Document how to add new form specs
- [ ] Create mapping database (labels → ALIS codes per form)

**Output:** Reusable specs for all 10+ forms

---

## Success Metrics

| Metric | Target |
|---|---|
| **Detection accuracy** | >95% fields detected |
| **Label matching confidence** | >85% average |
| **User review time** | <5 minutes per form |
| **Application speed** | <10 seconds to apply properties |
| **Time saved per form** | 75% reduction (20 min → 5 min) |
| **Error rate** | <2% properties applied incorrectly |

---

## Next Steps

1. **Prototype field detection** — Test pdf-lib + Tesseract.js on one Tungsten PDF
2. **Build label extractor** — Verify OCR accuracy on form text
3. **Create fuzzy matcher** — Map actual form labels to Master List
4. **Design review UI** — React table with edit/approve/skip flow
5. **Integrate into alis-hub** — Wire as new job template

---

## Questions for Aaron

1. **Form Templates:** Which 3 forms should we start with as prototypes?
2. **OCR Accuracy:** Are form labels clearly printed/machine-readable, or do they have poor quality scans?
3. **Tungsten Details:** What fields/properties does Tungsten preserve? (current field names, field types, etc.)
4. **Deployment:** Should this be web-only (in alis-hub), or also a standalone CLI tool?
5. **Auto-apply threshold:** If suggestion confidence >90%, auto-apply without user review, or always require human approval?
