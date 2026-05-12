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
    // Poll for status updates
    const interval = setInterval(fetchJobDetails, 2000);
    return () => clearInterval(interval);
  }, [jobId]);

  const fetchJobDetails = async () => {
    try {
      const response = await axios.get(`/api/jobs/${jobId}`);
      setJob(response.data.job);
      setSuggestions(response.data.suggestions || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSuggestion = (index, field, value) => {
    const updated = [...suggestions];
    updated[index] = { ...updated[index], [field]: value };
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
          <span className={`px-3 py-1 rounded text-white font-medium ${
            job.status === 'analyzing' ? 'bg-blue-600' :
            job.status === 'reviewed' ? 'bg-yellow-600' :
            job.status === 'applied' ? 'bg-green-600' :
            'bg-red-600'
          }`}>
            {job.status.toUpperCase()}
          </span>
        </div>

        {job.status === 'analyzed' || job.status === 'reviewed' ? (
          <button
            onClick={handleApprove}
            disabled={applying || suggestions.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition"
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
                className={`px-3 py-1 rounded ${
                  selectedPage === page
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Field Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Suggested Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Signer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Anchor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Required</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Read-Only</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {pageSuggestions.map((suggestion, index) => (
                  <tr key={suggestion.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{suggestion.field_name}</td>
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
                        value={suggestion.signer || 'unassigned'}
                        onChange={(e) => handleUpdateSuggestion(
                          suggestions.indexOf(suggestion),
                          'signer',
                          e.target.value
                        )}
                        className="px-2 py-1 border border-gray-300 rounded text-xs"
                      >
                        <option value="unassigned">Unassigned</option>
                        <option value="resident">Resident</option>
                        <option value="physician">Physician</option>
                        <option value="staff">Staff</option>
                        <option value="responsible_party">Responsible Party</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="text"
                        value={suggestion.anchor_name || ''}
                        onChange={(e) => handleUpdateSuggestion(
                          suggestions.indexOf(suggestion),
                          'anchor_name',
                          e.target.value
                        )}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                      />
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
