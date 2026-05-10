# Technical Implementation Guide
**Smart Form Markup for Node.js + alis-hub**

---

## Library Selection & Feasibility

### PDF Field Reading (Tungsten PDFs)

| Library | Can Read Form Fields? | Can Write Properties? | Recommendation |
|---|---|---|---|
| **pdf-lib** | ✅ Yes (AcroForm) | ✅ Yes | **Primary choice** |
| **PDFKit** | ⚠️ Limited | ⚠️ Limited | Fallback only |
| **pdfjs-dist** | ✅ Yes (read-only) | ❌ No | Read-only inspection |

**Decision:** Use **pdf-lib** as primary (can read + write AcroForm fields), with **pdfjs-dist** as helper for text extraction.

### OCR & Text Extraction

| Library | Language | Speed | Accuracy | Recommendation |
|---|---|---|---|---|
| **Tesseract.js** | JavaScript (WASM) | ~2-5 sec per page | 85-90% | **Use this** |
| **pdf-parse** | Node.js | ~0.5 sec per page | Text only, not OCR | Complement Tesseract |
| **node-tesseract-ocr** | Node.js wrapper | Requires system binary | ~95% | Production fallback |

**Decision:** Start with **Tesseract.js** (no system dependencies, works in Node), optionally upgrade to **node-tesseract-ocr** if accuracy needed.

### Fuzzy String Matching

```javascript
npm install fuse.js  // Fuzzy search library
```

---

## Proof of Concept: Field Detector

### Step 1: Extract Fields from Tungsten PDF

```javascript
// field-detector.js
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function detectFieldsFromPDF(pdfPath) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  // Get AcroForm (form fields)
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  
  const detectedFields = [];
  
  for (const field of fields) {
    // Get field metadata
    const fieldName = field.getName();
    const fieldType = field.constructor.name; // PDFTextField, PDFCheckBox, PDFSignature, etc.
    
    // Try to get position from widget annotations
    const widgets = field.acroField.getWidgets() || [];
    const widget = widgets[0];
    
    let position = null;
    if (widget && widget.getRectangle) {
      const rect = widget.getRectangle();
      position = {
        page: 0,  // Would need to find actual page
        x: rect[0],
        y: rect[1],
        width: rect[2] - rect[0],
        height: rect[3] - rect[1]
      };
    }
    
    detectedFields.push({
      id: fieldName || `field_${detectedFields.length + 1}`,
      name: fieldName,
      type: fieldType.replace('PDF', '').toLowerCase(),  // 'textfield' → 'text'
      position: position,
      currentValue: field.getValue ? field.getValue() : null
    });
  }
  
  return detectedFields;
}

module.exports = { detectFieldsFromPDF };
```

### Step 2: Extract Text Near Fields (OCR)

```javascript
// label-extractor.js
const Tesseract = require('tesseract.js');
const { PDFDocument } = require('pdf-lib');
const PDFParser = require('pdfjs-dist/legacy/build/pdf');

async function extractTextNearFields(pdfPath, detectedFields, searchRadius = 80) {
  // 1. OCR the entire PDF to get text blocks with positions
  const textBlocks = await ocrPDF(pdfPath);
  
  // 2. For each field, find nearest text labels
  const fieldLabels = [];
  
  for (const field of detectedFields) {
    if (!field.position) continue;
    
    // Find all text within searchRadius of field
    const nearbyText = textBlocks.filter(block => {
      const distance = getDistance(
        { x: field.position.x, y: field.position.y },
        { x: block.x, y: block.y }
      );
      return distance < searchRadius;
    });
    
    // Sort by distance, take closest
    const closest = nearbyText.sort((a, b) => 
      getDistance(field.position, { x: a.x, y: a.y }) -
      getDistance(field.position, { x: b.x, y: b.y })
    )[0];
    
    fieldLabels.push({
      field_id: field.id,
      detected_label: closest ? closest.text : null,
      confidence: closest ? closest.confidence : 0,
      text_position: closest ? { x: closest.x, y: closest.y } : null
    });
  }
  
  return fieldLabels;
}

async function ocrPDF(pdfPath) {
  // Use Tesseract.js to OCR the PDF
  const result = await Tesseract.recognize(pdfPath, 'eng');
  
  // Parse Tesseract output to get word positions
  const words = result.data.words || [];
  
  return words.map(word => ({
    text: word.text,
    x: word.bbox.x0,
    y: word.bbox.y0,
    confidence: word.confidence / 100  // 0-1
  }));
}

function getDistance(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

module.exports = { extractTextNearFields };
```

