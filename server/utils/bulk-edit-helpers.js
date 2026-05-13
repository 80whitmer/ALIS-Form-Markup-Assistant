/**
 * Bulk Edit Helper Utilities
 *
 * Shared utility functions for bulk editing form field suggestions
 * Used by both auto-edit and manual-edit workflows
 */

/**
 * Calculate statistics for fields on a specific page
 * @param {Array} suggestions - Array of suggestion objects
 * @param {number} pageNum - Page number to analyze
 * @returns {Object} Statistics object
 */
function calculatePageStats(suggestions, pageNum) {
  const pageFields = suggestions.filter(s => (s.field_page || 1) === pageNum);

  return {
    pageNum,
    totalFields: pageFields.length,
    byType: {
      signature: pageFields.filter(s => s.field_type === 'signature').length,
      text: pageFields.filter(s => s.field_type === 'text').length,
      checkbox: pageFields.filter(s => s.field_type === 'checkbox').length,
      radio: pageFields.filter(s => s.field_type === 'radio').length,
      date: pageFields.filter(s => s.field_type === 'date').length,
      dropdown: pageFields.filter(s => s.field_type === 'dropdown').length
    },
    byStatus: {
      approved: pageFields.filter(s => s.approval_status === 'approved').length,
      review_needed: pageFields.filter(s => s.approval_status === 'review_needed').length,
      rejected: pageFields.filter(s => s.approval_status === 'rejected').length
    },
    avgConfidence: pageFields.length > 0
      ? (pageFields.reduce((sum, s) => sum + (s.confidence || 0), 0) / pageFields.length)
      : 0
  };
}

/**
 * Group fields by page number
 * @param {Array} suggestions - Array of suggestion objects
 * @returns {Object} Fields grouped by page number
 */
function groupFieldsByPage(suggestions) {
  const grouped = {};

  suggestions.forEach(suggestion => {
    const page = suggestion.field_page || 1;
    if (!grouped[page]) {
      grouped[page] = [];
    }
    grouped[page].push(suggestion);
  });

  return grouped;
}

/**
 * Validate bulk changes before applying
 * @param {Array} suggestions - Array of suggestion objects
 * @param {Set} selectedFields - Set of field indices to change
 * @param {Object} changes - Object with properties to change
 * @returns {Object} Validation result with errors array
 */
function validateBulkChanges(suggestions, selectedFields, changes) {
  const errors = [];

  // Validate selected fields exist
  if (!selectedFields || selectedFields.size === 0) {
    errors.push('No fields selected for bulk edit');
    return { valid: false, errors };
  }

  // Validate field indices are within range
  selectedFields.forEach(idx => {
    if (idx < 0 || idx >= suggestions.length) {
      errors.push(`Invalid field index: ${idx}`);
    }
  });

  // Validate signer if provided
  if (changes.signer && typeof changes.signer !== 'string') {
    errors.push('Signer must be a string value');
  }

  // Validate property flags are boolean
  if (changes.required !== undefined && typeof changes.required !== 'boolean') {
    errors.push('Required property must be a boolean');
  }
  if (changes.read_only !== undefined && typeof changes.read_only !== 'boolean') {
    errors.push('Read-only property must be a boolean');
  }
  if (changes.border !== undefined && typeof changes.border !== 'boolean') {
    errors.push('Border property must be a boolean');
  }

  return {
    valid: errors.length === 0,
    errors,
    affectedFields: selectedFields.size
  };
}

/**
 * Apply bulk property changes to suggestions
 * @param {Array} suggestions - Array of suggestion objects
 * @param {Set} selectedFields - Set of field indices to change
 * @param {Object} changes - Object with properties to change
 * @returns {Array} Updated suggestions array
 */
function applyBulkPropertyChanges(suggestions, selectedFields, changes) {
  const updated = suggestions.map((suggestion, idx) => {
    if (!selectedFields.has(idx)) {
      return suggestion;
    }

    const updated = { ...suggestion };

    // Apply changes
    if (changes.signer !== undefined) {
      updated.signer = changes.signer;
    }
    if (changes.required !== undefined) {
      updated.required = changes.required;
    }
    if (changes.read_only !== undefined) {
      updated.read_only = changes.read_only;
    }
    if (changes.border !== undefined) {
      updated.border = changes.border;
    }
    if (changes.approval_status !== undefined) {
      updated.approval_status = changes.approval_status;
    }

    return updated;
  });

  return updated;
}

/**
 * Find duplicate field names and return duplicate info
 * @param {Array} suggestions - Array of suggestion objects
 * @returns {Object} Duplicate information
 */
function findDuplicateFields(suggestions) {
  const nameCount = {};
  const duplicates = [];

  suggestions.forEach((suggestion, idx) => {
    const name = suggestion.field_name;
    if (!nameCount[name]) {
      nameCount[name] = [];
    }
    nameCount[name].push(idx);
  });

  // Extract only duplicates
  Object.entries(nameCount).forEach(([name, indices]) => {
    if (indices.length > 1) {
      duplicates.push({
        fieldName: name,
        count: indices.length,
        indices
      });
    }
  });

  return {
    hasDuplicates: duplicates.length > 0,
    duplicateCount: duplicates.length,
    totalDuplicateFields: duplicates.reduce((sum, d) => sum + d.count, 0),
    duplicates
  };
}

/**
 * Batch update suggestions with validation
 * @param {Array} suggestions - Array of suggestion objects
 * @param {Array} updates - Array of update objects with index and changes
 * @returns {Object} Result with updated suggestions and summary
 */
function batchUpdateSuggestions(suggestions, updates) {
  const updated = [...suggestions];
  let successCount = 0;
  const errors = [];

  updates.forEach(({ index, changes }) => {
    if (index < 0 || index >= suggestions.length) {
      errors.push(`Invalid field index: ${index}`);
      return;
    }

    try {
      updated[index] = { ...updated[index], ...changes };
      successCount++;
    } catch (err) {
      errors.push(`Failed to update field at index ${index}: ${err.message}`);
    }
  });

  return {
    success: errors.length === 0,
    successCount,
    failureCount: updates.length - successCount,
    errors,
    suggestions: updated
  };
}

module.exports = {
  calculatePageStats,
  groupFieldsByPage,
  validateBulkChanges,
  applyBulkPropertyChanges,
  findDuplicateFields,
  batchUpdateSuggestions
};
