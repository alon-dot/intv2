import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useFormDraft } from '../hooks/useFormDraft';

type Profile = { id: string; full_name: string; role: string };
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
type ProjectCatalogRow = { project_number: string | number | null; project_name: string | null };
type TaskDetail = { task: Task; subtaskName: string | null };
type AssignmentDraft = {
  assignmentType: 'official' | 'free'; projectKey: string; selectedSubtaskIds: string[];
  clientId: string; assigneeId: string; priority: 'urgente' | 'media' | 'normal';
  title: string; description: string; notes: string; hours: string; dueDate: string;
};

const labelForSubtask = (subtask: ProjectSubtask) => subtask.name ?? subtask.subtask_name ?? subtask.title ?? subtask.label ?? 'Subactividad';
const projectNumbersWithVariables = new Set(['1', '2', '5', '6']);
const fallbackProjectNames = [
  'CONSTANCIA DE SITUACIÓN FISCAL Y 32-D',
  'IMPUESTOS',
  'NOMINA',
  'FACTURACIÓN Y COMPLEMENTO DE PAGO',
  'INFORMATIVAS',
  'SEGURO SOCIAL',
  'REGISTRO DE CONTABILIDAD',
  'ESTADOS FINANCIEROS',
  'PAPELES DE TRABAJO - DETERMINACION DE IMPUESTOS',
  'CONTABILIDAD ELECTRÓNICA',
  'ATENCIÓN DE FACULTADES DE COMPROBACIÓN',
  'MEDIOS DE DEFENSA',
  'ATENCIÓN A CLIENTE – REUNIÓN',
];
const fallbackProjectCatalog: ProjectCatalogRow[] = fallbackProjectNames.map((project_name, index) => ({ project_name, project_number: index + 1 }));
const fieldClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800';
const taskIsActive = (task: Task) => ['pending', 'in_progress'].includes(task.status.toLowerCase());

