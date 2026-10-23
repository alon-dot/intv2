import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../types/database';

export type Task = Database['public']['Tables']['tasks']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export const taskStatusLabel: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En Proceso',
  completed: 'Completada',
};

const statusClass: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[status] ?? 'bg-slate-100 text-slate-700'}`}>{taskStatusLabel[status] ?? status}</span>;
}

export function DashboardShell({ children }: { title: string; children: ReactNode }) {
  return <div className="mx-auto max-w-7xl">{children}</div>;
}

export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-6 shadow-sm ${className}`}><h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>{children}</section>;
}

export function PersonalPendingTasks({ refreshKey = 0 }: { refreshKey?: number }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: queryError } = await supabase.from('tasks').select('*').eq('assigned_to', user.id).eq('status', 'pending').order('created_at', { ascending: false });
    setTasks(data ?? []);
    setError(queryError?.message ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return (
    <Panel title="Mis Tareas Pendientes">
      {loading ? <p className="text-sm text-slate-500">Cargando tareas…</p>
        : error ? <p role="alert" className="text-sm text-red-700">No se pudieron cargar las tareas: {error}</p>
          : tasks.length === 0 ? <p className="text-sm text-slate-500">No tienes tareas pendientes.</p>
            : <ul className="divide-y divide-slate-100">{tasks.map((task) => <li key={task.id} className="py-3 first:pt-0 last:pb-0"><p className="font-semibold text-slate-800">{task.title}</p>{task.description && <p className="mt-1 text-sm text-slate-500">{task.description}</p>}</li>)}</ul>}
    </Panel>
  );
}

export function TaskRows({ tasks, assignees, onStatusChange }: { tasks: Task[]; assignees?: Record<string, string>; onStatusChange?: (task: Task, status: TaskStatus) => void }) {
  if (tasks.length === 0) return <p className="text-sm text-slate-500">No hay tareas para mostrar.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((task) => <li key={task.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{task.title}</p>
          {task.description && <p className="mt-1 text-sm text-slate-600">{task.description}</p>}
          {task.assigned_to && assignees?.[task.assigned_to] && <p className="mt-1 text-xs text-slate-500">Asignada a: {assignees[task.assigned_to]}</p>}
        </div>
        {onStatusChange ? <select aria-label={`Estado de ${task.title}`} value={task.status} onChange={(event) => onStatusChange(task, event.target.value as TaskStatus)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 sm:w-auto">
          <option value="pending">Pendiente</option><option value="in_progress">En Proceso</option><option value="completed">Completada</option>
        </select> : <StatusBadge status={task.status} />}
      </li>)}
    </ul>
  );
}
