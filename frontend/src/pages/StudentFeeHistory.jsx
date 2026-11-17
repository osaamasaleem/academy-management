import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  CreditCard,
  User,
  X,
  AlertCircle,
  ShieldAlert,
  UserMinus,
  UserCheck,
  CheckSquare,
  Square,
  DollarSign,
  Ban
} from 'lucide-react';

export default function StudentFeeHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Selection state for multi-select
  const [selectedPeriods, setSelectedPeriods] = useState([]); // array of keys "YYYY-M"

  // Bulk modal state
  const [bulkAction, setBulkAction] = useState(null); // 'set_fee' | 'mark_paid' | 'waive'
  const [bulkFeeAmount, setBulkFeeAmount] = useState('');
  const [bulkPaidDate, setBulkPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkRemarks, setBulkRemarks] = useState('');
  const [dryRunPreview, setDryRunPreview] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Leave / Return Modals
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [lastMonth, setLastMonth] = useState(new Date().getMonth() + 1);
  const [lastYear, setLastYear] = useState(new Date().getFullYear());

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnMonth, setReturnMonth] = useState(new Date().getMonth() + 1);
  const [returnYear, setReturnYear] = useState(new Date().getFullYear());

  // Single Pay modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [singlePaidDate, setSinglePaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [singleAmountPaid, setSingleAmountPaid] = useState('');
  const [singleRemarks, setSingleRemarks] = useState('');

  const fetchLedger = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/fees/student/${id}`);
      setData(res.data.data);
      setSelectedPeriods([]);
    } catch (err) {
      setError(err?.message || 'Failed to load student fee ledger');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const showToast = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  if (loading) {
    return <div className="p-12 text-center text-slate-400">Loading student fee ledger...</div>;
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-red-600">
        <p>Student ledger could not be loaded.</p>
        <button onClick={() => navigate('/fees')} className="mt-4 text-xs underline">
          Back to Fee Ledger
        </button>
      </div>
    );
  }

  const { student, ledger } = data;
  const isStudentLeft = student.status === 'Left';

  // Calculations: Waived and not_enrolled are excluded from outstanding balance
  const activeEnrolledRows = ledger.filter((r) => r.is_enrolled && r.status !== 'waived');
  const totalBilled = activeEnrolledRows.reduce((acc, curr) => acc + curr.fee_amount, 0);
  const totalPaid = activeEnrolledRows.reduce((acc, curr) => acc + curr.amount_paid, 0);
  const totalOutstanding = totalBilled - totalPaid;

  // Selectable rows: only enrolled rows
  const selectableRows = ledger.filter((r) => r.is_enrolled);

  const toggleSelectRow = (cycle) => {
    const key = `${cycle.billing_year}-${cycle.billing_month}`;
    setSelectedPeriods((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAll = () => {
    if (selectedPeriods.length === selectableRows.length) {
      setSelectedPeriods([]);
    } else {
      setSelectedPeriods(selectableRows.map((r) => `${r.billing_year}-${r.billing_month}`));
    }
  };

  // Trigger Bulk Action Dry-Run
  const handleInitiateBulk = async (action) => {
    if (selectedPeriods.length === 0) return;
    setError('');
    setBulkAction(action);
    setDryRunPreview(null);

    const periods = selectedPeriods.map((k) => {
      const [year, month] = k.split('-').map(Number);
      return { billing_year: year, billing_month: month };
    });

    if (action === 'set_fee' && !bulkFeeAmount) {
      setBulkFeeAmount(student.monthly_fee);
    }
    if (action === 'waive' && !bulkRemarks) {
      setBulkRemarks('Pre-system history');
    }

    try {
      setBulkLoading(true);
      const res = await apiClient.post('/fees/bulk', {
        student_id: student.id,
        periods,
        action,
        fee_amount: action === 'set_fee' ? parseFloat(bulkFeeAmount || student.monthly_fee) : undefined,
        paid_date: action === 'mark_paid' ? bulkPaidDate : undefined,
        remarks: action === 'waive' ? (bulkRemarks || 'Pre-system history') : undefined,
        dry_run: true
      });
      setDryRunPreview(res.data.data);
    } catch (err) {
      setError(err?.message || 'Failed to calculate dry-run preview');
    } finally {
      setBulkLoading(false);
    }
  };

  // Confirm and Execute Bulk Action
  const handleConfirmBulk = async () => {
    if (!bulkAction || selectedPeriods.length === 0) return;
    setBulkLoading(true);
    setError('');

    const periods = selectedPeriods.map((k) => {
      const [year, month] = k.split('-').map(Number);
      return { billing_year: year, billing_month: month };
    });

    try {
      await apiClient.post('/fees/bulk', {
        student_id: student.id,
        periods,
        action: bulkAction,
        fee_amount: bulkAction === 'set_fee' ? parseFloat(bulkFeeAmount) : undefined,
        paid_date: bulkAction === 'mark_paid' ? bulkPaidDate : undefined,
        remarks: bulkAction === 'waive' ? bulkRemarks : undefined,
        dry_run: false
      });
      showToast(`Updated ${periods.length} billing periods successfully`);
      setBulkAction(null);
      setDryRunPreview(null);
      fetchLedger();
    } catch (err) {
      setError(err?.message || 'Bulk operation failed');
    } finally {
      setBulkLoading(false);
    }
  };

  // Mark as Left
  const handleMarkAsLeft = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post(`/students/${student.id}/leave`, {
        last_month: lastMonth,
        last_year: lastYear
      });
      setLeaveModalOpen(false);
      showToast(`Student marked as Left. Unpaid future periods removed.`);
      fetchLedger();
    } catch (err) {
      setError(err?.message || 'Failed to mark student as left');
    }
  };

  // Return Student
  const handleReturnStudent = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post(`/students/${student.id}/return`, {
        return_month: returnMonth,
        return_year: returnYear
      });
      setReturnModalOpen(false);
      showToast(`Student returned and reactivated successfully.`);
      fetchLedger();
    } catch (err) {
      setError(err?.message || 'Failed to return student');
    }
  };

  // Single Pay
  const handleOpenSinglePay = (cycle) => {
    setSelectedCycle(cycle);
    setSinglePaidDate(new Date().toISOString().split('T')[0]);
    setSingleAmountPaid(cycle.fee_amount);
    setSingleRemarks('');
    setPayModalOpen(true);
  };

  const handleSinglePaySubmit = async (e) => {
    e.preventDefault();
    if (!selectedCycle) return;
    try {
      await apiClient.post('/fees/record', {
        student_id: student.id,
        billing_month: selectedCycle.billing_month,
        billing_year: selectedCycle.billing_year,
        status: 'paid',
        paid_date: singlePaidDate,
        amount_paid: parseFloat(singleAmountPaid),
        remarks: singleRemarks || undefined
      });
      setPayModalOpen(false);
      showToast('Payment recorded successfully');
      fetchLedger();
    } catch (err) {
      setError(err?.message || 'Failed to record payment');
    }
  };

  const handleRevert = async (cycle) => {
    if (!isAdmin) return;
    if (!window.confirm(`Revert payment for ${cycle.billing_month}/${cycle.billing_year}?`)) return;

    try {
      await apiClient.post('/fees/record', {
        student_id: student.id,
        billing_month: cycle.billing_month,
        billing_year: cycle.billing_year,
        status: 'unpaid',
        remarks: 'Reverted by Admin'
      });
      showToast('Payment reverted');
      fetchLedger();
    } catch (err) {
      setError(err?.message || 'Failed to revert payment');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Student Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/fees')}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <User size={22} className="text-indigo-600" /> {student.full_name}
              </h1>
              {isStudentLeft ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <UserMinus size={12} /> Left Academy
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <UserCheck size={12} /> Active Student
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
              <span>Roll No: <span className="font-mono font-bold text-indigo-700">{student.roll_no}</span></span>
              <span>·</span>
              <span>Grade {student.grade} ({student.stream})</span>
              <span>·</span>
              <span>Base Fee: PKR {student.monthly_fee.toLocaleString()}</span>
              <span>·</span>
              <span>Due: {student.fee_due_day === 1 ? '1st' : `${student.fee_due_day}th`}</span>
              <span
                className={`ml-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                  student.payment_habit === 'month_end'
                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                    : 'bg-teal-100 text-teal-800 border border-teal-200'
                }`}
              >
                {student.payment_habit === 'month_end' ? 'Month End' : 'Advance'}
              </span>
            </p>
          </div>
        </div>

        {/* Enrollment Actions */}
        <div className="flex items-center gap-2">
          {isStudentLeft ? (
            <button
              onClick={() => setReturnModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              <UserCheck size={14} />
              <span>Return / Re-enroll</span>
            </button>
          ) : (
            <button
              onClick={() => setLeaveModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-amber-300 text-amber-800 hover:bg-amber-50 rounded-lg text-xs font-semibold shadow-sm transition"
            >
              <UserMinus size={14} />
              <span>Mark as Left</span>
            </button>
          )}
        </div>
      </div>

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

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase">Enrolled Months Billed</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            PKR {totalBilled.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">{activeEnrolledRows.length} Active Billing Cycles</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-emerald-700 uppercase">Total Collected</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            PKR {totalPaid.toLocaleString()}
          </div>
          <div className="text-xs text-emerald-600 mt-1">
            {ledger.filter((r) => r.status === 'paid').length} Paid Cycles
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-red-700 uppercase">Outstanding Balance</div>
          <div className="text-2xl font-bold text-red-700 mt-1">
            PKR {totalOutstanding.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {ledger.filter((r) => r.status === 'waived').length} Waived (Excluded)
          </div>
        </div>
      </div>

      {/* Floating / Sticky Bulk Actions Bar */}
      {selectedPeriods.length > 0 && (
        <div className="sticky top-4 z-40 bg-indigo-900 text-white p-4 rounded-xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 border border-indigo-700">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckSquare size={18} className="text-indigo-300" />
            <span>{selectedPeriods.length} months selected</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Set Fee */}
            <div className="flex items-center gap-1 bg-indigo-950/80 px-2.5 py-1.5 rounded-lg border border-indigo-800">
              <span className="text-xs text-indigo-300">PKR</span>
              <input
                type="number"
                min="0"
                placeholder={student.monthly_fee}
                value={bulkFeeAmount}
                onChange={(e) => setBulkFeeAmount(e.target.value)}
                className="w-20 px-2 py-0.5 text-xs bg-white text-slate-900 rounded font-semibold focus:outline-none"
              />
              <button
                onClick={() => handleInitiateBulk('set_fee')}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-semibold transition"
              >
                Set Fee
              </button>
            </div>

            {/* Mark Paid */}
            <div className="flex items-center gap-1 bg-emerald-950/80 px-2.5 py-1.5 rounded-lg border border-emerald-800">
              <input
                type="date"
                value={bulkPaidDate}
                onChange={(e) => setBulkPaidDate(e.target.value)}
                className="px-2 py-0.5 text-xs bg-white text-slate-900 rounded focus:outline-none"
              />
              <button
                onClick={() => handleInitiateBulk('mark_paid')}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-semibold transition"
              >
                Mark Paid
              </button>
            </div>

            {/* Waive */}
            <div className="flex items-center gap-1 bg-purple-950/80 px-2.5 py-1.5 rounded-lg border border-purple-800">
              <input
                type="text"
                placeholder="Reason (optional)"
                value={bulkRemarks}
                onChange={(e) => setBulkRemarks(e.target.value)}
                className="w-32 px-2 py-0.5 text-xs bg-white text-slate-900 rounded focus:outline-none"
              />
              <button
                onClick={() => handleInitiateBulk('waive')}
                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs font-semibold transition"
              >
                Waive
              </button>
            </div>

            <button
              onClick={() => setSelectedPeriods([])}
              className="text-xs text-indigo-300 hover:text-white underline ml-2"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
            >
              {selectedPeriods.length === selectableRows.length && selectableRows.length > 0 ? (
                <CheckSquare size={16} className="text-indigo-600" />
              ) : (
                <Square size={16} />
              )}
              <span>Select All Enrolled ({selectedPeriods.length}/{selectableRows.length})</span>
            </button>
          </div>
          <span className="text-xs text-slate-500">
            Select rows to apply bulk fee updates, payments, or waivers
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4 w-10"></th>
                <th className="py-3 px-4">Billing Cycle</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Cycle Fee</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Payment Details / Reason</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {ledger.map((cycle) => {
                const key = `${cycle.billing_year}-${cycle.billing_month}`;
                const isSelected = selectedPeriods.includes(key);

                if (!cycle.is_enrolled) {
                  return (
                    <tr key={key} className="bg-slate-50/60 opacity-60">
                      <td className="py-3.5 px-4 text-center">
                        <span className="text-slate-300">—</span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-500">
                        {monthNames[cycle.billing_month - 1]} {cycle.billing_year}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">—</td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">—</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-600">
                          Not enrolled
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400 italic">
                        Gap period / Not attended
                      </td>
                      <td className="py-3.5 px-4 text-right text-xs text-slate-400">—</td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={key}
                    className={`transition ${isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50/70'}`}
                  >
                    <td className="py-3.5 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(cycle)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {monthNames[cycle.billing_month - 1]} {cycle.billing_year}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {cycle.due_date}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      PKR {cycle.fee_amount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      {cycle.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={12} /> Paid
                        </span>
                      ) : cycle.status === 'waived' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                          <Ban size={12} /> Waived
                        </span>
                      ) : cycle.is_overdue ? (
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
                      {cycle.status === 'paid' ? (
                        <div>
                          <span className="font-medium text-slate-800">
                            PKR {cycle.amount_paid.toLocaleString()} on {cycle.paid_date}
                          </span>
                          {cycle.remarks && (
                            <span className="text-slate-400 italic block text-[11px] truncate max-w-xs">{cycle.remarks}</span>
                          )}
                        </div>
                      ) : cycle.status === 'waived' ? (
                        <span className="text-purple-700 italic font-medium">
                          {cycle.remarks || 'Waived'}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {cycle.status !== 'paid' ? (
                        <button
                          onClick={() => handleOpenSinglePay(cycle)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                        >
                          <CreditCard size={13} />
                          <span>Pay</span>
                        </button>
                      ) : (
                        isAdmin && (
                          <button
                            onClick={() => handleRevert(cycle)}
                            title="Revert Payment (Admin Only)"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition"
                          >
                            <RotateCcw size={13} />
                            <span>Revert</span>
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dry Run / Bulk Confirmation Modal */}
      {bulkAction && dryRunPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="bg-indigo-900 px-6 py-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CheckSquare size={18} /> Confirm Bulk Action (Dry Run)
              </h2>
              <button onClick={() => setBulkAction(null)} className="text-indigo-200 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-sm text-indigo-950 space-y-2">
                <div className="font-semibold text-base capitalize">
                  Action: {bulkAction.replace('_', ' ')}
                </div>
                <div className="text-xs">
                  This operation will modify <strong>{dryRunPreview.affected_count}</strong> selected billing cycles.
                </div>
                {bulkAction === 'set_fee' && (
                  <div className="text-xs">
                    Target Fee Amount: <strong>PKR {bulkFeeAmount}</strong> per month
                  </div>
                )}
                {bulkAction === 'mark_paid' && (
                  <div className="text-xs">
                    Payment Date: <strong>{bulkPaidDate}</strong>
                  </div>
                )}
                {bulkAction === 'waive' && (
                  <div className="text-xs">
                    Reason: <strong>{bulkRemarks || 'Pre-system history'}</strong>
                  </div>
                )}
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                {dryRunPreview.preview.map((p) => (
                  <div key={`${p.year}-${p.month}`} className="p-2 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">
                      {monthNames[p.month - 1]} {p.year}
                    </span>
                    <span className="text-slate-500">
                      {p.before.status} (PKR {p.before.fee_amount}) &rarr; <span className="font-bold text-indigo-700">{p.after.status} (PKR {p.after.fee_amount})</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBulkAction(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulk}
                  disabled={bulkLoading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {bulkLoading ? 'Applying Changes...' : 'Apply Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Mark as Left */}
      {leaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="bg-amber-600 px-6 py-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <UserMinus size={18} /> Mark Student as Left
              </h2>
              <button onClick={() => setLeaveModalOpen(false)} className="text-amber-200 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleMarkAsLeft} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Pick the last month the student attended. Unpaid fee rows after this month will be removed. All paid and historical rows will be kept.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last Month</label>
                  <select
                    value={lastMonth}
                    onChange={(e) => setLastMonth(parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {monthNames.map((m, idx) => (
                      <option key={idx + 1} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last Year</label>
                  <input
                    type="number"
                    min="2020"
                    value={lastYear}
                    onChange={(e) => setLastYear(parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Confirm Student Left
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Return Student */}
      {returnModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="bg-emerald-600 px-6 py-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <UserCheck size={18} /> Student Return / Re-enroll
              </h2>
              <button onClick={() => setReturnModalOpen(false)} className="text-emerald-200 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleReturnStudent} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Pick the return month. Ledger cycles will resume from this month onward under the same student record and roll number.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Return Month</label>
                  <select
                    value={returnMonth}
                    onChange={(e) => setReturnMonth(parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {monthNames.map((m, idx) => (
                      <option key={idx + 1} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Return Year</label>
                  <input
                    type="number"
                    min="2020"
                    value={returnYear}
                    onChange={(e) => setReturnYear(parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReturnModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Confirm Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Single Pay */}
      {payModalOpen && selectedCycle && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="bg-emerald-700 px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Record Payment</h2>
                <p className="text-xs text-emerald-200 mt-0.5">
                  Cycle: {monthNames[selectedCycle.billing_month - 1]} {selectedCycle.billing_year}
                </p>
              </div>
              <button onClick={() => setPayModalOpen(false)} className="text-emerald-200 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSinglePaySubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={singlePaidDate}
                  onChange={(e) => setSinglePaidDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Paid (PKR) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={singleAmountPaid}
                  onChange={(e) => setSingleAmountPaid(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={singleRemarks}
                  onChange={(e) => setSingleRemarks(e.target.value)}
                  placeholder="e.g. Paid in cash"
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
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
