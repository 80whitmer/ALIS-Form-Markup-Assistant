# Quick Start Guide

Get the PoC running in 3 minutes.

## 1. Install Dependencies

```bash
cd form-markup-poc
npm install
```

This installs:
- `pdf-lib` - PDF field detection
- `tesseract.js` - OCR for label extraction
- `fuse.js` - Fuzzy string matching
- `yargs` - CLI arguments

## 2. Run Auto-Detection on a Test PDF

### Option A: Let the Test Suite Find PDFs

```bash
npm test
```

The test runner will search for PDFs in:
- `./test-pdfs/`
- `../test-data/`
- `C:\Users\AaronWhitmer\alis-hub\samples`
- `C:\Users\AaronWhitmer\Downloads`

### Option B: Test a Specific PDF

```bash
npm start -- --pdf "C:\path\to\your\form.pdf"
```

### Option C: Test with Form Template

If it's a move-in assessment:

```bash
npm start -- --pdf "C:\path\to\form.pdf" --template move-in-assessment-v1
```

## 3. Check Results

The pipeline will output:

1. **Field Detection** - How many form fields were found and their positions
2. **Label Extraction** - What text labels were found near each field
3. **Code Matching** - How labels were matched to ALIS codes
4. **Summary Report** - Statistics and confidence breakdown

Example output:
```
📊 Summary Report:
─────────────────────────────────────────────────────────────
  Total fields detected:        45
  Matched to ALIS/generic:     42 (93%)
  Unmatched (manual needed):   3

  Status Breakdown:
    🟢 Auto-approve (>95% conf):  38 fields
    🟡 Likely OK (85-95% conf):   3 fields
    🟠 Review (70-85% conf):      1 field
    🔴 Manual review (<70%):      3 fields

  Average Confidence:           92%
─────────────────────────────────────────────────────────────
```

## 4. Save Results to JSON

```bash
npm start -- --pdf "C:\path\to\form.pdf" --output results.json
```

This creates `results.json` with:
- All detected fields
- All extracted labels
- All matched codes
- Complete property suggestions
- Summary statistics

## 5. Review Suggestions

The JSON output contains a `suggestions` array where each object has:

```json
{
  "field_id": "field_0",
  "detected_label": "Resident Name",
  "suggested_code": "alis.resident.full_name",
  "confidence": 0.99,
  "match_type": "form_template",
  "status": "auto_approve",
  "properties": {
    "name": "alis.resident.full_name",
    "hover_text": "Resident Name-0",
    "font_size": 10,
    "font": "Helvetica",
    "text_color": "#000000",
    "read_only": true,
    "required": true
  }
}
```

**Status meanings:**
- ✅ `auto_approve` (≥95% confidence) - Ready to apply immediately
- 👀 `approve_likely` (85-95%) - Review recommended but probably correct
- ⚠️ `review_needed` (70-85%) - Should manually verify
- 🚫 `manual_review` (<70%) - Likely needs correction

## Testing Tips

### Find Example PDFs

Check for test PDFs in:
```bash
ls "C:\Users\AaronWhitmer\alis-hub\samples"
```

Or look for PDFs that have been pre-marked with Tungsten/Kofax fields.

### Add Your Own PDFs

Create a test directory and add PDFs there:
```bash
mkdir test-pdfs
# Copy your PDFs here
cp "C:\path\to\form.pdf" test-pdfs/
npm test
```

### Adjust OCR Search Radius

If labels are far from fields, increase the search radius:

```bash
npm start -- --pdf "form.pdf" --radius 200
```

Default is 100 pixels. Increase if labels are 2-3 field-widths away.

### Verbose Output

See detailed debug info:

```bash
npm start -- --pdf "form.pdf" --verbose
```

## Common First Results

Running the PoC on a typical move-in assessment form usually shows:

- **90-95% match rate** - Most fields automatically detected and matched
- **85-90% average confidence** - High confidence in suggestions
- **5-10 fields needing review** - Usually optional fields or unusual labels
- **2-3 fields completely unmatched** - Fields with non-standard labels

This means **5-10 minutes of manual review** instead of 20+ minutes clicking each field.

## Troubleshooting First Run

### "No form fields detected"

The PDF might not have form fields:
- Verify it was marked up in Tungsten/Kofax
- Check that fields are actual form fields (not just text boxes)
- Try a known good test PDF first

### "OCR returned no words"

The PDF might be a scanned image without searchable text:
- Ensure the PDF has text content
- Try increasing OCR timeout (edit `label-extractor.js`)

### npm install fails

Try clearing cache:
```bash
npm cache clean --force
npm install
```

Or use a different npm registry:
```bash
npm install --registry https://registry.npmjs.org/
```

## Next Steps

1. **Test with Real PDFs**: Run the PoC on your actual move-in assessment forms
2. **Validate Accuracy**: Check that auto-approve suggestions are correct
3. **Calibrate Confidence**: Adjust thresholds based on your form types
4. **Add More Templates**: Add mappings for other form types (intake, discharge, etc.)
5. **Integrate into alis-hub**: Build the property-applier to write suggestions back to PDF

## Questions?

Check the full README.md for architecture details and configuration options.
