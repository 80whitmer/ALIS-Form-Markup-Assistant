import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Download, ChevronDown, ChevronRight } from 'lucide-react';

function FormMarkup() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [selectedPage, setSelectedPage] = useState('ALL');

  // State for accordion and bulk operations
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [showCurrentValuesOnly, setShowCurrentValuesOnly] = useState(false);
  const [bulkProperties, setBulkProperties] = useState({
    required: null,
    read_only: null,
    border: null
  });
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  // New filter and pagination state
  const [typeFilter, setTypeFilter] = useState('');
  const [signerFilter, setSignerFilter] = useState('');
  const [bulkSignerValue, setBulkSignerValue] = useState('');
  const [showBulkSignerPanel, setShowBulkSignerPanel] = useState(false);
  const PAGINATION_COLUMNS = 10;

  // Progress bar and preview state
  const [progress, setProgress] = useState(0);
  const [selectedPreviewId, setSelectedPreviewId] = useState(null);

  // Poll progress while loading
  useEffect(() => {
    if (!loading || !jobId) return;

    const pollProgress = async () => {
      try {
        const progressRes = await fetch(`/api/jobs/${jobId}/progress`);
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          setProgress(progressData.percentage || 0);
        }
      } catch (err) {
        console.debug('[progress] Poll error:', err.message);
      }
    };

    const interval = setInterval(pollProgress, 500);
    pollProgress();

    return () => clearInterval(interval);
  }, [loading, jobId]);

  useEffect(() => {
    fetchJobDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const interval = setInterval(() => {
      if (!job || (job.status !== 'reviewed' && job.status !== 'applied')) {
        fetchJobDetails();
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Bulk signer assignment (auto-regenerates codes)
  const handleApplyBulkSigner = () => {
    if (selectedFields.size === 0 || !bulkSignerValue) {
      alert('Please select fields and choose a signer');
      return;
    }

    const updated = [...suggestions];
    selectedFields.forEach(index => {
      updated[index].signer = bulkSignerValue;
      // Auto-regenerate suggested code with new signer
      const newAnchor = generateAnchorFromSigner(bulkSignerValue, updated[index].field_type, index);
      updated[index].anchor_name = newAnchor;
      updated[index].suggested_code = newAnchor;
    });

    setSuggestions(updated);
    setShowBulkSignerPanel(false);
    setBulkSignerValue('');
    alert(`Signer and codes updated for ${selectedFields.size} field(s)`);
  };

  // Get unique types and signers for filter dropdowns
  const getUniqueTypes = () => {
    return [...new Set(suggestions.map(s => s.field_type).filter(Boolean))].sort();
  };

  const getUniqueSigners = () => {
    return [...new Set(suggestions.map(s => s.signer).filter(Boolean))].sort();
  };

  // Apply filters to suggestions
  const getFilteredSuggestions = () => {
    return suggestions.filter(s => {
      if (typeFilter && s.field_type !== typeFilter) return false;
      if (signerFilter && s.signer !== signerFilter) return false;
      return true;
    });
  };

  const handleApprove = async () => {
    setApplying(true);
    try {
      const approveSuggestions = suggestions.map(s => ({
        ...s,
        approval_status: 'approved',
        __debug_confidence: undefined
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

  const handleRefineInManualEdit = () => {
    alert(
      'To refine these results in Manual Edit mode:\n\n' +
      '1. Go to "New Analysis" to upload the PDF again\n' +
      '2. Select "Manual Edit (current values)" as the workflow\n' +
      '3. The manual editor will show all current field values for refinement\n\n' +
      'This allows you to bulk edit field names, signers, and properties without re-analyzing.'
    );
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

  // Get all pages, page suggestions with filters applied
  const allPageNumbers = [...new Set(suggestions.map(s => s.field_page || 1))].sort((a, b) => a - b);
  const filteredSuggestions = getFilteredSuggestions();

  // Show all filtered suggestions by default, or filter by page if page is selected
  const displaySuggestions = selectedPage === null || selectedPage === 'ALL'
    ? filteredSuggestions
    : filteredSuggestions.filter(s => (s.field_page || 1) === selectedPage);

  const pageSuggestions = displaySuggestions;
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

        <div className="grid grid-cols-4 gap-4 mt-6 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-gray-600 text-sm font-medium">Total Fields</p>
            <p className="text-3xl font-bold text-blue-600">{suggestions.length}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <p className="text-gray-600 text-sm font-medium">Signatures</p>
            <p className="text-3xl font-bold text-orange-600">{suggestions.filter(s => s.field_type === 'signature').length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-gray-600 text-sm font-medium">Signers Found</p>
            <p className="text-3xl font-bold text-green-600">{new Set(suggestions.map(s => s.signer).filter(s => s && s !== 'unassigned')).size}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-gray-600 text-sm font-medium">Signers</p>
            <p className="text-sm font-semibold text-purple-600 leading-relaxed">
              {new Set(suggestions.map(s => s.signer).filter(Boolean)).size > 0
                ? Array.from(new Set(suggestions.map(s => s.signer).filter(Boolean))).join(', ')
                : 'None assigned'
              }
            </p>
          </div>
        </div>

        {job.status === 'analyzed' || job.status === 'reviewed' ? (
          <div className="flex gap-3">
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
            <button
              onClick={handleRefineInManualEdit}
              disabled={applying || suggestions.length === 0}
              className="flex items-center gap-2 text-gray-700 px-6 py-3 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
            >
              ✏️ Refine in Manual Edit
            </button>
          </div>
        ) : null}
      </div>

      {job.status === 'analyzing' ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-full max-w-md text-center space-y-6">
            <div>
              <h2 className="text-lg font-bold text-blue-900 mb-2">Analyzing PDF...</h2>
              <p className="text-sm text-gray-600">This may take a moment.</p>
            </div>
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-sm font-semibold text-blue-900">{progress}%</div>
            </div>
            <div className="text-sm text-gray-600">
              {progress < 30 && 'Extracting form fields...'}
              {progress >= 30 && progress < 70 && 'Generating suggestions...'}
              {progress >= 70 && 'Finalizing analysis...'}
            </div>
          </div>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800">No fields detected in this PDF.</p>
        </div>
      ) : (
        <>
          {/* Preview Panel */}
          {selectedPreviewId && (
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-blue-900">Field Preview</h2>
                <button
                  onClick={() => setSelectedPreviewId(null)}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  ✕
                </button>
              </div>

              {(() => {
                const preview = suggestions.find(s => s.id === selectedPreviewId);
                if (!preview) return null;

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-4 bg-white rounded-lg p-4 border border-blue-200 text-sm">
                      <div>
                        <label className="font-semibold text-gray-700 block mb-1">Field Name</label>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded block font-mono truncate" title={preview.field_name}>
                          {preview.field_name || '—'}
                        </code>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700 block mb-1">Signer</label>
                        <span className="text-gray-900">{preview.signer || '—'}</span>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700 block mb-1">Type</label>
                        <span className="text-gray-900">{preview.field_type || 'text'}</span>
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700 block mb-1">Confidence</label>
                        <span className="text-gray-900 font-semibold text-blue-600">
                          {Math.round((preview.confidence || 0) * 100)}%
                        </span>
                      </div>
                    </div>

                    {preview.preview_image ? (
                      <div className="bg-white border border-gray-300 rounded-lg p-4 flex justify-center">
                        <img
                          src={preview.preview_image}
                          alt="Field preview"
                          className="max-h-96 rounded border border-gray-200"
                        />
                      </div>
                    ) : (
                      <div className="bg-white border border-gray-300 rounded-lg p-12 text-center text-gray-500">
                        <p className="text-sm">Preview image not available</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Type Filter</label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setSelectedPage(1);
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">All Types</option>
                  {getUniqueTypes().map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Signer Filter</label>
                <select
                  value={signerFilter}
                  onChange={(e) => {
                    setSignerFilter(e.target.value);
                    setSelectedPage(1);
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">All Signers</option>
                  {getUniqueSigners().map(signer => (
                    <option key={signer} value={signer}>{signer}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Results</label>
                <div className="px-3 py-2 bg-gray-100 rounded text-sm font-semibold">
                  {filteredSuggestions.length} / {suggestions.length}
                </div>
              </div>

              <div>
                <button
                  onClick={() => {
                    setTypeFilter('');
                    setSignerFilter('');
                    setSelectedPage(1);
                  }}
                  className="mt-6 w-full px-3 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 transition"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Signer Panel */}
          {selectedFields.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-blue-900">
                  {selectedFields.size} field{selectedFields.size !== 1 ? 's' : ''} selected
                </span>
              </div>

              {showBulkSignerPanel ? (
                <div className="mt-4 flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-blue-900 mb-2">Bulk Assign Signer</label>
                    <select
                      value={bulkSignerValue}
                      onChange={(e) => setBulkSignerValue(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Choose signer...</option>
                      {configuredSigners.map(signer => (
                        <option key={signer} value={signer}>{signer}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleApplyBulkSigner}
                    disabled={!bulkSignerValue}
                    className={`px-6 py-2 rounded text-sm font-medium transition-colors ${
                      bulkSignerValue
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Apply Signer to {selectedFields.size}
                  </button>
                  <button
                    onClick={() => {
                      setShowBulkSignerPanel(false);
                      setBulkSignerValue('');
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setShowBulkSignerPanel(true)}
                    className="px-4 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
                  >
                    Bulk Assign Signer
                  </button>
                  <button
                    onClick={() => setShowBulkPanel(!showBulkPanel)}
                    className="px-4 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition"
                  >
                    Bulk Set Properties
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Page Navigation with Compact Grid Pagination */}
          <div className="flex gap-4 mb-6 items-start">
            <div className="flex-1">
              <span className="text-xs font-semibold text-gray-600 block mb-2">Navigation (Pages):</span>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${PAGINATION_COLUMNS}, minmax(0, 1fr))`, maxWidth: '600px' }}>
                {/* ALL Button */}
                <button
                  onClick={() => {
                    setSelectedPage('ALL');
                    setExpandedRows(new Set());
                    setShowCurrentValuesOnly(false);
                  }}
                  className="px-2 py-1 rounded transition text-xs font-medium"
                  style={{
                    backgroundColor: selectedPage === 'ALL' ? '#FF9800' : '#E0E0E0',
                    color: selectedPage === 'ALL' ? 'white' : '#666'
                  }}
                  title={`Show all ${filteredSuggestions.length} filtered fields`}
                >
                  ALL
                </button>

                {/* Page Number Buttons */}
                {allPageNumbers.map(page => {
                  const pageHasFilterType = typeFilter && suggestions
                    .filter(s => (s.field_page || 1) === page && s.field_type === typeFilter)
                    .length > 0;

                  return (
                    <button
                      key={page}
                      onClick={() => {
                        setSelectedPage(page);
                        setExpandedRows(new Set());
                        setShowCurrentValuesOnly(false);
                      }}
                      className="px-2 py-1 rounded transition text-xs font-medium relative"
                      style={{
                        backgroundColor: selectedPage === page ? '#FF9800' : '#E0E0E0',
                        color: selectedPage === page ? 'white' : '#666'
                      }}
                      title={`Page ${page} (${filteredSuggestions.filter(s => (s.field_page || 1) === page).length} fields)`}
                    >
                      {page}
                      {pageHasFilterType && (
                        <span
                          className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"
                          title={`Page ${page} contains ${typeFilter} fields`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-gray-500 mt-1 block">
                Showing {pageSuggestions.length} of {filteredSuggestions.length} filtered ({suggestions.length} total)
              </span>
            </div>

            {/* View Mode Toggle */}
            <div className="pt-5">
              <button
                onClick={() => setShowCurrentValuesOnly(!showCurrentValuesOnly)}
                className="px-4 py-2 rounded text-sm transition whitespace-nowrap"
                style={{
                  backgroundColor: showCurrentValuesOnly ? '#4CAF50' : '#E0E0E0',
                  color: showCurrentValuesOnly ? 'white' : '#666',
                  fontWeight: '500'
                }}
              >
                {showCurrentValuesOnly ? '✓ Current Only' : 'View Values'}
              </button>
            </div>
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

          {/* Current Values Only View */}
          {showCurrentValuesOnly ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-blue-100 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Field Name (PDF)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Required</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Read-Only</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Border</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSuggestions.map((suggestion, pageIndex) => {
                    return (
                      <tr key={suggestion.id} className="border-b hover:bg-blue-50">
                        <td className="px-4 py-3 text-sm font-semibold" style={{ color: getFieldTypeColor(suggestion.field_type) }}>
                          {suggestion.field_type}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono bg-gray-100 rounded">
                          {suggestion.current_field_name || suggestion.field_name || '(unnamed)'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {suggestion.current_required ? '✓ Yes' : '○ No'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {suggestion.current_read_only ? '✓ Yes' : '○ No'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {suggestion.current_border ? '✓ Yes' : '○ No'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          Page {suggestion.field_page || 1}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Standard Suggestions Table with Accordion */
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
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Preview</th>
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

                          {/* Preview Thumbnail */}
                          <td className="px-4 py-3 text-center">
                            {suggestion.preview_image ? (
                              <button
                                onClick={() => setSelectedPreviewId(suggestion.id)}
                                className="group relative inline-block"
                              >
                                <img
                                  src={suggestion.preview_image}
                                  alt="Preview"
                                  className="w-12 h-12 object-cover rounded border border-gray-300 cursor-pointer hover:border-blue-500 transition-all hover:shadow-md"
                                  title="Click to view full preview"
                                />
                                <div className="absolute inset-0 rounded flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all">
                                  <span className="text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity">👁</span>
                                </div>
                              </button>
                            ) : (
                              <div className="w-12 h-12 bg-gray-100 rounded border border-gray-300 flex items-center justify-center text-xs text-gray-400">
                                —
                              </div>
                            )}
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
                                    <div className="pt-2 border-t border-blue-200 text-xs text-gray-500">
                                      Page {suggestion.field_page || 1}
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
                                      <span className="text-gray-600">Signer:</span>
                                      <div className="font-semibold mt-1">{suggestion.signer || 'Unassigned'}</div>
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

                              {/* Full Preview Image */}
                              {suggestion.preview_image && (
                                <div className="mt-4 pt-4 border-t border-blue-300">
                                  <span className="text-xs font-semibold text-gray-700 block mb-2">Field Preview:</span>
                                  <div className="bg-gray-50 border border-gray-300 rounded p-3 flex justify-center">
                                    <img
                                      src={suggestion.preview_image}
                                      alt="Field preview"
                                      className="max-h-48 rounded border border-gray-200"
                                    />
                                  </div>
                                </div>
                              )}

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
          )}
        </>
      )}
    </div>
  );
}

export default FormMarkup;
