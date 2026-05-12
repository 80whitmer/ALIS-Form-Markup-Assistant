# ALIS Form Markup → alis-hub Integration Guide

**Status**: PoC Complete | Integration Starting  
**Date**: May 11, 2026

---

## What's Been Built (PoC)

### Core Modules (Production-Ready)
Located: `form-markup-poc/`

1. **field-detector.js** — Detects AcroForm fields from Tungsten-marked PDFs
   - Function: `detectFieldsFromPDF(pdfPath)`
   - Returns: Array of field objects with position, type, name

2. **label-extractor.js** — Extracts text labels via OCR (Tesseract.js)
   - Function: `extractTextNearFields(pdfPath, detectedFields, searchRadius)`
   - Returns: Field → label mappings with confidence scores

3. **code-matcher.js** — 4-level fuzzy matching strategy
   - Function: `matchLabelToCode(label, formTemplate)`
   - Strategy: Template → Exact → Fuzzy → Patterns
   - Returns: {code, confidence, match_type}

4. **property-suggester.js** — Generates complete property objects
   - Function: `generatePropertySuggestions(fieldLabels, formTemplate)`
   - Returns: Suggestions array + summary statistics
   - Status thresholds: auto_approve (≥95%), approve_likely (80-95%), review_needed (70-80%), manual_review (<70%)

5. **master-list-map.js** — ALIS/generic code definitions
   - alisFields: 14+ ALIS codes
   - genericPatterns: 14+ pattern mappings
   - formMappings: move-in-assessment-v1 + extensible

### React UI (ui-app-v2.html)
- PDF upload (drag-drop)
- Signer management (color-coded: Resident, Physician, Staff, Responsible Party, Unassigned)
- Field type display (text, signature, checkbox, radio)
- Editable anchor names (click-to-edit)
- Page navigation with quick-jump tabs
- Confidence scoring with color-coded bars
- Per-field approve/reject with bulk actions
- JSON export of suggestions

### Configuration
- package.json with dependencies: pdf-lib, tesseract.js, fuse.js, yargs

---

## How to Use in alis-hub Integration

### Importing PoC Modules
```javascript
// In alis-hub/server/automation/form-markup.js

const { detectFieldsFromPDF } = require('../../../form-markup-poc/field-detector');
const { extractTextNearFields } = require('../../../form-markup-poc/label-extractor');
const { generatePropertySuggestions } = require('../../../form-markup-poc/property-suggester');

// Pipeline:
const fields = await detectFieldsFromPDF(pdfPath);
const labels = await extractTextNearFields(pdfPath, fields, 100);
const suggestions = await generatePropertySuggestions(labels, formTemplate);
```

### PoC vs alis-hub Responsibility

| Component | Location | Purpose |
|-----------|----------|---------|
| Field detection | form-markup-poc/ | Core logic (reuse as-is) |
| Label extraction | form-markup-poc/ | Core logic (reuse as-is) |
| Code matching | form-markup-poc/ | Core logic (reuse as-is) |
| Property applier | **alis-hub/server/automation/** | NEW - writes changes to PDF |
| Job orchestrator | **alis-hub/server/automation/form-markup.js** | Coordinates pipeline + SSE |
| Job template | **alis-hub/server/automation/templates.json** | Template definition |
| Audit/logging | **alis-hub/server/automation/audits-manager.js** | Persistence + history |
| Client UI | **alis-hub/client/** | Upload, review, apply, download |

---

## Next Steps: alis-hub Integration

### Phase 1: Template & Handler
1. Add `form-markup` entry to `templates.json`
2. Create `form-markup.js` job handler
3. Create `property-applier.js` module

### Phase 2: API & Client
1. Leverage existing API endpoints (`api/jobs.js`)
2. Build React UI component in alis-hub/client
3. Wire upload → analysis → editing → apply workflow

### Phase 3: Audit & History
1. Create `audits-manager.js` for logging
2. Add audit endpoints
3. Display job history with cards

---

## File Paths Reference

**PoC location:**
```
C:\Users\AaronWhitmer\OneDrive - Default Directory\Documents\Claude\Projects\ALIS Form Markup Assistant\form-markup-poc\
```

**alis-hub location:**
```
C:\Users\AaronWhitmer\alis-hub\
```

**Relative path from alis-hub/server/automation to PoC:**
```
../../../form-markup-poc/
```

---

## Key Design Decisions

1. **Keep PoC separate** — Core detection/extraction/matching logic lives in PoC, can be tested independently
2. **Integrate pipeline** — alis-hub job handler orchestrates the PoC pipeline
3. **Property applier in alis-hub** — New module writes changes back to PDF using pdf-lib
4. **Leverage alis-hub infrastructure** — Job persistence, SSE, database, API routing

---

## Quick Test Commands

**Test PoC standalone:**
```bash
cd form-markup-poc
npm start -- --pdf "path/to/form.pdf"
```

**Test alis-hub integration:**
(Once built) POST to `/api/jobs` with template `form-markup` + PDF payload

---

**Status**: Ready to start alis-hub integration  
**Next**: Build template, handler, applier, UI