### Step 3: Match Labels to ALIS Codes

```javascript
// code-matcher.js
const Fuse = require('fuse.js');
const masterList = require('./master-list.json');

function matchLabelToCode(label, formTemplate = null) {
  if (!label || label.trim() === '') {
    return { code: null, confidence: 0, reason: 'Empty label' };
  }
  
  // 1. Exact match (highest confidence)
  const exactMatch = masterList.find(f =>
    f.label.toLowerCase() === label.toLowerCase()
  );
  if (exactMatch) {
    return { code: exactMatch.code, confidence: 0.99, match_type: 'exact' };
  }
  
  // 2. Fuzzy match
  const fuse = new Fuse(masterList, {
    keys: ['label'],
    threshold: 0.4,  // 60% match
    minMatchCharLength: 3
  });
  
  const fuzzyMatches = fuse.search(label);
  if (fuzzyMatches.length > 0) {
    const bestMatch = fuzzyMatches[0];
    const confidence = 1 - bestMatch.score;  // Fuse score is 0-1, lower is better
    
    return {
      code: bestMatch.item.code,
      confidence: Math.max(0.7, confidence),  // At least 70%
      match_type: 'fuzzy',
      field_label: bestMatch.item.label
    };
  }
  
  // 3. Generic pattern matching
  const patternMatches = matchGenericPatterns(label);
  if (patternMatches) {
    return { ...patternMatches, match_type: 'pattern' };
  }
  
  // 4. Form template specific matching
  if (formTemplate) {
    const templateMatch = matchFormTemplate(label, formTemplate);
    if (templateMatch) {
      return { ...templateMatch, match_type: 'template' };
    }
  }
  
  return { code: null, confidence: 0, reason: 'No match found' };
}

function matchGenericPatterns(label) {
  const lower = label.toLowerCase();
  
  // Signature patterns
  if (lower.includes('signature') || lower.includes('sign')) {
    return { code: 'generic.signature_X.1', confidence: 0.95 };
  }
  
  // Checkbox/Yes-No patterns
  if (lower.includes('checkbox') || lower.match(/yes\s*[\/#\/]\s*no/i)) {
    return { code: 'generic.check_X.1', confidence: 0.90 };
  }
  
  // Date patterns
  if (lower.includes('date') || lower.includes('when') || lower.includes('effective')) {
    return { code: 'generic.date_X.1', confidence: 0.85 };
  }
  
  // Initial patterns
  if (lower.includes('initial')) {
    return { code: 'generic.initial_X.1', confidence: 0.90 };
  }
  
  // Critical safety fields
  if (lower.includes('allerg')) {
    return { code: 'generic.text_allergies.1', confidence: 0.92, required: true };
  }
  
  if (lower.includes('medication')) {
    return { code: 'generic.text_medication.1', confidence: 0.88 };
  }
  
  return null;
}

function matchFormTemplate(label, templateId) {
  // Load form-specific mappings
  const templates = {
    'move-in-assessment-v1': {
      'Community Name': { code: 'alis.facility.name', read_only: true },
      'Resident Name': { code: 'alis.resident.full_name', read_only: true },
      'Allergies': { code: 'generic.text_allergies.1', required: true },
      'Assessment Date': { code: 'generic.date_assessment.1', required: true },
      // ... more mappings
    }
  };
  
  const templateMappings = templates[templateId];
  if (!templateMappings) return null;
  
  // Direct match first
  if (templateMappings[label]) {
    return { code: templateMappings[label].code, confidence: 1.0 };
  }
  
  // Fuzzy match within template
  const fuse = new Fuse(
    Object.entries(templateMappings).map(([label, config]) => ({
      label, ...config
    })),
    { keys: ['label'], threshold: 0.4 }
  );
  
  const matches = fuse.search(label);
  if (matches.length > 0) {
    const best = matches[0];
    return { code: best.item.code, confidence: 0.88 };
  }
  
  return null;
}

module.exports = { matchLabelToCode };
```

