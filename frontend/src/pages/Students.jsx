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
  X
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
    admission_date: new Date().toISOString().split('T')[0]
  };

  const [formData, setFormData] = useState(initialForm);

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
    setFormData(initialForm);
    setModalOpen(true);
  };

  const handleOpenEdit = (student) => {
    setError('');
    setIsEditing(true);
    setEditingId(student.id);
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
      admission_date: student.admission_date ? student.admission_date.split('T')[0] : ''
    });
    setModalOpen(true);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (isEditing) {
        await apiClient.patch(`/students/${editingId}`, formData);
        showToast('Student profile updated successfully');
      } else {
        await apiClient.post('/students', formData);
        showToast('Student enrolled successfully');
      }
      setModalOpen(false);
      fetchStudents();
    } catch (err) {
      setError(err?.message || 'Failed to save student details');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <GraduationCap className="text-indigo-600" /> Student Directory
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Enroll students (Grades 1–12), configure rolling fee due days, and track records.
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
                      <div className="inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                        Due: {s.fee_due_day === 1 ? '1st of month' : `${s.fee_due_day}th of month`}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {s.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={12} /> Active
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
                              title={s.status === 'active' ? 'Archive Student' : 'Restore Student'}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border transition ${
                                s.status === 'active'
                                  ? 'text-amber-700 border-amber-300 hover:bg-amber-50'
                                  : 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                              }`}
                            >
                              {s.status === 'active' ? <Archive size={13} /> : <RefreshCw size={13} />}
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

      {/* Modal: Enroll / Edit Student */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-indigo-600 px-6 py-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {isEditing ? 'Edit Student Profile' : 'Enroll New Student'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-indigo-200 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fee Due Day (1–31) *
                  </label>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Admission Date</label>
                  <input
                    type="date"
                    value={formData.admission_date}
                    onChange={(e) => setFormData({ ...formData, admission_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
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
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Enroll Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
