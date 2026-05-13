import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Download, ChevronDown, ChevronRight, X } from 'lucide-react';

function ManualEditMarkup() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [selectedPage, setSelectedPage] = useState('ALL');

  // State for accordion and bulk operations
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [bulkProperties, setBulkProperties] = useState({
    required: null,
    read_only: null,
    border: null
  });
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  // Filter and pagination state
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
      setSuggestions(response.data.suggestions || []);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const toggleRowExpanded = (fieldName) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(fieldName)) {
      newExpanded.delete(fieldName);
    } else {
      newExpanded.add(fieldName);
    }
    setExpandedRows(newExpanded);
  };

  const handleSelectField = (fieldName) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(fieldName)) {
      newSelected.delete(fieldName);
    } else {
      newSelected.add(fieldName);
    }
    setSelectedFields(newSelected);
  };

  const handleSelectPage = () => {
    if (selectedFields.size === filteredSuggestions.length) {
      setSelectedFields(new Set());
    } else {
      setSelectedFields(new Set(filteredSuggestions.map(s => s.field_name)));
    }
  };

  const handleBulkPropertyChange = (field, value) => {
    setBulkProperties({
      ...bulkProperties,
      [field]: bulkProperties[field] === value ? null : value
    });
  };

  const applyBulkProperties = () => {
    const updated = suggestions.map(s => {
      if (selectedFields.has(s.field_name)) {
        return {
          ...s,
          required: bulkProperties.required !== null ? bulkProperties.required : s.required,
          read_only: bulkProperties.read_only !== null ? bulkProperties.read_only : s.read_only,
          border: bulkProperties.border !== null ? bulkProperties.border : s.border
        };
      }
      return s;
    });
    setSuggestions(updated);
    setShowBulkPanel(false);
    setBulkProperties({ required: null, read_only: null, border: null });
  };

  const applyBulkSigner = () => {
    if (!bulkSignerValue) {
      setShowBulkSignerPanel(false);
      return;
    }
    const updated = suggestions.map(s => {
      if (selectedFields.has(s.field_name)) {
        return { ...s, signer: bulkSignerValue };
      }
      return s;
    });
    setSuggestions(updated);
    setShowBulkSignerPanel(false);
    setBulkSignerValue('');
  };

  const updateSuggestion = (index, field, value) => {
    const updated = [...suggestions];
    updated[index] = { ...updated[index], [field]: value };
    setSuggestions(updated);
  };

  // Filter and pagination
  const filteredSuggestions = suggestions.filter(s => {
    if (selectedPage !== 'ALL' && s.field_page !== parseInt(selectedPage)) return false;
    if (typeFilter && s.field_type !== typeFilter) return false;
    if (signerFilter && s.signer !== signerFilter) return false;
    return true;
  });

  const uniquePages = [...new Set(suggestions.map(s => s.field_page || 1))].sort((a, b) => a - b);
  const uniqueTypes = [...new Set(suggestions.map(s => s.field_type))];
  const uniqueSigners = [...new Set(suggestions.map(s => s.signer).filter(Boolean))];

  const getAvailableSigners = () => {
    if (job?.signers) {
      return JSON.parse(job.signers);
    }
    return ['Resident', 'Staff', 'Family', 'Physician'];
  };

  const handleApplyChanges = async () => {
    if (applying) return;
    setApplying(true);

    try {
      const response = await axios.post(`/api/jobs/${jobId}/apply`, {
        suggestions: suggestions.map(s => ({
          ...s,
          approval_status: 'approved'
        }))
      });

      if (response.data.pdf) {
        const link = document.createElement('a');
        link.href = response.data.pdf;
        link.download = `${job.document_title || 'form'}-marked.pdf`;
        link.click();
      }

      navigate('/history');
    } catch (err) {
      alert('Error applying changes: ' + err.message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Analyzing PDF...</h2>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-gray-600 mt-2">{progress}% complete</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Manual Edit Mode</h1>
          <p className="text-gray-600">Edit current field values and properties for {job?.document_title}</p>
        </div>

        {/* Preview Panel */}
        {selectedPreviewId && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-l-4 border-blue-500">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {suggestions.find(s => s.field_name === selectedPreviewId)?.field_name}
              </h3>
              <button
                onClick={() => setSelectedPreviewId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <p className="text-gray-600">Type</p>
                <p className="font-medium">{suggestions.find(s => s.field_name === selectedPreviewId)?.field_type}</p>
              </div>
              <div>
                <p className="text-gray-600">Signer</p>
                <p className="font-medium">{suggestions.find(s => s.field_name === selectedPreviewId)?.signer || 'Unassigned'}</p>
              </div>
              <div>
                <p className="text-gray-600">Page</p>
                <p className="font-medium">{suggestions.find(s => s.field_name === selectedPreviewId)?.field_page || 1}</p>
              </div>
              <div>
                <p className="text-gray-600">Required</p>
                <p className="font-medium">{suggestions.find(s => s.field_name === selectedPreviewId)?.required ? 'Yes' : 'No'}</p>
              </div>
            </div>
            {suggestions.find(s => s.field_name === selectedPreviewId)?.preview_image && (
              <img
                src={suggestions.find(s => s.field_name === selectedPreviewId)?.preview_image}
                alt="Field preview"
                className="max-h-96 w-auto rounded border border-gray-200"
              />
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Page</label>
              <select
                value={selectedPage}
                onChange={(e) => setSelectedPage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Pages</option>
                {uniquePages.map(p => (
                  <option key={p} value={p}>Page {p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                {uniqueTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Signer</label>
              <select
                value={signerFilter}
                onChange={(e) => setSignerFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Signers</option>
                {uniqueSigners.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-sm text-gray-600">{filteredSuggestions.length} fields shown</p>
            </div>
          </div>
        </div>

        {/* Bulk Operations Panel */}
        {selectedFields.size > 0 && (
          <div className="bg-blue-50 rounded-lg shadow-md p-6 mb-6 border-l-4 border-blue-500">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Bulk Edit ({selectedFields.size} selected)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <button
                onClick={() => setShowBulkSignerPanel(!showBulkSignerPanel)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium"
              >
                Set Signer
              </button>
              <button
                onClick={() => setShowBulkPanel(!showBulkPanel)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium"
              >
                Set Properties
              </button>
              <button
                onClick={() => {
                  setSelectedFields(new Set());
                  setBulkSignerValue('');
                  setBulkProperties({ required: null, read_only: null, border: null });
                }}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium"
              >
                Clear Selection
              </button>
            </div>

            {showBulkSignerPanel && (
              <div className="bg-white rounded border border-gray-300 p-4 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Signer</label>
                <select
                  value={bulkSignerValue}
                  onChange={(e) => setBulkSignerValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a signer...</option>
                  {getAvailableSigners().map(s => (
                    <option key={s} value={s.toLowerCase()}>{s}</option>
                  ))}
                </select>
                <button
                  onClick={applyBulkSigner}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Apply
                </button>
              </div>
            )}

            {showBulkPanel && (
              <div className="bg-white rounded border border-gray-300 p-4 mb-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { key: 'required', label: 'Required' },
                    { key: 'read_only', label: 'Read Only' },
                    { key: 'border', label: 'Border' }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleBulkPropertyChange(key, true)}
                      className={`px-3 py-2 rounded text-sm font-medium transition ${
                        bulkProperties[key] === true
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={applyBulkProperties}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Apply Properties
                </button>
              </div>
            )}
          </div>
        )}

        {/* Fields Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-10">
                  <input
                    type="checkbox"
                    checked={selectedFields.size === filteredSuggestions.length && filteredSuggestions.length > 0}
                    onChange={handleSelectPage}
                    className="w-4 h-4"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Field Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Signer</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Req</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">RO</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Border</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Preview</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Page</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredSuggestions.map((s, idx) => (
                <React.Fragment key={s.field_name}>
                  <tr className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedFields.has(s.field_name)}
                        onChange={() => handleSelectField(s.field_name)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <input
                        type="text"
                        value={s.field_name}
                        onChange={(e) => updateSuggestion(idx, 'field_name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.field_type}</td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={s.signer || ''}
                        onChange={(e) => updateSuggestion(idx, 'signer', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                      >
                        <option value="">—</option>
                        {getAvailableSigners().map(signer => (
                          <option key={signer} value={signer.toLowerCase()}>{signer}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={s.required || false}
                        onChange={(e) => updateSuggestion(idx, 'required', e.target.checked)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={s.read_only || false}
                        onChange={(e) => updateSuggestion(idx, 'read_only', e.target.checked)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={s.border || false}
                        onChange={(e) => updateSuggestion(idx, 'border', e.target.checked)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.preview_image && (
                        <button
                          onClick={() => setSelectedPreviewId(s.field_name)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          👁️
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.field_page || 1}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleRowExpanded(s.field_name)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {expandedRows.has(s.field_name) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                    </td>
                  </tr>
                  {expandedRows.has(s.field_name) && (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td colSpan="10" className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">Field Index</p>
                            <p className="font-medium">{s.field_index}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Confidence</p>
                            <p className="font-medium">{(s.confidence * 100).toFixed(0)}%</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4 justify-end">
          <button
            onClick={() => navigate('/history')}
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleApplyChanges}
            disabled={applying}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            <Download size={18} />
            {applying ? 'Applying...' : 'Apply & Download'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ManualEditMarkup;
