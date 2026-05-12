import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Download, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

function FormMarkup() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [selectedPage, setSelectedPage] = useState(1);

  // State for accordion and bulk operations
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [bulkProperties, setBulkProperties] = useState({
    required: null,
    read_only: null,
    border: null
  });
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  useEffect(() => {
    fetchJobDetails();
    const interval = setInterval(() => {
      if (!job || (job.status !== 'reviewed' && job.status !== 'applied')) {
        fetchJobDetails();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const fetchJobDetails = async () => {
    try {
      const response = await axios.get(`/api/jobs/${jobId}`);
      setJob(response.data.job);

      let initializedSuggestions = response.data.suggestions || [];

      const signers = response.data.job?.signers
        ? JSON.parse(response.data.job.signers)
        : ['Resident', 'Staff'];

      if (signers.length > 0) {
        initializedSuggestions = initializedSuggestions.map((suggestion, index) => {
          const signer = suggestion.signer === 'unassigned' ? signers[0] : suggestion.signer;

          const safeSigner = signer
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

          const fieldsBeforeThisSigner = initializedSuggestions
            .slice(0, index)
            .filter(s => (s.signer === 'unassigned' ? signers[0] : s.signer) === signer && s.field_type === suggestion.field_type)
            .length;

          const iteration = fieldsBeforeThisSigner + 1;
          const anchor = `${safeSigner}.${suggestion.field_type}.${iteration}`;

          return {
            ...suggestion,
            signer,
            anchor_name: suggestion.anchor_name || anchor,
            suggested_code: suggestion.suggested_code || anchor,
            current_required: suggestion.required,
            current_read_only: suggestion.read_only,
            current_field_name: suggestion.field_name,
            current_border: suggestion.border || false,
            border: suggestion.border || false,
            required: suggestion.required !== undefined ? suggestion.required : false,
            read_only: suggestion.read_only !== undefined ? suggestion.read_only : false,
            // Debug: Log confidence value
            __debug_confidence: suggestion.confidence
          };
        });
      }

      setSuggestions(initializedSuggestions);
      setSelectedFields(new Set());
      setExpandedRows(new Set());
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load job details');
      console.error('Error fetching job details:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFieldTypeColor = (fieldType) => {
    const colorMap = {
      'signature': '#FF5722',
      'text': '#FFC107',
      'checkbox': '#FF9800',
      'radio': '#FF5722',
      'button': '#FF5722',
      'dropdown': '#FF9800',
      'date': '#FFC107',
    };
    return colorMap[fieldType?.toLowerCase()] || '#555';
  };

  const getImportantProperties = (fieldPropertiesJSON) => {
    if (!fieldPropertiesJSON) return [];

    try {
      const props = typeof fieldPropertiesJSON === 'string'
        ? JSON.parse(fieldPropertiesJSON)
        : fieldPropertiesJSON;

      const important = [];
      if (props.password) important.push('password');
      if (props.multiline) important.push('multiline');
      if (props.rich_text) important.push('rich_text');
      if (props.commit_on_sel_change) important.push('auto_trigger');
      if (props.comb) important.push('comb');
      if (props.no_export) important.push('no_export');

      return important;
    } catch (e) {
      return [];
    }
  };

  const generateAnchorFromSigner = (signer, fieldType, suggestionIndex) => {
    if (!signer || signer === 'unassigned') {
      return '';
    }

    const safeSigner = signer
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const fieldsBeforeThisSigner = suggestions
      .slice(0, suggestionIndex)
      .filter(s => s.signer === signer && s.field_type === fieldType).length;

    const iteration = fieldsBeforeThisSigner + 1;
    return `${safeSigner}.${fieldType}.${iteration}`;
  };

  const handleUpdateSuggestion = (index, field, value) => {
    const updated = [...suggestions];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'signer') {
      const newAnchor = generateAnchorFromSigner(value, updated[index].field_type, index);
      updated[index].anchor_name = newAnchor;
      updated[index].suggested_code = newAnchor;
    }

    setSuggestions(updated);
  };

  const toggleRowExpanded = (fieldIndex) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(fieldIndex)) {
      newExpanded.delete(fieldIndex);
    } else {
      newExpanded.add(fieldIndex);
    }
    setExpandedRows(newExpanded);
  };

  const handleToggleFieldSelection = (fieldIndex) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(fieldIndex)) {
      newSelected.delete(fieldIndex);
    } else {
      newSelected.add(fieldIndex);
    }
    setSelectedFields(newSelected);
  };

  const handleSelectAllOnPage = () => {
    const pageNumbers = [...new Set(suggestions.map(s => s.field_page || 1))].sort((a, b) => a - b);
    const pageSuggestions = suggestions.filter(s => (s.field_page || 1) === selectedPage);
    const pageIndices = pageSuggestions.map(s => suggestions.indexOf(s));

    if (pageIndices.length === 0) return;

    const newSelected = new Set(selectedFields);
    const allSelectedOnPage = pageIndices.every(i => newSelected.has(i));

    if (allSelectedOnPage) {
      pageIndices.forEach(i => newSelected.delete(i));
    } else {
      pageIndices.forEach(i => newSelected.add(i));
    }
    setSelectedFields(newSelected);
  };

  const handleApplyBulkProperties = () => {
    if (selectedFields.size === 0) {
      alert('Please select fields first');
      return;
    }

    const updated = [...suggestions];
    selectedFields.forEach(index => {
      if (bulkProperties.required !== null) {
        updated[index].required = bulkProperties.required;
      }
      if (bulkProperties.read_only !== null) {
        updated[index].read_only = bulkProperties.read_only;
      }
      if (bulkProperties.border !== null) {
        updated[index].border = bulkProperties.border;
      }
    });

    setSuggestions(updated);
    setShowBulkPanel(false);
    alert(`Properties applied to ${selectedFields.size} field(s)`);
  };

  const handleApprove = async () => {
    setApplying(true);
    try {
      const approveSuggestions = suggestions.map(s => ({
        ...s,
        approval_status: 'approved',
        __debug_confidence: undefined // Remove debug field before sending
      }));

      const response = await axios.post(`/api/jobs/${jobId}/apply`, {
        suggestions: approveSuggestions
      });

      const link = document.createElement('a');
      link.href = response.data.pdf;
      link.download = `${job.document_title}-applied.pdf`;
      link.click();

      setJob({ ...job, status: 'applied' });
      alert('PDF applied and downloaded successfully!');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply changes');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading job details...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Job not found</p>
      </div>
    );
  }

  const pageNumbers = [...new Set(suggestions.map(s => s.field_page || 1))].sort((a, b) => a - b);
  const pageSuggestions = suggestions.filter(s => (s.field_page || 1) === selectedPage);
  const configuredSigners = job && job.signers ? JSON.parse(job.signers) : ['Resident', 'Staff'];
  const pageIndices = pageSuggestions.map(s => suggestions.indexOf(s));
  const selectedOnPage = pageIndices.filter(i => selectedFields.has(i)).length;

  return (
    <div className="max-w-7xl mx-auto">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 mb-6">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold">{job.document_title}</h1>
            <p className="text-gray-600">{job.company_name}</p>
          </div>
          <span className="px-3 py-1 rounded text-white font-medium" style={{
            backgroundColor:
              job.status === 'analyzing' ? '#FFC107' :
              job.status === 'reviewed' ? '#FF9800' :
              job.status === 'applied' ? '#FF5722' :
              '#555'
          }}>
            {job.status.toUpperCase()}
          </span>
        </div>

        {job.status === 'analyzed' || job.status === 'reviewed' ? (
          <button
            onClick={handleApprove}
            disabled={applying || suggestions.length === 0}
            className="flex items-center gap-2 text-white px-6 py-3 rounded-lg disabled:bg-gray-400 transition"
            style={{
              backgroundColor: '#FF5722',
              '--tw-bg-opacity': '1'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#E64A19'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#FF5722'}
          >
            <Download size={20} />
            {applying ? 'Applying...' : 'Apply & Download'}
          </button>
        ) : null}
      </div>

      {job.status === 'analyzing' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800">Analyzing PDF... This may take a moment.</p>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800">No fields detected in this PDF.</p>
        </div>
      ) : (
        <>
          {/* Page Navigation */}
          <div className="flex gap-2 mb-6 items-center">
            <div className="flex gap-2">
              {pageNumbers.map(page => (
                <button
                  key={page}
                  onClick={() => setSelectedPage(page)}
                  className="px-3 py-1 rounded transition"
                  style={{
                    backgroundColor: selectedPage === page ? '#FF9800' : '#E0E0E0',
                    color: selectedPage === page ? 'white' : '#666',
                    fontWeight: selectedPage === page ? '600' : '500'
                  }}
                >
                  Page {page}
                </button>
              ))}
            </div>

            {/* Bulk Actions */}
            {selectedFields.size > 0 && (
              <div className="ml-auto flex gap-2 items-center">
                <span className="text-sm text-gray-600">
                  {selectedFields.size} field{selectedFields.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={() => setShowBulkPanel(!showBulkPanel)}
                  className="px-4 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition"
                >
                  Bulk Assign
                </button>
              </div>
            )}
          </div>

          {/* Bulk Properties Panel */}
          {showBulkPanel && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Required
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBulkProperties({ ...bulkProperties, required: true })}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkProperties.required === true
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setBulkProperties({ ...bulkProperties, required: false })}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkProperties.required === false
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      No
                    </button>
                    <button
                      onClick={() => setBulkProperties({ ...bulkProperties, required: null })}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkProperties.required === null
                          ? 'bg-gray-400 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Skip
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Read-Only
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBulkProperties({ ...bulkProperties, read_only: true })}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkProperties.read_only === true
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setBulkProperties({ ...bulkProperties, read_only: false })}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkProperties.read_only === false
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      No
                    </button>
                    <button
                      onClick={() => setBulkProperties({ ...bulkProperties, read_only: null })}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkProperties.read_only === null
                          ? 'bg-gray-400 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Skip
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Border
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBulkProperties({ ...bulkProperties, border: true })}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkProperties.border === true
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setBulkProperties({ ...bulkProperties, border: false })}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkProperties.border === false
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      No
                    </button>
                    <button
                      onClick={() => setBulkProperties({ ...bulkProperties, border: null })}
                      className={`px-3 py-1 rounded text-sm ${
                        bulkProperties.border === null
                          ? 'bg-gray-400 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Skip
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleApplyBulkProperties}
                  className="ml-auto px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                >
                  Apply to {selectedFields.size} Fields
                </button>
              </div>
            </div>
          )}

          {/* Suggestions Table with Accordion */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 w-12">
                    <input
                      type="checkbox"
                      checked={selectedOnPage === pageIndices.length && pageIndices.length > 0}
                      onChange={handleSelectAllOnPage}
                      title="Select all on this page"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Suggested Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Signer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Border</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Required</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Read-Only</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {pageSuggestions.map((suggestion, pageIndex) => {
                  const fullIndex = suggestions.indexOf(suggestion);
                  const isSelected = selectedFields.has(fullIndex);
                  const isExpanded = expandedRows.has(fullIndex);
                  const confidencePercent = (suggestion.confidence || 0) * 100;

                  return (
                    <React.Fragment key={suggestion.id}>
                      {/* Main Row */}
                      <tr className={`border-b hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleFieldSelection(fullIndex)}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <button
                            onClick={() => toggleRowExpanded(fullIndex)}
                            className="text-gray-400 hover:text-gray-600"
                            title={isExpanded ? 'Hide current values' : 'Show current values'}
                          >
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold" style={{ color: getFieldTypeColor(suggestion.field_type) }}>
                          {suggestion.field_type}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <input
                            type="text"
                            value={suggestion.suggested_code || ''}
                            onChange={(e) => handleUpdateSuggestion(fullIndex, 'suggested_code', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={suggestion.signer || ''}
                            onChange={(e) => handleUpdateSuggestion(fullIndex, 'signer', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs"
                          >
                            {configuredSigners.map((signer) => (
                              <option key={signer} value={signer}>
                                {signer}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={suggestion.border || false}
                            onChange={(e) => handleUpdateSuggestion(fullIndex, 'border', e.target.checked)}
                            title="Field should have a border/outline"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={suggestion.required || false}
                            onChange={(e) => handleUpdateSuggestion(fullIndex, 'required', e.target.checked)}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={suggestion.read_only || false}
                            onChange={(e) => handleUpdateSuggestion(fullIndex, 'read_only', e.target.checked)}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-1">
                            <div className="w-24 bg-gray-200 rounded h-2">
                              <div
                                className="bg-green-500 h-2 rounded"
                                style={{ width: `${confidencePercent}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600 min-w-max" title={`OCR match confidence: ${confidencePercent.toFixed(0)}%`}>
                              {confidencePercent.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Row - Current Values */}
                      {isExpanded && (
                        <tr className="bg-blue-100 border-b">
                          <td colSpan="9" className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-6">
                              {/* Current Values (left) */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-3 text-sm">📋 Current (in PDF)</h4>
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <span className="text-gray-600">Field Name:</span>
                                    <div className="font-mono bg-gray-200 px-2 py-1 rounded text-xs mt-1">
                                      {suggestion.current_field_name || suggestion.field_name || '(unnamed)'}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Required:</span>
                                    <div className="mt-1">{suggestion.current_required ? '✓ Yes' : '○ No'}</div>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Read-Only:</span>
                                    <div className="mt-1">{suggestion.current_read_only ? '✓ Yes' : '○ No'}</div>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Border:</span>
                                    <div className="mt-1">{suggestion.current_border ? '✓ Yes' : '○ No'}</div>
                                  </div>
                                </div>
                              </div>

                              {/* Suggested Values (right) */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-3 text-sm">✏️ Suggested (to apply)</h4>
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <span className="text-gray-600">Field Name:</span>
                                    <div className="font-mono bg-yellow-100 px-2 py-1 rounded text-xs mt-1">
                                      {suggestion.suggested_code || '(pending)'}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Required:</span>
                                    <div className="mt-1">{suggestion.required ? '✓ Yes' : '○ No'}</div>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Read-Only:</span>
                                    <div className="mt-1">{suggestion.read_only ? '✓ Yes' : '○ No'}</div>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Border:</span>
                                    <div className="mt-1">{suggestion.border ? '✓ Yes' : '○ No'}</div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Properties Info */}
                            {getImportantProperties(suggestion.field_properties).length > 0 && (
                              <div className="mt-4 pt-4 border-t border-blue-300">
                                <span className="text-xs text-gray-600">Other Properties:</span>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {getImportantProperties(suggestion.field_properties).map((prop) => (
                                    <span
                                      key={prop}
                                      className="px-2 py-1 bg-blue-200 text-blue-700 rounded text-xs font-medium"
                                    >
                                      {prop === 'auto_trigger' ? '⚡' : prop === 'password' ? '🔐' : prop === 'multiline' ? '📄' : prop === 'rich_text' ? '✏️' : prop === 'comb' ? '#️⃣' : prop === 'no_export' ? '🚫' : '•'} {prop}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Debug Info for Confidence */}
          {suggestions.some(s => s.__debug_confidence !== undefined && s.__debug_confidence !== null) && (
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
              <strong>ℹ️ Debug Note:</strong> Confidence values are being loaded from the database. If all fields show 0%, it means the confidence values weren't calculated during analysis. Check the form-markup analysis phase to ensure OCR label matching confidence is being captured.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FormMarkup;
