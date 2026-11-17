import { useAuth } from '../context/AuthContext';
import { ShieldCheck, UserCheck, Key, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Welcome, {user?.full_name}!
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Active role: <span className="font-semibold capitalize text-indigo-700">{user?.role}</span> ({user?.username})
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle size={14} /> System Online
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account Info Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3 text-indigo-900 border-b border-slate-100 pb-3">
            <UserCheck size={20} />
            <h2 className="text-base font-semibold">Active Session Profile</h2>
          </div>
          <div className="text-sm text-slate-600 space-y-2">
            <div><strong className="text-slate-800">Full Name:</strong> {user?.full_name}</div>
            <div><strong className="text-slate-800">Username:</strong> {user?.username}</div>
            <div><strong className="text-slate-800">Role:</strong> {user?.role}</div>
            <div><strong className="text-slate-800">Timezone:</strong> Asia/Karachi (PKT)</div>
          </div>
        </div>

        {/* Permissions Overview Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3 text-indigo-900 border-b border-slate-100 pb-3">
            <ShieldCheck size={20} />
            <h2 className="text-base font-semibold">Active Permissions</h2>
          </div>
          {user?.role === 'admin' ? (
            <p className="text-sm text-emerald-700 font-medium">
              Full Administrator Access. All system modules unlocked.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span>View Students:</span>
                <span className={`font-semibold ${user?.permissions?.can_view_students ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {user?.permissions?.can_view_students ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span>Manage Students:</span>
                <span className={`font-semibold ${user?.permissions?.can_manage_students ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {user?.permissions?.can_manage_students ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span>Manage Fees:</span>
                <span className={`font-semibold ${user?.permissions?.can_manage_fees ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {user?.permissions?.can_manage_fees ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span>Mark Attendance for All:</span>
                <span className={`font-semibold ${user?.permissions?.can_mark_all_attendance ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {user?.permissions?.can_mark_all_attendance ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
