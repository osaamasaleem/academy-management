import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  CalendarCheck, 
  AlertCircle, 
  CheckCircle2, 
  Save, 
  Sparkles,
  Info,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  BarChart2,
  XCircle,
  Clock,
  Eye
} from 'lucide-react';

export default function MarkAttendance() {
  const { user } = useAuth();
  
  // Format local Asia/Karachi today for default date input
  const getTodayStr = () => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  };

  const todayStr = getTodayStr();
  const currentDate = new Date();

  // Tab State: 'daily' (mark attendance) vs 'monthly' (summary / ledger)
  const [activeTab, setActiveTab] = useState('daily');

  // Daily State
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [teachers, setTeachers] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [remarksMap, setRemarksMap] = useState({});
  const [dailyLoading, setDailyLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Monthly Ledger State
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [selectedTeacherDetail, setSelectedTeacherDetail] = useState(null);

  const isAdmin = user?.role === 'admin';

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Load Daily Attendance
  useEffect(() => {
    if (activeTab === 'daily') {
      fetchAttendanceForDate(selectedDate);
    }
  }, [selectedDate, activeTab]);

  // Load Monthly Summary Ledger
  useEffect(() => {
    if (activeTab === 'monthly') {
      fetchMonthlyLedger();
    }
  }, [selectedMonth, selectedYear, activeTab]);

  const fetchAttendanceForDate = async (date) => {
    setDailyLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch(`/api/attendance?date=${date}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to load faculty attendance');
      }

      const records = json.data.records || [];
      setTeachers(records);

      const newAttMap = {};
      const newRemarksMap = {};
      records.forEach(r => {
        if (r.status) newAttMap[r.teacher_id] = r.status;
        if (r.remarks) newRemarksMap[r.teacher_id] = r.remarks;
      });

      setAttendanceMap(newAttMap);
      setRemarksMap(newRemarksMap);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDailyLoading(false);
    }
  };

  const fetchMonthlyLedger = async () => {
    setLedgerLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch(`/api/attendance/summary?month=${selectedMonth}&year=${selectedYear}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to load attendance summary ledger');
      }
      setLedger(json.data.ledger || []);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleStatusChange = (teacherId, status) => {
    setAttendanceMap(prev => ({ ...prev, [teacherId]: status }));
  };

  const handleRemarksChange = (teacherId, remarks) => {
    setRemarksMap(prev => ({ ...prev, [teacherId]: remarks }));
  };

  const handleMarkAllPresent = () => {
    const updated = { ...attendanceMap };
    teachers.forEach(t => {
      if (!isAdmin && t.teacher_id === user.id) return;
      if (!updated[t.teacher_id]) {
        updated[t.teacher_id] = 'present';
      }
    });
    setAttendanceMap(updated);
  };

  const handleSaveAttendance = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    const recordsToSave = [];
    teachers.forEach(t => {
      if (!isAdmin && t.teacher_id === user.id) return;

      const status = attendanceMap[t.teacher_id];
      if (status) {
        recordsToSave.push({
          teacher_id: t.teacher_id,
          status,
          remarks: remarksMap[t.teacher_id] || null
        });
      }
    });

    if (recordsToSave.length === 0) {
      setMessage({ type: 'error', text: 'Please set attendance status for at least one teacher before saving.' });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/attendance/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          records: recordsToSave
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to save attendance');
      }

      setMessage({ type: 'success', text: `Attendance for ${recordsToSave.length} teachers saved successfully!` });
      fetchAttendanceForDate(selectedDate);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
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

  const filteredLedger = ledger.filter(item => {
    const q = ledgerSearch.toLowerCase();
    return (
      item.teacher.full_name.toLowerCase().includes(q) ||
      item.teacher.username.toLowerCase().includes(q) ||
      (item.teacher.subject_specialty && item.teacher.subject_specialty.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Navigation */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Faculty Attendance</h1>
          <p className="text-sm text-slate-500 mt-1">
            Daily roll-call marking and monthly faculty attendance ledger
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('daily')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'daily'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarCheck size={16} />
            <span>Daily Roll Call</span>
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'monthly'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart2 size={16} />
            <span>Monthly Ledger & Summary</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {message.text && (
        <div
          className={`p-4 rounded-xl flex items-center space-x-2 border text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* TAB 1: DAILY ROLL CALL */}
      {activeTab === 'daily' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <label className="text-xs font-semibold text-slate-600 uppercase">Attendance Date:</label>
              <input
                type="date"
                value={selectedDate}
                max={todayStr}
                disabled={!isAdmin}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-lg border border-indigo-200 transition"
              >
                <Sparkles size={14} />
                <span>Mark Unset as Present</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAttendance}
                disabled={saving || dailyLoading}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-50"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Save size={16} />
                )}
                <span>Save Attendance</span>
              </button>
            </div>
          </div>

          {!isAdmin && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-start space-x-2.5 text-xs text-blue-800">
              <Info size={16} className="mt-0.5 text-blue-600 shrink-0" />
              <span>
                As a delegated faculty member, you can mark attendance for colleagues for <strong>today ({todayStr})</strong>. 
                Your personal record is reserved for Principal verification.
              </span>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {dailyLoading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : teachers.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <CalendarCheck size={36} className="mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No active teachers found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Faculty Member</th>
                      <th className="py-3.5 px-4">Specialty</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teachers.map((t) => {
                      const isSelf = t.teacher_id === user.id;
                      const currentStatus = attendanceMap[t.teacher_id] || '';

                      return (
                        <tr
                          key={t.teacher_id}
                          className={`hover:bg-slate-50/75 transition ${isSelf ? 'bg-indigo-50/30' : ''}`}
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-900 flex items-center gap-2">
                              {t.full_name}
                              {isSelf && (
                                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">@{t.username}</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {t.subject_specialty || 'General'}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex justify-center items-center space-x-1.5">
                              {[
                                { key: 'present', label: 'P', name: 'Present' },
                                { key: 'absent', label: 'A', name: 'Absent' },
                                { key: 'late', label: 'L', name: 'Late' },
                                { key: 'leave', label: 'Lv', name: 'Leave' }
                              ].map((s) => {
                                const isSelected = currentStatus === s.key;
                                return (
                                  <button
                                    key={s.key}
                                    type="button"
                                    title={s.name}
                                    onClick={() => handleStatusChange(t.teacher_id, s.key)}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg border transition ${
                                      isSelected
                                        ? s.key === 'present'
                                          ? 'bg-emerald-600 text-white border-emerald-600'
                                          : s.key === 'absent'
                                          ? 'bg-rose-600 text-white border-rose-600'
                                          : s.key === 'late'
                                          ? 'bg-amber-500 text-white border-amber-500'
                                          : 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {s.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <input
                              type="text"
                              placeholder="Optional remarks..."
                              value={remarksMap[t.teacher_id] || ''}
                              onChange={(e) => handleRemarksChange(t.teacher_id, e.target.value)}
                              className="w-full max-w-xs px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MONTHLY LEDGER & SUMMARY */}
      {activeTab === 'monthly' && (
        <div className="space-y-6">
          {/* Controls: Month Selector & Search */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrevMonth}
                className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                aria-label="Previous Month"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-sm text-slate-800 bg-slate-50 min-w-[150px] text-center">
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

            <div className="w-full sm:w-72">
              <input
                type="text"
                placeholder="Search faculty name or specialty..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {ledgerLoading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : filteredLedger.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <BarChart2 size={36} className="mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No records found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Faculty Member</th>
                      <th className="py-3.5 px-4">Specialty</th>
                      <th className="py-3.5 px-4 text-center">Present</th>
                      <th className="py-3.5 px-4 text-center">Absent</th>
                      <th className="py-3.5 px-4 text-center">Late</th>
                      <th className="py-3.5 px-4 text-center">Leave</th>
                      <th className="py-3.5 px-4">Absent Dates Detail</th>
                      <th className="py-3.5 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLedger.map((item) => (
                      <tr key={item.teacher.id} className="hover:bg-slate-50/75 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900">{item.teacher.full_name}</div>
                          <div className="text-xs text-slate-400 font-mono">@{item.teacher.username}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {item.teacher.subject_specialty || 'General'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            {item.counts.present}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            item.counts.absent > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.counts.absent}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            item.counts.late > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.counts.late}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            item.counts.leave > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.counts.leave}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          {item.absentDates.length === 0 ? (
                            <span className="text-xs text-emerald-600 font-medium">None (Perfect Attendance)</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {item.absentDates.map(date => (
                                <span key={date} className="px-1.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded font-mono">
                                  {date.split('-')[2]}th
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedTeacherDetail(item)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                          >
                            <Eye size={14} />
                            <span>Detail</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Teacher Detailed Modal */}
      {selectedTeacherDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedTeacherDetail.teacher.full_name}
                </h3>
                <p className="text-xs text-slate-500">
                  Attendance Details for {monthNames[selectedMonth - 1]} {selectedYear}
                </p>
              </div>
              <button
                onClick={() => setSelectedTeacherDetail(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Summary badges */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-emerald-50 p-2 rounded-lg">
                <span className="text-emerald-700 font-medium">Present</span>
                <p className="text-lg font-bold text-emerald-800">{selectedTeacherDetail.counts.present}</p>
              </div>
              <div className="bg-rose-50 p-2 rounded-lg">
                <span className="text-rose-700 font-medium">Absent</span>
                <p className="text-lg font-bold text-rose-800">{selectedTeacherDetail.counts.absent}</p>
              </div>
              <div className="bg-amber-50 p-2 rounded-lg">
                <span className="text-amber-700 font-medium">Late</span>
                <p className="text-lg font-bold text-amber-800">{selectedTeacherDetail.counts.late}</p>
              </div>
              <div className="bg-blue-50 p-2 rounded-lg">
                <span className="text-blue-700 font-medium">Leave</span>
                <p className="text-lg font-bold text-blue-800">{selectedTeacherDetail.counts.leave}</p>
              </div>
            </div>

            {/* Specific Date Logs */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase">Logged Days ({selectedTeacherDetail.records.length})</h4>
              {selectedTeacherDetail.records.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No days marked yet for this month.</p>
              ) : (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {selectedTeacherDetail.records.map((r, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-medium text-slate-800">{r.attendance_date}</span>
                        {r.remarks && <span className="text-slate-500 italic">({r.remarks})</span>}
                      </div>
                      <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                        r.status === 'present' ? 'bg-emerald-100 text-emerald-800' :
                        r.status === 'absent' ? 'bg-rose-100 text-rose-800' :
                        r.status === 'late' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {r.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTeacherDetail(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
