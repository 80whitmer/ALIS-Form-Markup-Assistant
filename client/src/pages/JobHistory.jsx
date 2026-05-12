import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Trash2, RotateCcw } from 'lucide-react';
import { formatDateCentral } from '../utils/dateFormatter';

function JobHistory() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, [searchTerm]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/jobs', {
        params: {
          search: searchTerm,
          limit: 50
        }
      });
      setJobs(response.data.jobs || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colorMap = {
      'analyzing': { bg: '#FFF3E0', text: '#FF9800' }, // Light orange/gold
      'reviewed': { bg: '#FFE0B2', text: '#FF8A00' }, // Light orange
      'applied': { bg: '#FFCCBC', text: '#FF5722' }, // Light red-orange
      'failed': { bg: '#FFEBEE', text: '#D32F2F' } // Light red
    };
    return colorMap[status] || { bg: '#F5F5F5', text: '#555' };
  };

  const handleDelete = async (jobId) => {
    try {
      setDeleting(true);
      await axios.delete(`/api/jobs/${jobId}`);
      setJobs(jobs.filter(job => job.id !== jobId));
      setDeleteConfirm(null);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete job');
    } finally {
      setDeleting(false);
    }
  };

  const handleResetDatabase = async () => {
    try {
      setResetting(true);
      await axios.post('/api/dev/reset-database');
      // Clear jobs and reset state
      setJobs([]);
      setResetConfirm(false);
      setSearchTerm('');
      setError(null);
      // Show success message
      setTimeout(() => {
        alert('✓ Database reset successfully! Ready for fresh testing.');
      }, 500);
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Reset is only available in development mode');
      } else {
        setError(err.response?.data?.error || 'Failed to reset database');
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Job History</h1>
          {/* Dev-only reset button */}
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={() => setResetConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-white rounded transition"
              title="Reset database (dev only)"
              style={{
                backgroundColor: '#FF9800'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#E68900'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#FF9800'}
            >
              <RotateCcw size={16} />
              Reset DB
            </button>
          )}
        </div>
        <input
          type="text"
          placeholder="Search by company or document title..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
          style={{
            '--tw-ring-color': '#FF9800'
          }}
          onFocus={(e) => e.target.style.borderColor = '#FF9800'}
          onBlur={(e) => e.target.style.borderColor = '#D0D0D0'}
        />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading jobs...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No jobs found</p>
          <Link to="/" className="text-blue-600 hover:underline mt-2 inline-block">
            Create a new job
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm">{job.company_name}</td>
                  <td className="px-6 py-4 text-sm">{job.document_title}</td>
                  <td className="px-6 py-4">
                    <span className="inline-block px-2 py-1 text-xs font-semibold rounded" style={{
                      backgroundColor: getStatusColor(job.status).bg,
                      color: getStatusColor(job.status).text
                    }}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDateCentral(job.created_at)}
                  </td>
                  <td className="px-6 py-4 text-sm flex gap-3">
                    <Link
                      to={`/jobs/${job.id}/detail`}
                      className="transition"
                      style={{
                        color: '#FF9800'
                      }}
                      onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                    >
                      View
                    </Link>
                    <button
                      onClick={() => setDeleteConfirm(job)}
                      className="flex items-center gap-1 transition"
                      title="Delete job"
                      style={{
                        color: '#FF5722'
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                      onMouseLeave={(e) => e.target.style.opacity = '1'}
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: '#FF5722' }}>Delete Job?</h2>
            <p className="text-gray-700 mb-2">
              Are you sure you want to delete this job?
            </p>
            <p className="text-sm text-gray-600 mb-6">
              <strong>{deleteConfirm.company_name}</strong> - {deleteConfirm.document_title}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              This action cannot be undone. All associated files and records will be deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                disabled={deleting}
                className="px-4 py-2 text-white rounded disabled:opacity-50 flex items-center gap-2 transition"
                style={{
                  backgroundColor: '#FF5722'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#E64A19'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#FF5722'}
              >
                <Trash2 size={16} />
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Database Confirmation Modal (Dev Only) */}
      {resetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: '#FF9800' }}>Reset Database?</h2>
            <p className="text-gray-700 mb-4">
              This will drop all tables and recreate the database schema.
            </p>
            <p className="text-sm text-gray-600 mb-6">
              <strong>All job history will be deleted.</strong> This action cannot be undone.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Use this to start fresh when testing new features.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setResetConfirm(false)}
                disabled={resetting}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDatabase}
                disabled={resetting}
                className="px-4 py-2 text-white rounded disabled:opacity-50 flex items-center gap-2 transition"
                style={{
                  backgroundColor: '#FF9800'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#E68900'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#FF9800'}
              >
                <RotateCcw size={16} />
                {resetting ? 'Resetting...' : 'Reset Database'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobHistory;
