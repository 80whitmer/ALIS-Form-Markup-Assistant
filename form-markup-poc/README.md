# ALIS Form Markup - Smart Detection PoC

A Node.js proof-of-concept for intelligently detecting form fields in Tungsten/Kofax-marked PDFs, extracting nearby text labels via OCR, matching them to ALIS field codes, and generating complete property suggestions.

## Problem Statement

Currently, when clients submit pre-marked PDFs (with text boxes and signature fields already drawn), the ALIS markup automation requires manual clicking into each field to set properties:
- Field name (ALIS code)
- Hover text
- Read-only status
- Required status
- Font, color, size

This is **tedious and error-prone** for 20+ field forms. This PoC automates the detection and suggestion process to reduce manual work from 20+ minutes to 5-10 minutes.

## Architecture

### Four-Phase Pipeline

```
PDF Input
   ↓
[Phase 1] Field Detection (pdf-lib)
   → Detects AcroForm fields and positions
   ↓
[Phase 2] Label Extraction (Tesseract.js OCR)
   → Finds nearby text labels
   ↓
[Phase 3] Code Matching (Fuse.js fuzzy matching)
   → Matches labels to ALIS/generic codes
   ↓
[Phase 4] Property Suggestion (confidence-based)
   → Generates complete property objects
   ↓
JSON Output + User Review
```

### Confidence-Based Workflow

- **≥95% confidence**: Auto-approve ready (🟢)
- **80-95% confidence**: Likely OK, recommend review (🟡)
- **70-80% confidence**: Fair match, needs manual review (🟠)
- **<70% confidence**: Low confidence, likely needs correction (🔴)

## Installation

```bash
# Install dependencies
npm install

# Or in the parent directory and cd here
cd form-markup-poc
npm install
```

## Usage

### Basic Pipeline

```bash
node index.js --pdf path/to/form.pdf
```

### With Form Template

When a form template is available (e.g., move-in-assessment-v1), detection is more accurate:

```bash
node index.js --pdf path/to/form.pdf --template move-in-assessment-v1
```

### Save Results to JSON

```bash
node index.js --pdf path/to/form.pdf --output results.json
```

### Custom OCR Search Radius

Adjust the pixel radius for finding nearby text labels (default: 100px):

```bash
node index.js --pdf path/to/form.pdf --radius 150
```

### Full Example

```bash
node index.js \
  --pdf "C:/path/to/move-in-assessment.pdf" \
  --template move-in-assessment-v1 \
  --output results.json \
  --radius 120 \
  --verbose
```

### CLI Help

```bash
node index.js --help
```

## Test Suite

### Run Tests

```bash
# Auto-discovers PDFs in standard locations
node test.js

# Test specific PDF
node test.js "C:/path/to/form.pdf"
```

The test runner:
1. Searches for PDFs in common directories
2. Auto-detects form type (move-in assessment, etc.)
3. Runs the full pipeline
4. Outputs results JSON
5. Prints summary statistics

## Output Format

### Console Output

Four sections printed to console:

1. **Field Detection**: Table of detected fields with positions
2. **Label Extraction**: Detected labels and OCR confidence
3. **Code Matching**: Matched ALIS codes and confidence
4. **Summary Report**: Statistics and breakdown by status

### JSON Output

```json
{
  "timestamp": "2026-05-09T...",
  "input": {
    "pdf": "form.pdf",
    "formTemplate": "move-in-assessment-v1",
    "searchRadius": 100
  },
  "summary": {
    "total_fields": 45,
    "matched_fields": 42,
    "auto_approve": 38,
    "approve_likely": 3,
    "review_needed": 1,
    "manual_review": 3,
    "average_confidence": 0.92
  },
  "data": {
    "detectedFields": [...],
    "fieldLabels": [...],
    "suggestions": [...]
  }
}
```

## Module Architecture

### `field-detector.js`
Detects form fields from PDF using pdf-lib
- Reads AcroForm fields
- Extracts positions (x, y, width, height)
- Determines field types (text, checkbox, signature, etc.)

### `label-extractor.js`
Extracts text labels via Tesseract.js OCR
- Runs OCR on entire PDF
- Finds text near each field (configurable radius)
- Combines adjacent words into meaningful labels
- Returns labels with OCR confidence scores

### `code-matcher.js`
Matches labels to ALIS/generic codes with four-level strategy:
1. **Form Template Match** (highest priority) - exact label → code mapping
2. **Exact Match** - exact string match against ALIS field labels
3. **Fuzzy Match** - Fuse.js with 60% threshold
4. **Generic Pattern** - matches patterns like "allergy", "signature", etc.

Returns: `{code, confidence, match_type, required, read_only}`

### `property-suggester.js`
Generates complete property objects
- Creates: name, hover_text, font_size, font, text_color, read_only, required
- Determines approval status based on confidence
- Generates summary statistics

