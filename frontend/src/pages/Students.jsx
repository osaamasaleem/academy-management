import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';
import {
  GraduationCap,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  Archive,
  RefreshCw,
  Edit2,
  CreditCard,
  AlertCircle,
  X,
  ArrowRight,
  ArrowLeft,
  CheckSquare,
  Square,
  Ban
} from 'lucide-react';

export default function Students() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const canManage = user?.role === 'admin' || user?.permissions?.can_manage_students;
  const canManageFees = user?.role === 'admin' || user?.permissions?.can_manage_fees;

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [streamFilter, setStreamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState(1); // 1 = Details, 2 = Fee History Review
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const initialForm = {
    roll_no: '',
    full_name: '',
    guardian_name: '',
    guardian_phone: '',
    grade: 9,
    stream: 'Science',
    monthly_fee: 3000,
    fee_due_day: 1,
    fee_note: '',
    payment_habit: 'advance',
    admission_date: new Date().toISOString().split('T')[0]
  };

  const [formData, setFormData] = useState(initialForm);

  // Generated historical fee rows for Step 2
  const [historyRows, setHistoryRows] = useState([]);
  const [selectedHistoryIndices, setSelectedHistoryIndices] = useState([]);
  const [bulkFeeVal, setBulkFeeVal] = useState('');
  const [bulkPaidDateVal, setBulkPaidDateVal] = useState(new Date().toISOString().split('T')[0]);
  const [bulkWaiveReason, setBulkWaiveReason] = useState('Pre-system history');

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (gradeFilter) params.grade = gradeFilter;
      if (streamFilter) params.stream = streamFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await apiClient.get('/students', { params });
      setStudents(res.data.data);
    } catch (err) {
      setError(err?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [search, gradeFilter, streamFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStudents();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchStudents]);

  const showToast = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleOpenAdd = () => {
    setError('');
    setIsEditing(false);
    setEditingId(null);
    setOnboardingStep(1);
    setFormData(initialForm);
    setHistoryRows([]);
    setSelectedHistoryIndices([]);
    setModalOpen(true);
  };

  const handleOpenEdit = (student) => {
    setError('');
    setIsEditing(true);
    setEditingId(student.id);
    setOnboardingStep(1);
    setFormData({
      roll_no: student.roll_no,
      full_name: student.full_name,
      guardian_name: student.guardian_name || '',
      guardian_phone: student.guardian_phone || '',
      grade: student.grade,
      stream: student.stream,
      monthly_fee: student.monthly_fee,
      fee_due_day: student.fee_due_day,
      fee_note: student.fee_note || '',
      payment_habit: student.payment_habit || 'advance',
      admission_date: student.admission_date ? student.admission_date.split('T')[0] : ''
    });
    setModalOpen(true);
  };

  // Step 1 -> Step 2: Generate months from admission date to current month
  const handleProceedToHistoryReview = (e) => {
    e.preventDefault();
    if (isEditing) {
      handleFinalSave();
      return;
    }

    const admDate = formData.admission_date || new Date().toISOString().split('T')[0];
    const [startYear, startMonth] = admDate.split('-').map(Number);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const rows = [];
    let curY = startYear;
    let curM = startMonth;

    while (curY < currentYear || (curY === currentYear && curM <= currentMonth)) {
      rows.push({
        billing_year: curY,
        billing_month: curM,
        fee_amount: formData.monthly_fee,
        status: 'unpaid',
        paid_date: null,
        remarks: ''
      });

      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }

    // Sort descending (latest on top)
    rows.reverse();

    setHistoryRows(rows);
    setSelectedHistoryIndices(rows.map((_, i) => i)); // Default select all
    setBulkFeeVal(formData.monthly_fee);
    setOnboardingStep(2);
  };

  // Bulk actions on step 2 rows
  const handleApplyBulkSetFee = () => {
    if (selectedHistoryIndices.length === 0) return;
    const val = parseFloat(bulkFeeVal) || 0;
    setHistoryRows(prev =>
      prev.map((r, i) => (selectedHistoryIndices.includes(i) ? { ...r, fee_amount: val } : r))
    );
  };

  const handleApplyBulkMarkPaid = () => {
    if (selectedHistoryIndices.length === 0) return;
    setHistoryRows(prev =>
      prev.map((r, i) =>
        selectedHistoryIndices.includes(i)
          ? { ...r, status: 'paid', paid_date: bulkPaidDateVal, remarks: 'Paid prior to system' }
          : r
      )
    );
  };

  const handleApplyBulkWave = () => {
    if (selectedHistoryIndices.length === 0) return;
    setHistoryRows(prev =>
      prev.map((r, i) =>
        selectedHistoryIndices.includes(i)
          ? { ...r, status: 'waived', paid_date: null, remarks: bulkWaiveReason || 'Pre-system history' }
          : r
      )
    );
  };

  const handleFinalSave = async () => {
    setError('');
    setSubmitting(true);

    try {
      if (isEditing) {
        await apiClient.patch(`/students/${editingId}`, formData);
        showToast('Student profile updated successfully');
      } else {
        const payload = {
          ...formData,
          initial_fee_history: historyRows
        };
        await apiClient.post('/students', payload);
        showToast('Student enrolled and fee history configured successfully');
      }
      setModalOpen(false);
      fetchStudents();
    } catch (err) {
      setError(err?.message || 'Failed to save student details');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (student) => {
    const isActivating = student.status === 'inactive';
    const confirmMsg = isActivating
      ? `Restore student ${student.full_name}?`
      : `Archive student ${student.full_name}? Their historical records will be preserved.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      if (isActivating) {
        await apiClient.patch(`/students/${student.id}`, { status: 'active' });
        showToast('Student restored successfully');
      } else {
        await apiClient.delete(`/students/${student.id}`);
        showToast('Student archived successfully');
      }
      fetchStudents();
    } catch (err) {
      setError(err?.message || 'Failed to update student status');
    }
  };

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <GraduationCap className="text-indigo-600" /> Student Directory
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Enroll students (Grades 1–12), configure rolling fee due days, and review historical fee cycles.
          </p>
        </div>
        {canManage && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition"
          >
            <UserPlus size={18} />
            <span>Enroll Student</span>
          </button>
        )}
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

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, roll no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All Grades (1–12)</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </select>

        <select
          value={streamFilter}
          onChange={(e) => setStreamFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All Streams</option>
          <option value="General">General</option>
          <option value="Science">Science</option>
          <option value="ICS">ICS</option>
          <option value="Arts">Arts</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="active">Active Students</option>
          <option value="Left">Left Academy</option>
          <option value="inactive">Archived Only</option>
          <option value="all">All Records</option>
        </select>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading students...</div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No students found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Roll No & Student</th>
                  <th className="py-3 px-4">Grade & Stream</th>
                  <th className="py-3 px-4">Guardian Contact</th>
                  <th className="py-3 px-4">Monthly Fee & Cycle</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{s.full_name}</div>
                      <div className="text-xs font-mono font-bold text-indigo-700">{s.roll_no}</div>
                      {s.fee_note && (
                        <div className="text-xs text-amber-700 italic mt-0.5">{s.fee_note}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">Grade {s.grade}</div>
                      <div className="text-xs text-slate-500">{s.stream}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <div className="text-slate-800 font-medium">{s.guardian_phone}</div>
                      {s.guardian_name && (
                        <div className="text-slate-500">{s.guardian_name}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">
                        PKR {parseFloat(s.monthly_fee).toLocaleString()}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                          Due: {s.fee_due_day === 1 ? '1st' : `${s.fee_due_day}th`}
                        </span>
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            s.payment_habit === 'month_end'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-teal-100 text-teal-800 border border-teal-200'
                          }`}
                        >
                          {s.payment_habit === 'month_end' ? 'Month End' : 'Advance'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {s.status === 'active' || s.status === 'Active' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={12} /> Active
                        </span>
                      ) : s.status === 'Left' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          Left
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                          <XCircle size={12} /> Archived
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {canManageFees && (
                          <button
                            onClick={() => navigate(`/fees/student/${s.id}`)}
                            title="View Lifetime Fee Ledger"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition"
                          >
                            <CreditCard size={13} />
                            <span>Ledger</span>
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button
                              onClick={() => handleOpenEdit(s)}
                              title="Edit Student Profile"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(s)}
                              title={s.status === 'inactive' ? 'Restore Student' : 'Archive Student'}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border transition ${
                                s.status === 'inactive'
                                  ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                                  : 'text-amber-700 border-amber-300 hover:bg-amber-50'
                              }`}
                            >
                              {s.status === 'inactive' ? <RefreshCw size={13} /> : <Archive size={13} />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Enroll / Edit Student with Step 2 Fee History Review */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-indigo-600 px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  {isEditing ? 'Edit Student Profile' : 'Enroll New Student'}
                </h2>
                {!isEditing && (
                  <p className="text-xs text-indigo-200 mt-0.5">
                    Step {onboardingStep} of 2: {onboardingStep === 1 ? 'Personal & Academic Details' : 'Review & Adjust Initial Fee History'}
                  </p>
                )}
              </div>
              <button onClick={() => setModalOpen(false)} className="text-indigo-200 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {onboardingStep === 1 ? (
              <form onSubmit={handleProceedToHistoryReview} className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g. Bilal Tariq"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Roll No (optional, auto-generated)
                    </label>
                    <input
                      type="text"
                      value={formData.roll_no}
                      onChange={(e) => setFormData({ ...formData, roll_no: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono"
                      placeholder="Auto if left blank"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Guardian Phone *</label>
                    <input
                      type="text"
                      required
                      value={formData.guardian_phone}
                      onChange={(e) => setFormData({ ...formData, guardian_phone: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="03001234567"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Guardian Name</label>
                    <input
                      type="text"
                      value={formData.guardian_name}
                      onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="Father / Mother Name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Grade (1–12) *</label>
                    <select
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                        <option key={g} value={g}>Grade {g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Stream *</label>
                    <select
                      value={formData.stream}
                      onChange={(e) => setFormData({ ...formData, stream: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="General">General</option>
                      <option value="Science">Science</option>
                      <option value="ICS">ICS</option>
                      <option value="Arts">Arts</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Fee (PKR) *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.monthly_fee}
                      onChange={(e) => setFormData({ ...formData, monthly_fee: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fee Due Day (1–31) *</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={formData.fee_due_day}
                      onChange={(e) => setFormData({ ...formData, fee_due_day: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] text-slate-400">1 = 1st of month; 17 = 17th of month</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Habit *</label>
                    <select
                      value={formData.payment_habit}
                      onChange={(e) => setFormData({ ...formData, payment_habit: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="advance">Advance</option>
                      <option value="month_end">Month End</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Admission Date *</label>
                    <input
                      type="date"
                      required
                      value={formData.admission_date}
                      onChange={(e) => setFormData({ ...formData, admission_date: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fee Note / Remarks</label>
                  <input
                    type="text"
                    value={formData.fee_note}
                    onChange={(e) => setFormData({ ...formData, fee_note: e.target.value })}
                    placeholder="e.g. 500 discount sibling concession"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                  >
                    <span>{isEditing ? 'Save Changes' : 'Next: Review Fee History'}</span>
                    {!isEditing && <ArrowRight size={16} />}
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2: Fee History Bulk-Edit Screen */
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-xs text-indigo-900">
                  <strong>Initial Fee Cycles Generated:</strong> {historyRows.length} months from admission date ({formData.admission_date}) through current month. You can adjust fees, mark past months as paid, or waive pre-system months before saving.
                </div>

                {/* Bulk Actions Bar */}
                <div className="p-3 bg-slate-100 rounded-lg flex flex-wrap items-center justify-between gap-2 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedHistoryIndices.length === historyRows.length) {
                          setSelectedHistoryIndices([]);
                        } else {
                          setSelectedHistoryIndices(historyRows.map((_, i) => i));
                        }
                      }}
                      className="text-xs font-bold text-slate-700 flex items-center gap-1"
                    >
                      {selectedHistoryIndices.length === historyRows.length ? (
                        <CheckSquare size={16} className="text-indigo-600" />
                      ) : (
                        <Square size={16} />
                      )}
                      <span>Select All ({selectedHistoryIndices.length})</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Set Fee */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        value={bulkFeeVal}
                        onChange={(e) => setBulkFeeVal(e.target.value)}
                        className="w-16 px-1.5 py-1 text-xs border rounded bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleApplyBulkSetFee}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded"
                      >
                        Set Fee
                      </button>
                    </div>

                    {/* Mark Paid */}
                    <button
                      type="button"
                      onClick={handleApplyBulkMarkPaid}
                      className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded"
                    >
                      Mark Paid
                    </button>

                    {/* Waive */}
                    <button
                      type="button"
                      onClick={handleApplyBulkWave}
                      className="px-2.5 py-1 bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold rounded flex items-center gap-1"
                    >
                      <Ban size={12} />
                      <span>Waive (Pre-system)</span>
                    </button>
                  </div>
                </div>

                {/* History Rows Table */}
                <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="p-2 w-8"></th>
                        <th className="p-2">Cycle</th>
                        <th className="p-2">Fee (PKR)</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyRows.map((row, idx) => {
                        const isSelected = selectedHistoryIndices.includes(idx);
                        return (
                          <tr key={`${row.billing_year}-${row.billing_month}`} className={isSelected ? 'bg-indigo-50/50' : ''}>
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedHistoryIndices(prev =>
                                    prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                  );
                                }}
                                className="w-3.5 h-3.5 text-indigo-600 rounded"
                              />
                            </td>
                            <td className="p-2 font-semibold">
                              {monthNames[row.billing_month - 1]} {row.billing_year}
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                value={row.fee_amount}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setHistoryRows(prev =>
                                    prev.map((r, i) => (i === idx ? { ...r, fee_amount: val } : r))
                                  );
                                }}
                                className="w-20 px-1 py-0.5 border rounded bg-white font-medium"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={row.status}
                                onChange={(e) => {
                                  const st = e.target.value;
                                  setHistoryRows(prev =>
                                    prev.map((r, i) => (i === idx ? { ...r, status: st } : r))
                                  );
                                }}
                                className="px-1.5 py-0.5 border rounded bg-white text-xs"
                              >
                                <option value="unpaid">Unpaid</option>
                                <option value="paid">Paid</option>
                                <option value="waived">Waived</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Remarks / note"
                                value={row.remarks || ''}
                                onChange={(e) => {
                                  const rem = e.target.value;
                                  setHistoryRows(prev =>
                                    prev.map((r, i) => (i === idx ? { ...r, remarks: rem } : r))
                                  );
                                }}
                                className="w-full px-1 py-0.5 border rounded bg-white text-xs"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(1)}
                    className="inline-flex items-center gap-1 px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                  >
                    <ArrowLeft size={16} />
                    <span>Back to Details</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalSave}
                    disabled={submitting}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                  >
                    {submitting ? 'Enrolling...' : 'Confirm & Enroll Student'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
