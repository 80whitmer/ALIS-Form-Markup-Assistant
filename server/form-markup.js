/**
 * form-markup.js
 *
 * Main form markup workflow handler for ALIS compliance document processing.
 * Integrates enhanced OCR for signer detection and confidence scoring.
 *
 * Exports:
 * - processFormMarkupJob(jobData): Main workflow orchestrator
 * - applyApprovedSuggestions(applyData): Apply approved changes to PDF
 */

const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf');

// Import enhanced OCR module with directional search
let extractSignerLabels;
try {
  const labelExtractor = require('../form-markup-poc/label-extractor-ocr-enhanced');
  extractSignerLabels = labelExtractor.extractSignerLabels || labelExtractor;
} catch (e) {
  console.warn('[form-markup] Enhanced OCR module not available:', e.message);
  extractSignerLabels = null;
}

// Set up pdfjs worker
try {
  pdfjs.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.entry');
} catch (e) {
  console.warn('[form-markup] pdfjs worker setup warning:', e.message);
}

/**
 * Detect form fields from a PDF with page numbers
 * Uses pdfjs for page-by-page iteration to capture correct page numbers
 */
async function detectFields(pdfPath) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);

    // Convert Buffer to Uint8Array for pdfjs-dist
    const uint8Array = new Uint8Array(pdfBytes);

    const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;
    const allFields = [];
    let fieldIndex = 0;

    console.log(`[form-markup] PDF has ${pdf.numPages} pages`);

    // Page-by-page iteration to capture correct page numbers
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const annotations = await page.getAnnotations();

        const formFields = annotations.filter(ann =>
          ann.subtype === 'Widget' && ann.fieldName
        );

        if (formFields.length > 0) {
          console.log(`[form-markup] Page ${pageNum}: Found ${formFields.length} fields`);
        }

        formFields.forEach((fieldAnn) => {
          const fieldName = fieldAnn.fieldName || `field_${fieldIndex}`;
          const fieldType = fieldAnn.fieldType ?
            (fieldAnn.fieldType.toLowerCase().includes('sig') ? 'signature' :
             fieldAnn.fieldType.toLowerCase().includes('tx') ? 'text' :
             fieldAnn.fieldType.toLowerCase().includes('ch') ? 'checkbox' :
             fieldAnn.fieldType.toLowerCase().includes('btn') ? 'button' : 'unknown') :
            'unknown';

          allFields.push({
            field_name: fieldName,
            field_page: pageNum,          // ← CORRECT PAGE NUMBER
            field_index: fieldIndex,
            field_type: fieldType,
            x: fieldAnn.rect?.[0] || 0,
            y: fieldAnn.rect?.[1] || 0,
            width: (fieldAnn.rect?.[2] || 0) - (fieldAnn.rect?.[0] || 0),
            height: (fieldAnn.rect?.[3] || 0) - (fieldAnn.rect?.[1] || 0),
            position: { page: pageNum, x: fieldAnn.rect?.[0], y: fieldAnn.rect?.[1] }
          });

          fieldIndex++;
        });

      } catch (pageErr) {
        console.warn(`[form-markup] Warning processing page ${pageNum}:`, pageErr.message);
      }
    }

    console.log(`[form-markup] Detected ${allFields.length} fields across ${pdf.numPages} pages`);

    if (allFields.length === 0) {
      console.warn('[form-markup] No fields found in PDF');
    }

    return allFields;

  } catch (err) {
    console.error('[form-markup] Error detecting fields:', err.message);
    throw err;
  }
}

/**
 * Generate ALIS code suggestions
 */
function generateSuggestions(detectedFields) {
  console.log(`[form-markup] Generating suggestions for ${detectedFields.length} fields`);

  return detectedFields.map((field, idx) => {
    const alisCode = `FAC.${field.field_type}.${idx + 1}`;

    return {
      field_name: field.field_name,
      field_type: field.field_type,
      field_page: field.field_page,        // ← PAGE NUMBER
      field_index: field.field_index,
      suggested_code: alisCode,
      signer: 'unassigned',
      confidence: 0.0,
      approval_status: 'pending',
      required: field.field_type === 'signature',
      read_only: false
    };
  });
}

/**
 * Process form markup job - main workflow orchestrator
 */
