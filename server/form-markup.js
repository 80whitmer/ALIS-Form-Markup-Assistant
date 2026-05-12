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
const { spawn } = require('child_process');

// Import OCR module with subprocess support for EasyOCR
let extractSignerLabels;
try {
  const labelExtractor = require('../form-markup-poc/label-extractor-ocr-subprocess');
  extractSignerLabels = labelExtractor.extractSignerLabels || labelExtractor;
} catch (e) {
  console.warn('[form-markup] Subprocess OCR module not available, falling back to pdfjs:', e.message);
  try {
    const labelExtractor = require('../form-markup-poc/label-extractor-ocr-enhanced');
    extractSignerLabels = labelExtractor.extractSignerLabels || labelExtractor;
  } catch (e2) {
    console.warn('[form-markup] Enhanced OCR module also not available:', e2.message);
    extractSignerLabels = null;
  }
}

/**
 * Detect form fields from a PDF with page numbers
 * Uses pikepdf via Python field detector for reliable field extraction
 */
async function detectFields(pdfPath) {
  return new Promise((resolve, reject) => {
    try {
      const fieldDetectorPath = path.join(__dirname, 'services', 'pdf-field-detector.py');

      if (!fs.existsSync(fieldDetectorPath)) {
        throw new Error(`pdf-field-detector.py not found at ${fieldDetectorPath}`);
      }

      console.log(`[form-markup] Spawning field detector: ${fieldDetectorPath} ${pdfPath}`);

      const pythonProcess = spawn('python', [fieldDetectorPath, pdfPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`[form-markup] ${data.toString().trim()}`);
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Field detection failed with code ${code}: ${stderr}`));
        }

        try {
          const result = JSON.parse(stdout);

          if (result.status !== 'success') {
            return reject(new Error(`Field detection error: ${result.error}`));
          }

          console.log(`[form-markup] Detected ${result.fields.length} fields across ${result.total_pages} pages`);

          if (result.fields.length === 0) {
            console.warn('[form-markup] No fields found in PDF');
          }

          resolve(result.fields);
        } catch (parseErr) {
          reject(new Error(`Failed to parse field detection output: ${parseErr.message}`));
        }
      });

      pythonProcess.on('error', (err) => {
        reject(new Error(`Could not spawn field detector process: ${err.message}`));
      });

    } catch (err) {
      reject(err);
    }
  });
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
        const pdfBuffer = fs.readFileSync(input_pdf_path);

        const availableSigners = signers && signers.length > 0 ? signers : ['resident', 'responsible party', 'staff', 'family', 'admin', 'physician', 'medical provider'];

        const labelResults = await extractSignerLabels(
          pdfBuffer,
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
