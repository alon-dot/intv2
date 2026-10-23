import { useCallback, useEffect, useState } from 'react';
import { Panel, PersonalPendingTasks, TaskRows, type Task, type TaskStatus } from './DashboardShared';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export default function ContadorDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: queryError } = await supabase.from('tasks').select('*').eq('assigned_to', user.id).order('created_at', { ascending: false });
    setTasks(data ?? []);
    setError(queryError?.message ? `No se pudieron cargar tus tareas: ${queryError.message}` : null);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  async function changeStatus(task: Task, status: TaskStatus) {
    setSavingTask(task.id);
    setError(null);
    const { error: updateError } = await supabase.from('tasks').update({ status }).eq('id', task.id).eq('assigned_to', user?.id ?? '');
    setSavingTask(null);
    if (updateError) {
      setError(`No se pudo actualizar la tarea: ${updateError.message}`);
      return;
    }
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item));
    setPendingRefresh((current) => current + 1);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="grid gap-6 lg:grid-cols-2">
        <PersonalPendingTasks refreshKey={pendingRefresh} />
        <Panel title={`Mis tareas (${tasks.length})`}>
          {loading ? <p className="text-sm text-slate-500">Cargando tareas…</p>
            : error ? <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>
              : <TaskRows tasks={tasks} onStatusChange={(task, status) => void changeStatus(task, status)} />}
          {savingTask && <p className="mt-3 text-xs text-slate-500">Guardando cambio…</p>}
        </Panel>
      </div>
    </div>
  );
}
