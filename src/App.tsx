import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AdminDashboard from './components/AdminDashboard';
import SupervisorDashboard from './components/SupervisorDashboard';
import ContadorDashboard from './components/ContadorDashboard';
import { useAuth } from './contexts/AuthContext';
import type { AppRole } from './types/database';
import type { ReactNode } from 'react';
import MainLayout from './components/MainLayout';
import PasswordReset from './components/PasswordReset';

function RoleRoute({ allowedRoles, children }: { allowedRoles: AppRole[]; children: ReactNode }) {
  return <ProtectedRoute allowedRoles={allowedRoles}>{children}</ProtectedRoute>;
}

function DashboardRoute() {
  const { role, loading, session } = useAuth();
  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600" aria-live="polite">Verificando sesión…</main>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (role === 'admin') return <Navigate to="/admin" replace />;
  if (role === 'supervisor') return <Navigate to="/supervisor" replace />;
  if (role === 'contador') return <Navigate to="/contador" replace />;
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600" role="alert">No se pudo validar el rol de esta cuenta.</main>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<PasswordReset />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardRoute />} />
      <Route path="/admin" element={<RoleRoute allowedRoles={['admin']}><MainLayout><AdminDashboard /></MainLayout></RoleRoute>} />
      <Route path="/supervisor" element={<RoleRoute allowedRoles={['supervisor']}><MainLayout><SupervisorDashboard /></MainLayout></RoleRoute>} />
      <Route path="/contador" element={<RoleRoute allowedRoles={['contador']}><MainLayout><ContadorDashboard /></MainLayout></RoleRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
