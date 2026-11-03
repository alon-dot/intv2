import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell, Panel, StatusBadge, type Profile, type Task } from './DashboardShared';
import { supabase } from '../lib/supabaseClient';

type DateFilterMode = 'all' | 'today' | 'week' | 'month' | 'custom';
type StatusFilterMode = 'all' | 'completed' | 'in_progress' | 'in_review' | 'pending';

export default function AdminDashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Estados de filtrado para la supervisión
  const [filterMode, setFilterMode] = useState<DateFilterMode>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterMode>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const load = useCallback(async () => {
    const [profileResult, taskResult] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role').order('full_name'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
    ]);
    setProfiles(profileResult.data ?? []);
    setTasks(taskResult.data ?? []);
    setError(profileResult.error?.message ?? taskResult.error?.message ?? null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const names = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name])), [profiles]);

  // Filtrado dinámico de tareas por fecha y estatus (incluyendo "en_review" / "review")
  const filteredTasks = useMemo(() => {
    const now = new Date();

    return tasks.filter((task) => {
      // 1. Filtro por Estatus
      const st = String(task.status).toLowerCase();
      if (statusFilter === 'completed' && st !== 'completed' && st !== 'completada') return false;
      if (statusFilter === 'in_progress' && st !== 'in_progress' && st !== 'en proceso') return false;
      if (statusFilter === 'in_review' && st !== 'in_review' && st !== 'review' && st !== 'en revisión') return false;
      if (statusFilter === 'pending' && (st === 'completed' || st === 'completada' || st === 'in_progress' || st === 'en proceso' || st === 'in_review' || st === 'review' || st === 'en revisión')) return false;

      // 2. Filtro por Fecha
      if (filterMode === 'all') return true;

      const taskDate = new Date(task.created_at);
      if (isNaN(taskDate.getTime())) return true;

      if (filterMode === 'today') {
        return taskDate.toDateString() === now.toDateString();
      }
      if (filterMode === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return taskDate >= weekAgo;
      }
      if (filterMode === 'month') {
        return taskDate.getMonth() === now.getMonth() && taskDate.getFullYear() === now.getFullYear();
      }
      if (filterMode === 'custom' && startDate && endDate) {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        return taskDate >= start && taskDate <= end;
      }
      return true;
    });
  }, [tasks, filterMode, statusFilter, startDate, endDate]);

  return (
    <DashboardShell title="Supervisión de tareas">
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">No se pudieron cargar todos los datos: {error}</p>}

      {/* Barra de Filtros Interactivos (Fechas y Estatus con "En revisión") */}
      <div className="mb-6 space-y-4 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Filtros de supervisión</h3>
            <p className="text-xs text-slate-500">Filtra las actividades por periodo y estatus operativo.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setFilterMode('today')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'today' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Hoy</button>
            <button type="button" onClick={() => setFilterMode('week')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'week' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Última semana</button>
            <button type="button" onClick={() => setFilterMode('month')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'month' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Este mes</button>
            <button type="button" onClick={() => setFilterMode('all')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Histórico</button>
            <button type="button" onClick={() => setFilterMode('custom')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'custom' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Personalizado</button>
          </div>
        </div>

        {filterMode === 'custom' && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <label className="flex items-center gap-1 font-medium text-slate-600">Desde: <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded border border-slate-300 p-1" /></label>
            <label className="flex items-center gap-1 font-medium text-slate-600">Hasta: <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded border border-slate-300 p-1" /></label>
          </div>
        )}

        {/* Filtro secundario por Estatus con el botón de "En revisión" */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="font-semibold text-slate-500 mr-2">Estatus:</span>
          <button type="button" onClick={() => setStatusFilter('all')} className={`rounded-md px-2.5 py-1 font-medium transition ${statusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todas</button>
          <button type="button" onClick={() => setStatusFilter('completed')} className={`rounded-md px-2.5 py-1 font-medium transition ${statusFilter === 'completed' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>Completadas</button>
          <button type="button" onClick={() => setStatusFilter('in_progress')} className={`rounded-md px-2.5 py-1 font-medium transition ${statusFilter === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>En proceso</button>
          <button type="button" onClick={() => setStatusFilter('in_review')} className={`rounded-md px-2.5 py-1 font-medium transition ${statusFilter === 'in_review' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>En revisión</button>
          <button type="button" onClick={() => setStatusFilter('pending')} className={`rounded-md px-2.5 py-1 font-medium transition ${statusFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>Pendientes</button>
        </div>
      </div>

      {/* Listado de Supervisión con los datos filtrados */}
      <Panel title={`Supervisión de tareas (${filteredTasks.length})`}>
        {filteredTasks.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No hay tareas que coincidan con los filtros seleccionados.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredTasks.map((task) => (
              <li key={task.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{task.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Asignada a: {task.assigned_to ? names[task.assigned_to] ?? 'Usuario' : 'Sin asignar'}
                    {task.description ? ` · ${task.description}` : ''}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </DashboardShell>
  );
}