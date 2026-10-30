import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

type Client = { id: string; name: string };
type Project = { id: string; name: string; client_id: string };
type Task = { id: string; title: string; project_id: string; client_id?: string };
type TimeEntry = {
  id: string;
  task_id: string;
  start_time: string | null;
  duration_minutes: number;
  is_manual: boolean;
  justification: string | null;
};
type TimerMode = 'idle' | 'running' | 'paused';

function localDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayRange(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) return `${remaining} min`;
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
}

function dateLabel(value: string | null) {
  if (!value) return 'Sin hora registrada';
  return new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function TimeTracker() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [manualDate, setManualDate] = useState(localDateInput());
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [justification, setJustification] = useState('');
  const [timerMode, setTimerMode] = useState<TimerMode>('idle');
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeSegmentStarted, setActiveSegmentStarted] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = localDateInput();

  const availableProjects = useMemo(
    () => projects.filter((project) => !clientId || project.client_id === clientId),
    [projects, clientId],
  );
  const availableTasks = useMemo(
    () => tasks.filter((task) => !projectId || task.project_id === projectId),
    [tasks, projectId],
  );
  const totalMinutesToday = entries.reduce((total, entry) => total + entry.duration_minutes, 0);

  const loadEntries = useCallback(async () => {
    if (!user) return;
    const { start, end } = dayRange(today);
    const { data, error: queryError } = await supabase
      .from('time_entries')
      .select('id,task_id,start_time,duration_minutes,is_manual,justification')
      .eq('user_id', user.id)
      .gte('start_time', start)
      .lt('start_time', end)
      .order('start_time', { ascending: false });

    if (queryError) {
      setError(`No se pudo cargar el historial de hoy: ${queryError.message}`);
      return;
    }
    setEntries((data ?? []) as TimeEntry[]);
  }, [today, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function loadOptions() {
      setLoading(true);
      
      // Consultamos clientes y project_subtasks (que contiene el desglose real)
      const [clientResult, subtaskResult] = await Promise.all([
        supabase.from('clients').select('id,name').order('name'),
        supabase.from('project_subtasks').select('id,project_name,subtask_name').order('project_name'),
      ]);

      if (!active) return;
      const queryError = clientResult.error ?? subtaskResult.error;
      if (queryError) setError(`No se pudieron cargar los datos: ${queryError.message}`);

      setClients((clientResult.data ?? []) as Client[]);

      const rawSubtasks = (subtaskResult.data ?? []) as any[];

      // Agrupamos los proyectos únicos por 'project_name'
      const uniqueProjectsMap = new Map<string, Project>();
      rawSubtasks.forEach((item) => {
        if (!uniqueProjectsMap.has(item.project_name)) {
          uniqueProjectsMap.set(item.project_name, {
            id: item.id,
            name: item.project_name,
            client_id: '', // Abierto para cualquier cliente o ajustable
          });
        }
      });
      setProjects(Array.from(uniqueProjectsMap.values()));

      // Mapeamos las subtareas reales como tareas disponibles
      const mappedTasks: Task[] = rawSubtasks.map((item) => {
        // Encontramos el ID del proyecto virtual correspondiente
        const matchingProject = uniqueProjectsMap.get(item.project_name);
        return {
          id: item.id,
          title: item.subtask_name,
          project_id: matchingProject ? matchingProject.id : item.id,
        };
      });
      setTasks(mappedTasks);

      setLoading(false);
    }
    void loadOptions();
    void loadEntries();
    return () => { active = false; };
  }, [loadEntries, user]);

  useEffect(() => {
    if (timerMode !== 'running' || activeSegmentStarted === null) return;
    const intervalId = window.setInterval(() => {
      setElapsedSeconds((Date.now() - activeSegmentStarted) / 1000);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeSegmentStarted, timerMode]);

  function startTimer() {
    if (!taskId) {
      setError('Selecciona un cliente, proyecto y tarea antes de iniciar el cronómetro.');
      return;
    }
    setError(null);
    setNotice(null);
    const now = Date.now();
    if (timerMode === 'idle') {
      setStartedAt(new Date(now).toISOString());
      setElapsedSeconds(0);
    }
    setActiveSegmentStarted(now - (timerMode === 'paused' ? elapsedSeconds * 1000 : 0));
    setTimerMode('running');
  }

  function pauseTimer() {
    if (activeSegmentStarted !== null) setElapsedSeconds((Date.now() - activeSegmentStarted) / 1000);
    setActiveSegmentStarted(null);
    setTimerMode('paused');
  }

  async function stopTimer() {
    if (!user || !taskId || !startedAt || saving) return;
    const finalSeconds = timerMode === 'running' && activeSegmentStarted !== null
      ? (Date.now() - activeSegmentStarted) / 1000
      : elapsedSeconds;
    const durationMinutes = Math.round(finalSeconds / 60);
    if (durationMinutes < 1) {
      setError('El cronómetro debe registrar al menos un minuto para guardar.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    const { error: insertError } = await supabase.from('time_entries').insert({
      user_id: user.id,
      task_id: taskId,
      start_time: startedAt,
      end_time: new Date().toISOString(),
      duration_minutes: durationMinutes,
      is_manual: false,
      justification: null,
    });
    setSaving(false);
    if (insertError) {
      setError(`No se pudo guardar el tiempo: ${insertError.message}`);
      return;
    }
    resetTimer();
    setNotice('Tiempo registrado correctamente.');
    await loadEntries();
  }

  function resetTimer() {
    setTimerMode('idle');
    setStartedAt(null);
    setActiveSegmentStarted(null);
    setElapsedSeconds(0);
  }

  async function saveManualEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !taskId || saving) return;
    setError(null);
    setNotice(null);
    const hours = Number(manualHours || 0);
    const minutes = Number(manualMinutes || 0);
    const durationMinutes = hours * 60 + minutes;
    if (!Number.isInteger(hours) || hours < 0 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59 || durationMinutes < 1) {
      setError('Ingresa horas y minutos válidos. La duración debe ser de al menos un minuto.');
      return;
    }
    if (!justification.trim()) {
      setError('La justificación es obligatoria para un registro manual.');
      return;
    }

    const start = new Date(`${manualDate}T00:00:00`);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    setSaving(true);
    const { error: insertError } = await supabase.from('time_entries').insert({
      user_id: user.id,
      task_id: taskId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: durationMinutes,
      is_manual: true,
      justification: justification.trim(),
    });
    setSaving(false);
    if (insertError) {
      setError(`No se pudo guardar el registro manual: ${insertError.message}`);
      return;
    }
    setManualHours('');
    setManualMinutes('');
    setJustification('');
    setNotice('Registro manual guardado.');
    if (manualDate === today) await loadEntries();
  }

  const selectedTaskLabel = (id: string) => {
    const task = tasks.find((item) => item.id === id);
    const project = projects.find((item) => item.id === task?.project_id);
    return task ? `${task.title}${project ? ` · ${project.name}` : ''}` : 'Tarea';
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5"><p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Control de tiempo</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Time Tracker</h2><p className="mt-1 text-sm text-slate-500">Registra el tiempo dedicado a tus tareas.</p></div>
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-lg font-semibold text-slate-900">Modo en vivo</h3>
            <p className="mt-1 text-sm text-slate-500">Inicia, pausa y detén el cronómetro para guardar el tiempo.</p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm font-medium text-slate-700">Cliente
                <select value={clientId} onChange={(event) => { setClientId(event.target.value); setProjectId(''); setTaskId(''); }} disabled={loading || timerMode !== 'idle'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
                  <option value="">Selecciona un cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Proyecto
                <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setTaskId(''); }} disabled={loading || !clientId || timerMode !== 'idle'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal disabled:bg-slate-50">
                  <option value="">Selecciona un proyecto</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Tarea
                <select value={taskId} onChange={(event) => setTaskId(event.target.value)} disabled={loading || !projectId || timerMode !== 'idle'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal disabled:bg-slate-50">
                  <option value="">Selecciona una tarea</option>{availableTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-6 flex flex-col items-center rounded-xl bg-slate-50 p-5">
              <p className="font-mono text-4xl font-semibold tabular-nums text-slate-900" aria-live="off">{formatDuration(Math.floor(elapsedSeconds))}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {timerMode !== 'running' && <button type="button" onClick={startTimer} disabled={saving || loading} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{timerMode === 'paused' ? 'Reanudar' : 'Start'}</button>}
                {timerMode === 'running' && <button type="button" onClick={pauseTimer} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">Pause</button>}
                {timerMode !== 'idle' && <button type="button" onClick={() => void stopTimer()} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{saving ? 'Guardando…' : 'Stop y guardar'}</button>}
              </div>
              {timerMode !== 'idle' && <p className="mt-3 text-xs text-slate-500">{selectedTaskLabel(taskId)}{startedAt ? ` · Desde ${dateLabel(startedAt)}` : ''}</p>}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-lg font-semibold text-slate-900">Registro manual</h3>
            <p className="mt-1 text-sm text-slate-500">Registra tiempo trabajado fuera del cronómetro.</p>
            <form onSubmit={(event) => void saveManualEntry(event)} className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">Cliente
              <select value={clientId} onChange={(event) => { setClientId(event.target.value); setProjectId(''); setTaskId(''); }} required disabled={timerMode !== 'idle'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal disabled:bg-slate-50"><option value="">Selecciona un cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Proyecto
                <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setTaskId(''); }} required disabled={!clientId || timerMode !== 'idle'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal disabled:bg-slate-50"><option value="">Selecciona un proyecto</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Tarea
                <select value={taskId} onChange={(event) => setTaskId(event.target.value)} required disabled={!projectId || timerMode !== 'idle'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal disabled:bg-slate-50"><option value="">Selecciona una tarea</option>{availableTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Fecha
                <input type="date" value={manualDate} max={today} onChange={(event) => setManualDate(event.target.value)} required className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-slate-700">Horas
                  <input type="number" min="0" step="1" value={manualHours} onChange={(event) => setManualHours(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="0" />
                </label>
                <label className="text-sm font-medium text-slate-700">Minutos
                  <input type="number" min="0" max="59" step="1" value={manualMinutes} onChange={(event) => setManualMinutes(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="0" />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">Justificación
                <textarea value={justification} onChange={(event) => setJustification(event.target.value)} required maxLength={1000} rows={3} placeholder="Ej. Reunión presencial con el cliente en cafetería…" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <button type="submit" disabled={saving || loading} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar registro manual'}</button>
            </form>
          </section>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-sm font-semibold uppercase tracking-wider text-slate-400">Resumen del día</p><h2 className="mt-1 text-xl font-bold text-slate-900">Bloques registrados hoy</h2></div>
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">Total: {formatMinutes(totalMinutesToday)}</p>
        </div>
        {entries.length === 0 ? <p className="mt-5 text-sm text-slate-500">Todavía no hay bloques registrados hoy.</p> : <ul className="mt-4 divide-y divide-slate-100">
          {entries.map((entry) => <li key={entry.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold text-slate-800">{selectedTaskLabel(entry.task_id)}</p><p className="mt-1 text-sm text-slate-500">{dateLabel(entry.start_time)} · {entry.is_manual ? 'Manual' : 'Cronómetro'}{entry.justification ? ` · ${entry.justification}` : ''}</p></div>
            <span className="font-semibold text-slate-700">{formatMinutes(entry.duration_minutes)}</span>
          </li>)}
        </ul>}
      </section>
    </div>
  );
}