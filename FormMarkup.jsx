import React, { useState, useMemo, useEffect, useRef } from 'react';
import './FormMarkup.css';
import * as pdfjs from 'pdfjs-dist';

/**
 * FormMarkup Component
 *
 * Displays PDF form field analysis with:
 * - Enhanced OCR suggestions (directional search for labels)
 * - Page-based pagination for multi-page documents
 * - Field properties (border, required, read-only)
 * - Confidence scoring for signer detection
 * - Bulk operations and inline editing
 */

export default function FormMarkup({ suggestions = [] }) {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [fieldsPerPage] = useState(10);
  const [viewMode, setViewMode] = useState('all'); // 'all', 'current-only'
  const [expandedRow, setExpandedRow] = useState(null);
  const [selectedForBulk, setSelectedForBulk] = useState(new Set());

  // Calculate page info
  const totalPages = useMemo(() => {
    if (!suggestions.length) return 1;
    const maxPage = Math.max(...suggestions.map(s => s.field_page || 1));
    return maxPage;
  }, [suggestions]);

  // Filter suggestions by page
  const fieldsOnCurrentPage = useMemo(() => {
    return suggestions.filter(s => (s.field_page || 1) === currentPage);
  }, [suggestions, currentPage]);

  // Paginate within current page's fields
  const paginatedFields = useMemo(() => {
    const startIdx = 0;
    const endIdx = fieldsPerPage;
    return fieldsOnCurrentPage.slice(startIdx, endIdx);
  }, [fieldsOnCurrentPage, fieldsPerPage]);

  // Summary stats
  const totalFields = suggestions.length;
  const fieldsOnPage = fieldsOnCurrentPage.length;
  const avgConfidenceOnPage = fieldsOnPage > 0
    ? (fieldsOnCurrentPage.reduce((sum, f) => sum + (f.confidence || 0), 0) / fieldsOnPage * 100).toFixed(1)
    : 0;

  // Bulk operations
  const handleSelectForBulk = (fieldName) => {
    const newSelected = new Set(selectedForBulk);
    if (newSelected.has(fieldName)) {
      newSelected.delete(fieldName);
    } else {
      newSelected.add(fieldName);
    }
    setSelectedForBulk(newSelected);
  };

  const handleSelectAllOnPage = () => {
    if (selectedForBulk.size === fieldsOnPage) {
      setSelectedForBulk(new Set());
    } else {
      const allOnPage = new Set(fieldsOnCurrentPage.map(f => f.field_name));
      setSelectedForBulk(allOnPage);
    }
  };

  const handleOpenAllAccordions = () => {
    if (expandedRow && expandedRow === 'ALL') {
      setExpandedRow(null);
    } else {
      setExpandedRow('ALL');
    }
  };

  // Page navigation
  const goToPage = (page) => {
    const p = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(p);
    setSelectedForBulk(new Set());
    setExpandedRow(null);
  };

  const getConfidenceColor = (confidence) => {
    const c = confidence || 0;
    if (c >= 0.9) return '#4caf50'; // green
    if (c >= 0.75) return '#ffc107'; // amber
    if (c >= 0.6) return '#ff9800'; // orange
    return '#f44336'; // red
  };

  const getConfidenceBar = (confidence) => {
    const c = (confidence || 0) * 100;
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <div style={{
          width: '80px',
          height: '8px',
          backgroundColor: '#e0e0e0',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${c}%`,
            height: '100%',
            backgroundColor: getConfidenceColor(confidence),
            transition: 'width 0.3s'
          }} />
        </div>
        <span style={{ fontSize: '12px', fontWeight: 'bold', minWidth: '35px' }}>
          {Math.round(c)}%
        </span>
      </div>
    );
  };

  return (
    <div className="form-markup-container">
      {/* Header */}
      <div className="form-markup-header">
        <h2>Form Field Analysis</h2>
        <div className="header-stats">
          <span>{totalFields} total fields across {totalPages} pages</span>
          <span>Page {currentPage} of {totalPages} • {fieldsOnPage} fields on this page</span>
          <span>Avg Confidence: {avgConfidenceOnPage}%</span>
        </div>
      </div>

      {/* Page Navigation */}
      <div className="page-navigation">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="nav-btn"
        >
          ← Previous
        </button>

        <div className="page-selector">
          <label>Go to page:</label>
          <input
            type="number"
            min="1"
            max={totalPages}
            value={currentPage}
            onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
            className="page-input"
          />
          <span>of {totalPages}</span>
        </div>

        <div className="page-buttons">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const page = i + 1;
            return (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`page-btn ${currentPage === page ? 'active' : ''}`}
              >
                {page}
              </button>
            );
          })}
          {totalPages > 5 && (
            <>
              <span className="page-ellipsis">...</span>
              <button
                onClick={() => goToPage(totalPages)}
                className={`page-btn ${currentPage === totalPages ? 'active' : ''}`}
              >
                {totalPages}
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="nav-btn"
        >
          Next →
        </button>
      </div>

      {/* Toolbar */}
      <div className="form-markup-toolbar">
        <button
          onClick={handleOpenAllAccordions}
          className="bulk-btn open-all-btn"
        >
          {expandedRow === 'ALL' ? '📂 Close All' : '📂 Open All'}
        </button>

        <button
          onClick={handleSelectAllOnPage}
          className="bulk-btn"
        >
          {selectedForBulk.size === fieldsOnPage && fieldsOnPage > 0
            ? 'Deselect All'
            : 'Select All On Page'}
        </button>

        {selectedForBulk.size > 0 && (
          <div className="bulk-actions">
            <span>{selectedForBulk.size} selected</span>
            <button className="action-btn">
              Bulk Assign Signer
            </button>
            <button className="action-btn">
              Confirm Updates
            </button>
          </div>
        )}

        <button
          onClick={() => setViewMode(viewMode === 'all' ? 'current-only' : 'all')}
          className={`view-toggle ${viewMode === 'current-only' ? 'active' : ''}`}
        >
          {viewMode === 'current-only' ? '✓ Current Values Only' : '📋 Current Values Only'}
        </button>
      </div>

      {/* Results Table */}
      <div className="form-markup-results">
        {fieldsOnPage === 0 ? (
          <div className="empty-state">
            <p>No fields on this page</p>
          </div>
        ) : (
          <table className="results-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedForBulk.size === fieldsOnPage && fieldsOnPage > 0}
                    onChange={handleSelectAllOnPage}
                  />
                </th>
                <th style={{ width: '50px' }}>#</th>
                <th style={{ width: '80px' }}>Page</th>
                <th style={{ width: '100px' }}>Type</th>
                <th style={{ width: '120px' }}>Field Name</th>
                <th style={{ width: '140px' }}>Suggested Code</th>
                <th style={{ width: '120px' }}>Signer</th>
                <th style={{ width: '100px' }}>Border</th>
                <th style={{ width: '80px' }}>Required</th>
                <th style={{ width: '80px' }}>Read-Only</th>
                <th style={{ width: '120px' }}>Confidence</th>
                <th style={{ width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {paginatedFields.map((field) => (
                <React.Fragment key={field.field_name}>
                  <tr
                    className={`field-row ${expandedRow === field.field_name ? 'expanded' : ''} ${selectedForBulk.has(field.field_name) ? 'selected' : ''}`}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedForBulk.has(field.field_name)}
                        onChange={() => handleSelectForBulk(field.field_name)}
                      />
                    </td>
                    <td className="field-index-cell">
                      {field.field_index || '-'}
                    </td>
                    <td className="page-cell">
                      <strong>{field.field_page || '-'}</strong>
                    </td>
                    <td>{field.field_type || '-'}</td>
                    <td className="field-name">{field.field_name}</td>
                    <td className="code-cell">{field.suggested_code || '-'}</td>
                    <td className="signer-cell">{field.signer || '-'}</td>
                    <td>
                      {field.has_border ? (
                        <span className="badge badge-yes">✓ Yes</span>
                      ) : (
                        <span className="badge badge-no">✗ No</span>
                      )}
                    </td>
                    <td>
                      {field.required ? (
                        <span className="badge badge-yes">✓</span>
                      ) : (
                        <span className="badge badge-no">✗</span>
                      )}
                    </td>
                    <td>
                      {field.read_only ? (
                        <span className="badge badge-yes">✓</span>
                      ) : (
                        <span className="badge badge-no">✗</span>
                      )}
                    </td>
                    <td>
                      {getConfidenceBar(field.confidence)}
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          if (expandedRow === 'ALL') {
                            setExpandedRow(field.field_name);
                          } else {
                            setExpandedRow(
                              expandedRow === field.field_name ? null : field.field_name
                            );
                          }
                        }}
                        className="expand-btn"
                      >
                        {(expandedRow === field.field_name || expandedRow === 'ALL') ? '▼' : '▶'}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Row */}
                  {(expandedRow === field.field_name || expandedRow === 'ALL') && (
                    <tr className="expanded-row">
                      <td colSpan="11">
                        <div className="expansion-panel">
                          {/* Field Metadata */}
                          <div className="field-metadata">
                            <div className="metadata-item">
                              <label>Field Name:</label>
                              <span>{field.field_name}</span>
                            </div>
                            <div className="metadata-item">
                              <label>Type:</label>
                              <span>{field.field_type || '-'}</span>
                            </div>
                            <div className="metadata-item">
                              <label>Page:</label>
                              <span>{field.field_page || '-'}</span>
                            </div>
                            <div className="metadata-item">
                              <label>Coordinates:</label>
                              <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                                ({field.x?.toFixed(0)}, {field.y?.toFixed(0)})
                                {field.width && ` → ${field.width.toFixed(0)}×${field.height?.toFixed(0)}px`}
                              </span>
                            </div>
                          </div>

                          {/* PDF Field Location Hint */}
                          <div style={{
                            padding: '12px',
                            backgroundColor: '#e8f4f8',
                            border: '1px solid #0288d1',
                            borderRadius: '4px',
                            marginBottom: '20px',
                            fontSize: '12px',
                            color: '#01579b'
                          }}>
                            <strong>📍 To locate this field in the PDF:</strong>
                            <br />
                            Go to page {field.field_page} and look for a {field.field_type} field positioned at approximately ({field.x?.toFixed(0)}px, {field.y?.toFixed(0)}px) from the top-left corner.
                          </div>

                          {/* Line-by-line Comparison */}
                          <div className="line-by-line-comparison">
                            {/* Code/Field */}
                            <div className="comparison-line">
                              <div className="line-item suggested">
                                <label>Suggested Code:</label>
                                <span className="highlight">{field.suggested_code || '-'}</span>
                              </div>
                              {!viewMode.includes('current') && field.current_code && (
                                <div className="line-item current">
                                  <label>Current Code:</label>
                                  <span>{field.current_code || '-'}</span>
                                </div>
                              )}
                            </div>

                            {/* Signer */}
                            <div className="comparison-line">
                              <div className="line-item suggested">
                                <label>Suggested Signer:</label>
                                <span className="highlight">{field.signer || '-'}</span>
                              </div>
                              {!viewMode.includes('current') && field.current_signer && (
                                <div className="line-item current">
                                  <label>Current Signer:</label>
                                  <span>{field.current_signer || '-'}</span>
                                </div>
                              )}
                            </div>

                            {/* Confidence */}
                            <div className="comparison-line">
                              <div className="line-item suggested">
                                <label>Confidence:</label>
                                <span className="highlight">{((field.confidence || 0) * 100).toFixed(1)}%</span>
                              </div>
                            </div>

                            {/* OCR Details */}
                            {!viewMode.includes('current') && (
                              <>
                                {field.match_text && (
                                  <div className="comparison-line">
                                    <div className="line-item suggested">
                                      <label>Matched Text:</label>
                                      <span className="match-text">"{field.match_text}"</span>
                                    </div>
                                  </div>
                                )}
                                {field.match_zone && (
                                  <div className="comparison-line">
                                    <div className="line-item suggested">
                                      <label>Text Location:</label>
                                      <span className="zone-badge">
                                        {field.match_zone.toUpperCase()}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                {field.match_reason && (
                                  <div className="comparison-line">
                                    <div className="line-item suggested">
                                      <label>Match Method:</label>
                                      <span className="reason">{field.match_reason}</span>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="expansion-actions">
                            <button className="action-btn accept-btn">
                              Accept Suggestion
                            </button>
                            <button className="action-btn dismiss-btn">
                              Dismiss
                            </button>
                            <button className="action-btn edit-btn">
                              Edit
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="form-markup-footer">
        <p>
          Page {currentPage} of {totalPages}
          {fieldsOnPage > 0 && ` • Showing ${paginatedFields.length} of ${fieldsOnPage} fields on this page`}
        </p>
      </div>
    </div>
  );
}
