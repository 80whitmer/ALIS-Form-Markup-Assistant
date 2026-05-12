/**
 * field-creator.js
 *
 * Automatically creates AcroForm fields from visual elements and OCR-detected labels
 * When a PDF has no existing form fields, this module:
 * 1. Scans for visual signature boxes and rectangles
 * 2. Detects text labels (Signature, Date, Initial, etc.) via OCR
 * 3. Creates corresponding AcroForm fields at those locations
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFNumber, PDFArray, PDFString } = require('pdf-lib');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf');

/**
 * Common field label patterns to detect
 */
const FIELD_PATTERNS = {
  signature: {
    patterns: ['signature', 'sign here', 'signed by', 'sign', 'authorized by'],
    type: 'signature',
    defaultWidth: 200,
    defaultHeight: 50
  },
  date: {
    patterns: ['date', 'dated', 'date of', 'today'],
    type: 'text',
    defaultWidth: 100,
    defaultHeight: 30
  },
  initial: {
    patterns: ['initial', 'initials', 'init', 'approved by'],
    type: 'text',
    defaultWidth: 60,
    defaultHeight: 30
  },
  name: {
    patterns: ['name', 'full name', 'print name', 'resident name'],
    type: 'text',
    defaultWidth: 200,
    defaultHeight: 30
  },
  checkbox: {
    patterns: ['agree', 'understand', 'acknowledge', 'consent', 'accept'],
    type: 'checkbox',
    defaultWidth: 20,
    defaultHeight: 20
  }
};

/**
 * Scan PDF for visual rectangles/boxes (signature lines, etc.)
 */
async function detectVisualBoxes(pdfPath) {
  console.log(`[field-creator] Scanning for visual boxes and annotations...`);

  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;

    const boxes = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      try {
        // Get page annotations
        const annotations = await page.getAnnotations();

        if (annotations && annotations.length > 0) {
          console.log(`[field-creator] Found ${annotations.length} annotations on page ${pageNum}`);

          for (const annot of annotations) {
            // Look for rectangle/square annotations
            if (annot.subtype === 'Square' || annot.subtype === 'Rect' || annot.annotationType === 3) {
              const rect = annot.rect;
              if (rect && rect.length === 4) {
                boxes.push({
                  page: pageNum,
                  x: Math.min(rect[0], rect[2]),
                  y: Math.min(rect[1], rect[3]),
                  width: Math.abs(rect[2] - rect[0]),
                  height: Math.abs(rect[3] - rect[1]),
                  type: 'rectangle',
                  raw: annot
                });

                console.log(`[field-creator] ✓ Found box on page ${pageNum}: (${rect[0]}, ${rect[1]}) ${Math.abs(rect[2] - rect[0])}x${Math.abs(rect[3] - rect[1])}`);
              }
            }

            // Also look for ink annotations (drawn lines/boxes)
            if (annot.subtype === 'Ink' || annot.annotationType === 15) {
              const rect = annot.rect;
              if (rect && rect.length === 4) {
                boxes.push({
                  page: pageNum,
                  x: Math.min(rect[0], rect[2]),
                  y: Math.min(rect[1], rect[3]),
                  width: Math.abs(rect[2] - rect[0]),
                  height: Math.abs(rect[3] - rect[1]),
                  type: 'ink',
                  raw: annot
                });

                console.log(`[field-creator] ✓ Found ink box on page ${pageNum}`);
              }
            }
          }
        }
      } catch (annotErr) {
        console.warn(`[field-creator] Could not extract annotations from page ${pageNum}:`, annotErr.message);
      }
    }

    console.log(`[field-creator] Found ${boxes.length} visual boxes`);
    return boxes;
  } catch (err) {
    console.warn(`[field-creator] Could not scan visual boxes:`, err.message);
    return [];
  }
}

/**
 * Extract all text from PDF with position information
 */
