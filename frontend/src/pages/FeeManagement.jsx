import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import {
  CreditCard,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  History,
  TrendingUp,
  X,
  AlertCircle
} from 'lucide-react';

export default function FeeManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [gradeFilter, setGradeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState('active');
  const [search, setSearch] = useState('');

  const [feeSheet, setFeeSheet] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Pay Modal State
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [paidDate, setPaidDate] = useState(today.toISOString().split('T')[0]);
  const [amountPaid, setAmountPaid] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const showToast = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const fetchFeeData = useCallback(async () => {
    try {
      setLoading(true);
      const params = { month, year };
      if (gradeFilter) params.grade = gradeFilter;
      if (statusFilter) params.status = statusFilter;
      if (studentStatusFilter) params.student_status = studentStatusFilter;
      if (search) params.search = search;

      const [sheetRes, summaryRes] = await Promise.all([
        apiClient.get('/fees', { params }),
        apiClient.get('/fees/summary', { params: { month, year, grade: gradeFilter || undefined, student_status: studentStatusFilter } })
      ]);

      setFeeSheet(sheetRes.data.data);
      setSummary(summaryRes.data.data);
    } catch (err) {
      setError(err?.message || 'Failed to load fee ledger');
    } finally {
      setLoading(false);
    }
  }, [month, year, gradeFilter, statusFilter, studentStatusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFeeData();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchFeeData]);

  const handleOpenPayModal = (row) => {
    setError('');
    setSelectedRow(row);
    setPaidDate(new Date().toISOString().split('T')[0]);
    setAmountPaid(row.fee_amount);
    setRemarks('');
    setPayModalOpen(true);
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!selectedRow) return;
    setError('');
    setSubmitting(true);

    try {
      await apiClient.post('/fees/record', {
        student_id: selectedRow.student_id,
        billing_month: month,
        billing_year: year,
        status: 'paid',
        paid_date: paidDate,
        amount_paid: parseFloat(amountPaid),
        remarks: remarks || undefined
      });

      setPayModalOpen(false);
      showToast(`Payment recorded for ${selectedRow.full_name}`);
      fetchFeeData();
    } catch (err) {
      setError(err?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevert = async (row) => {
    if (!isAdmin) return;
    const confirmRevert = window.confirm(
      `Revert payment for ${row.full_name} for cycle ${month}/${year}? This record will become unpaid.`
    );
    if (!confirmRevert) return;

    try {
      await apiClient.post('/fees/record', {
        student_id: row.student_id,
        billing_month: month,
        billing_year: year,
        status: 'unpaid',
        remarks: 'Reverted by Admin'
      });
      showToast(`Payment reverted for ${row.full_name}`);
      fetchFeeData();
    } catch (err) {
      setError(err?.message || 'Failed to revert payment');
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <CreditCard className="text-indigo-600" /> Monthly Fee Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time monthly fee collection, due-date tracking, and snapshot ledger.
          </p>
        </div>

        {/* Month & Year Selectors */}
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            className="px-3 py-1.5 text-sm font-semibold border-none bg-transparent rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-800"
          >
            {monthNames.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-3 py-1.5 text-sm font-semibold border-none bg-transparent rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-800"
          >
            {[2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
              <span>Expected Fee</span>
              <TrendingUp size={16} className="text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">
              PKR {summary.expected.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {summary.counts.total_students} Enrolled Students
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold uppercase">
              <span>Collected</span>
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-2">
              PKR {summary.collected.toLocaleString()}
            </div>
            <div className="text-xs text-emerald-600 mt-1">
              {summary.counts.paid} Paid ({summary.expected > 0 ? Math.round((summary.collected / summary.expected) * 100) : 0}%)
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-amber-700 text-xs font-semibold uppercase">
              <span>Pending</span>
              <Clock size={16} className="text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-700 mt-2">
              PKR {summary.pending.toLocaleString()}
            </div>
            <div className="text-xs text-amber-600 mt-1">
              {summary.counts.unpaid} Unpaid (within due date)
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-red-700 text-xs font-semibold uppercase">
              <span>Overdue Defaulters</span>
              <AlertTriangle size={16} className="text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-700 mt-2">
              PKR {summary.overdue_amount.toLocaleString()}
            </div>
            <div className="text-xs text-red-600 mt-1">
              {summary.counts.overdue} Past Due Date
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search name or roll no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">All Grades</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">All Fee Statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="overdue">Overdue</option>
          </select>

          <select
            value={studentStatusFilter}
            onChange={(e) => setStudentStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="active">Active Students</option>
            <option value="inactive">Archived Students</option>
            <option value="all">All Students</option>
          </select>
        </div>
      </div>

      {/* Fee Sheet Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading fee records...</div>
        ) : feeSheet.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No fee records found for {monthNames[month - 1]} {year}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Grade</th>
                  <th className="py-3 px-4">Due Cycle</th>
                  <th className="py-3 px-4">Fee Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Payment Info</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {feeSheet.map((row) => (
                  <tr key={row.student_id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span>{row.full_name}</span>
                        {row.student_status === 'inactive' && (
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono font-bold text-indigo-700">{row.roll_no}</div>
                      {row.fee_note && (
                        <div className="text-xs text-amber-700 italic mt-0.5">{row.fee_note}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <div className="font-semibold text-slate-800">Grade {row.grade}</div>
                      <div className="text-slate-500">{row.stream}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
                        Due: {row.fee_due_day === 1 ? '1st' : `${row.fee_due_day}th`}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{row.due_date}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      <div>PKR {row.fee_amount.toLocaleString()}</div>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-semibold ${
                          row.payment_habit === 'month_end'
                            ? 'bg-purple-100 text-purple-700 border border-purple-200'
                            : 'bg-teal-100 text-teal-800 border border-teal-200'
                        }`}
                      >
                        {row.payment_habit === 'month_end' ? 'Month End' : 'Advance'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {row.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={12} /> Paid
                        </span>
                      ) : row.is_overdue ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                          <AlertTriangle size={12} /> Overdue
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          <Clock size={12} /> Unpaid
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {row.status === 'paid' ? (
                        <div>
                          <div className="font-medium text-slate-800">PKR {row.amount_paid.toLocaleString()}</div>
                          <div className="text-slate-500 text-[11px]">{row.paid_date}</div>
                          {row.remarks && <div className="text-slate-400 italic text-[11px] truncate max-w-xs">{row.remarks}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {row.status !== 'paid' ? (
                          <button
                            onClick={() => handleOpenPayModal(row)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            <CreditCard size={13} />
                            <span>Mark Paid</span>
                          </button>
                        ) : (
                          isAdmin && (
                            <button
                              onClick={() => handleRevert(row)}
                              title="Revert Payment (Admin Only)"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition"
                            >
                              <RotateCcw size={13} />
                              <span>Revert</span>
                            </button>
                          )
                        )}
                        <button
                          onClick={() => navigate(`/fees/student/${row.student_id}`)}
                          title="Lifetime Ledger"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                        >
                          <History size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mark Paid Modal */}
      {payModalOpen && selectedRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="bg-emerald-700 px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Record Fee Payment</h2>
                <p className="text-xs text-emerald-200 mt-0.5">
                  Cycle: {monthNames[month - 1]} {year}
                </p>
              </div>
              <button onClick={() => setPayModalOpen(false)} className="text-emerald-200 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePaySubmit} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
                <div><strong>Student:</strong> {selectedRow.full_name} ({selectedRow.roll_no})</div>
                <div><strong>Grade:</strong> {selectedRow.grade} ({selectedRow.stream})</div>
                <div><strong>Expected Fee:</strong> PKR {selectedRow.fee_amount.toLocaleString()}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount Paid (PKR) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Receipt Note
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Paid in cash / Bank slip #1029"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