export default function WorkloadManagement() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projectRows, setProjectRows] = useState<ProjectSubtask[]>([]);
  const [projectCatalog, setProjectCatalog] = useState<ProjectCatalogRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [dueDate, setDueDate] = useState('');
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const assignmentDraft = useMemo<AssignmentDraft>(() => ({ assignmentType, projectKey, selectedSubtaskIds, clientId, assigneeId, priority, title, description, notes, hours, dueDate }), [assignmentType, projectKey, selectedSubtaskIds, clientId, assigneeId, priority, title, description, notes, hours, dueDate]);
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
    setHours(draft?.hours ?? '');
    setDueDate(draft?.dueDate ?? '');
  }, []);
  const clearAssignmentDraft = useFormDraft(user ? `workload-assignment-draft:${user.id}` : null, assignmentDraft, restoreAssignmentDraft);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const [profileResult, clientResult, projectCatalogResult, projectResult, taskResult] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role').order('full_name'),
      supabase.from('clients').select('id,name').order('name'),
      supabase.from('project_subtasks').select('project_number, project_name').order('project_number', { ascending: true }),
      supabase.from('project_subtasks').select('*'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
    ]);
    const firstError = profileResult.error ?? clientResult.error ?? projectCatalogResult.error ?? projectResult.error ?? taskResult.error;
    if (firstError) setError(`No se pudo cargar toda la información de asignaciones: ${firstError.message}`);
    setProfiles((profileResult.data ?? []) as Profile[]);
    setClients((clientResult.data ?? []) as Client[]);
    setProjectRows((projectResult.data ?? []) as ProjectSubtask[]);
    const uniqueProjects = new Map<string, ProjectCatalogRow>();
    for (const row of (projectCatalogResult.data ?? []) as ProjectCatalogRow[]) {
      const name = row.project_name?.trim();
      if (name && !uniqueProjects.has(name.toLocaleLowerCase('es-MX'))) uniqueProjects.set(name.toLocaleLowerCase('es-MX'), { ...row, project_name: name });
    }
    setProjectCatalog(projectCatalogResult.error || uniqueProjects.size === 0 ? fallbackProjectCatalog : [...uniqueProjects.values()]);
    setTasks((taskResult.data ?? []) as Task[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const accountants = useMemo(() => profiles.filter((profile) => ['contador', 'accountant'].includes(profile.role.trim().toLowerCase())), [profiles]);
  const names = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name])), [profiles]);
  const clientNames = useMemo(() => Object.fromEntries(clients.map((client) => [client.id, client.name])), [clients]);
  const projectNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of projectRows) if (row.project_id && row.project_name) map.set(row.project_id, `${row.project_number ? `${row.project_number}. ` : ''}${row.project_name}`);
    return map;
  }, [projectRows]);
  const subtaskNames = useMemo(() => Object.fromEntries(projectRows.map((row) => [row.id, labelForSubtask(row)])), [projectRows]);
  const officialProjects = useMemo<OfficialProject[]>(() => {
    return projectCatalog.map((catalogProject) => {
      const number = String(catalogProject.project_number ?? '').trim();
      const name = catalogProject.project_name?.trim() ?? `Proyecto ${number}`;
      const matchingRows = projectRows.filter((row) =>
        String(row.project_name ?? '').trim().toLocaleLowerCase('es-MX') === name.toLocaleLowerCase('es-MX')
        || (number && String(row.project_number ?? '').trim() === number),
      );
      return {
        key: `${number}::${name}`,
        name,
        number,
        projectId: matchingRows.find((row) => row.project_id)?.project_id ?? null,
        subtasks: matchingRows,
      };
    });
  }, [projectCatalog, projectRows]);
  const selectedProject = officialProjects.find((project) => project.key === projectKey) ?? null;
  const hasVariableSubtasks = Boolean(selectedProject && projectNumbersWithVariables.has(selectedProject.number));
  const activeTasks = tasks.filter(taskIsActive);
  const workloads = useMemo(() => accountants.map((accountant) => {
    const memberTasks = activeTasks.filter((task) => task.assigned_to === accountant.id);
    return { ...accountant, count: memberTasks.length, hours: memberTasks.reduce((sum, task) => sum + (Number(task.estimated_hours) || 0), 0) };
  }), [accountants, activeTasks]);

  function changeAssignmentType(value: 'official' | 'free') {
    setAssignmentType(value);
    setProjectKey('');
    setSelectedSubtaskIds([]);
    setTitle('');
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;
    setError(null);
    setNotice(null);
    if (!clientId || !assigneeId || !priority || !dueDate || !hours) {
      setError('Completa cliente, contador, prioridad, horas estimadas y fecha de vencimiento.');
      return;
    }
    if (assignmentType === 'official' && !selectedProject) {
      setError('Selecciona uno de los proyectos oficiales.');
      return;
    }
    if (assignmentType === 'official' && hasVariableSubtasks && selectedProject!.subtasks.length > 0 && selectedSubtaskIds.length === 0) {
      setError('Selecciona al menos una variable o subactividad.');
      return;
    }
    if (assignmentType === 'free' && !title.trim()) {
      setError('Escribe el título de la tarea libre.');
      return;
    }
    const hasAvailableSubtasks = hasVariableSubtasks && selectedProject!.subtasks.length > 0;
    const chosenSubtasks = hasAvailableSubtasks ? selectedProject!.subtasks.filter((subtask) => selectedSubtaskIds.includes(subtask.id)) : [];
    const isProject = assignmentType === 'official';
    const selectedProjectName = selectedProject
      ? `${selectedProject.number ? `${selectedProject.number}. ` : ''}${selectedProject.name}`
      : '';
    const selectedSubtasksArray = chosenSubtasks.map(labelForSubtask);
    const taskData = {
      title: isProject ? selectedProjectName : title.trim(),
      description: isProject ? (notes.trim() || selectedProjectName) : description.trim(),
      client_id: clientId,
      assigned_to: assigneeId,
      created_by: user.id,
      due_date: dueDate,
      priority: priority || 'normal',
      estimated_hours: hours ? Number(hours) : null,
      notes: notes.trim() || '',
      subtasks: isProject ? selectedSubtasksArray : [],
      status: 'pending',
    };
    setSaving(true);
    const { error: insertError } = await supabase.from('tasks').insert(taskData);
    setSaving(false);
    if (insertError) {
      setError(`No se pudo crear la asignación: ${insertError.message}`);
      return;
    }
    clearAssignmentDraft();
    setTitle(''); setDescription(''); setNotes(''); setProjectKey(''); setSelectedSubtaskIds([]);
    setClientId(''); setAssigneeId(''); setPriority('normal'); setHours(''); setDueDate('');
    setNotice('Asignación creada correctamente.');
    await load();
  }

  async function reassign(task: Task, nextAssigneeId: string) {
    if (!nextAssigneeId || nextAssigneeId === task.assigned_to || saving) return;
    setSaving(true); setError(null); setNotice(null);
    const { error: updateError } = await supabase.from('tasks').update({ assigned_to: nextAssigneeId }).eq('id', task.id);
    setSaving(false);
    if (updateError) {
      setError(`No se pudo reasignar el trabajo: ${updateError.message}`);
      return;
    }
    setNotice(`Trabajo reasignado a ${names[nextAssigneeId] ?? 'el contador seleccionado'}.`);
    await load();
  }

  const formatDateTime = (value: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

  return <div className="mx-auto max-w-7xl space-y-6">
    <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
      <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Administrador · Supervisor</p>
      <h2 className="mt-1 text-2xl font-bold text-slate-900">Asignación de carga de trabajo</h2>
      <p className="mt-1 text-sm text-slate-500">Asigna proyectos oficiales o tareas libres y consulta la carga activa del equipo.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      {loading ? <p className="mt-5 text-sm text-slate-500">Cargando equipo y asignaciones…</p> : <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{workloads.map((member) => <li key={member.id} className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-900">{member.full_name}</h3><p className="mt-1 text-sm text-slate-500">{member.count} tareas activas · {member.hours} h estimadas</p></li>)}</ul>}
    </section>

    <section className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <form onSubmit={(event) => void createAssignment(event)} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-bold text-slate-900">Nueva asignación</h2>
        <label className="block text-sm font-medium text-slate-700">Tipo de asignación<select value={assignmentType} onChange={(event) => changeAssignmentType(event.target.value as 'official' | 'free')} className={fieldClass}><option value="official">Asignar proyecto oficial</option><option value="free">Asignar tarea libre</option></select></label>
        {assignmentType === 'official' ? <>
          <label className="block text-sm font-medium text-slate-700">Proyecto oficial<select required value={projectKey} onChange={(event) => { setProjectKey(event.target.value); setSelectedSubtaskIds([]); }} className={fieldClass}><option value="">Selecciona un proyecto</option>{officialProjects.map((project) => <option key={project.key} value={project.key}>{project.number ? `${project.number}. ` : ''}{project.name}</option>)}</select></label>
          {hasVariableSubtasks && <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-2 text-sm font-semibold text-slate-800">Variables / subactividades</legend>{selectedProject?.subtasks.length ? <div className="max-h-48 space-y-1 overflow-y-auto">{selectedProject.subtasks.map((subtask) => <label key={subtask.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedSubtaskIds.includes(subtask.id)} onChange={(event) => setSelectedSubtaskIds((current) => event.target.checked ? [...current, subtask.id] : current.filter((id) => id !== subtask.id))} className="rounded border-slate-300 text-blue-600" /><span>{labelForSubtask(subtask)}</span></label>)}</div> : <p className="px-2 py-1 text-sm text-amber-700">El catálogo de subactividades no está disponible; se asignará el proyecto sin variables.</p>}</fieldset>}
        </> : <>
          <label className="block text-sm font-medium text-slate-700">Título<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} /></label>
          <label className="block text-sm font-medium text-slate-700">Descripción detallada<textarea required rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className={fieldClass} /></label>
        </>}
        <label className="block text-sm font-medium text-slate-700">Cliente<select required value={clientId} onChange={(event) => setClientId(event.target.value)} className={fieldClass}><option value="">Selecciona un cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label className="block text-sm font-medium text-slate-700">Contador responsable<select required value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className={fieldClass}><option value="">Selecciona un contador</option>{accountants.map((accountant) => <option key={accountant.id} value={accountant.id}>{accountant.full_name}</option>)}</select></label>
        <label className="block text-sm font-medium text-slate-700">Categoría / semáforo<select required value={priority} onChange={(event) => setPriority(event.target.value as 'urgente' | 'media' | 'normal')} className={fieldClass}><option value="urgente">🔴 Urgente</option><option value="media">🟡 Prioridad media</option><option value="normal">🟢 Normal</option></select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-700">Tiempo estimado (horas)<input required type="number" min="0.25" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} className={fieldClass} /></label><label className="block text-sm font-medium text-slate-700">Fecha de vencimiento<input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={fieldClass} /></label></div>
        <label className="block text-sm font-medium text-slate-700">Notas (opcional)<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className={fieldClass} /></label>
        <button type="submit" disabled={saving || loading || !user} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Guardando…' : 'Crear y asignar'}</button>
      </form>

      <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-bold text-slate-900">Registro histórico de asignaciones</h2>
        <p className="mt-1 text-sm text-slate-500">Fecha de creación y contador asignado de cada tarea.</p>
        {loading ? <p className="mt-4 text-sm text-slate-500">Cargando historial…</p> : tasks.length === 0 ? <p className="mt-4 text-sm text-slate-500">Todavía no hay asignaciones registradas.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-2 py-3">Creado por</th><th className="px-2 py-3">Tipo / actividad</th><th className="px-2 py-3">Cliente</th><th className="px-2 py-3">Contador asignado</th><th className="px-2 py-3">Fecha y hora</th><th className="px-2 py-3">Acciones</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id} className="border-b border-slate-100 align-top"><td className="px-2 py-3">{task.created_by ? names[task.created_by] ?? 'Usuario' : '—'}</td><td className="max-w-64 px-2 py-3"><span className="block truncate font-medium text-slate-800">{task.project_id ? projectNames[task.project_id] ?? task.title : task.title}</span>{task.subtasks?.length ? <span className="text-xs text-slate-500">{task.subtasks.join(', ')}</span> : task.project_subtask_id && <span className="text-xs text-slate-500">{subtaskNames[task.project_subtask_id] ?? ''}</span>}</td><td className="px-2 py-3">{task.client_id ? clientNames[task.client_id] ?? 'Cliente' : '—'}</td><td className="px-2 py-3">{task.assigned_to ? names[task.assigned_to] ?? 'Usuario' : 'Sin asignar'}</td><td className="whitespace-nowrap px-2 py-3">{task.created_at ? formatDateTime(task.created_at) : '—'}</td><td className="px-2 py-3"><div className="flex flex-col gap-2"><button type="button" onClick={() => setDetail({ task, subtaskName: task.subtasks?.join(', ') || (task.project_subtask_id ? subtaskNames[task.project_subtask_id] ?? null : null) })} className="text-left font-medium text-blue-700 hover:underline">Ver detalles</button><select aria-label={`Reasignar ${task.title}`} value={task.assigned_to ?? ''} disabled={saving} onChange={(event) => void reassign(task, event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"><option value="" disabled>Reasignar a…</option>{accountants.map((accountant) => <option key={accountant.id} value={accountant.id}>{accountant.full_name}</option>)}</select></div></td></tr>)}</tbody></table></div>}
      </section>
    </section>

    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section role="dialog" aria-modal="true" aria-labelledby="assignment-detail-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><h2 id="assignment-detail-title" className="text-xl font-bold text-slate-900">Detalle de asignación</h2><button type="button" onClick={() => setDetail(null)} aria-label="Cerrar detalles" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">Cerrar</button></div><dl className="mt-5 grid gap-4 sm:grid-cols-2">{[
      ['Actividad', detail.task.title], ['Cliente', detail.task.client_id ? clientNames[detail.task.client_id] ?? 'Cliente' : 'Sin cliente'],
      ['Contador asignado', detail.task.assigned_to ? names[detail.task.assigned_to] ?? 'Usuario' : 'Sin asignar'],
      ['Creado por', detail.task.created_by ? names[detail.task.created_by] ?? 'Usuario' : 'Sin registro'],
      ['Creado', detail.task.created_at ? formatDateTime(detail.task.created_at) : 'Sin fecha'],
      ['Vencimiento', detail.task.due_date ?? 'Sin fecha'], ['Tiempo estimado', `${detail.task.estimated_hours ?? 0} horas`],
      ['Subactividad / variable', detail.subtaskName ?? 'No aplica'], ['Estado', detail.task.status],
    ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{value}</dd></div>)}</dl>{detail.task.description && <div className="mt-5"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Descripción y notas</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{detail.task.description}</p></div>}{detail.task.notes && <div className="mt-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{detail.task.notes}</p></div>}<button type="button" onClick={() => setDetail(null)} className="mt-6 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">Listo</button></section></div>}
  </div>;
}
