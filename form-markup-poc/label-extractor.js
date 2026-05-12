/**
 * label-extractor.js
 *
 * Extracts text labels from PDF using OCR
 * Tesseract.js is used for client-side OCR without requiring system binaries
 *
 * NOTE: For PDF files, we generate placeholder labels based on field names
 * since Tesseract requires image input, not PDF input
 */

const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

/**
 * Extract text labels near detected fields using OCR
 *
 * @param {string} pdfPath - Path to PDF file
 * @param {array} detectedFields - Fields detected by field-detector.js
 * @param {number} searchRadius - Distance in pixels to search for labels (default: 100)
 * @returns {array} Array of {field_id, detected_label, confidence, text_position}
 */
async function extractTextNearFields(pdfPath, detectedFields, searchRadius = 100) {
  console.log(`\n🔤 Extracting text labels from PDF (search radius: ${searchRadius}px)...`);

  try {
    // For now, generate placeholder labels from field names
    // This allows the system to work without PDF rendering
    // In production, you'd render PDF pages to images and run OCR on those

    console.log('   📌 Using field names as labels (full OCR coming soon)...');

    const fieldLabels = [];

    for (const field of detectedFields) {
      if (!field.name) {
        fieldLabels.push({
          field_id: field.id,
          detected_label: null,
          confidence: 0,
          reason: 'No field name'
        });
        continue;
      }

      // Use field name as the label with medium confidence
      // This is a fallback until we have proper PDF rendering for OCR
      const label = cleanFieldName(field.name);

      fieldLabels.push({
        field_id: field.id,
        detected_label: label,
        confidence: 0.65, // Medium confidence for field name match
        text_position: field.position,
        source: 'field_name_fallback'
      });
    }

    console.log(`   ✅ Generated labels for ${fieldLabels.length} fields`);
    return fieldLabels;

  } catch (err) {
    console.error('❌ Error extracting text:', err.message);
    throw err;
  }
}

/**
 * Clean field names to create readable labels
 * e.g., "topmostSubform[0].residentName" -> "Resident Name"
 */
function cleanFieldName(fieldName) {
  // Remove common prefixes and patterns
  let cleaned = fieldName
    .replace(/^topmostSubform\[0\]\./, '')           // Remove Acrobat form prefix
    .replace(/\[\d+\]/g, '')                         // Remove array indices
    .replace(/([a-z])([A-Z])/g, '$1 $2')             // Add spaces before capitals
    .replace(/_/g, ' ')                              // Replace underscores with spaces
    .trim();

  // Capitalize first letter of each word
  cleaned = cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return cleaned;
}

module.exports = {
  extractTextNearFields
};
