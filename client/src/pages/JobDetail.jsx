import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Download, Trash2 } from 'lucide-react';
import { formatDateTimeCentral } from '../utils/dateFormatter';

function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [versions, setVersions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchJobDetail();
  }, [jobId]);

  const fetchJobDetail = async () => {
    try {
      const response = await axios.get(`/api/jobs/${jobId}`);
      setJob(response.data.job);
      setVersions(response.data.versions || []);
      setSummary(response.data.summary || {});
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (versionType) => {
    try {
      const endpoint = versionType === 'original'
        ? `/api/downloads/jobs/${jobId}/input`
        : `/api/downloads/jobs/${jobId}/output`;

      const response = await axios.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${job.document_title}-${versionType}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download PDF');
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await axios.delete(`/api/jobs/${jobId}`);
      navigate('/history');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete job');
      setDeleting(false);
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

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/history" className="flex items-center gap-2 text-blue-600 hover:underline mb-6">
        <ArrowLeft size={16} />
        Back to History
      </Link>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 mb-6">
          {error}
        </div>
      )}

      {/* Job Header */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{job.document_title}</h1>
            <p className="text-gray-600 text-lg">{job.company_name}</p>
            <p className="text-gray-500 text-sm mt-2">
              Created: {formatDateTimeCentral(job.created_at)}
            </p>
            {job.completed_at && (
              <p className="text-gray-500 text-sm">
                Completed: {formatDateTimeCentral(job.completed_at)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className={`px-4 py-2 rounded text-white font-medium text-lg ${
              job.status === 'analyzing' ? 'bg-blue-600' :
              job.status === 'reviewed' ? 'bg-yellow-600' :
              job.status === 'applied' ? 'bg-green-600' :
              'bg-red-600'
            }`}>
              {job.status.toUpperCase()}
            </span>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded"
              title="Delete job"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Statistics */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{summary.total || 0}</p>
            <p className="text-gray-600 text-sm">Total Fields</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{summary.approved || 0}</p>
            <p className="text-gray-600 text-sm">Approved</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-yellow-600">{summary.reviewed || 0}</p>
            <p className="text-gray-600 text-sm">Under Review</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-orange-600">{summary.autoApproved || 0}</p>
            <p className="text-gray-600 text-sm">Auto-Approved</p>
          </div>
        </div>
      )}

      {/* File Versions */}
      {versions.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">File Versions</h2>
          <div className="space-y-3">
            {versions.map((version) => (
              <div key={version.id} className="flex justify-between items-center border-b pb-3">
                <div>
                  <p className="font-medium">
                    {version.version_type === 'original' ? '📄 Original' : '✅ Applied'}
                  </p>
                  <p className="text-sm text-gray-600">{version.file_path}</p>
                  <p className="text-xs text-gray-500">
                    {version.suggestion_count} suggestions ({version.approved_count} applied)
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(version.version_type)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configuration Summary */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Job Configuration</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">OCR Search Radius</p>
            <p className="text-lg font-medium">{job.ocr_radius}px</p>
          </div>
          {job.form_template && (
            <div>
              <p className="text-sm text-gray-600">Form Template</p>
              <p className="text-lg font-medium">{job.form_template}</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm">
            <h2 className="text-xl font-bold text-red-600 mb-4">Delete Job?</h2>
            <p className="text-gray-700 mb-2">
              Are you sure you want to delete this job?
            </p>
            <p className="text-sm text-gray-600 mb-6">
              <strong>{job.company_name}</strong> - {job.document_title}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              This action cannot be undone. All associated files and records will be deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 size={16} />
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobDetail;
