import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChangePassword from './pages/ChangePassword';
import Teachers from './pages/Teachers';
import Students from './pages/Students';
import FeeManagement from './pages/FeeManagement';
import StudentFeeHistory from './pages/StudentFeeHistory';
import MarkAttendance from './pages/MarkAttendance';
import MyAttendance from './pages/MyAttendance';
import AuditLogs from './pages/AuditLogs';

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
              <Route path="/students" element={<Students />} />
              <Route path="/fees" element={<FeeManagement />} />
              <Route path="/fees/student/:id" element={<StudentFeeHistory />} />
              <Route path="/attendance" element={<MarkAttendance />} />
              <Route path="/my-attendance" element={<MyAttendance />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
