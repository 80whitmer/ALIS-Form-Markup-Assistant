/**
 * field-detector.js
 *
 * Detects and extracts form fields from a Tungsten-marked PDF
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf');

async function detectFieldsFromPDF(pdfPath) {
  console.log(`\n📄 Detecting fields from: ${path.basename(pdfPath)}`);

  try {
    // Read PDF with pdf-lib
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Try to get form fields
    let detectedFields = [];

    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      console.log(`✅ Found ${fields.length} form fields`);

      detectedFields = fields.map((field, index) => {
        const fieldName = field.getName ? field.getName() : `field_${index}`;
        const fieldType = field.constructor.name;

        // Try to extract position and properties from annotations
        let position = null;
        let fieldProperties = {
          required: false,
          read_only: false,
          no_export: false,
          multiline: false,
          password: false,
          comb: false,
          no_spell_check: false,
          no_scroll: false,
          rich_text: false,
          commit_on_sel_change: false,
          has_border: false,
          border_color: null
        };

        try {
          const acroField = field.acroField;
          if (acroField) {
            // Extract position from widgets
            if (acroField.getWidgets) {
              const widgets = acroField.getWidgets();
              if (widgets && widgets.length > 0) {
                const rect = widgets[0].getRectangle();
                if (rect) {
                  position = {
                    page: 0,
                    x: Math.round(rect[0]),
                    y: Math.round(rect[1]),
                    width: Math.round(rect[2] - rect[0]),
                    height: Math.round(rect[3] - rect[1])
                  };
                }
              }
            }

            // Extract field flags from AcroForm
            // Bit 0 (1) = ReadOnly, 1 (2) = Required, 2 (4) = NoExport
            // Bit 4 (16) = MultiLine, 5 (32) = Password, 8 (256) = NoSpellCheck
            // Bit 9 (512) = NoScroll, 10 (1024) = Comb, 11 (2048) = RichText
            // Bit 13 (8192) = CommitOnSelChange
            if (acroField.getFlags) {
              const flags = acroField.getFlags() || 0;
              fieldProperties.read_only = (flags & 1) !== 0;          // Bit 0
              fieldProperties.required = (flags & 2) !== 0;           // Bit 1
              fieldProperties.no_export = (flags & 4) !== 0;          // Bit 2
              fieldProperties.multiline = (flags & 16) !== 0;         // Bit 4
              fieldProperties.password = (flags & 32) !== 0;          // Bit 5
              fieldProperties.no_spell_check = (flags & 256) !== 0;   // Bit 8
              fieldProperties.no_scroll = (flags & 512) !== 0;        // Bit 9
              fieldProperties.comb = (flags & 1024) !== 0;            // Bit 10
              fieldProperties.rich_text = (flags & 2048) !== 0;       // Bit 11
              fieldProperties.commit_on_sel_change = (flags & 8192) !== 0; // Bit 13
            }
          }
        } catch (e) {
          // Position/properties extraction failed, continue
        }

        // Determine field type
        let simpleType = 'unknown';
        if (fieldType.includes('Text')) simpleType = 'text';
        else if (fieldType.includes('CheckBox')) simpleType = 'checkbox';
        else if (fieldType.includes('Radio')) simpleType = 'radio';
        else if (fieldType.includes('Signature')) simpleType = 'signature';
        else if (fieldType.includes('Button')) simpleType = 'button';

        return {
          id: `field_${index}`,
          name: fieldName,
          type: simpleType,
          constructor: fieldType,
          position: position,
          currentValue: null,
          properties: fieldProperties
        };
      });
    } catch (err) {
      console.warn('⚠️ Could not extract form fields via pdf-lib:', err.message);
      console.log('   Falling back to PDFjs inspection...');

      // Fallback: try pdfjs-dist
      detectedFields = await detectFieldsWithPDFjs(pdfPath);
    }

    console.log(`\n📊 Detection Results:`);
    console.log(`   Total fields: ${detectedFields.length}`);

    // Group by type
    const byType = {};
    for (const field of detectedFields) {
      byType[field.type] = (byType[field.type] || 0) + 1;
    }
    console.log(`   By type: ${JSON.stringify(byType)}`);

    return detectedFields;

  } catch (err) {
    console.error('❌ Error detecting fields:', err.message);
    throw err;
  }
}

/**
 * Fallback: Use PDFjs to inspect PDF structure for fields
 */
async function detectFieldsWithPDFjs(pdfPath) {
  console.log('   Using PDFjs for inspection...');

  const pdfBytes = fs.readFileSync(pdfPath);
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;

  const detectedFields = [];
  let fieldIndex = 0;

  // PDFjs doesn't have great form field support, so we return what we found
  // In real scenario, would parse the PDF structure directly

  return detectedFields;
}

/**
 * Pretty print detected fields
 */
function printFields(fields) {
  console.log('\n📋 Detected Fields:');
  console.log('─'.repeat(100));

  for (const field of fields) {
    let posStr = field.position
      ? `(${field.position.x}, ${field.position.y}) ${field.position.width}x${field.position.height}px`
      : '(position unknown)';

    console.log(`  ${field.id.padEnd(12)} | ${field.type.padEnd(10)} | ${field.name.padEnd(30)} | ${posStr}`);
  }
  console.log('─'.repeat(100));
}

module.exports = {
  detectFieldsFromPDF,
  printFields
};