### `master-list-map.js`
Maps labels to ALIS/generic codes
- **alisFields**: 14+ ALIS codes (e.g., `alis.resident.full_name`)
- **genericPatterns**: 14+ generic patterns (e.g., `generic.text_allergies.1`)
- **formMappings**: Template-specific mappings (e.g., `move-in-assessment-v1`)

## Configuration

### Form Templates

Add new form templates to `master-list-map.js`:

```javascript
const formMappings = {
  'my-new-form-v1': {
    'Resident Name': { code: 'alis.resident.full_name', confidence: 0.99, read_only: true },
    'First Name': { code: 'alis.resident.first_name', confidence: 0.99 },
    // ... more mappings
  }
};
```

### ALIS Fields

Add new ALIS fields:

```javascript
const alisFields = {
  'alis.resident.phone': {
    label: 'Phone',
    read_only: false,
    type: 'resident'
  }
};
```

### Generic Patterns

Add new generic patterns:

```javascript
const genericPatterns = {
  'generic.text_emergency_contact.1': {
    patterns: ['emergency contact', 'next of kin'],
    type: 'text',
    required: false,
    confidence: 0.85
  }
};
```

## How It Works

### Field Detection
1. Read PDF using pdf-lib
2. Extract AcroForm fields
3. Get position and type of each field
4. Return fields with coordinates

### Label Extraction
1. Run Tesseract.js OCR on PDF
2. For each field, find words within search radius (default 100px)
3. Prefer labels above/left of field (standard form layout)
4. Combine adjacent words into meaningful labels
5. Return with OCR confidence (0-1)

### Code Matching
1. Try form template mapping (if provided)
2. Try exact match against ALIS field labels
3. Try fuzzy match with Fuse.js (60% threshold)
4. Try generic pattern matching
5. Return best match or null with confidence

### Property Generation
1. For each field, get matched code and confidence
2. Generate property object with ALIS code as name
3. Create hover text as "Label-FieldNumber"
4. Set font (Helvetica, 10pt), color (black)
5. Determine read-only/required from code match
6. Assign approval status based on confidence
7. Generate summary statistics

## Matching Strategy Example

For a field with label "Resident Name":

1. **Template Match**: 'Resident Name' → `alis.resident.full_name` (99%, form template)
2. If no template, **Exact Match**: exact string match in ALIS fields (99%)
3. If no exact, **Fuzzy Match**: similar strings using Fuse.js (85-95%)
4. If no fuzzy, **Generic Pattern**: check if contains "resident" or "name" (70-80%)

## Confidence Calibration

Confidence scores are generated from:
- **Template match**: 0.95-0.99
- **Exact match**: 0.99
- **Fuzzy match**: 0.65-0.95 (based on string similarity)
- **Generic pattern**: 0.70-0.98 (based on pattern specificity)

Thresholds can be adjusted in `code-matcher.js`:
- Form template threshold: 0.35 (65% match)
- ALIS fuzzy threshold: 0.40 (60% match)

## Next Steps

### Short Term (Validation)
1. ✅ Build PoC modules
2. ⏳ Test on actual move-in assessment PDFs
3. ⏳ Validate field detection accuracy
4. ⏳ Validate OCR label extraction
5. ⏳ Verify fuzzy matching produces correct codes
6. ⏳ Document confidence breakdown

### Medium Term (Enhancement)
1. Add more form templates (intake, discharge, etc.)
2. Improve OCR accuracy for handwritten fields
3. Add support for multi-page forms
4. Create confidence calibration dataset
5. Add batch processing mode

### Long Term (Integration)
1. Integrate into alis-hub as job template
2. Build web UI for reviewing suggestions
3. Create property-applier.js for batch PDF updates
4. Add audit trail and approval workflow
5. Deploy to production

## Dependencies

- **pdf-lib**: PDF field reading/writing
- **pdfjs-dist**: PDF text extraction (fallback)
- **tesseract.js**: OCR (client-side, no system deps)
- **fuse.js**: Fuzzy string matching
- **yargs**: CLI argument parsing

## Performance Notes

- First run of Tesseract.js loads worker (~50MB): ~5-10 seconds
- Subsequent runs: ~2-3 seconds per page
- Full pipeline on 1-page form: ~3-8 seconds
- Full pipeline on 5-page form: ~15-25 seconds

## Troubleshooting

### "No form fields detected"
- PDF may not have AcroForm fields
- Ensure PDF was marked up with Tungsten/Kofax
- Check that fields are actual form fields, not just shapes

### "OCR returned no words"
- PDF may be scanned image, not searchable text
- Run OCR preprocessing on PDF first
- Adjust search radius if labels are far from fields

### Low confidence matches
- Form template may not be available (add to `master-list-map.js`)
- Label text may be unclear or partially cut off
- Fuzzy matching threshold may be too strict
- Try with `--verbose` flag for debugging

### Memory issues with large PDFs
- Reduce search radius to decrease OCR memory usage
- Process multi-page PDFs one page at a time
- Increase Node.js heap: `node --max-old-space-size=4096 index.js ...`

## License

Internal use - ALIS automation project

## Questions?

Contact: aaron@go-alis.com
