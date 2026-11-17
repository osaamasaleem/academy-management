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
      show: user?.role === 'admin' || user?.permissions?.can_view_audit_logs
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
    <div className="h-screen w-screen flex flex-col md:flex-row bg-slate-100 overflow-hidden">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-indigo-900 text-white px-4 py-3 flex items-center justify-between shadow-md shrink-0 z-30">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-lg tracking-wide">Academy MS</span>
          <span className="text-xs bg-indigo-800/80 text-indigo-200 px-2 py-0.5 rounded capitalize">
            {user?.role}
          </span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-indigo-800 transition"
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
        />
      )}

      {/* Sidebar: Fixed & Static on Desktop, Slide-over Drawer on Mobile */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-indigo-950 text-slate-100 flex flex-col justify-between shrink-0 shadow-xl md:shadow-lg transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Sidebar Header */}
          <div className="px-5 py-5 border-b border-indigo-900/80 flex items-center justify-between shrink-0">
            <div>
              <h1 className="text-xl font-black tracking-wide text-white">Academy MS</h1>
              <p className="text-xs text-indigo-300 mt-1 capitalize">
                Role: <span className="font-semibold text-indigo-200">{user?.role}</span>
              </p>
            </div>
            {/* Close button inside mobile drawer */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-indigo-300 hover:text-white hover:bg-indigo-900 transition"
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation Links (Scrollable if screen height is small) */}
          <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
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
                        ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                        : 'text-indigo-200 hover:bg-indigo-900/70 hover:text-white'
                    }`
                  }
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* User Info & Logout Footer */}
          <div className="p-4 border-t border-indigo-900/80 bg-indigo-950/80 shrink-0">
            <div className="px-2 py-1 mb-2 text-xs text-indigo-300">
              <div className="font-semibold text-white truncate text-sm">{user?.full_name}</div>
              <div className="truncate text-indigo-400 font-mono">@{user?.username}</div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-300 hover:bg-red-950/50 hover:text-red-200 transition"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area (Independently scrollable) */}
      <main className="flex-1 h-full overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
