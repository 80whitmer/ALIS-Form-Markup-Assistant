const fs = require('fs');
const { PDFDocument, PDFName } = require('pdf-lib');

/**
 * Apply reviewed and approved suggestions to a PDF document
 *
 * For each approved suggestion, this function:
 * 1. Updates the field name to "alis.code|anchor" format
 * 2. Sets the required flag
 * 3. Sets the read-only flag
 * 4. Adds a tooltip with signer metadata
 *
 * @param {string} inputPath - Full path to original PDF
 * @param {array} suggestions - Array of suggestion objects (with approval_status = 'approved')
 * @param {string} outputPath - Full path to save modified PDF
 * @returns {object} Summary of changes made
 */
async function applyChangesToPDF(inputPath, suggestions, outputPath) {
  try {
    console.log(`[applier] Loading PDF from ${inputPath}`);

    // Load original PDF
    const pdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get AcroForm (form fields)
    const form = pdfDoc.getForm();
    const allFields = form.getFields();

    console.log(`[applier] Found ${allFields.length} fields in PDF`);

    let changesApplied = 0;
    const auditLog = [];

    // Filter for approved suggestions only
    const approvedSuggestions = suggestions.filter(s => s.approval_status === 'approved');

    console.log(`[applier] Applying ${approvedSuggestions.length} approved suggestions`);

    for (const suggestion of approvedSuggestions) {
      const {
        field_name: originalFieldName,
        suggested_code: alisCode,
        signer,
        anchor_name: anchorName,
        required: isRequired,
        read_only: isReadOnly
      } = suggestion;

      // Find matching field in PDF (by original name or position)
      const matchingField = allFields.find(f => {
        try {
          return f.getName && f.getName() === originalFieldName;
        } catch {
          return false;
        }
      });

      if (!matchingField) {
        console.warn(`[applier] Field not found: ${originalFieldName}`);
        auditLog.push({
          status: 'skipped',
          originalName: originalFieldName,
          reason: 'Field not found in PDF'
        });
        continue;
      }

      try {
        // Construct new field name in ALIS encoding format
        const newFieldName = `${alisCode}|${anchorName}`;

        // Update field name
        matchingField.setName(newFieldName);

        // Set required flag
        if (isRequired) {
          matchingField.setRequired(true);
        } else {
          matchingField.setRequired(false);
        }

        // Set read-only flag (for non-signature fields)
        if (isReadOnly && matchingField.acroField) {
          // Mark field as read-only by setting flag in PDF
          const flags = matchingField.acroField.getFlags() || 0;
          matchingField.acroField.setFlags(flags | 0x1); // ReadOnly flag = 0x1
        }

        // Add tooltip with signer metadata
        const tooltip = `[${signer}] ${alisCode}\nAnchor: ${anchorName}\nEncoded: ${newFieldName}`;
        if (matchingField.setTooltip) {
          matchingField.setTooltip(tooltip);
        }

        changesApplied++;
        auditLog.push({
          status: 'applied',
          originalName: originalFieldName,
          newName: newFieldName,
          signer,
          required: isRequired,
          readOnly: isReadOnly
        });

        console.log(`[applier] ✓ Updated field: ${originalFieldName} → ${newFieldName}`);

      } catch (fieldErr) {
        console.error(`[applier] Error updating field ${originalFieldName}:`, fieldErr.message);
        auditLog.push({
          status: 'error',
          originalName: originalFieldName,
          error: fieldErr.message
        });
      }
    }

    // Save modified PDF
    console.log(`[applier] Saving modified PDF to ${outputPath}`);
    const modifiedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, modifiedPdfBytes);

    console.log(`[applier] ✓ PDF saved. Applied ${changesApplied}/${approvedSuggestions.length} suggestions`);

    return {
      success: true,
      changesApplied,
      totalSuggestions: approvedSuggestions.length,
      outputPath,
      auditLog
    };

  } catch (err) {
    console.error('[applier] Fatal error:', err.message);
    throw new Error(`Failed to apply changes to PDF: ${err.message}`);
  }
}

module.exports = {
  applyChangesToPDF
};
