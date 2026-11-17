import { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Calendar, 
  User, 
  Activity,
  AlertCircle
} from 'lucide-react';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 50, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    fetchLogs(meta.page);
  }, [meta.page, entityType, fromDate, toDate]);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: meta.pageSize.toString()
      });

      if (entityType) params.append('entity_type', entityType);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to fetch audit logs');
      }

      setLogs(json.data || []);
      setMeta(json.meta || { page, pageSize: 50, total: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(meta.total / meta.pageSize) || 1;

  const formatActionBadge = (action) => {
    let color = 'bg-slate-100 text-slate-800 border-slate-200';
    if (action.includes('revert') || action.includes('delete') || action.includes('archive')) {
      color = 'bg-rose-50 text-rose-700 border-rose-200';
    } else if (action.includes('create') || action.includes('record')) {
      color = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (action.includes('update') || action.includes('permission') || action.includes('bulk')) {
      color = 'bg-blue-50 text-blue-700 border-blue-200';
    }

    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium border ${color}`}>
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <ShieldAlert className="text-indigo-600" size={26} />
            <span>Audit & Compliance Logs</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tamper-evident trail of administrative, financial, and attendance modifications
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <Filter size={16} className="text-slate-400" />
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setMeta(prev => ({ ...prev, page: 1 }));
              }}
              className="text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Entities</option>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="fee_record">Fee Record</option>
              <option value="attendance">Attendance</option>
              <option value="auth">Auth</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-slate-500 font-medium">From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setMeta(prev => ({ ...prev, page: 1 }));
              }}
              className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-slate-500 font-medium">To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setMeta(prev => ({ ...prev, page: 1 }));
              }}
              className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Table & Content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 flex flex-col items-center">
            <AlertCircle size={28} className="mb-2" />
            <p>{error}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Activity size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">No audit log entries matching filters</p>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Details / Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/75 transition">
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{log.actor_name || 'System / Anonymous'}</div>
                        {log.actor_username && (
                          <div className="text-[10px] text-slate-400 font-mono">@{log.actor_username}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {formatActionBadge(log.action)}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap font-medium">
                        {log.entity_type} {log.entity_id ? `(#${log.entity_id})` : ''}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <div className="bg-slate-50 p-2 rounded border border-slate-200/60 font-mono text-[11px] text-slate-700 overflow-x-auto max-h-24">
                          {log.details ? JSON.stringify(log.details, null, 2) : '—'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Showing Page {meta.page} of {totalPages} ({meta.total} total events)
              </span>
              <div className="flex items-center space-x-2">
                <button
                  disabled={meta.page <= 1}
                  onClick={() => setMeta(prev => ({ ...prev, page: prev.page - 1 }))}
                  className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={meta.page >= totalPages}
                  onClick={() => setMeta(prev => ({ ...prev, page: prev.page + 1 }))}
                  className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
