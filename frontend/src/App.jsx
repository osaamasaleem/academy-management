import { useEffect, useState } from 'react';
import apiClient from './api/axiosClient';

function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient.get('/health')
      .then((res) => {
        setHealth(res.data.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to connect to backend API');
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-800 text-center">
          Academy Management System
        </h1>
        <p className="text-sm text-slate-500 text-center">
          Phase 0: Scaffolding & Proxy Check
        </p>

        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Backend API:</span>
            {loading && <span className="text-xs text-amber-600 font-semibold">Checking...</span>}
            {!loading && health && (
              <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                Online ({health.status})
              </span>
            )}
            {!loading && error && (
              <span className="text-xs bg-red-100 text-red-800 font-semibold px-2 py-0.5 rounded-full">
                Offline
              </span>
            )}
          </div>
          {health && (
            <div className="mt-3 text-xs text-slate-500 space-y-1">
              <div><strong>Timestamp:</strong> {health.timestamp}</div>
              <div><strong>Uptime:</strong> {Math.round(health.uptime)}s</div>
            </div>
          )}
          {error && (
            <div className="mt-3 text-xs text-red-600">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
