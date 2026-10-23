import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell, Panel, StatusBadge, type Profile, type Task } from './DashboardShared';
import { supabase } from '../lib/supabaseClient';

export default function AdminDashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <DashboardShell title="Panel de administración">
      <Panel title={`Supervisión de tareas (${tasks.length})`}>
        {error && <p role="alert" className="mb-3 text-sm text-red-700">No se pudieron cargar todos los datos: {error}</p>}
        {tasks.length === 0 ? <p className="text-sm text-slate-500">No hay tareas registradas.</p> : <ul className="divide-y divide-slate-100">{tasks.map((task) => <li key={task.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">{task.title}</p><p className="mt-1 text-sm text-slate-500">Asignada a: {task.assigned_to ? names[task.assigned_to] ?? 'Usuario' : 'Sin asignar'}{task.description ? ` · ${task.description}` : ''}</p></div><StatusBadge status={task.status} /></li>)}</ul>}
      </Panel>
    </DashboardShell>
  );
}
