import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import FormMarkup from './FormMarkup';
import ManualEditMarkup from './ManualEditMarkup';

/**
 * Router component that checks job workflow_type and renders appropriate component
 */
function FormMarkupRouter() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchJobDetails();
  }, [jobId]);

  const fetchJobDetails = async () => {
    try {
      const response = await axios.get(`/api/jobs/${jobId}`);
      setJob(response.data.job);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Job not found</div>
      </div>
    );
  }

  // Route based on workflow type
  if (job.workflow_type === 'manual_edit') {
    return <ManualEditMarkup />;
  }

  // Default to auto edit
  return <FormMarkup />;
}

export default FormMarkupRouter;
