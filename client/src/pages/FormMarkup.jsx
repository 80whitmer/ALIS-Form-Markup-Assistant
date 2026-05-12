import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Download, CheckCircle, XCircle } from 'lucide-react';

function FormMarkup() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [selectedPage, setSelectedPage] = useState(1);

  useEffect(() => {
    fetchJobDetails();
    // Poll for status updates only while analyzing
    // Once reviewed, stop polling to prevent local edits from being overwritten
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

      // Initialize suggestions with proper signers and anchors
      let initializedSuggestions = response.data.suggestions || [];

      // Parse configured signers
      const signers = response.data.job?.signers
        ? JSON.parse(response.data.job.signers)
        : ['Resident', 'Staff'];

      // If signers are unassigned, assign first configured signer
      if (signers.length > 0) {
        initializedSuggestions = initializedSuggestions.map((suggestion, index) => {
          const signer = suggestion.signer === 'unassigned' ? signers[0] : suggestion.signer;

          // Generate anchor based on signer (clean format)
          const safeSigner = signer
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_') // Replace one or more non-alphanumeric with single underscore
            .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

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
            // Auto-populate suggested_code with anchor if not already set
            suggested_code: suggestion.suggested_code || anchor,
            // Use the value from PDF's AcroForm (detected), default to false if not set
            required: suggestion.required !== undefined ? suggestion.required : false
          };
        });
      }

      setSuggestions(initializedSuggestions);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Generate anchor from signer, field type, and iteration number
   * Format: {signer_name}.{field_type}.{iteration}
   * Example: resident_or_responsible_party.text.1
   */
  /**
   * Get color for field type based on ALIS brand colors
   */
  const getFieldTypeColor = (fieldType) => {
    const colorMap = {
      'signature': '#FF5722', // Red-Orange
      'text': '#FFC107', // Gold-Yellow
      'checkbox': '#FF9800', // Orange
      'radio': '#FF5722', // Red-Orange
      'button': '#FF5722', // Red-Orange
      'dropdown': '#FF9800', // Orange
      'date': '#FFC107', // Gold-Yellow
    };
    return colorMap[fieldType?.toLowerCase()] || '#555'; // Default to dark gray
  };

  /**
   * Get important properties from the extracted field properties
   * Shows password, multiline, rich_text, commit_on_sel_change, comb
   */
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
      return ''; // Don't generate anchor if no signer
    }

    // Convert signer name to safe format (lowercase, spaces/special chars to underscores, remove duplicates)
    const safeSigner = signer
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_') // Replace one or more non-alphanumeric with single underscore
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

    // Count how many fields with this signer and type come before this one
    const fieldsBeforeThisSigner = suggestions
      .slice(0, suggestionIndex)
      .filter(s => s.signer === signer && s.field_type === fieldType).length;

    const iteration = fieldsBeforeThisSigner + 1;

    return `${safeSigner}.${fieldType}.${iteration}`;
  };

  const handleUpdateSuggestion = (index, field, value) => {
    const updated = [...suggestions];
    updated[index] = { ...updated[index], [field]: value };

    // If signer was changed, auto-update the anchor and use it as the suggested code
    if (field === 'signer') {
      const newAnchor = generateAnchorFromSigner(value, updated[index].field_type, index);
      updated[index].anchor_name = newAnchor;
      // Auto-populate the suggested code with the anchor
      updated[index].suggested_code = newAnchor;
    }

    setSuggestions(updated);
  };

  const handleApprove = async () => {
    setApplying(true);
    try {
      // Mark all as approved
      const approveSuggestions = suggestions.map(s => ({
        ...s,
        approval_status: 'approved'
      }));

      const response = await axios.post(`/api/jobs/${jobId}/apply`, {
        suggestions: approveSuggestions
      });

      // Download the PDF
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

  // Parse signers from job config
  const configuredSigners = job && job.signers ? JSON.parse(job.signers) : ['Resident', 'Staff'];

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
          <div className="flex gap-2 mb-6">
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

          {/* Suggestions Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Suggested Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Signer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Properties</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Required</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Read-Only</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {pageSuggestions.map((suggestion, index) => (
                  <tr key={suggestion.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: getFieldTypeColor(suggestion.field_type) }}>
                      {suggestion.field_type}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="text"
                        value={suggestion.suggested_code || ''}
                        onChange={(e) => handleUpdateSuggestion(
                          suggestions.indexOf(suggestion),
                          'suggested_code',
                          e.target.value
                        )}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={suggestion.signer || (configuredSigners.length > 0 ? configuredSigners[0] : '')}
                        onChange={(e) => handleUpdateSuggestion(
                          suggestions.indexOf(suggestion),
                          'signer',
                          e.target.value
                        )}
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
                      <div className="flex flex-wrap gap-1">
                        {getImportantProperties(suggestion.field_properties).map((prop) => (
                          <span
                            key={prop}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                            title={prop}
                          >
                            {prop === 'auto_trigger' ? '⚡' : prop === 'password' ? '🔐' : prop === 'multiline' ? '📄' : prop === 'rich_text' ? '✏️' : prop === 'comb' ? '#️⃣' : prop === 'no_export' ? '🚫' : '•'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={suggestion.required || false}
                        onChange={(e) => handleUpdateSuggestion(
                          suggestions.indexOf(suggestion),
                          'required',
                          e.target.checked
                        )}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={suggestion.read_only || false}
                        onChange={(e) => handleUpdateSuggestion(
                          suggestions.indexOf(suggestion),
                          'read_only',
                          e.target.checked
                        )}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-1">
                        <div className="w-24 bg-gray-200 rounded h-2">
                          <div
                            className="bg-green-500 h-2 rounded"
                            style={{ width: `${(suggestion.confidence || 0) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">
                          {((suggestion.confidence || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default FormMarkup;
