import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ requiredFlags = [], adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return (
      <div className="p-8 text-center text-red-600">
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-sm mt-1">This section is restricted to administrators.</p>
      </div>
    );
  }

  if (requiredFlags.length > 0 && user.role !== 'admin') {
    const hasAnyFlag = requiredFlags.some((flag) => user.permissions?.[flag]);
    if (!hasAnyFlag) {
      return (
        <div className="p-8 text-center text-amber-700">
          <h2 className="text-xl font-bold">Access Restricted</h2>
          <p className="text-sm mt-1">You do not have permission to view this section.</p>
        </div>
      );
    }
  }

  return <Outlet />;
}
