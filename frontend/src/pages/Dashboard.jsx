import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  GraduationCap, 
  CreditCard, 
  CalendarCheck, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/summary');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to load dashboard metrics');
      }
      setData(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
        <button 
          onClick={fetchDashboard} 
          className="text-sm underline font-semibold hover:text-red-900"
        >
          Retry
        </button>
      </div>
    );
  }

  const isAdmin = data?.role === 'admin';
  const myAtt = data?.myAttendance;
  const attToday = data?.attendanceToday;
  const fees = data?.fees;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 to-indigo-700 text-white p-6 sm:p-8 rounded-2xl shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Welcome back, {user?.full_name}!
        </h1>
        <p className="mt-2 text-indigo-100 text-sm sm:text-base max-w-2xl">
          {isAdmin 
            ? 'Academy Overview & Principal Control Center' 
            : `Teacher Portal · ${user?.subject_specialty || 'Faculty Member'}`}
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Active Teachers Card */}
        {data?.activeTeachers !== null && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Teachers</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{data.activeTeachers}</h3>
            </div>
          </div>
        )}

        {/* Active Students Card */}
        {data?.activeStudents !== null && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Students</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{data.activeStudents}</h3>
            </div>
          </div>
        )}

        {/* Fees Expected Card */}
        {fees && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fees Expected</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">Rs. {fees.expected.toLocaleString()}</h3>
            </div>
          </div>
        )}

        {/* Fees Collected Card */}
        {fees && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Collected ({monthNames[fees.month - 1]})</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-0.5">Rs. {fees.collected.toLocaleString()}</h3>
            </div>
          </div>
        )}
      </div>

      {/* Attendance & Ledger Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Teacher Attendance (Admin / delegated) */}
        {attToday && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <CalendarCheck className="text-indigo-600" size={20} />
                  <h2 className="text-lg font-bold text-slate-900">Today's Faculty Attendance</h2>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                  {attToday.date}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center my-4">
                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-emerald-700">Present</p>
                  <p className="text-xl font-bold text-emerald-800 mt-1">{attToday.present}</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-rose-700">Absent</p>
                  <p className="text-xl font-bold text-rose-800 mt-1">{attToday.absent}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-amber-700">Late</p>
                  <p className="text-xl font-bold text-amber-800 mt-1">{attToday.late}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-blue-700">Leave</p>
                  <p className="text-xl font-bold text-blue-800 mt-1">{attToday.leave}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg col-span-2 sm:col-span-1">
                  <p className="text-xs font-medium text-slate-600">Pending</p>
                  <p className="text-xl font-bold text-slate-700 mt-1">{attToday.notMarked}</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Link 
                to="/attendance" 
                className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 space-x-1"
              >
                <span>Manage Attendance</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        )}

        {/* Teacher's Own Attendance Log (Non-admin) */}
        {myAtt && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Clock className="text-indigo-600" size={20} />
                  <h2 className="text-lg font-bold text-slate-900">
                    My Attendance ({monthNames[myAtt.month - 1]} {myAtt.year})
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center my-4">
                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-emerald-700">Present</p>
                  <p className="text-xl font-bold text-emerald-800 mt-1">{myAtt.counts.present}</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-rose-700">Absent</p>
                  <p className="text-xl font-bold text-rose-800 mt-1">{myAtt.counts.absent}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-amber-700">Late</p>
                  <p className="text-xl font-bold text-amber-800 mt-1">{myAtt.counts.late}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg">
                  <p className="text-xs font-medium text-blue-700">Leave</p>
                  <p className="text-xl font-bold text-blue-800 mt-1">{myAtt.counts.leave}</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Link 
                to="/my-attendance" 
                className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 space-x-1"
              >
                <span>View Full Log</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        )}

        {/* Monthly Fee Collection Progress */}
        {fees && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <CreditCard className="text-indigo-600" size={20} />
                  <h2 className="text-lg font-bold text-slate-900">Fee Status ({monthNames[fees.month - 1]})</h2>
                </div>
                <span className="text-xs font-bold text-slate-600">
                  {fees.expected > 0 ? Math.round((fees.collected / fees.expected) * 100) : 0}% Collected
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-3 mb-6 overflow-hidden flex">
                <div 
                  className="bg-emerald-500 h-full"
                  style={{ width: `${fees.expected > 0 ? (fees.collected / fees.expected) * 100 : 0}%` }}
                ></div>
                <div 
                  className="bg-amber-500 h-full"
                  style={{ width: `${fees.expected > 0 ? (fees.pending / fees.expected) * 100 : 0}%` }}
                ></div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2 border border-slate-100 rounded-lg">
                  <p className="text-xs text-slate-500">Paid</p>
                  <p className="text-lg font-bold text-emerald-600">{fees.counts.paid}</p>
                </div>
                <div className="p-2 border border-slate-100 rounded-lg">
                  <p className="text-xs text-slate-500">Unpaid</p>
                  <p className="text-lg font-bold text-slate-700">{fees.counts.unpaid}</p>
                </div>
                <div className="p-2 border border-slate-100 rounded-lg">
                  <p className="text-xs text-slate-500">Overdue</p>
                  <p className="text-lg font-bold text-rose-600">{fees.counts.overdue}</p>
                </div>
                <div className="p-2 border border-slate-100 rounded-lg">
                  <p className="text-xs text-slate-500">Waived</p>
                  <p className="text-lg font-bold text-indigo-600">{fees.counts.waived}</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Link 
                to="/fees" 
                className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 space-x-1"
              >
                <span>Open Fee Ledger</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
