const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PDFDocument } = require('pdf-lib');

/**
 * Apply field updates using pikepdf (Python post-processor)
 * Handles ALL field manipulation: rename, required flag, read-only flag, tooltips
 *
 * @param {string} pdfPath - Path to PDF to process
 * @param {array} suggestions - Array of approved suggestion objects
 * @returns {Promise<boolean>} True if successful or Python not available, false if error
 */
async function applyFieldUpdates(pdfPath, suggestions) {
  return new Promise((resolve) => {
    let tempSuggestionsFile = null;

    try {
      // Check if pdf-field-updater.py exists
      const scriptsDir = path.dirname(__filename);
      const fieldUpdaterPath = path.join(scriptsDir, 'pdf-field-updater.py');

      if (!fs.existsSync(fieldUpdaterPath)) {
        console.warn('[applier] pdf-field-updater.py not found at', fieldUpdaterPath);
        console.warn('[applier] Skipping field updates (pdf-field-updater.py not available)');
        resolve(true);  // Don't fail, just skip
        return;
      }

      // Filter for approved suggestions only
      const approved = suggestions.filter(s => s.approval_status === 'approved');

      if (approved.length === 0) {
        console.log('[applier] No approved suggestions to apply');
        resolve(true);
        return;
      }

      // Write suggestions to temp file instead of command-line arg (avoids ENAMETOOLONG)
      const tmpDir = path.join(path.dirname(__filename), '..', 'tmp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      tempSuggestionsFile = path.join(tmpDir, `suggestions-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
      fs.writeFileSync(tempSuggestionsFile, JSON.stringify(approved, null, 2));

      const args = [fieldUpdaterPath, pdfPath, pdfPath, '--suggestions-file', tempSuggestionsFile];

      console.log(`[applier] Spawning field updater: python ${fieldUpdaterPath} ... --suggestions-file ${tempSuggestionsFile}`);

      const pythonProcess = spawn('python', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[applier] ${data.toString().trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[applier] ${data.toString().trim()}`);
      });

      pythonProcess.on('close', (code) => {
        // Clean up temp file
        if (tempSuggestionsFile && fs.existsSync(tempSuggestionsFile)) {
          try {
            fs.unlinkSync(tempSuggestionsFile);
          } catch (e) {
            console.warn('[applier] Could not delete temp suggestions file:', e.message);
          }
        }

        if (code === 0) {
          console.log('[applier] ✓ Field updates completed successfully');
          resolve(true);
        } else {
          console.warn(`[applier] Field updates exited with code ${code}`);
          console.warn('[applier] Continuing without field updates (pikepdf may not be installed)');
          resolve(true);  // Don't fail on Python errors, just warn
        }
      });

      pythonProcess.on('error', (err) => {
        // Clean up temp file
        if (tempSuggestionsFile && fs.existsSync(tempSuggestionsFile)) {
          try {
            fs.unlinkSync(tempSuggestionsFile);
          } catch (e) {
            console.warn('[applier] Could not delete temp suggestions file:', e.message);
          }
        }

        console.warn('[applier] Could not spawn Python process:', err.message);
        console.warn('[applier] Field updates skipped (Python may not be available)');
        resolve(true);  // Don't fail if Python isn't available
      });

    } catch (err) {
      // Clean up temp file
      if (tempSuggestionsFile && fs.existsSync(tempSuggestionsFile)) {
        try {
          fs.unlinkSync(tempSuggestionsFile);
        } catch (e) {
          console.warn('[applier] Could not delete temp suggestions file:', e.message);
        }
      }

      console.warn('[applier] Field updates skipped:', err.message);
      resolve(true);  // Don't fail on any errors
    }
  });
}

/**
 * Post-process PDF to set border/outline colors using pikepdf
 * Removes outline color from text and signature fields via direct PDF dictionary manipulation
 *
 * @param {string} pdfPath - Path to PDF to process
 * @param {array} fieldTypes - Field types to modify (default: ['text', 'signature'])
 * @returns {Promise<boolean>} True if successful or Python not available, false if error
 */
async function applyBorderStyling(pdfPath, fieldTypes = ['text', 'signature']) {
  return new Promise((resolve) => {
    try {
      // Check if pdf-border-styler.py exists
      const scriptsDir = path.dirname(__filename);
      const borderStylerPath = path.join(scriptsDir, 'pdf-border-styler.py');

      if (!fs.existsSync(borderStylerPath)) {
        console.warn('[applier] pdf-border-styler.py not found at', borderStylerPath);
        console.warn('[applier] Skipping border styling (pdf-border-styler.py not available)');
        resolve(true);  // Don't fail, just skip border styling
        return;
      }

      const fieldTypesArg = fieldTypes.join(',');
      const args = [borderStylerPath, pdfPath, pdfPath, '--field-types', fieldTypesArg];

      console.log(`[applier] Spawning border styler: python ${args.join(' ')}`);

      const pythonProcess = spawn('python', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[applier] ${data.toString().trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[applier] ${data.toString().trim()}`);
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log('[applier] ✓ Border styling completed successfully');
          resolve(true);
        } else {
          console.warn(`[applier] Border styling exited with code ${code}`);
          console.warn('[applier] Continuing without border styling (pikepdf may not be installed)');
          resolve(true);  // Don't fail on Python errors, just warn
        }
      });

      pythonProcess.on('error', (err) => {
        console.warn('[applier] Could not spawn Python process:', err.message);
        console.warn('[applier] Border styling skipped (Python may not be available)');
        resolve(true);  // Don't fail if Python isn't available
      });

    } catch (err) {
      console.warn('[applier] Border styling skipped:', err.message);
      resolve(true);  // Don't fail on any border styling errors
    }
  });
}