### Step 4: Generate Property Suggestions

```javascript
// property-suggester.js
const { matchLabelToCode } = require('./code-matcher');

function generatePropertySuggestions(detectedFields, fieldLabels, masterListMap, formTemplate = null) {
  const suggestions = [];
  
  for (const fieldLabel of fieldLabels) {
    const field = detectedFields.find(f => f.id === fieldLabel.field_id);
    if (!field) continue;
    
    // Match label to code
    const codeMatch = matchLabelToCode(fieldLabel.detected_label, formTemplate);
    
    if (!codeMatch.code) {
      // No match found - flag for manual review
      suggestions.push({
        field_id: field.id,
        field_type: field.type,
        detected_label: fieldLabel.detected_label,
        suggested_code: null,
        confidence: 0,
        status: 'needs_review',
        reason: codeMatch.reason
      });
      continue;
    }
    
    // Look up field in Master List for properties
    const masterField = masterListMap[codeMatch.code];
    const isALISField = codeMatch.code.startsWith('alis.');
    const isReadOnly = isALISField ? (masterField?.read_only || false) : false;
    
    suggestions.push({
      field_id: field.id,
      field_type: field.type,
      detected_label: fieldLabel.detected_label,
      suggested_code: codeMatch.code,
      confidence: codeMatch.confidence,
      status: codeMatch.confidence > 0.90 ? 'auto_approve' : 'review',
      properties: {
        name: codeMatch.code,
        hover_text: generateHoverText(fieldLabel.detected_label, field.id),
        read_only: isReadOnly || codeMatch.read_only || false,
        required: codeMatch.required || isRequiredField(codeMatch.code),
        font_size: 10,
        font: 'Helvetica',
        text_color: '#000000'
      },
      match_type: codeMatch.match_type
    });
  }
  
  return suggestions;
}

function generateHoverText(label, fieldId) {
  // Clean label and add field number
  const clean = label.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const count = parseInt(fieldId.split('_')[1] || '0');
  return `${clean}-${count}`;
}

function isRequiredField(code) {
  // Critical fields that are always required
  const requiredCodes = [
    'alis.resident.full_name',
    'generic.date_assessment.1',
    'generic.text_allergies.1',
    'generic.signature_physician.1'
  ];
  return requiredCodes.includes(code);
}

module.exports = { generatePropertySuggestions };
```

### Step 5: Apply Properties to PDF

```javascript
// property-applier.js
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function applyPropertiesTopPDF(pdfPath, approvedFields, outputPath) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  
  const results = [];
  
  for (const approved of approvedFields) {
    try {
      // Find field by ID
      const field = form.getField(approved.field_id);
      
      if (!field) {
        results.push({
          field_id: approved.field_id,
          status: 'failed',
          error: 'Field not found'
        });
        continue;
      }
      
      // Update field name (via metadata)
      // Note: pdf-lib doesn't directly expose field name setter
      // Workaround: update the field's internal dictionary
      const fieldDict = field.acroField.dict;
      fieldDict.set(PDFName.of('T'), PDFString.of(approved.properties.name));
      
      // Set default value (displays in form)
      if (field.setDefaultValue) {
        field.setDefaultValue(approved.properties.hover_text);
      }
      
      // Mark as read-only if needed
      if (approved.properties.read_only) {
        fieldDict.set(
          PDFName.of('Ff'),
          PDFNumber.of(fieldDict.get(PDFName.of('Ff'))?.asNumber() | 1)  // Set bit 0 (ReadOnly)
        );
      }
      
      // Mark as required if needed
      if (approved.properties.required) {
        fieldDict.set(
          PDFName.of('Ff'),
          PDFNumber.of(fieldDict.get(PDFName.of('Ff'))?.asNumber() | 8192)  // Set bit 13 (Required)
        );
      }
      
      results.push({
        field_id: approved.field_id,
        status: 'success',
        applied_properties: approved.properties
      });
      
    } catch (err) {
      results.push({
        field_id: approved.field_id,
        status: 'failed',
        error: err.message
      });
    }
  }
  
  // Save modified PDF
  const modifiedBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, modifiedBytes);
  
  return {
    output_path: outputPath,
    total_fields: approvedFields.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    details: results
  };
}

module.exports = { applyPropertiesToPDF };
```

