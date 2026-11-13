import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useFormDraft } from '../hooks/useFormDraft';
import { logActivity } from '../lib/activityLogs';
import { PROYECTOS_OFICIALES } from '../constants/proyectosOficiales';

type Profile = { id: string; full_name: string; role: string; supervisor_id: string | null };
type Client = { id: string; name: string };
type ProjectSubtask = {
  id: string;
  project_id?: string | null;
  project_name?: string | null;
  project_number?: string | number | null;
  name?: string | null;
  subtask_name?: string | null;
  title?: string | null;
  label?: string | null;
};
type Task = {
  id: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  status: string;
  assigned_to: string | null;
  created_by?: string | null;
  created_at: string;
  estimated_hours: number | null;
  due_date: string | null;
  project_id: string | null;
  project_subtask_id?: string | null;
  subtasks?: string[] | null;
  client_id?: string | null;
  priority?: string | null;
};
type OfficialProject = { key: string; name: string; number: string; projectId: string | null; subtasks: ProjectSubtask[] };
type TaskDetail = { task: Task; subtaskName: string | null };
type AssignmentDraft = {
  assignmentType: 'official' | 'free'; projectKey: string; selectedSubtaskIds: string[];
  clientId: string; assigneeId: string; priority: 'urgente' | 'media' | 'normal';
  title: string; description: string; notes: string; hours: string; minutes: string; dueDate: string;
};
type TaskFilter = 'active' | 'today' | 'all';