async function extractAllText(pdfPath) {
  console.log(`[field-creator] Extracting all text from PDF...`);

  const textItems = [];

  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      console.log(`[field-creator] Page ${pageNum}: Found ${textContent.items.length} text items`);

      for (const item of textContent.items) {
        if (item.str && item.str.trim()) {
          const textEntry = {
            text: item.str.toLowerCase().trim(),
            page: pageNum,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height
          };
          textItems.push(textEntry);

          // Log any text that might be field labels
          if (item.str.toLowerCase().includes('signature') ||
              item.str.toLowerCase().includes('date') ||
              item.str.toLowerCase().includes('initial')) {
            console.log(`[field-creator] ✓ Found potential label: "${item.str.trim()}" at (${item.x}, ${item.y})`);
          }
        }
      }
    }

    console.log(`[field-creator] Extracted ${textItems.length} total text items from ${pdf.numPages} pages`);
  } catch (err) {
    console.warn(`[field-creator] Text extraction error:`, err.message);
  }

  return textItems;
}

/**
 * Detect text labels and create fields below them
 */
async function detectLabelsAndCreateFields(pdfPath, labels) {
  console.log(`[field-creator] Detecting field labels from text...`);

  const createdFields = [];

  // Extract all text from the PDF if labels parameter is empty
  let textItems = [];
  if (!labels || Object.keys(labels).length === 0) {
    textItems = await extractAllText(pdfPath);
  } else {
    // Use provided labels
    for (const [fieldName, textInfo] of Object.entries(labels)) {
      if (textInfo && textInfo.text) {
        textItems.push({
          text: textInfo.text.toLowerCase(),
          position: textInfo.position
        });
      }
    }
  }

  // Match text against field patterns
  for (const item of textItems) {
    const textLower = item.text || '';

    for (const [patternKey, patternConfig] of Object.entries(FIELD_PATTERNS)) {
      const matched = patternConfig.patterns.some(pattern =>
        textLower.includes(pattern)
      );

      if (matched && textLower.length > 0) {
        createdFields.push({
          name: `${patternKey}_auto_${Date.now()}`,
          type: patternConfig.type,
          page: item.page || 1,
          // Position field below/after the detected label
          x: (item.x || 100) + (item.width || 0) + 5,
          y: (item.y || 100) - 20,  // Slightly above label
          width: patternConfig.defaultWidth,
          height: patternConfig.defaultHeight,
          detectedLabel: textLower,
          confidence: 0.75
        });

        console.log(`[field-creator] ✓ Detected ${patternConfig.type} field for label: "${textLower}"`);
        break;  // Don't match same text to multiple patterns
      }
    }
  }

  return createdFields;
}

/**
 * Create AcroForm fields in the PDF document
 */
