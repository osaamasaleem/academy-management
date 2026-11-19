import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, AlertCircle, Sparkles } from 'lucide-react';
import apiClient from '../api/axiosClient';

export default function MyAttendance() {
  const { user } = useAuth();
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [records, setRecords] = useState([]);
  const [counts, setCounts] = useState({ present: 0, absent: 0, late: 0, leave: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Self-marking states
  const [selfStatus, setSelfStatus] = useState('present');
  const [selfRemarks, setSelfRemarks] = useState('');
  const [markingSelf, setMarkingSelf] = useState(false);
  const [selfMessage, setSelfMessage] = useState({ type: '', text: '' });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    fetchMyAttendance();
  }, [selectedMonth, selectedYear]);

  const fetchMyAttendance = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/attendance/my', {
        params: { month: selectedMonth, year: selectedYear }
      });
      setRecords(res.data.data.records || []);
      setCounts(res.data.data.counts || { present: 0, absent: 0, late: 0, leave: 0 });
    } catch (err) {
      setError(err?.message || 'Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleMarkSelfAttendance = async (e) => {
    e.preventDefault();
    setMarkingSelf(true);
    setSelfMessage({ type: '', text: '' });

    try {
      const res = await apiClient.post('/attendance/mark-self', {
        status: selfStatus,
        remarks: selfRemarks.trim() || undefined
      });
      setSelfMessage({ type: 'success', text: res.data.message || 'Attendance marked successfully!' });
      fetchMyAttendance();
    } catch (err) {
      setSelfMessage({
        type: 'error',
        text: err.response?.data?.error?.message || err.message || 'Failed to mark attendance'
      });
    } finally {
      setMarkingSelf(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'present':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 size={12} className="mr-1" /> Present
          </span>
        );
      case 'absent':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <XCircle size={12} className="mr-1" /> Absent
          </span>
        );
      case 'late':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock size={12} className="mr-1" /> Late
          </span>
        );
      case 'leave':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            <Calendar size={12} className="mr-1" /> Leave
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Attendance Log</h1>
          <p className="text-sm text-slate-500 mt-1">
            Personal attendance record for {user?.full_name} ({user?.username})
          </p>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrevMonth}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
            aria-label="Previous Month"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-sm text-slate-800 bg-slate-50 min-w-[140px] text-center">
            {monthNames[selectedMonth - 1]} {selectedYear}
          </div>
          <button
            onClick={handleNextMonth}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
            aria-label="Next Month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Quick Self Attendance Action Card */}
      <div className="bg-gradient-to-r from-indigo-50/80 via-white to-slate-50 p-5 rounded-2xl border border-indigo-100/80 shadow-sm">
        <form onSubmit={handleMarkSelfAttendance} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-600" />
              Mark Today&apos;s Attendance
            </h2>
            <p className="text-xs text-slate-500">
              Record your daily check-in status directly into the central attendance register.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Status selection */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              {[
                { key: 'present', label: 'Present' },
                { key: 'late', label: 'Late' },
                { key: 'leave', label: 'Leave' }
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSelfStatus(s.key)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                    selfStatus === s.key
                      ? s.key === 'present'
                        ? 'bg-emerald-600 text-white'
                        : s.key === 'late'
                        ? 'bg-amber-500 text-white'
                        : 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Optional remarks */}
            <input
              type="text"
              placeholder="Remarks (optional)..."
              value={selfRemarks}
              onChange={(e) => setSelfRemarks(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            />

            <button
              type="submit"
              disabled={markingSelf}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 transition"
            >
              {markingSelf ? 'Marking...' : 'Mark Now'}
            </button>
          </div>
        </form>

        {selfMessage.text && (
          <div
            className={`mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              selfMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {selfMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{selfMessage.text}</span>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Present</p>
          <h3 className="text-2xl font-bold text-emerald-800 mt-1">{counts.present}</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-sm">
          <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Absent</p>
          <h3 className="text-2xl font-bold text-rose-800 mt-1">{counts.absent}</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Late</p>
          <h3 className="text-2xl font-bold text-amber-800 mt-1">{counts.late}</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Leave</p>
          <h3 className="text-2xl font-bold text-blue-800 mt-1">{counts.leave}</h3>
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 flex flex-col items-center">
            <AlertCircle size={28} className="mb-2" />
            <p>{error}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Calendar size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-base font-semibold text-slate-700">No attendance marked for this month</p>
            <p className="text-xs text-slate-400 mt-1">Records will appear as management logs daily attendance.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Day</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const dayName = new Date(r.attendance_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/75 transition">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">{r.attendance_date}</td>
                      <td className="py-3 px-4 text-slate-500">{dayName}</td>
                      <td className="py-3 px-4">{getStatusBadge(r.status)}</td>
                      <td className="py-3 px-4 text-slate-600 italic">{r.remarks || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
