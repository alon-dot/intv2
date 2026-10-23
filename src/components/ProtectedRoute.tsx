import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { AppRole } from '../types/database';

type ProtectedRouteProps = {
  allowedRoles: AppRole[];
  children: ReactNode;
};

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { session, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600" aria-live="polite">
        Verificando acceso…
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!role || !allowedRoles.includes(role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-slate-200/70">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-600">403</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Acceso denegado</h1>
          <p className="mt-2 text-slate-600">Tu cuenta no tiene permiso para ver esta página.</p>
          <Link to="/dashboard" className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200">
            Ir al inicio
          </Link>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