const labelForSubtask = (subtask: ProjectSubtask) => subtask.name ?? subtask.subtask_name ?? subtask.title ?? subtask.label ?? 'Subactividad';
const ITEMS_PER_PAGE = 5;
const fieldClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const inactiveTaskStatuses = new Set(['completed', 'completado', 'completada', 'cancelled', 'canceled', 'cancelado', 'cancelada', 'archived', 'archivado', 'archivada']);
const taskIsActive = (task: Task) => !inactiveTaskStatuses.has(task.status.trim().toLowerCase());
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function WorkloadManagement() {
  const { user, role } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projectRows, setProjectRows] = useState<ProjectSubtask[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const [todayKey, setTodayKey] = useState(() => localDateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assignmentType, setAssignmentType] = useState<'official' | 'free'>('official');
  const [projectKey, setProjectKey] = useState('');
  const [selectedSubtaskIds, setSelectedSubtaskIds] = useState<string[]>([]);
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<'urgente' | 'media' | 'normal'>('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('0');
  const [timeValidationError, setTimeValidationError] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [detail, setDetail] = useState<TaskDetail | null>(null);

  const assignmentDraft = useMemo<AssignmentDraft>(() => ({ assignmentType, projectKey, selectedSubtaskIds, clientId, assigneeId, priority, title, description, notes, hours, minutes, dueDate }), [assignmentType, projectKey, selectedSubtaskIds, clientId, assigneeId, priority, title, description, notes, hours, minutes, dueDate]);
  
  const restoreAssignmentDraft = useCallback((draft: Partial<AssignmentDraft> | null) => {
    setAssignmentType(draft?.assignmentType === 'free' ? 'free' : 'official');
    setProjectKey(draft?.projectKey ?? '');
    setSelectedSubtaskIds(Array.isArray(draft?.selectedSubtaskIds) ? draft.selectedSubtaskIds.filter((id): id is string => typeof id === 'string') : []);
    setClientId(draft?.clientId ?? '');
    setAssigneeId(draft?.assigneeId ?? '');
    setPriority(draft?.priority === 'urgente' || draft?.priority === 'media' ? draft.priority : 'normal');
    setTitle(draft?.title ?? '');
    setDescription(draft?.description ?? '');
    setNotes(draft?.notes ?? '');
    if (typeof draft?.minutes === 'string') {
      setHours(draft.hours ?? '');
      setMinutes(draft.minutes);
    } else {
      const oldEstimatedHours = Number(draft?.hours);
      const oldTotalMinutes = Number.isFinite(oldEstimatedHours) && oldEstimatedHours > 0 ? Math.round(oldEstimatedHours * 60) : 0;
      setHours(draft?.hours ? String(Math.floor(oldTotalMinutes / 60)) : '');
      setMinutes(String(oldTotalMinutes % 60));
    }
    setTimeValidationError(null);
    setDueDate(draft?.dueDate ?? '');
  }, []);

  const clearAssignmentDraft = useFormDraft(user ? `workload-assignment-draft:${user.id}` : null, assignmentDraft, restoreAssignmentDraft);

  const load = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setLoading(true);
    setError(null);
    if (role !== 'admin' && role !== 'supervisor') {
      setProfiles([]);
      setTasks([]);
      setError('No tienes permiso para consultar la carga de trabajo.');
      setLoading(false);
      return;
    }
    const profileQuery = supabase.from('profiles').select('id,full_name,role,supervisor_id').order('full_name');
    const scopedProfileQuery = role === 'supervisor'
      ? profileQuery.or(`id.eq.${user.id},supervisor_id.eq.${user.id}`)
      : profileQuery;
    const [profileResult, clientResult, projectResult] = await Promise.all([
      scopedProfileQuery,
      supabase.from('clients').select('id,name').order('name'),
      supabase.from('project_subtasks').select('*'),
    ]);
    const firstError = profileResult.error ?? clientResult.error ?? projectResult.error;
    if (firstError) setError(`No se pudo cargar toda la información de asignaciones: ${firstError.message}`);
    if (profileResult.error) {
      setProfiles([]);
      setTasks([]);
      setLoading(false);
      return;
    }
    const loadedProfiles = (profileResult.data ?? []) as Profile[];
    setProfiles(loadedProfiles);
    const accountantIds = loadedProfiles
      .filter((profile) => ['contador', 'accountant'].includes(profile.role.trim().toLowerCase()))
      .map((profile) => profile.id);
    const taskResult = role === 'admin'
      ? await supabase.from('tasks').select('*').order('created_at', { ascending: false })
      : accountantIds.length > 0
        ? await supabase.from('tasks').select('*').in('assigned_to', accountantIds).order('created_at', { ascending: false })
        : { data: [], error: null };
    if (taskResult.error) setError(`No se pudieron cargar las tareas del equipo: ${taskResult.error.message}`);
    if (!clientResult.error) setClients((clientResult.data ?? []) as Client[]);
    if (!projectResult.error) setProjectRows((projectResult.data ?? []) as ProjectSubtask[]);
    if (!taskResult.error) setTasks((taskResult.data ?? []) as Task[]);
    setLoading(false);
  }, [role, user]);

  const teamAccountantIds = useMemo(
    () => profiles.filter((profile) => ['contador', 'accountant'].includes(profile.role.trim().toLowerCase())).map((profile) => profile.id),
    [profiles],
  );

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const dateRefresh = window.setInterval(() => setTodayKey(localDateKey(new Date())), 60000);
    return () => window.clearInterval(dateRefresh);
  }, []);

  useEffect(() => {
    if (!user || (role !== 'admin' && role !== 'supervisor')) return;
    let channel = supabase.channel('public:tasks');
    const onTaskChange = () => { void load(false); };
    if (role === 'admin') {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onTaskChange);
    } else {
      for (const accountantId of teamAccountantIds) {
        channel = channel.on('postgres_changes', {
          event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${accountantId}`,
        }, onTaskChange);
      }
    }
    channel.subscribe((status) => setRealtimeConnected(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(channel); };
  }, [load, role, teamAccountantIds, user]);

  useEffect(() => {
    if (!user) return;
    const refreshInterval = window.setInterval(() => { void load(false); }, 10000);
    return () => window.clearInterval(refreshInterval);
  }, [load, user]);

  const accountants = useMemo(() => profiles.filter((profile) => ['contador', 'accountant'].includes(profile.role.trim().toLowerCase())), [profiles]);
  const names = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name])), [profiles]);
  const clientNames = useMemo(() => Object.fromEntries(clients.map((client) => [client.id, client.name])), [clients]);
  const projectNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of projectRows) if (row.project_id && row.project_name) map.set(row.project_id, `${row.project_number ? `${row.project_number}. ` : ''}${row.project_name}`);
    return map;
  }, [projectRows]);
  const subtaskNames = useMemo(() => Object.fromEntries(projectRows.map((row) => [row.id, labelForSubtask(row)])), [projectRows]);
  
  const officialProjects = useMemo<OfficialProject[]>(() => PROYECTOS_OFICIALES.map((catalogProject) => {
    const number = String(catalogProject.numero);
    const name = catalogProject.nombre;
    const matchingRows = projectRows.filter((row) =>
      String(row.project_name ?? '').trim().toLocaleLowerCase('es-MX') === name.toLocaleLowerCase('es-MX')
      || String(row.project_number ?? '').trim() === number,
    );
    return {
      key: `${number}::${name}`,
      name,
      number,
      projectId: matchingRows.find((row) => row.project_id)?.project_id ?? null,
      subtasks: catalogProject.subactividades.map((subactivity, index) => ({
        id: `${number}-${index + 1}`,
        project_number: number,
        project_name: name,
        name: subactivity,
      })),
    };
  }), [projectRows]);

  const selectedProject = officialProjects.find((project) => project.key === projectKey) ?? null;
  const hasVariableSubtasks = Boolean(selectedProject?.subtasks.length);
  
  const visibleTasks = useMemo(() => {
    if (taskFilter === 'active') return tasks.filter(taskIsActive);
    if (taskFilter === 'all') return tasks;
    return tasks.filter((task) => {
      const createdDate = task.created_at ? localDateKey(new Date(task.created_at)) : null;
      const scheduledDate = task.due_date?.slice(0, 10) ?? null;
      return createdDate === todayKey || scheduledDate === todayKey;
    });
  }, [taskFilter, tasks, todayKey]);

  const totalPages = Math.max(1, Math.ceil(visibleTasks.length / ITEMS_PER_PAGE));
  const pageStart = (Math.min(currentPage, totalPages) - 1) * ITEMS_PER_PAGE;
  const paginatedTasks = visibleTasks.slice(pageStart, pageStart + ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [taskFilter]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const workloads = useMemo(() => {
    const workloadByAssignee = new Map<string, { count: number; hours: number }>();
    for (const task of visibleTasks) {
      if (!taskIsActive(task) || !task.assigned_to) continue;
      const workload = workloadByAssignee.get(task.assigned_to) ?? { count: 0, hours: 0 };
      workload.count += 1;
      workload.hours += Number(task.estimated_hours) || 0;
      workloadByAssignee.set(task.assigned_to, workload);
    }
    return accountants.flatMap((accountant) => {
      const workload = workloadByAssignee.get(accountant.id);
      return workload && workload.count > 0 ? [{ ...accountant, ...workload }] : [];
    });
  }, [accountants, visibleTasks]);

  function changeAssignmentType(value: 'official' | 'free') {
    setAssignmentType(value);
    setProjectKey('');
    setSelectedSubtaskIds([]);
    setTitle('');
  }

  function handleHoursChange(value: string) {
    if (value === '') { setHours(''); setTimeValidationError(null); return; }
    if (!/^\d+$/.test(value) || Number(value) > 999) { setTimeValidationError('Las horas deben ser un entero entre 0 y 999.'); return; }
    setHours(value); setTimeValidationError(null);
  }

  function handleMinutesChange(value: string) {
    if (value === '') { setMinutes(''); setTimeValidationError(null); return; }
    if (!/^\d+$/.test(value) || Number(value) > 59) { setTimeValidationError('Los minutos deben ser un entero entre 0 y 59.'); return; }
    setMinutes(value); setTimeValidationError(null);
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;
    setError(null);
    setNotice(null);
    if (!assigneeId || !priority) { setError('Completa contador y prioridad.'); return; }
    if (assignmentType === 'official' && !clientId) { setError('Selecciona un cliente para el proyecto oficial.'); return; }
    if (timeValidationError) { setError(timeValidationError); return; }
    
    const estimatedHoursInput = Number(hours);
    const estimatedMinutesInput = Number(minutes);
    if (!/^\d+$/.test(hours) || !Number.isInteger(estimatedHoursInput) || estimatedHoursInput < 0 || estimatedHoursInput > 999
      || !/^\d+$/.test(minutes) || !Number.isInteger(estimatedMinutesInput) || estimatedMinutesInput < 0 || estimatedMinutesInput > 59) {
      setError('El tiempo estimado debe ser horas enteras (0 a 999) y minutos enteros (0 a 59).');
      return;
    }
    if (estimatedHoursInput === 0 && estimatedMinutesInput === 0) { setError('El tiempo estimado debe ser mayor a cero.'); return; }
    if (!dueDate || dueDate < localDateKey(new Date())) { setError('La fecha de vencimiento debe ser hoy o una fecha futura.'); return; }
    if (!accountants.some((accountant) => accountant.id === assigneeId)) { setError('El contador seleccionado no pertenece a tu equipo o ya no está disponible.'); return; }
    if (assignmentType === 'official' && !selectedProject) { setError('Selecciona uno de los proyectos oficiales.'); return; }
    if (assignmentType === 'official' && hasVariableSubtasks && selectedProject!.subtasks.length > 0 && selectedSubtaskIds.length === 0) {
      setError('Selecciona al menos una variable o subactividad.');
      return;
    }
    if (assignmentType === 'free' && !title.trim()) { setError('Escribe el título de la tarea libre.'); return; }

    const hasAvailableSubtasks = hasVariableSubtasks && selectedProject!.subtasks.length > 0;
    const chosenSubtasks = hasAvailableSubtasks ? selectedProject!.subtasks.filter((subtask) => selectedSubtaskIds.includes(subtask.id)) : [];
    const isProject = assignmentType === 'official';
    const selectedProjectName = selectedProject ? `${selectedProject.number ? `${selectedProject.number}. ` : ''}${selectedProject.name}` : '';
    const selectedSubtasksArray = chosenSubtasks.map(labelForSubtask);

    const taskData = {
      title: isProject ? selectedProjectName : title.trim(),
      description: isProject ? (notes.trim() || selectedProjectName) : description.trim(),
      client_id: clientId || null,
      assigned_to: assigneeId,
      created_by: user.id,
      due_date: dueDate,
      priority: priority || 'normal',
      estimated_hours: (estimatedHoursInput * 60 + estimatedMinutesInput) / 60,
      notes: notes.trim() || '',
      subtasks: isProject ? selectedSubtasksArray : [],
      status: 'pending',
    };

    setSaving(true);
    const { data: insertedTask, error: insertError } = await supabase.from('tasks').insert(taskData).select('id,assigned_to').single();
    setSaving(false);
    if (insertError || insertedTask?.assigned_to !== assigneeId) {
      setError(insertError?.message ? `No se pudo crear la asignación: ${insertError.message}` : 'La base de datos no confirmó el contador asignado.');
      return;
    }
    await logActivity(user.id, 'task_assigned', `Asignó la tarea ${taskData.title} a ${names[assigneeId] ?? 'el contador seleccionado'}`);
    clearAssignmentDraft();
    setTitle(''); setDescription(''); setNotes(''); setProjectKey(''); setSelectedSubtaskIds([]);
    setClientId(''); setAssigneeId(''); setPriority('normal'); setHours(''); setMinutes('0'); setTimeValidationError(null); setDueDate('');
    setNotice('Asignación creada correctamente.');
    await load();
  }

  async function reassign(task: Task, nextAssigneeId: string) {
    if (!nextAssigneeId || nextAssigneeId === task.assigned_to || saving) return;
    if (!accountants.some((accountant) => accountant.id === task.assigned_to)
      || !accountants.some((accountant) => accountant.id === nextAssigneeId)) {
      setError('Solo puedes reasignar tareas entre contadores de tu equipo.');
      return;
    }
    setSaving(true); setError(null); setNotice(null);
    const { data: updatedTask, error: updateError } = await supabase.from('tasks').update({ assigned_to: nextAssigneeId }).eq('id', task.id).select('id,assigned_to').maybeSingle();
    setSaving(false);
    if (updateError || updatedTask?.assigned_to !== nextAssigneeId) {
      setError(updateError?.message ? `No se pudo reasignar el trabajo: ${updateError.message}` : 'La base de datos no confirmó la reasignación.');
      return;
    }
    await logActivity(user?.id, 'task_assigned', `Asignó la tarea ${task.title} a ${names[nextAssigneeId] ?? 'el contador seleccionado'}`);
    setNotice(`Trabajo reasignado a ${names[nextAssigneeId] ?? 'el contador seleccionado'}.`);
    await load();
  }

  const formatDateTime = (value: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-7 lg:col-span-7 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Administrador · Supervisor</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Asignación de carga de trabajo</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Asigna proyectos oficiales o tareas libres y consulta la carga activa del equipo.</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" role="status">{realtimeConnected ? 'Actualización en tiempo real activa' : 'Sin conexión en tiempo real; verificando cambios cada 10 segundos'}</p>
          
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar tareas y asignaciones">
            {([
              ['active', 'Todas las activas'],
              ['today', 'Solo de hoy'],
              ['all', 'Todas (Histórico)'],
            ] as const).map(([filter, label]) => (
              <button
                key={filter}
                type="button"
                aria-pressed={taskFilter === filter}
                onClick={() => setTaskFilter(filter)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${taskFilter === filter ? 'bg-blue-600 text-white dark:bg-blue-500' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
          {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{notice}</p>}
          {!loading && workloads.length === 0 && <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">No hay contadores con tareas activas en este filtro.</p>}
          {loading ? <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">Cargando equipo y asignaciones…</p> : <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{workloads.map((member) => <li key={member.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">{member.full_name}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{member.count} {taskFilter === 'active' ? 'tareas activas' : 'tareas'} · {member.hours} h estimadas</p></li>)}</ul>}
        </section>

        <form onSubmit={(event) => void createAssignment(event)} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm sm:p-7 lg:col-span-5 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Nueva asignación</h2>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de asignación<select value={assignmentType} onChange={(event) => changeAssignmentType(event.target.value as 'official' | 'free')} className={fieldClass}><option value="official">Asignar proyecto oficial</option><option value="free">Asignar tarea libre</option></select></label>
          
          {assignmentType === 'official' ? <>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Proyecto oficial<select required value={projectKey} onChange={(event) => { setProjectKey(event.target.value); setSelectedSubtaskIds([]); }} className={fieldClass}><option value="">Selecciona un proyecto</option>{officialProjects.map((project) => <option key={project.key} value={project.key}>{project.number ? `${project.number}. ` : ''}{project.name}</option>)}</select></label>
            {hasVariableSubtasks && <fieldset className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><legend className="px-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Variables / subactividades</legend><p className="px-2 pb-2 text-xs text-slate-500 dark:text-slate-400">Selecciona una o varias opciones.</p><div className="grid gap-1 sm:grid-cols-2">{selectedProject?.subtasks.map((subtask) => <label key={subtask.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"><input type="checkbox" checked={selectedSubtaskIds.includes(subtask.id)} onChange={(event) => setSelectedSubtaskIds((current) => event.target.checked ? [...new Set([...current, subtask.id])] : current.filter((id) => id !== subtask.id))} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800" /><span>{labelForSubtask(subtask)}</span></label>)}</div></fieldset>}
          </> : <>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Título<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} /></label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción detallada<textarea required rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className={fieldClass} /></label>
          </>}

          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cliente<select required={assignmentType === 'official'} value={clientId} onChange={(event) => setClientId(event.target.value)} className={fieldClass}><option value="">Selecciona un cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contador responsable<select required value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className={fieldClass}><option value="">Selecciona un contador</option>{accountants.map((accountant) => <option key={accountant.id} value={accountant.id}>{accountant.full_name}</option>)}</select></label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Categoría / semáforo<select required value={priority} onChange={(event) => setPriority(event.target.value as 'urgente' | 'media' | 'normal')} className={fieldClass}><option value="urgente">🔴 Urgente</option><option value="media">🟡 Prioridad media</option><option value="normal">🟢 Normal</option></select></label>
          
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <legend className="px-2 text-sm font-medium text-slate-700 dark:text-slate-300">Tiempo estimado</legend>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Horas<input required type="number" min="0" max="999" step="1" inputMode="numeric" value={hours} onChange={(event) => handleHoursChange(event.target.value)} className={fieldClass} /></label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Minutos<input required type="number" min="0" max="59" step="1" inputMode="numeric" value={minutes} onChange={(event) => handleMinutesChange(event.target.value)} className={fieldClass} /></label>
              </div>
              {timeValidationError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{timeValidationError}</p>}
            </fieldset>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha de vencimiento<input required type="date" min={todayKey} value={dueDate} onChange={(event) => { const value = event.target.value; if (value && value < localDateKey(new Date())) { setError('La fecha de vencimiento debe ser hoy o una fecha futura.'); return; } setDueDate(value); setError(null); }} className={fieldClass} /></label>
          </div>

          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notas (opcional)<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className={fieldClass} /></label>
          <button type="submit" disabled={saving || loading || !user} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Guardando…' : 'Crear y asignar'}</button>
        </form>
      </section>

      <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-7 dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Registro histórico de asignaciones</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Fecha de creación y contador asignado de cada tarea.</p>
        
        {loading ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Cargando historial…</p>
        ) : visibleTasks.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No hay tareas que coincidan con este filtro.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-2 py-3">Creado por</th>
                  <th className="px-2 py-3">Tipo / actividad</th>
                  <th className="px-2 py-3">Cliente</th>
                  <th className="px-2 py-3">Contador asignado</th>
                  <th className="px-2 py-3">Fecha y hora</th>
                  <th className="px-2 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map((task) => (
                  <tr key={task.id} className="border-b border-slate-100 align-top dark:border-slate-800/50">
                    <td className="px-2 py-3 text-slate-800 dark:text-slate-200">{task.created_by ? names[task.created_by] ?? 'Usuario' : '—'}</td>
                    <td className="max-w-64 px-2 py-3">
                      <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{task.project_id ? projectNames.get(task.project_id) ?? task.title : task.title}</span>
                      {task.subtasks?.length ? <span className="text-xs text-slate-500 dark:text-slate-400">{task.subtasks.join(', ')}</span> : task.project_subtask_id && <span className="text-xs text-slate-500 dark:text-slate-400">{subtaskNames[task.project_subtask_id] ?? ''}</span>}
                    </td>
                    <td className="px-2 py-3 text-slate-800 dark:text-slate-200">{task.client_id ? clientNames[task.client_id] ?? 'Cliente' : '—'}</td>
                    <td className="px-2 py-3 text-slate-800 dark:text-slate-200">{task.assigned_to ? names[task.assigned_to] ?? 'Usuario' : 'Sin asignar'}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-slate-800 dark:text-slate-200">{task.created_at ? formatDateTime(task.created_at) : '—'}</td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col gap-2">
                        <button type="button" onClick={() => setDetail({ task, subtaskName: task.subtasks?.join(', ') || (task.project_subtask_id ? subtaskNames[task.project_subtask_id] ?? null : null) })} className="text-left font-medium text-blue-600 hover:underline dark:text-blue-400">Ver detalles</button>
                        <select aria-label={`Reasignar ${task.title}`} value={task.assigned_to ?? ''} disabled={saving} onChange={(event) => void reassign(task, event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <option value="" disabled>Reasignar a…</option>
                          {accountants.map((accountant) => <option key={accountant.id} value={accountant.id}>{accountant.full_name}</option>)}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          <p>{visibleTasks.length === 0 ? 'Mostrando 0–0 de 0 registros' : `Mostrando ${pageStart + 1}–${Math.min(pageStart + paginatedTasks.length, visibleTasks.length)} de ${visibleTasks.length} registros`}</p>
          <div className="flex items-center gap-2">
            <span className="px-2">Página {Math.min(currentPage, totalPages)} de {totalPages}</span>
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage <= 1 || visibleTasks.length === 0} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">Anterior</button>
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages || visibleTasks.length === 0} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">Siguiente</button>
          </div>
        </div>
      </section>
    </div>
  );
}