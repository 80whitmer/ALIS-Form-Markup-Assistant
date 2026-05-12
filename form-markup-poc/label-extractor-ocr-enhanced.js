/**
 * label-extractor-ocr-enhanced.js
 *
 * Enhanced OCR-based signer label detection for PDF form fields using Tesseract.
 * Uses directional text search with confidence scoring based on proximity.
 *
 * Features:
 * - Page-by-page text extraction with Tesseract OCR
 * - Directional zones (ABOVE, BELOW, LEFT, RIGHT, INSIDE)
 * - Distance-based confidence scoring: confidence = max(0, 1.0 - (distance / radius))
 * - 20% confidence boost for ABOVE zone labels
 * - Signer keyword matching (resident, staff, admin, family)
 *
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {Array} fields - Detected form fields with coordinates
 * @param {Array} availableSigners - List of signer keywords to search for
 * @param {number} ocrRadius - Search radius in pixels (default 100)
 * @returns {Promise<Array>} Array of {field_name, signer, confidence, match_text, match_zone, match_reason}
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Extract text with coordinates from PDF pages using Tesseract OCR
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} Map of page number to extracted text items with coordinates
 */
async function extractTextWithCoordinates(pdfBuffer) {
  return new Promise((resolve, reject) => {
    try {
      // Write PDF to temp file
      const tmpDir = path.join(path.dirname(__filename), '..', 'tmp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      const tmpPdfPath = path.join(tmpDir, `ocr-temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`);
      fs.writeFileSync(tmpPdfPath, pdfBuffer);

      // Get path to python script
      const pythonScriptPath = path.join(path.dirname(__filename), 'pdf-ocr-extractor.py');

      if (!fs.existsSync(pythonScriptPath)) {
        throw new Error(`pdf-ocr-extractor.py not found at ${pythonScriptPath}`);
      }

      console.log(`[ocr-enhanced] Spawning Tesseract OCR process: ${pythonScriptPath} ${tmpPdfPath}`);

      const pythonProcess = spawn('python', [pythonScriptPath, tmpPdfPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`[ocr-enhanced] ${data.toString().trim()}`);
      });

      pythonProcess.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tmpPdfPath);
        } catch (e) {
          console.warn('[ocr-enhanced] Could not delete temp PDF:', e.message);
        }

        if (code !== 0) {
          return reject(new Error(`OCR extraction failed with code ${code}: ${stderr}`));
        }

        try {
          // Parse JSON output
          const result = JSON.parse(stdout);

          if (result.status !== 'success') {
            return reject(new Error(`OCR extraction error: ${result.error}`));
          }

          // Convert to format expected by findSignersNearField
          const textByPage = {};

          result.pages.forEach(pageData => {
            const pageNum = pageData.page;
            textByPage[pageNum] = pageData.text_regions.map(region => ({
              text: region.text,
              x: region.x,
              y: region.y,
              width: region.width,
              height: region.height,
              confidence: region.confidence
            }));

            if (textByPage[pageNum].length > 0) {
              console.log(`[ocr-enhanced] Page ${pageNum}: Extracted ${textByPage[pageNum].length} text regions via Tesseract`);
            }
          });

          resolve(textByPage);
        } catch (parseErr) {
          reject(new Error(`Failed to parse OCR output: ${parseErr.message}`));
        }
      });

      pythonProcess.on('error', (err) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tmpPdfPath);
        } catch (e) {
          console.warn('[ocr-enhanced] Could not delete temp PDF:', e.message);
        }

        reject(new Error(`Could not spawn OCR process: ${err.message}`));
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Normalize text for keyword matching (lowercase, remove punctuation)
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, '');
}

/**
 * Determine zone and distance from field to text
 * Zones: ABOVE (top), BELOW (bottom), LEFT (left), RIGHT (right), INSIDE (overlapping)
 *
 * @param {Object} field - Field object with x, y, width, height
 * @param {Object} textItem - Text item with x, y, width, height
 * @returns {Object} {distance, zone, zoneBoost}
 */
