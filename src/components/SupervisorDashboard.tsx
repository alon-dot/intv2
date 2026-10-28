import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import CreateUserModal from './CreateUserModal';
import { DashboardShell, Panel, StatusBadge, type Profile, type Task } from './DashboardShared';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useFormDraft } from '../hooks/useFormDraft';
import { logActivity } from '../lib/activityLogs';

type SupervisorAssignmentDraft = {
  title: string; description: string; assignee: string; assignmentType: 'independent' | 'official';
  clientId: string; officialProjectKey: string; projectId: string; categoryId: string;
  serviceId: string; estimatedHours: string; dueDate: string; selectedSubtaskIds: string[];
};

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const [team, setTeam] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [projectSubtaskRows, setProjectSubtaskRows] = useState<{ id: string; project_id?: string | null; project_name?: string; project_number?: string | number; name?: string; title?: string; subtask_name?: string; label?: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name?: string; service_name?: string; title?: string; label?: string }[]>([]);
  const [selectedSubtaskIds, setSelectedSubtaskIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assignmentType, setAssignmentType] = useState<'independent' | 'official'>('independent');
  const [clientId, setClientId] = useState('');
  const [officialProjectKey, setOfficialProjectKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const assignmentDraft = useMemo<SupervisorAssignmentDraft>(() => ({ title, description, assignee, assignmentType, clientId, officialProjectKey, projectId, categoryId, serviceId, estimatedHours, dueDate, selectedSubtaskIds }), [title, description, assignee, assignmentType, clientId, officialProjectKey, projectId, categoryId, serviceId, estimatedHours, dueDate, selectedSubtaskIds]);
  const restoreAssignmentDraft = useCallback((draft: Partial<SupervisorAssignmentDraft> | null) => {
    setTitle(draft?.title ?? ''); setDescription(draft?.description ?? ''); setAssignee(draft?.assignee ?? '');
    setAssignmentType(draft?.assignmentType === 'official' ? 'official' : 'independent');
    setClientId(draft?.clientId ?? ''); setOfficialProjectKey(draft?.officialProjectKey ?? ''); setProjectId(draft?.projectId ?? '');
    setCategoryId(draft?.categoryId ?? ''); setServiceId(draft?.serviceId ?? '');
    setEstimatedHours(draft?.estimatedHours ?? ''); setDueDate(draft?.dueDate ?? '');
    setSelectedSubtaskIds(Array.isArray(draft?.selectedSubtaskIds) ? draft.selectedSubtaskIds.filter((id): id is string => typeof id === 'string') : []);
  }, []);
  const clearAssignmentDraft = useFormDraft(user ? `supervisor-assignment-draft:${user.id}` : null, assignmentDraft, restoreAssignmentDraft);

  const officialProjects = useMemo(() => {
    const grouped = new Map<string, { key: string; name: string; number: string; projectIds: Set<string>; subtasks: typeof projectSubtaskRows }>();
    projectSubtaskRows.forEach((row) => {
      const name = String(row.project_name ?? '').trim();
      const number = String(row.project_number ?? '').trim();
      if (!name && !number) return;
      const key = `${number}::${name}`;
      const group = grouped.get(key) ?? { key, name, number, projectIds: new Set<string>(), subtasks: [] };
      if (row.project_id) group.projectIds.add(row.project_id);
      group.subtasks.push(row);
      grouped.set(key, group);
    });
    return Array.from(grouped.values()).sort((a, b) => Number(a.number) - Number(b.number) || a.name.localeCompare(b.name, 'es-MX'));
  }, [projectSubtaskRows]);
  const selectedOfficialProject = officialProjects.find((project) => project.key === officialProjectKey) ?? null;
  const selectedProjectId = selectedOfficialProject ? Array.from(selectedOfficialProject.projectIds)[0] ?? '' : '';
  const subtasks = selectedOfficialProject?.subtasks ?? [];

  useEffect(() => {
    setSelectedSubtaskIds([]);
    setProjectId(selectedProjectId);
  }, [officialProjectKey, selectedProjectId]);

  useEffect(() => {
    let active = true;
    async function loadTaskOptions() {
      const [clientResult, catalogResult, categoryResult, serviceResult] = await Promise.all([
        supabase.from('clients').select('id,name').order('name'),
        supabase.from('project_subtasks').select('*'),
        supabase.from('task_categories').select('id,name').order('name'),
        supabase.from('service_catalogs').select('*'),
      ]);
      if (!active) return;
      const optionsError = clientResult.error ?? catalogResult.error ?? categoryResult.error ?? serviceResult.error;
      if (optionsError) setError(`No se pudieron cargar clientes, proyectos o categorías: ${optionsError.message}`);
      setClients((clientResult.data ?? []) as { id: string; name: string }[]);
      setProjectSubtaskRows((catalogResult.data ?? []) as typeof projectSubtaskRows);
      setCategories((categoryResult.data ?? []) as { id: string; name: string }[]);
      setServices((serviceResult.data ?? []) as { id: string; name?: string; service_name?: string; title?: string; label?: string }[]);
    }
    void loadTaskOptions();
    return () => { active = false; };
  }, []);



  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    const { data: members, error: memberError } = await supabase.from('profiles').select('id,full_name,role').order('full_name');
    if (memberError) {
      setError(memberError.message);
      setTeam([]);
      setTasks([]);
      return;
    }
    const accountants = (members ?? []).filter((member) => ['contador', 'accountant'].includes(String(member.role).trim().toLowerCase()));
    setTeam(accountants);
    if (accountants.length === 0) {
      setTasks([]);
      return;
    }
    const { data, error: taskError } = await supabase.from('tasks').select('*').in('assigned_to', accountants.map((member) => member.id)).order('created_at', { ascending: false });
    setTasks(data ?? []);
    setError(taskError?.message ?? null);
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!team.some((member) => member.id === assignee)) setAssignee(team[0]?.id ?? '');
  }, [team, assignee]);

  const names = useMemo(() => Object.fromEntries(team.map((member) => [member.id, member.full_name])), [team]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!user || !assignee) {
      setError('Selecciona un contador para asignar el trabajo.');
      return;
    }
    if (assignmentType === 'official' && (!clientId || !selectedOfficialProject)) {
      setError('Selecciona el cliente y uno de los proyectos oficiales.');
      return;
    }
    setSubmitting(true);
    if (assignmentType === 'official' && selectedSubtaskIds.length === 0) {
      setError('Selecciona al menos una subactividad del proyecto.');
      setSubmitting(false);
      return;
    }
    const selectedSubtasks = subtasks.filter((subtask) => selectedSubtaskIds.includes(subtask.id));
    const taskRows = (assignmentType === 'official' ? selectedSubtasks : [null]).map((subtask) => ({
      title: subtask ? `${selectedOfficialProject?.number ? `${selectedOfficialProject.number}. ` : ''}${selectedOfficialProject?.name} - ${subtask.name ?? subtask.subtask_name ?? subtask.title ?? subtask.label ?? subtask.id}` : title.trim(),
      project_subtask_id: subtask?.id ?? null,
      description: description.trim() || null,
      status: 'pending',
      project_id: assignmentType === 'official' ? projectId || null : null,
      ...(assignmentType === 'official' ? { client_id: clientId } : {}),
      category_id: categoryId || null,
      service_catalog_id: serviceId || null,
      estimated_hours: Number(estimatedHours),
      due_date: dueDate,
      assigned_to: assignee,
      created_by: user.id,
    }));
    const { error: insertError } = await supabase.from('tasks').insert(taskRows);
    setSubmitting(false);
    if (insertError) {
      setError(`No se pudo crear la tarea: ${insertError.message}`);
      return;
    }
    await Promise.all(taskRows.map((task) => logActivity(user.id, 'task_assigned', `Asignó la tarea ${task.title} a ${names[assignee] ?? 'el contador seleccionado'}`)));
    clearAssignmentDraft();
    setTitle('');
    setDescription('');
    setProjectId(''); setClientId(''); setOfficialProjectKey(''); setCategoryId(''); setServiceId(''); setSelectedSubtaskIds([]); setEstimatedHours(''); setDueDate('');
    setNotice('Tarea creada y asignada.');
    await load();
  }

  return (
    <DashboardShell title="Panel de supervisión">
      <div className="mb-6 flex justify-end">
        <button type="button" onClick={() => setShowCreateUser(true)} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700">Dar de alta contador</button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Avance del equipo (${team.length} contadores)`}>
          {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
          {team.length === 0 ? <p className="text-sm text-slate-500">Aún no tienes contadores asignados.</p> : <ul className="space-y-3">{team.map((member) => {
            const memberTasks = tasks.filter((task) => task.assigned_to === member.id);
            const completed = memberTasks.filter((task) => task.status === 'completed').length;
            return <li key={member.id} className="rounded-xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-800">{member.full_name}</p><span className="text-xs text-slate-500">{completed}/{memberTasks.length} completadas</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${memberTasks.length ? completed / memberTasks.length * 100 : 0}%` }} /></div></li>;
          })}</ul>}
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Crear y asignar tarea">
          <form onSubmit={(event) => void createTask(event)} className="space-y-4">
            <div><label htmlFor="task-title" className="mb-1.5 block text-sm font-medium text-slate-700">Título</label><input id="task-title" required={assignmentType === 'independent'} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /></div>
            <div><label htmlFor="task-description" className="mb-1.5 block text-sm font-medium text-slate-700">Descripción</label><textarea id="task-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /></div>
            <div><label htmlFor="assignment-type" className="mb-1.5 block text-sm font-medium text-slate-700">Tipo de asignaci?n</label><select id="assignment-type" value={assignmentType} onChange={(event) => { setAssignmentType(event.target.value as 'independent' | 'official'); setProjectId(''); setClientId(''); setOfficialProjectKey(''); setSelectedSubtaskIds([]); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="independent">Tarea independiente</option><option value="official">Asignar proyecto oficial</option></select></div>
            {assignmentType === 'official' && <>
              <div><label htmlFor="official-client" className="mb-1.5 block text-sm font-medium text-slate-700">Cliente</label><select id="official-client" required value={clientId} onChange={(event) => setClientId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Selecciona un cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
              <div><label htmlFor="official-project" className="mb-1.5 block text-sm font-medium text-slate-700">Proyecto oficial</label><select id="official-project" required value={officialProjectKey} onChange={(event) => setOfficialProjectKey(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Selecciona un proyecto oficial</option>{officialProjects.map((project) => <option key={project.key} value={project.key}>{project.number ? `${project.number}. ` : ''}{project.name}</option>)}</select></div>
              {selectedOfficialProject && <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-2 text-sm font-semibold text-slate-800">Subactividades para asignar</legend><div className="max-h-48 space-y-1 overflow-y-auto">{subtasks.map((subtask) => { const label = subtask.name ?? subtask.subtask_name ?? subtask.title ?? subtask.label ?? subtask.id; return <label key={subtask.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedSubtaskIds.includes(subtask.id)} onChange={(event) => setSelectedSubtaskIds((current) => event.target.checked ? [...current, subtask.id] : current.filter((id) => id !== subtask.id))} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span>{label}</span></label>; })}</div></fieldset>}
            </>}
            <div><label htmlFor="task-category" className="mb-1.5 block text-sm font-medium text-slate-700">Categoría</label><select id="task-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Selecciona una categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="task-due-date" className="mb-1.5 block text-sm font-medium text-slate-700">Fecha límite</label><input id="task-due-date" required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /></div><div><label htmlFor="task-estimated-hours" className="mb-1.5 block text-sm font-medium text-slate-700">Horas estimadas</label><input id="task-estimated-hours" required type="number" min="0.25" step="0.25" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /></div></div>
            <div><label htmlFor="task-service" className="mb-1.5 block text-sm font-medium text-slate-700">Servicio fiscal</label><select id="task-service" value={serviceId} onChange={(event) => setServiceId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Sin servicio</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name ?? service.service_name ?? service.title ?? service.label ?? service.id}</option>)}</select></div>
            <div><label htmlFor="task-assignee" className="mb-1.5 block text-sm font-medium text-slate-700">Contador asignado</label><select id="task-assignee" required value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={team.length === 0} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100"><option value="">Selecciona un contador</option>{team.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></div>
            {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={submitting || team.length === 0} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Guardando…' : 'Crear tarea'}</button>
          </form>
        </Panel>
        <Panel title={`Tareas del equipo (${tasks.length})`}>
          {tasks.length === 0 ? <p className="text-sm text-slate-500">Tu equipo todavía no tiene tareas.</p> : <ul className="divide-y divide-slate-100">{tasks.map((task) => <li key={task.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-semibold text-slate-800">{task.title}</p><p className="text-xs text-slate-500">{task.assigned_to ? names[task.assigned_to] : ''}</p></div><StatusBadge status={task.status} /></li>)}</ul>}
        </Panel>
      </div>
      {showCreateUser && <CreateUserModal onClose={() => setShowCreateUser(false)} onCreated={() => void load()} />}
    </DashboardShell>
  );
}
