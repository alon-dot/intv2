import { useState } from 'react';
import { Activity, BriefcaseBusiness, ChartNoAxesCombined, ClipboardList, Clock3, History, Menu, Users, X } from './icons';
import type { UserRole } from '../types/database';
import ThemeToggle from './ThemeToggle';

export type TabId = 'tasks' | 'supervision' | 'time' | 'clients' | 'history' | 'workload' | 'metrics' | 'users';

const links: { id: TabId; label: string; icon: typeof ClipboardList; managersOnly?: boolean; accountantOnly?: boolean; adminOnly?: boolean }[] = [
  { id: 'tasks', label: 'Mis Tareas (Semáforo)', icon: ClipboardList, accountantOnly: true },
  { id: 'supervision', label: 'Supervisión de tareas', icon: ClipboardList, managersOnly: true },
  { id: 'time', label: 'Time Tracker', icon: Clock3 },
  { id: 'clients', label: 'Clientes', icon: BriefcaseBusiness },
  { id: 'history', label: 'Historial', icon: History },
  { id: 'users', label: 'Gestión de usuarios', icon: Users, adminOnly: true },
  { id: 'workload', label: 'Asignación de Carga de Trabajo', icon: Users, managersOnly: true },
  { id: 'metrics', label: 'Rendimiento y Métricas', icon: ChartNoAxesCombined, adminOnly: true }, // Asegúrate de marcarlo para admin aquí si gustas
];

type SidebarProps = { role: UserRole; activeTab: TabId; onTabChange: (tab: TabId) => void };

export default function Sidebar({ role, activeTab, onTabChange }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  
  // Normalizamos la validación del rol para evitar problemas con mayúsculas/minúsculas
  const userRole = String(role || '').toLowerCase();
  const visibleLinks = links.filter(({ managersOnly, accountantOnly, adminOnly }) => 
    (!managersOnly || userRole !== 'accountant') && 
    (!accountantOnly || userRole === 'accountant') && 
    (!adminOnly || userRole === 'admin')
  );

  return (
    <>
    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
      <div className="flex items-center gap-2">
        <img src="/Telles%20Ponce%20Blanco.svg" alt="Téllez Ponce & Asociados" className="h-8 w-auto object-contain dark:hidden" />
        <img src="/Telles%20Ponce%20Azul.svg" alt="Téllez Ponce & Asociados" className="hidden h-8 w-auto object-contain dark:block" />
      </div>
      <button type="button" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
        {mobileOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
    </div>
      <aside className={`${mobileOpen ? 'block' : 'hidden'} absolute inset-x-0 top-[57px] z-20 border-b border-slate-200 bg-white p-4 lg:static lg:block lg:min-h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-6`}>
      <div className="mb-6 hidden lg:block">
        <div className="mb-3 px-2">
          <img src="/Telles%20Ponce%20Blanco.svg" alt="Téllez Ponce & Asociados" className="block h-35 w-full object-contain dark:hidden" />
          <img src="/Telles%20Ponce%20Azul.svg" alt="Téllez Ponce & Asociados" className="hidden h-35 w-full object-contain dark:block" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Panel de gestión</p>
      </div>
        
        <nav aria-label="Navegación principal" className="space-y-1">
          {visibleLinks.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { onTabChange(id); setMobileOpen(false); }} aria-current={activeTab === id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${activeTab === id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-8 space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><Activity size={15} /> Acceso: {role}</div>
          <div className="flex items-center justify-between rounded-xl px-3 py-2"><ThemeToggle /></div>
        </div>
      </aside>
    </>
  );
}