function calculateZoneAndDistance(field, textItem) {
  const fieldLeft = field.x || 0;
  const fieldTop = field.y || 0;
  const fieldRight = fieldLeft + (field.width || 0);
  const fieldBottom = fieldTop + (field.height || 0);

  const textLeft = textItem.x || 0;
  const textTop = textItem.y || 0;
  const textRight = textLeft + (textItem.width || 0);
  const textBottom = textTop + (textItem.height || 0);

  // Check if overlapping (INSIDE)
  const overlaps = !(textRight < fieldLeft || textLeft > fieldRight ||
                     textBottom < fieldTop || textTop > fieldBottom);

  if (overlaps) {
    return {
      distance: 0,
      zone: 'INSIDE',
      zoneBoost: 1.0
    };
  }

  // Calculate minimum distance to field edges
  let minDistance = Infinity;
  let zone = null;
  let zoneBoost = 1.0;

  // Distance to top edge (ABOVE)
  if (textBottom < fieldTop) {
    const distance = fieldTop - textBottom;
    if (distance < minDistance) {
      minDistance = distance;
      zone = 'ABOVE';
      zoneBoost = 1.2; // 20% boost for ABOVE zone
    }
  }

  // Distance to bottom edge (BELOW)
  if (textTop > fieldBottom) {
    const distance = textTop - fieldBottom;
    if (distance < minDistance) {
      minDistance = distance;
      zone = 'BELOW';
      zoneBoost = 1.0;
    }
  }

  // Distance to left edge (LEFT)
  if (textRight < fieldLeft) {
    const distance = fieldLeft - textRight;
    if (distance < minDistance) {
      minDistance = distance;
      zone = 'LEFT';
      zoneBoost = 1.0;
    }
  }

  // Distance to right edge (RIGHT)
  if (textLeft > fieldRight) {
    const distance = textLeft - fieldRight;
    if (distance < minDistance) {
      minDistance = distance;
      zone = 'RIGHT';
      zoneBoost = 1.0;
    }
  }

  // If we couldn't determine zone (shouldn't happen), use NEARBY
  if (zone === null) {
    const centerX = fieldLeft + (field.width || 0) / 2;
    const centerY = fieldTop + (field.height || 0) / 2;
    const textCenterX = textLeft + (textItem.width || 0) / 2;
    const textCenterY = textTop + (textItem.height || 0) / 2;
    minDistance = Math.sqrt(
      Math.pow(centerX - textCenterX, 2) + Math.pow(centerY - textCenterY, 2)
    );
    zone = 'NEARBY';
    zoneBoost = 1.0;
  }

  return {
    distance: Math.max(0, minDistance),
    zone,
    zoneBoost
  };
}

/**
 * Calculate confidence based on distance and zone
 * confidence = max(0, 1.0 - (distance / radius)) * zoneBoost
 * capped at 1.0
 *
 * @param {number} distance - Distance in pixels
 * @param {number} radius - Search radius in pixels
 * @param {number} zoneBoost - Multiplier for zone (1.0 or 1.2 for ABOVE)
 * @returns {number} Confidence score 0.0-1.0
 */
function calculateConfidence(distance, radius, zoneBoost = 1.0) {
  const baseConfidence = Math.max(0, 1.0 - (distance / radius));
  const boostedConfidence = baseConfidence * zoneBoost;
  return Math.min(1.0, boostedConfidence);
}

/**
 * Find signer keywords in text near a field
 * @param {Array} pageTexts - Text items from page
 * @param {Object} field - Field object
 * @param {Array} signerKeywords - Keywords to search for
 * @param {number} searchRadius - Search radius in pixels
 * @returns {Array} Matching signer results sorted by confidence
 */
