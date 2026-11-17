import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChangePassword from './pages/ChangePassword';
import Teachers from './pages/Teachers';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/change-password" element={<ChangePassword />} />
              
              {/* Upcoming phases routes */}
              <Route path="/teachers" element={<Teachers />} />
              <Route path="/students" element={<div className="bg-white p-6 rounded-xl border border-slate-200"><h2 className="text-xl font-bold">Students Management (Phase 3)</h2></div>} />
              <Route path="/fees" element={<div className="bg-white p-6 rounded-xl border border-slate-200"><h2 className="text-xl font-bold">Fee Ledger (Phase 3)</h2></div>} />
              <Route path="/attendance" element={<div className="bg-white p-6 rounded-xl border border-slate-200"><h2 className="text-xl font-bold">Teacher Attendance (Phase 4)</h2></div>} />
              <Route path="/my-attendance" element={<div className="bg-white p-6 rounded-xl border border-slate-200"><h2 className="text-xl font-bold">My Attendance (Phase 4)</h2></div>} />
              <Route path="/audit-logs" element={<div className="bg-white p-6 rounded-xl border border-slate-200"><h2 className="text-xl font-bold">Audit Logs (Phase 4)</h2></div>} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