---

## Integration into alis-hub

### New Job Handler

```javascript
// server/automation/form-markup-job.js
const { detectFieldsFromPDF } = require('./form-markup/field-detector');
const { extractTextNearFields } = require('./form-markup/label-extractor');
const { generatePropertySuggestions } = require('./form-markup/property-suggester');
const { applyPropertiesToPDF } = require('./form-markup/property-applier');
const { setJobStatus, setItemStatus, updateFormMarkupJob } = require('../db/database');
const { broadcast } = require('../api/broadcaster');

async function runFormMarkupJob(jobId, { form_template, pdf_file, auto_apply = false }) {
  const emit = (event, data) => broadcast(jobId, event, data);
  
  setJobStatus(jobId, 'running');
  emit('job_start', { jobId, stage: 'detecting' });
  
  try {
    // Stage 1: Detect fields
    emit('stage', 'Detecting fields...');
    const detectedFields = await detectFieldsFromPDF(pdf_file);
    emit('fields_detected', { count: detectedFields.length, fields: detectedFields });
    
    // Stage 2: Extract labels
    emit('stage', 'Extracting form labels...');
    const fieldLabels = await extractTextNearFields(pdf_file, detectedFields);
    emit('labels_extracted', { count: fieldLabels.length });
    
    // Stage 3: Generate suggestions
    emit('stage', 'Matching labels to ALIS codes...');
    const suggestions = generatePropertySuggestions(detectedFields, fieldLabels, masterListMap, form_template);
    emit('suggestions_generated', { count: suggestions.length, suggestions });
    
    // Save to DB for user review
    updateFormMarkupJob(jobId, { suggestions, status: 'reviewing' });
    
    // If auto_apply, apply high-confidence suggestions
    if (auto_apply) {
      const approved = suggestions.filter(s => s.confidence > 0.90);
      
      if (approved.length > 0) {
        emit('stage', 'Applying properties...');
        const result = await applyPropertiesToPDF(pdf_file, approved, `${pdf_file}.marked.pdf`);
        emit('job_done', { result });
      }
    } else {
      emit('status', { message: 'Waiting for user review', suggestions_count: suggestions.length });
    }
    
  } catch (err) {
    setJobStatus(jobId, 'failed');
    emit('job_error', { error: err.message });
  }
}

module.exports = { runFormMarkupJob };
```

---

## Package.json Dependencies

```json
{
  "dependencies": {
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^3.11.174",
    "tesseract.js": "^4.1.1",
    "fuse.js": "^7.0.0"
  }
}
```

---

## Estimated Complexity

| Module | Lines of Code | Complexity | Time |
|---|---|---|---|
| field-detector.js | 80-100 | Low | 2 hours |
| label-extractor.js | 150-200 | Medium | 4 hours |
| code-matcher.js | 200-250 | Medium | 5 hours |
| property-suggester.js | 150-180 | Low | 3 hours |
| property-applier.js | 120-150 | Low | 3 hours |
| Tests + refinement | - | - | 8-10 hours |
| **TOTAL** | ~700-900 | Medium | **25-30 hours** |

---

## Next Action Items

1. **Verify Tesseract.js works** with your sample PDFs
2. **Test pdf-lib field reading** against a Tungsten PDF
3. **Create master-list.json** mapping (extract from your Master List spreadsheet)
4. **Build form template mappings** (labels → ALIS codes for each form type)
5. **Prototype → test → integrate into alis-hub**
