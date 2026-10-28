import { useState, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types/database';
import Sidebar, { type TabId } from './Sidebar';
import TimeTracker from './TimeTracker';
import TaskList from './TaskList';
import WorkloadManagement from './WorkloadManagement';
import ClientHistory from './ClientHistory';
import UserManagement from './UserManagement';
import ActivityHistory from './ActivityHistory';

const tabTitles: Record<TabId, string> = {
  users: 'Gestión de usuarios',
  tasks: 'Mis Tareas (Semáforo)',
  supervision: 'Supervisión de tareas',
  time: 'Time Tracker',
  clients: 'Clientes',
  history: 'Historial',
  workload: 'Asignación de Carga de Trabajo',
  metrics: 'Rendimiento y Métricas',
};

function normalizeRole(role: string | null): UserRole | null {
  switch (role?.toUpperCase()) {
    case 'ADMIN': return 'ADMIN';
    case 'SUPERVISOR': return 'SUPERVISOR';
    case 'ACCOUNTANT':
    case 'CONTADOR': return 'ACCOUNTANT';
    default: return null;
  }
}

export default function MainLayout({ children }: { children: ReactNode }) {
  const { role, profile, user, signOut } = useAuth();
  const userRole = normalizeRole(role);
  const isManager = userRole === 'ADMIN' || userRole === 'SUPERVISOR';
  const [activeTab, setActiveTab] = useState<TabId>(() => isManager ? 'workload' : 'tasks');
  const isPersonalTasks = activeTab === 'tasks' && userRole === 'ACCOUNTANT';
  const isSupervision = activeTab === 'supervision' && isManager;

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {userRole && <Sidebar role={userRole} activeTab={activeTab} onTabChange={setActiveTab} />}
      <div className="min-w-0 flex-1">
        <header className="hidden items-center justify-between border-b border-slate-200 bg-white px-8 py-4 lg:flex">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Panel de gestión</p><h1 className="mt-1 text-xl font-semibold text-slate-900">{tabTitles[activeTab]}</h1></div>
          <div className="flex items-center gap-4"><span className="text-sm text-slate-600">{profile?.full_name || user?.email}</span><button type="button" onClick={() => void signOut()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cerrar sesión</button></div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          {isPersonalTasks && <><TaskList />{children}</>}
          {isSupervision && children}
          <div className={activeTab === 'time' ? '' : 'hidden'}><TimeTracker /></div>
          {activeTab === 'workload' && isManager && <WorkloadManagement />}
          {activeTab === 'clients' && <ClientHistory />}
          {activeTab === 'history' && <ActivityHistory />}
          {activeTab === 'users' && userRole === 'ADMIN' && <UserManagement />}
          {activeTab === 'metrics' && <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-lg font-semibold text-slate-800">{tabTitles[activeTab]}</h2><p className="mt-2 text-sm text-slate-500">Esta sección estará disponible próximamente.</p></section>}
        </main>
      </div>
    </div>
  );
}