function findSignersNearField(pageTexts, field, signerKeywords, searchRadius) {
  const matches = [];

  // Debug logging
  console.log(`[ocr-enhanced-debug] Field: ${field.field_name} on page ${field.field_page}`);
  console.log(`[ocr-enhanced-debug] Searching for signers: ${signerKeywords.join(', ')}`);
  console.log(`[ocr-enhanced-debug] Available text items on page: ${pageTexts.length}`);

  if (pageTexts.length > 0) {
    console.log(`[ocr-enhanced-debug] Sample texts: ${pageTexts.slice(0, 3).map(t => `"${t.text}"`).join(', ')}`);
  }

  pageTexts.forEach(textItem => {
    const normalizedText = normalizeText(textItem.text);

    // Check if text contains any signer keyword
    for (const keyword of signerKeywords) {
      const normalizedKeyword = normalizeText(keyword);

      if (normalizedText.includes(normalizedKeyword)) {
        console.log(`[ocr-enhanced-debug] ✓ Match found: "${keyword}" in "${textItem.text}"`);
        const { distance, zone, zoneBoost } = calculateZoneAndDistance(field, textItem);

        // Only include if within search radius
        if (distance <= searchRadius) {
          const confidence = calculateConfidence(distance, searchRadius, zoneBoost);

          matches.push({
            signer: keyword.toLowerCase(),
            confidence,
            distance,
            zone,
            match_text: textItem.text,
            match_zone: zone,
            match_reason: `Found "${keyword}" ${distance > 0 ? `${Math.round(distance)}px` : ''} in ${zone} zone`,
            raw: {
              x: textItem.x,
              y: textItem.y,
              width: textItem.width,
              height: textItem.height
            }
          });
        }
      }
    }
  });

  // Sort by confidence (highest first), then by distance (closest first)
  return matches.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return a.distance - b.distance;
  });
}

/**
 * Main function: Extract signer labels from PDF with OCR
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {Array} fields - Detected form fields
 * @param {Array} availableSigners - Signer keywords to search for
 * @param {number} ocrRadius - Search radius in pixels
 * @returns {Promise<Array>} Array of signer detection results
 */
async function extractSignerLabels(pdfBuffer, fields, availableSigners = [], ocrRadius = 100) {
  try {
    console.log(`[ocr-enhanced] Starting signer label extraction (radius: ${ocrRadius}px)`);

    if (!Array.isArray(fields) || fields.length === 0) {
      console.warn('[ocr-enhanced] No fields provided');
      return [];
    }

    if (!Array.isArray(availableSigners) || availableSigners.length === 0) {
      availableSigners = ['resident', 'staff', 'admin', 'family'];
      console.log('[ocr-enhanced] Using default signers:', availableSigners.join(', '));
    }

    // Extract text with coordinates from all pages
    const textByPage = await extractTextWithCoordinates(pdfBuffer);

    // Process each field
    const results = [];
    let fieldsWithMatches = 0;

    for (const field of fields) {
      const pageNum = field.field_page || 1;
      const pageTexts = textByPage[pageNum] || [];

      if (pageTexts.length === 0) {
        continue;
      }

      // Find matching signers near this field
      const matches = findSignersNearField(pageTexts, field, availableSigners, ocrRadius);

      if (matches.length > 0) {
        fieldsWithMatches++;

        // Use the highest confidence match
        const bestMatch = matches[0];

        results.push({
          field_name: field.field_name,
          signer: bestMatch.signer,
          confidence: bestMatch.confidence,
          match_text: bestMatch.match_text,
          match_zone: bestMatch.match_zone,
          match_reason: bestMatch.match_reason,
          distance: bestMatch.distance
        });

        console.log(`[ocr-enhanced] Field "${field.field_name}": Found "${bestMatch.signer}" (${Math.round(bestMatch.confidence * 100)}% confidence)`);
      }
    }

    console.log(`[ocr-enhanced] Signer extraction complete: Matched ${fieldsWithMatches} of ${fields.length} fields`);
    return results;

  } catch (err) {
    console.error('[ocr-enhanced] Error extracting signers:', err.message);
    throw err;
  }
}

module.exports = {
  extractSignerLabels,
  extractTextWithCoordinates,
  findSignersNearField,
  calculateZoneAndDistance,
  calculateConfidence,
  normalizeText
};
