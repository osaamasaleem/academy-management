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
  AlertCircle
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

  // Pay modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [amountPaid, setAmountPaid] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchLedger = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/fees/student/${id}`);
      setData(res.data.data);
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

  const handleOpenPay = (cycle) => {
    setSelectedCycle(cycle);
    setPaidDate(new Date().toISOString().split('T')[0]);
    setAmountPaid(cycle.fee_amount);
    setRemarks('');
    setPayModalOpen(true);
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!selectedCycle || !data) return;
    setSubmitting(true);
    setError('');

    try {
      await apiClient.post('/fees/record', {
        student_id: data.student.id,
        billing_month: selectedCycle.billing_month,
        billing_year: selectedCycle.billing_year,
        status: 'paid',
        paid_date: paidDate,
        amount_paid: parseFloat(amountPaid),
        remarks: remarks || undefined
      });
      setPayModalOpen(false);
      showToast('Payment recorded successfully');
      fetchLedger();
    } catch (err) {
      setError(err?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevert = async (cycle) => {
    if (!isAdmin) return;
    const confirm = window.confirm(
      `Revert payment for cycle ${cycle.billing_month}/${cycle.billing_year}?`
    );
    if (!confirm) return;

    try {
      await apiClient.post('/fees/record', {
        student_id: data.student.id,
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

  const totalBilled = ledger.reduce((acc, curr) => acc + curr.fee_amount, 0);
  const totalPaid = ledger.reduce((acc, curr) => acc + curr.amount_paid, 0);
  const totalOutstanding = totalBilled - totalPaid;

  return (
    <div className="space-y-6">
      {/* Back button & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/fees')}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <User size={22} className="text-indigo-600" /> {student.full_name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Roll No: <span className="font-mono font-bold text-indigo-700">{student.roll_no}</span> · Grade {student.grade} ({student.stream}) · Admission: {student.admission_date}
            </p>
          </div>
        </div>

        <div className="inline-block px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
          Fee Cycle: {student.fee_due_day === 1 ? '1st of month' : `${student.fee_due_day}th of month`}
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

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase">Lifetime Billed</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            PKR {totalBilled.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">{ledger.length} Billing Periods</div>
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
          <div className="text-xs text-red-600 mt-1">
            {ledger.filter((r) => r.is_overdue).length} Overdue Cycles
          </div>
        </div>
      </div>

      {/* Lifetime Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
            Lifetime Monthly Ledger Timeline
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Billing Cycle</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Cycle Fee</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Payment Details</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {ledger.map((cycle) => (
                <tr key={`${cycle.billing_year}-${cycle.billing_month}`} className="hover:bg-slate-50/70 transition">
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
                        <div className="font-medium text-slate-800">
                          PKR {cycle.amount_paid.toLocaleString()} on {cycle.paid_date}
                        </div>
                        {cycle.remarks && (
                          <div className="text-slate-400 italic text-[11px] truncate max-w-xs">{cycle.remarks}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {cycle.status !== 'paid' ? (
                      <button
                        onClick={() => handleOpenPay(cycle)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                      >
                        <CreditCard size={13} />
                        <span>Mark Paid</span>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay Modal */}
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

            <form onSubmit={handlePaySubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
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
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Bank slip #1029"
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