async function createAcroFormFields(pdfPath, fieldDefinitions, outputPath) {
  console.log(`[field-creator] Creating ${fieldDefinitions.length} AcroForm fields...`);

  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const form = pdfDoc.getForm();
    const createdCount = { text: 0, signature: 0, checkbox: 0 };

    for (const fieldDef of fieldDefinitions) {
      try {
        let field;
        const pageIndex = Math.max(0, (fieldDef.page || 1) - 1);

        // Get the page to determine its dimensions for coordinate conversion
        const pages = pdfDoc.getPages();
        if (pageIndex >= pages.length) {
          console.warn(`[field-creator] Page ${fieldDef.page} doesn't exist, skipping field`);
          continue;
        }

        const page = pages[pageIndex];
        const pageHeight = page.getHeight();

        // PDF coordinates are bottom-left origin, so convert from top-left
        const pdfY = pageHeight - (fieldDef.y + fieldDef.height);

        switch (fieldDef.type) {
          case 'signature':
            field = form.createSignature(fieldDef.name);
            field.addToPage(page, [
              fieldDef.x,
              pdfY,
              fieldDef.x + fieldDef.width,
              pdfY + fieldDef.height
            ]);
            createdCount.signature++;
            break;

          case 'checkbox':
            field = form.createCheckBox(fieldDef.name);
            field.addToPage(page, [
              fieldDef.x,
              pdfY,
              fieldDef.x + fieldDef.width,
              pdfY + fieldDef.height
            ]);
            createdCount.checkbox++;
            break;

          case 'text':
          default:
            field = form.createTextField(fieldDef.name);
            field.addToPage(page, [
              fieldDef.x,
              pdfY,
              fieldDef.x + fieldDef.width,
              pdfY + fieldDef.height
            ]);
            createdCount.text++;
            break;
        }

        console.log(`[field-creator] ✓ Created ${fieldDef.type} field: ${fieldDef.name}`);

      } catch (fieldErr) {
        console.warn(`[field-creator] Error creating field ${fieldDef.name}:`, fieldErr.message);
      }
    }

    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, modifiedPdfBytes);

    console.log(`[field-creator] ✓ Saved PDF with ${createdCount.text} text, ${createdCount.signature} signature, ${createdCount.checkbox} checkbox fields`);

    return {
      success: true,
      fieldsCreated: fieldDefinitions.length,
      breakdown: createdCount,
      outputPath
    };

  } catch (err) {
    console.error('[field-creator] Error creating AcroForm fields:', err.message);
    throw err;
  }
}

/**
 * Full workflow: detect labels and visual boxes, create fields if PDF has no AcroForm fields
 */
async function createFieldsFromLabels(pdfPath, labels) {
  console.log(`[field-creator] Starting field creation workflow...`);

  try {
    let fieldDefinitions = [];

    // Step 1: Detect visual boxes (annotations, rectangles, etc.)
    console.log('[field-creator] Step 1: Detecting visual boxes...');
    const visualBoxes = await detectVisualBoxes(pdfPath);

    if (visualBoxes.length > 0) {
      console.log(`[field-creator] Found ${visualBoxes.length} visual boxes, creating fields at those locations...`);

      // Create text fields at visual box locations
      for (let i = 0; i < visualBoxes.length; i++) {
        const box = visualBoxes[i];
        fieldDefinitions.push({
          name: `field_box_${i + 1}`,
          type: 'text',  // Default to text, can be signature/date based on label matching
          page: box.page,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          detectedFrom: 'visual_box',
          confidence: 0.8
        });
      }
    }

    // Step 2: Detect text labels and add additional fields if needed
    console.log('[field-creator] Step 2: Detecting text labels...');
    const textLabelFields = await detectLabelsAndCreateFields(pdfPath, labels);

    if (textLabelFields.length > 0) {
      console.log(`[field-creator] Found ${textLabelFields.length} fields from text labels`);
      fieldDefinitions = fieldDefinitions.concat(textLabelFields);
    }

    if (fieldDefinitions.length === 0) {
      console.warn('[field-creator] No visual boxes or field labels detected');
      return {
        success: false,
        fieldsCreated: 0,
        reason: 'No visual boxes or recognizable field labels found in PDF'
      };
    }

    // Step 3: Create a temporary output file with new fields
    console.log(`[field-creator] Step 3: Creating ${fieldDefinitions.length} AcroForm fields...`);
    const tmpDir = path.dirname(pdfPath);
    const tmpPath = path.join(tmpDir, `temp-${Date.now()}.pdf`);

    const result = await createAcroFormFields(pdfPath, fieldDefinitions, tmpPath);

    // Step 4: Replace original with enhanced version
    console.log('[field-creator] Step 4: Saving enhanced PDF...');
    fs.copyFileSync(tmpPath, pdfPath);
    fs.unlinkSync(tmpPath);

    return result;

  } catch (err) {
    console.error('[field-creator] Field creation workflow failed:', err.message);
    throw err;
  }
}

module.exports = {
  detectVisualBoxes,
  detectLabelsAndCreateFields,
  createAcroFormFields,
  createFieldsFromLabels,
  FIELD_PATTERNS
};