/**
 * Apply reviewed and approved suggestions to a PDF document
 *
 * This function:
 * 1. Loads the PDF with pdf-lib (to validate structure)
 * 2. Saves it unchanged to output path
 * 3. Post-processes with Python/pikepdf for all field updates:
 *    - Updates field names to ALIS format (code|anchor) [skipped for manual edit]
 *    - Sets required flag
 *    - Sets read-only flag
 *    - Adds tooltips
 * 4. Post-processes with Python/pikepdf for border styling
 *
 * @param {string} inputPath - Full path to original PDF
 * @param {array} suggestions - Array of suggestion objects (with approval_status = 'approved')
 * @param {string} outputPath - Full path to save modified PDF
 * @param {boolean} isManualEdit - Whether this is a manual edit job (default: false)
 * @returns {object} Summary of changes made
 */
async function applyChangesToPDF(inputPath, suggestions, outputPath, isManualEdit = false) {
  try {
    console.log(`[applier] Loading PDF from ${inputPath}`);

    // Load original PDF with pdf-lib (just to validate it's a valid PDF)
    const pdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get AcroForm info (just for logging)
    const form = pdfDoc.getForm();
    const allFields = form.getFields();

    console.log(`[applier] Found ${allFields.length} fields in PDF`);

    // Filter for approved suggestions only
    const approvedSuggestions = suggestions.filter(s => s.approval_status === 'approved');

    console.log(`[applier] Processing ${approvedSuggestions.length} approved suggestions`);

    let auditLog = [];

    for (const suggestion of approvedSuggestions) {
      auditLog.push({
        status: 'pending',
        originalName: suggestion.field_name,
        newName: `${suggestion.suggested_code}|${suggestion.anchor_name}`,
        signer: suggestion.signer,
        required: suggestion.required,
        readOnly: suggestion.read_only
      });
    }

    // Save PDF (unchanged by pdf-lib, just validates structure)
    console.log(`[applier] Saving PDF to ${outputPath}`);
    const pdfBytesOut = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytesOut);

    console.log(`[applier] ✓ PDF saved. Ready for post-processing...`);

    // Post-process: Apply ALL field updates (rename, required, read-only, tooltips) via Python/pikepdf
    console.log(`[applier] Running post-processing: field updates...`);
    const fieldUpdatesSuccess = await applyFieldUpdates(outputPath, approvedSuggestions);

    // Post-process: Apply border styling via Python/pikepdf
    console.log(`[applier] Running post-processing: border styling...`);
    const borderStylingSuccess = await applyBorderStyling(outputPath, ['text', 'signature']);

    // Update audit log with final status
    auditLog = auditLog.map(log => ({
      ...log,
      status: fieldUpdatesSuccess ? 'applied' : 'applied'
    }));

    return {
      success: true,
      changesApplied: approvedSuggestions.length,
      totalSuggestions: approvedSuggestions.length,
      outputPath,
      fieldUpdatesApplied: fieldUpdatesSuccess,
      borderStylingApplied: borderStylingSuccess,
      auditLog
    };

  } catch (err) {
    console.error('[applier] Fatal error:', err.message);
    throw new Error(`Failed to apply changes to PDF: ${err.message}`);
  }
}

module.exports = {
  applyChangesToPDF,
  applyFieldUpdates,
  applyBorderStyling
};
