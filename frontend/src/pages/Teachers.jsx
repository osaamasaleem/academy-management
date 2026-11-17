import { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/axiosClient';
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  Archive,
  RefreshCw,
  AlertCircle,
  Edit2,
  KeyRound,
  X
} from 'lucide-react';

export default function Teachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // New teacher form state
  const [createForm, setCreateForm] = useState({
    full_name: '',
    username: '',
    password: '',
    phone: '',
    cnic: '',
    subject_specialty: '',
    joining_date: new Date().toISOString().split('T')[0],
    permissions: {
      can_view_students: false,
      can_manage_students: false,
      can_mark_all_attendance: false,
      can_manage_fees: false
    }
  });

  // Edit teacher form state
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    username: '',
    phone: '',
    cnic: '',
    subject_specialty: '',
    joining_date: '',
    new_password: ''
  });

  const fetchTeachers = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.is_active = statusFilter;

      const res = await apiClient.get('/teachers', { params });
      setTeachers(res.data.data);
    } catch (err) {
      setError(err?.message || 'Failed to load teachers');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTeachers();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchTeachers]);

  const showToast = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleTogglePermission = async (teacherId, flag, currentValue) => {
    setTeachers((prev) =>
      prev.map((t) => (t.id === teacherId ? { ...t, [flag]: !currentValue } : t))
    );

    try {
      await apiClient.patch(`/teachers/${teacherId}`, { [flag]: !currentValue });
      showToast('Permissions updated');
    } catch (err) {
      setTeachers((prev) =>
        prev.map((t) => (t.id === teacherId ? { ...t, [flag]: currentValue } : t))
      );
      setError(err?.message || 'Failed to update permission');
    }
  };

  const handleToggleStatus = async (teacher) => {
    const nextStatus = !teacher.is_active;
    const confirmText = nextStatus
      ? `Restore teacher ${teacher.full_name}?`
      : `Archive teacher ${teacher.full_name}? They will not be able to log in.`;

    if (!window.confirm(confirmText)) return;

    try {
      if (nextStatus) {
        await apiClient.patch(`/teachers/${teacher.id}`, { is_active: true });
        showToast('Teacher restored successfully');
      } else {
        await apiClient.delete(`/teachers/${teacher.id}`);
        showToast('Teacher archived successfully');
      }
      fetchTeachers();
    } catch (err) {
      setError(err?.message || 'Failed to update teacher status');
    }
  };

  const openEditModal = async (teacher) => {
    setError('');
    setEditingTeacherId(teacher.id);
    try {
      // Fetch single teacher profile with unmasked CNIC
      const res = await apiClient.get(`/teachers/${teacher.id}`);
      const data = res.data.data;
      setEditForm({
        full_name: data.full_name || '',
        username: data.username || '',
        phone: data.phone || '',
        cnic: data.cnic || '',
        subject_specialty: data.subject_specialty || '',
        joining_date: data.joining_date ? data.joining_date.split('T')[0] : '',
        new_password: ''
      });
      setEditModalOpen(true);
    } catch (err) {
      setError(err?.message || 'Failed to load teacher details');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        full_name: editForm.full_name.trim(),
        username: editForm.username.trim(),
        phone: editForm.phone.trim(),
        cnic: editForm.cnic ? editForm.cnic.trim() : null,
        subject_specialty: editForm.subject_specialty ? editForm.subject_specialty.trim() : null,
        joining_date: editForm.joining_date || undefined
      };

      if (editForm.new_password) {
        if (editForm.new_password.length < 8) {
          setError('New password must be at least 8 characters long');
          setSubmitting(false);
          return;
        }
        payload.password = editForm.new_password;
      }

      await apiClient.patch(`/teachers/${editingTeacherId}`, payload);
      setEditModalOpen(false);
      showToast('Teacher details updated successfully');
      fetchTeachers();
    } catch (err) {
      setError(err?.message || 'Failed to update teacher');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await apiClient.post('/teachers', createForm);
      setCreateModalOpen(false);
      showToast('Teacher onboarded successfully');
      setCreateForm({
        full_name: '',
        username: '',
        password: '',
        phone: '',
        cnic: '',
        subject_specialty: '',
        joining_date: new Date().toISOString().split('T')[0],
        permissions: {
          can_view_students: false,
          can_manage_students: false,
          can_mark_all_attendance: false,
          can_manage_fees: false
        }
      });
      fetchTeachers();
    } catch (err) {
      setError(err?.message || 'Failed to onboard teacher');
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
            <Users className="text-indigo-600" /> Teacher Directory & RBAC
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage teacher profiles, reset credentials, and delegate granular permissions.
          </p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition"
        >
          <UserPlus size={18} />
          <span>Add Teacher</span>
        </button>
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

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, username, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="text-xs font-semibold text-slate-600">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="true">Active Only</option>
            <option value="false">Archived Only</option>
          </select>
        </div>
      </div>

      {/* Teachers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading teachers...</div>
        ) : teachers.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No teachers found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Teacher</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">View Students</th>
                  <th className="py-3 px-4 text-center">Manage Students</th>
                  <th className="py-3 px-4 text-center">Manage Fees</th>
                  <th className="py-3 px-4 text-center">Mark All Att.</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{t.full_name}</div>
                      <div className="text-xs text-indigo-600 font-mono">@{t.username}</div>
                      {t.subject_specialty && (
                        <div className="text-xs text-slate-400 mt-0.5">{t.subject_specialty}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      <div>{t.phone}</div>
                      {t.cnic && <div className="text-slate-400 font-mono mt-0.5">{t.cnic}</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      {t.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={12} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                          <XCircle size={12} /> Archived
                        </span>
                      )}
                    </td>

                    {/* Permissions Toggles */}
                    <td className="py-3.5 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={t.can_view_students}
                        disabled={!t.is_active}
                        onChange={() => handleTogglePermission(t.id, 'can_view_students', t.can_view_students)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                      />
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={t.can_manage_students}
                        disabled={!t.is_active}
                        onChange={() => handleTogglePermission(t.id, 'can_manage_students', t.can_manage_students)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                      />
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={t.can_manage_fees}
                        disabled={!t.is_active}
                        onChange={() => handleTogglePermission(t.id, 'can_manage_fees', t.can_manage_fees)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                      />
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={t.can_mark_all_attendance}
                        disabled={!t.is_active}
                        onChange={() => handleTogglePermission(t.id, 'can_mark_all_attendance', t.can_mark_all_attendance)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                      />
                    </td>

                    {/* Actions: Edit & Archive/Restore */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEditModal(t)}
                          title="Edit Profile & Password"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleToggleStatus(t)}
                          title={t.is_active ? 'Archive Teacher' : 'Restore Teacher'}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition ${
                            t.is_active
                              ? 'text-amber-700 border-amber-300 hover:bg-amber-50'
                              : 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                          }`}
                        >
                          {t.is_active ? (
                            <>
                              <Archive size={13} /> <span>Archive</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw size={13} /> <span>Restore</span>
                            </>
                          )}
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

      {/* Onboard Teacher Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-indigo-600 px-6 py-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold">Onboard New Teacher</h2>
              <button onClick={() => setCreateModalOpen(false)} className="text-indigo-200 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Ahmad Khan"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="ahmad.k"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="Min 8 characters"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone *</label>
                  <input
                    type="text"
                    required
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="03001234567"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">CNIC (13 digits)</label>
                  <input
                    type="text"
                    value={createForm.cnic}
                    onChange={(e) => setCreateForm({ ...createForm, cnic: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="3520112345671"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Specialty</label>
                  <input
                    type="text"
                    value={createForm.subject_specialty}
                    onChange={(e) => setCreateForm({ ...createForm, subject_specialty: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Physics / Math"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Joining Date</label>
                  <input
                    type="date"
                    value={createForm.joining_date}
                    onChange={(e) => setCreateForm({ ...createForm, joining_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Initial Permissions
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createForm.permissions.can_view_students}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          permissions: { ...createForm.permissions, can_view_students: e.target.checked }
                        })
                      }
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Can View Students Directory</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createForm.permissions.can_manage_students}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          permissions: { ...createForm.permissions, can_manage_students: e.target.checked }
                        })
                      }
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Can Manage Students (Add / Edit / Archive)</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createForm.permissions.can_manage_fees}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          permissions: { ...createForm.permissions, can_manage_fees: e.target.checked }
                        })
                      }
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Can Manage Fees (View & Record Payments)</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createForm.permissions.can_mark_all_attendance}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          permissions: { ...createForm.permissions, can_mark_all_attendance: e.target.checked }
                        })
                      }
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Can Mark Attendance for All Teachers</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Onboarding...' : 'Onboard Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Teacher & Reset Password Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Edit2 size={18} /> Edit Teacher Profile
              </h2>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone *</label>
                  <input
                    type="text"
                    required
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">CNIC (13 digits)</label>
                  <input
                    type="text"
                    value={editForm.cnic}
                    onChange={(e) => setEditForm({ ...editForm, cnic: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Specialty</label>
                  <input
                    type="text"
                    value={editForm.subject_specialty}
                    onChange={(e) => setEditForm({ ...editForm, subject_specialty: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Joining Date</label>
                <input
                  type="date"
                  value={editForm.joining_date}
                  onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Password Reset Section */}
              <div className="pt-3 border-t border-slate-200 bg-slate-50 p-3 rounded-xl border">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                  <KeyRound size={14} className="text-amber-600" /> Reset Teacher Password
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Leave blank to keep the current password. If entered, the teacher will be logged out everywhere and must use this new password.
                </p>
                <input
                  type="password"
                  value={editForm.new_password}
                  onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })}
                  placeholder="Enter new password (min 8 characters)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