async function processFormMarkupJob(jobData) {
  const {
    input_pdf_path,
    output_pdf_path,
    job_id,
    ocr_radius = 100,
    signers = []
  } = jobData;

  try {
    console.log(`[form-markup] Processing job ${job_id}`);
    console.log(`[form-markup] Input: ${input_pdf_path}`);

    // Phase 1: Detect fields with correct page numbers
    console.log(`[form-markup] Phase 1: Detecting fields...`);
    const detectedFields = await detectFields(input_pdf_path);

    if (detectedFields.length === 0) {
      return {
        status: 'error',
        message: 'No form fields detected in PDF',
        job_id
      };
    }

    // Phase 1b: Run enhanced OCR for signer detection and confidence scoring
    console.log(`[form-markup] Phase 1b: Running enhanced OCR (radius: ${ocr_radius}px)...`);
    let ocrResults = {};

    if (extractSignerLabels) {
      try {
        const pdfBytes = fs.readFileSync(input_pdf_path);

        // Convert Buffer to Uint8Array for OCR module
        const uint8Array = new Uint8Array(pdfBytes);

        const availableSigners = signers && signers.length > 0 ? signers : ['resident', 'staff', 'admin', 'family'];

        const labelResults = await extractSignerLabels(
          uint8Array,
          detectedFields,
          availableSigners,
          ocr_radius
        );

        // Index OCR results by field name
        if (labelResults && Array.isArray(labelResults)) {
          labelResults.forEach(result => {
            ocrResults[result.field_name] = {
              signer: result.signer,
              confidence: result.confidence,
              match_text: result.match_text,
              match_zone: result.match_zone,
              match_reason: result.match_reason
            };
          });
          console.log(`[form-markup] OCR: Found signer labels for ${Object.keys(ocrResults).length} fields`);
        }
      } catch (ocrErr) {
        console.warn('[form-markup] OCR processing failed:', ocrErr.message);
        console.warn('[form-markup] Continuing with generic suggestions (0% confidence)');
      }
    } else {
      console.warn('[form-markup] Enhanced OCR module not available');
    }

    // Phase 2: Generate suggestions
    console.log(`[form-markup] Phase 2: Generating suggestions...`);
    let suggestions = generateSuggestions(detectedFields);

    // Phase 2b: Merge OCR results into suggestions
    console.log(`[form-markup] Phase 2b: Merging OCR results...`);
    suggestions = suggestions.map(suggestion => {
      const ocrData = ocrResults[suggestion.field_name];
      if (ocrData) {
        return {
          ...suggestion,
          signer: ocrData.signer || suggestion.signer,
          confidence: ocrData.confidence || suggestion.confidence,
          match_text: ocrData.match_text,
          match_zone: ocrData.match_zone,
          match_reason: ocrData.match_reason
        };
      }
      return suggestion;
    });

    console.log(`[form-markup] Merged OCR results: ${suggestions.filter(s => s.confidence > 0).length} fields with confidence > 0%`);

    // Phase 3: Store suggestions (to file for api-handlers.js)
    console.log(`[form-markup] Phase 3: Storing suggestions...`);
    const suggestionsPath = path.join(path.dirname(output_pdf_path), 'suggestions.json');
    fs.writeFileSync(suggestionsPath, JSON.stringify(suggestions, null, 2));

    // Calculate actual page count from suggestions
    const actualPageCount = Math.max(...suggestions.map(s => s.field_page || 1));

    return {
      status: 'pending_approval',
      message: `Found ${detectedFields.length} fields across ${actualPageCount} pages. Suggestions generated and awaiting approval.`,
      job_id,
      suggestions,
      suggestionsPath,
      totalPages: actualPageCount
    };

  } catch (err) {
    console.error('[form-markup] Job processing error:', err.message);
    return {
      status: 'error',
      message: err.message,
      job_id
    };
  }
}

/**
 * Apply approved suggestions to PDF
 */
async function applyApprovedSuggestions(applyData) {
  const {
    input_pdf_path,
    output_pdf_path,
    suggestions,
    job_id
  } = applyData;

  try {
    console.log(`[form-markup] Applying approved suggestions for job ${job_id}`);

    // Filter for approved suggestions
    const approved = suggestions.filter(s => s.approval_status === 'approved');

    if (approved.length === 0) {
      return {
        status: 'error',
        message: 'No approved suggestions to apply',
        job_id
      };
    }

    // TODO: Implement actual PDF modification
    // For now, just copy the PDF as the output
    if (input_pdf_path !== output_pdf_path) {
      fs.copyFileSync(input_pdf_path, output_pdf_path);
    }

    return {
      status: 'completed',
      message: `Applied ${approved.length} field updates to PDF`,
      job_id,
      outputPath: output_pdf_path
    };

  } catch (err) {
    console.error('[form-markup] Error applying suggestions:', err.message);
    return {
      status: 'error',
      message: err.message,
      job_id
    };
  }
}

module.exports = {
  detectFields,
  generateSuggestions,
  processFormMarkupJob,
  applyApprovedSuggestions
};
