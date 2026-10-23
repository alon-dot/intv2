import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

type TaskStatus = 'pending' | 'in_progress' | 'review' | 'completed';
type Priority = 'urgent' | 'medium' | 'normal';
type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  estimated_hours: number | null;
  priority: string | null;
  project: { name: string; client: { name: string } | null } | null;
  task_categories: { name: string } | null;
};
type TaskBase = Omit<TaskRow, 'project' | 'task_categories'> & { project_id: string | null; client_id: string | null; category_id: string | null };

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'review', label: 'En revisión' },
  { value: 'completed', label: 'Completada' },
];

function localToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  const due = new Date(year, month - 1, day);
  return Math.round((due.getTime() - localToday().getTime()) / 86_400_000);
}

function priorityFor(date: string | null, storedPriority?: string | null): Priority {
  if (storedPriority) {
    const normalized = storedPriority.toLowerCase();
    if (normalized === 'urgente' || normalized === 'urgent') return 'urgent';
    if (normalized === 'media' || normalized === 'medium') return 'medium';
    if (normalized === 'normal') return 'normal';
  }
  const days = daysUntil(date);
  if (days === null) return 'normal';
  if (days <= 3) return 'urgent';
  if (days <= 7) return 'medium';
  return 'normal';
}

const priorityStyles: Record<Priority, { dot: string; badge: string; label: string }> = {
  urgent: { dot: 'bg-red-500', badge: 'bg-red-50 text-red-700', label: 'Urgente' },
  medium: { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-800', label: 'Prioridad media' },
  normal: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700', label: 'Normal' },
};

function statusValue(status: string): TaskStatus {
  const normalized = status.toLowerCase();
  return statusOptions.some((option) => option.value === normalized) ? normalized as TaskStatus : 'pending';
}

export default function TaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!user) { setTasks([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('tasks')
      .select('id,title,status,due_date,estimated_hours,priority,project_id,client_id,category_id')
      .eq('assigned_to', user.id)
      .order('due_date', { ascending: true, nullsFirst: false });
    if (queryError) {
      setError(`No se pudieron cargar tus tareas: ${queryError.message}`);
      setTasks([]);
    } else {
      const baseTasks = (data ?? []) as TaskBase[];
      const projectIds = [...new Set(baseTasks.map((task) => task.project_id).filter((id): id is string => Boolean(id)))];
      const taskClientIds = [...new Set(baseTasks.map((task) => task.client_id).filter((id): id is string => Boolean(id)))];
      const categoryIds = [...new Set(baseTasks.map((task) => task.category_id).filter((id): id is string => Boolean(id)))];
      const [projectResult, categoryResult] = await Promise.all([
        projectIds.length ? supabase.from('projects').select('id,name,client_id').in('id', projectIds) : Promise.resolve({ data: [], error: null }),
        categoryIds.length ? supabase.from('task_categories').select('id,name').in('id', categoryIds) : Promise.resolve({ data: [], error: null }),
      ]);
      const projects = (projectResult.data ?? []) as { id: string; name: string; client_id: string | null }[];
      const relatedClientIds = [...new Set([...taskClientIds, ...projects.map((project) => project.client_id).filter((id): id is string => Boolean(id))])];
      const { data: clientData, error: clientError } = relatedClientIds.length
        ? await supabase.from('clients').select('id,name').in('id', relatedClientIds)
        : { data: [], error: null };
      const clients = (clientData ?? []) as { id: string; name: string }[];
      const projectById = new Map(projects.map((project) => [project.id, project]));
      const clientById = new Map(clients.map((client) => [client.id, client]));
      const categoryById = new Map(((categoryResult.data ?? []) as { id: string; name: string }[]).map((category) => [category.id, category]));
      const relationError = projectResult.error ?? categoryResult.error ?? clientError;
      if (relationError) setError(`Se cargaron las tareas, pero faltan algunos datos relacionados: ${relationError.message}`);
      setTasks(baseTasks.map((task) => {
        const project = task.project_id ? projectById.get(task.project_id) : undefined;
        return {
          ...task,
          project: project ? { name: project.name, client: project.client_id ? clientById.get(project.client_id) ?? null : null } : task.client_id ? { name: '', client: clientById.get(task.client_id) ?? null } : null,
          task_categories: task.category_id ? categoryById.get(task.category_id) ?? null : null,
        };
      }));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  const visibleTasks = useMemo(() => tasks.filter((task) =>
    (statusFilter === 'all' || statusValue(task.status) === statusFilter)
    && (priorityFilter === 'all' || priorityFor(task.due_date, task.priority) === priorityFilter),
  ), [priorityFilter, statusFilter, tasks]);

  async function updateStatus(task: TaskRow, nextStatus: TaskStatus) {
    const previousStatus = task.status;
    setError(null);
    setSavingId(task.id);
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: nextStatus } : item));
    const { error: updateError } = await supabase.from('tasks').update({ status: nextStatus }).eq('id', task.id).eq('assigned_to', user?.id);
    if (updateError) {
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: previousStatus } : item));
      setError(`No se pudo actualizar el estado: ${updateError.message}`);
    }
    setSavingId(null);
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Seguimiento personal</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Mis tareas</h2><p className="mt-1 text-sm text-slate-500">Prioridad calculada según los días restantes para la fecha límite.</p></div>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm font-medium text-slate-600">Estado
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="all">Todos</option>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-600">Semáforo
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="all">Todas las prioridades</option><option value="urgent">🔴 Urgente</option><option value="medium">🟡 Media</option><option value="normal">🟢 Normal</option>
              </select>
            </label>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-xs font-medium">
          {(['urgent', 'medium', 'normal'] as Priority[]).map((priority) => <span key={priority} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${priorityStyles[priority].badge}`}><span className={`h-2.5 w-2.5 rounded-full ${priorityStyles[priority].dot}`} />{priorityStyles[priority].label}</span>)}
          <span className="self-center text-slate-500">Urgente: vencida o en 3 días · Media: 4 a 7 días · Normal: más de 7 días</span>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {loading ? <p className="p-6 text-sm text-slate-500">Cargando tareas…</p>
          : visibleTasks.length === 0 ? <p className="p-6 text-sm text-slate-500">{tasks.length ? 'No hay tareas que coincidan con estos filtros.' : 'No tienes tareas asignadas.'}</p>
            : <ul className="divide-y divide-slate-100">{visibleTasks.map((task) => {
              const priority = priorityFor(task.due_date, task.priority);
              const days = daysUntil(task.due_date);
              return <li key={task.id} className="flex flex-col gap-4 border-l-4 border-l-transparent p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderLeftColor: priority === 'urgent' ? '#ef4444' : priority === 'medium' ? '#fbbf24' : '#10b981' }}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span aria-label={priorityStyles[priority].label} className={`h-3 w-3 rounded-full ${priorityStyles[priority].dot}`} /><h3 className="font-semibold text-slate-900">{task.title}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityStyles[priority].badge}`}>{priorityStyles[priority].label}</span></div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500"><span>Cliente: {task.project?.client?.name ?? 'Sin cliente'}</span><span>Proyecto: {task.project?.name ?? 'Sin proyecto'}</span><span>Categoría: {task.task_categories?.name ?? 'Sin categoría'}</span><span>Estimado: {task.estimated_hours ?? 0} h</span><span>Vence: {task.due_date ? new Date(`${task.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString('es-MX') : 'Sin fecha'}{days !== null ? days < 0 ? ` · vencida hace ${Math.abs(days)} d` : days === 0 ? ' · vence hoy' : ` · en ${days} d` : ''}</span></div>
                </div>
                <label className="text-sm font-medium text-slate-600">Estado
                  <select aria-label={`Estado de ${task.title}`} value={statusValue(task.status)} onChange={(event) => void updateStatus(task, event.target.value as TaskStatus)} disabled={savingId === task.id} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 disabled:opacity-60 sm:w-44">
                    {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </li>;
            })}</ul>}
      </div>
    </section>
  );
}
