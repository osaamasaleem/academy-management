import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  GraduationCap,
  CreditCard,
  CalendarCheck,
  LayoutDashboard,
  KeyRound,
  LogOut,
  ShieldAlert,
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, show: true },
    {
      name: 'Teachers',
      path: '/teachers',
      icon: Users,
      show: user?.role === 'admin'
    },
    {
      name: 'Students',
      path: '/students',
      icon: GraduationCap,
      show: user?.role === 'admin' || user?.permissions?.can_view_students || user?.permissions?.can_manage_students
    },
    {
      name: 'Fee Ledger',
      path: '/fees',
      icon: CreditCard,
      show: user?.role === 'admin' || user?.permissions?.can_manage_fees
    },
    {
      name: 'Attendance',
      path: '/attendance',
      icon: CalendarCheck,
      show: user?.role === 'admin' || user?.permissions?.can_mark_all_attendance
    },
    {
      name: 'My Attendance',
      path: '/my-attendance',
      icon: CalendarCheck,
      show: user?.role === 'teacher'
    },
    {
      name: 'Audit Logs',
      path: '/audit-logs',
      icon: ShieldAlert,
      show: user?.role === 'admin'
    },
    {
      name: 'Change Password',
      path: '/change-password',
      icon: KeyRound,
      show: true
    }
  ];

  const visibleNav = navItems.filter((i) => i.show);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100">
      {/* Mobile Header */}
      <header className="md:hidden bg-indigo-900 text-white p-4 flex items-center justify-between shadow-md">
        <span className="font-bold text-lg tracking-tight">Academy MS</span>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1 rounded hover:bg-indigo-800 transition"
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar for Desktop & Mobile Toggle */}
      <aside
        className={`bg-indigo-950 text-slate-100 w-full md:w-64 p-4 flex flex-col justify-between shrink-0 shadow-lg ${
          mobileMenuOpen ? 'block' : 'hidden md:flex'
        }`}
      >
        <div>
          <div className="px-3 py-4 mb-4 border-b border-indigo-900">
            <h1 className="text-xl font-extrabold tracking-wide text-white">Academy MS</h1>
            <p className="text-xs text-indigo-300 mt-1 capitalize">
              Role: <span className="font-semibold">{user?.role}</span>
            </p>
          </div>

          <nav className="space-y-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-indigo-200 hover:bg-indigo-900/60 hover:text-white'
                    }`
                  }
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-indigo-900 mt-6">
          <div className="px-3 py-2 mb-2 text-xs text-indigo-300">
            <div className="font-medium text-white truncate">{user?.full_name}</div>
            <div className="truncate text-indigo-400 font-mono">@{user?.username}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-300 hover:bg-red-950/40 hover:text-red-200 transition"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl">
        <Outlet />
      </main>
    </div>
  );
}
