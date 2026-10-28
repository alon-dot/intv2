import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useFormDraft } from '../hooks/useFormDraft';
import { logActivity } from '../lib/activityLogs';

type Client = { id: string; name: string; tax_id: string | null; tax_regime?: string | string[] | null; tax_regimes?: string[] | null; contact_email: string | null; phone: string | null; [key: string]: any };
type Project = { id: string; client_id: string; name: string };
type Task = { id: string; title: string; status: string; project_id: string; assigned_to: string | null; created_at: string; due_date: string | null };
type TimeEntry = { id: string; task_id: string; user_id: string; start_time: string | null; created_at: string; duration_minutes: number; is_manual: boolean; justification: string | null };
type TimelineEvent = { id: string; date: string | null; type: 'task' | 'time'; task: Task; entry?: TimeEntry; actorName: string };
type ClientDraft = { clientName: string; taxId: string; taxRegime: string; contactEmail: string; phone: string; clientFields: Record<string, string>; editingClientId: string | null; showClientForm: boolean };

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) return `${remaining} min`;
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
}

function formatDate(date: string | null) {
  if (!date) return 'Fecha no disponible';
  return new Date(date).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusLabel(status: string) {
  switch (status.toLowerCase()) {
    case 'completed': return 'Completada';
    case 'in_progress': return 'En progreso';
    case 'review': return 'En revisión';
    default: return 'Pendiente';
  }
}

function parseTaxRegimes(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => parseTaxRegimes(item));
  if (typeof value !== 'string') return value == null ? [] : [String(value)];
  const text = value.trim();
  if (!text) return [];

  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'string' || parsed !== text) return parseTaxRegimes(parsed);
  } catch {
    // Older rows may contain plain text or malformed JSON; normalize below.
  }

  return text
    .replace(/^\s*\[|\]\s*$/g, '')
    .split(',')
    .map((item) => item.replace(/\\?"/g, '').replace(/^\s*['"]|['"]\s*$/g, '').trim())
    .filter(Boolean);
}

function formatTaxRegime(value: unknown) {
  return parseTaxRegimes(value).join(', ') || 'No registrado';
}

export default function ClientHistory() {
  const { role, user } = useAuth();
  const canManageClients = ['admin', 'supervisor', 'contador'].includes(role ?? '');
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientName, setClientName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxRegime, setTaxRegime] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [accountants, setAccountants] = useState<{ id: string; full_name: string }[]>([]);
  const [clientFields, setClientFields] = useState<Record<string, string>>({});
  const [draftEditingClientId, setDraftEditingClientId] = useState<string | null>(null);
  const clientFieldNames = ['industry','person_type','payment_method','assigned_accountant_id','postal_code','street','exterior_number','interior_number','neighborhood','city','state','has_employees','payroll_frequency','primary_contact_name','primary_contact_phone','primary_contact_email','primary_contact_title','payment_contact_name','payment_contact_phone','payment_contact_email','payment_contact_title'];
  const regimes = ['601 - General de Ley Personas Morales','603 - Personas Morales con Fines no Lucrativos','605 - Sueldos y Salarios e Ingresos Asimilados a Salarios','606 - Arrendamiento','607 - Enajenación o Adquisición de Bienes','608 - Demás ingresos','610 - Residentes en el Extranjero sin Establecimiento Permanente en México','611 - Ingresos por Dividendos','612 - Personas Físicas con Actividades Empresariales y Profesionales','614 - Ingresos por intereses','615 - Ingresos por obtención de premios','616 - Sin obligaciones fiscales','620 - Sociedades Cooperativas de Producción','621 - Incorporación Fiscal','622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras','623 - Opcional para Grupos de Sociedades','624 - Coordinados','625 - Plataformas Tecnológicas','626 - Régimen Simplificado de Confianza'];

  const clientDraft = useMemo<ClientDraft>(() => ({ clientName, taxId, taxRegime, contactEmail, phone, clientFields, editingClientId: editingClient?.id ?? draftEditingClientId, showClientForm }), [clientName, taxId, taxRegime, contactEmail, phone, clientFields, editingClient, draftEditingClientId, showClientForm]);
  const restoreClientDraft = useCallback((draft: Partial<ClientDraft> | null) => {
    setClientName(draft?.clientName ?? ''); setTaxId(draft?.taxId ?? ''); setTaxRegime(draft?.taxRegime ?? '');
    setContactEmail(draft?.contactEmail ?? ''); setPhone(draft?.phone ?? '');
    setClientFields(draft?.clientFields && typeof draft.clientFields === 'object' ? draft.clientFields : {});
    setDraftEditingClientId(draft?.editingClientId ?? null);
    const hasSavedClientFields = Boolean(draft && (draft.showClientForm || draft.clientName || draft.taxId || draft.taxRegime || draft.contactEmail || draft.phone || Object.values(draft.clientFields ?? {}).some(Boolean)));
    setShowClientForm(hasSavedClientFields);
  }, []);
  const clearClientDraft = useFormDraft(user ? `client-form-draft:${user.id}` : null, clientDraft, restoreClientDraft);

  useEffect(() => {
    if (!draftEditingClientId || !clients.length) return;
    setEditingClient(clients.find((client) => client.id === draftEditingClientId) ?? null);
  }, [clients, draftEditingClientId]);

  useEffect(() => {
    let active = true;
    void supabase.from('profiles').select('id,full_name,role').then(({ data }) => {
      if (active) setAccountants((data ?? []).filter((person) => ['contador','accountant'].includes(String(person.role).toLowerCase())).map((person) => ({ id: person.id, full_name: person.full_name })));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadDirectory() {
      const [clientResult, projectResult] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('projects').select('id,client_id,name').order('name'),
      ]);
      if (!active) return;
      const queryError = clientResult.error ?? projectResult.error;
      if (queryError) setError(`No se pudo cargar el directorio de clientes: ${queryError.message}`);
      const loadedClients = (clientResult.data ?? []) as Client[];
      setClients(loadedClients);
      setProjects((projectResult.data ?? []) as Project[]);
      setSelectedId((current) => current || loadedClients[0]?.id || '');
      setLoadingClients(false);
    }
    void loadDirectory();
    return () => { active = false; };
  }, [refreshKey]);

  function openClientForm(client?: Client) {
    setShowClientForm(true);
    setEditingClient(client ?? null);
    setClientName(client?.name ?? '');
    setTaxId(client?.tax_id ?? '');
    setTaxRegime(parseTaxRegimes(client?.tax_regime ?? client?.tax_regimes).join(', '));
    setContactEmail(client?.contact_email ?? '');
    setPhone(client?.phone ?? '');
    const fieldAliases: Record<string, string> = {
      industry: 'giro',
      payroll_frequency: 'payroll_type',
      primary_contact_name: 'main_contact_name',
      primary_contact_phone: 'main_contact_phone',
      primary_contact_email: 'main_contact_email',
      primary_contact_title: 'main_contact_position',
      payment_contact_title: 'payment_contact_position',
    };
    setClientFields(Object.fromEntries(clientFieldNames.map((field) => [field, String(client?.[field] ?? client?.[fieldAliases[field]] ?? '')])));
    setError(null); setNotice(null);
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingClient) return;
    setSavingClient(true); setError(null); setNotice(null);
    const hasEmployees = clientFields.has_employees === 'true';
    const giro = clientFields.industry ?? '';
    const clientData = {
      name: clientName.trim(),
      payment_method: clientFields.payment_method ?? '',
      person_type: clientFields.person_type ?? '',
      assigned_accountant_id: clientFields.assigned_accountant_id || null,
      business_name: clientName.trim(),
      giro,
      industry: giro,
      line_of_business: giro,
      phone: phone.trim(),
      tax_regime: parseTaxRegimes(taxRegime),
      postal_code: clientFields.postal_code ?? '',
      email: contactEmail.trim(),
      street: clientFields.street ?? '',
      exterior_number: clientFields.exterior_number ?? '',
      interior_number: clientFields.interior_number ?? '',
      neighborhood: clientFields.neighborhood ?? '',
      city: clientFields.city ?? '',
      state: clientFields.state ?? '',
      has_employees: Boolean(hasEmployees),
      has_workers: Boolean(hasEmployees),
      payroll_type: clientFields.payroll_frequency || null,
      main_contact_name: clientFields.primary_contact_name ?? '',
      main_contact_phone: clientFields.primary_contact_phone ?? '',
      main_contact_email: clientFields.primary_contact_email ?? '',
      main_contact_position: clientFields.primary_contact_title ?? '',
      payment_contact_name: clientFields.payment_contact_name ?? '',
      payment_contact_phone: clientFields.payment_contact_phone ?? '',
      payment_contact_email: clientFields.payment_contact_email ?? '',
      payment_contact_position: clientFields.payment_contact_title ?? '',
    };
    const result = editingClient
      ? await supabase.from('clients').update(clientData).eq('id', editingClient.id)
      : await supabase.from('clients').insert(clientData);
    setSavingClient(false);
    if (result.error) { setError(`No se pudo guardar el cliente: ${result.error.message}`); return; }
    if (!editingClient) await logActivity(user?.id, 'client_created', `Creó el cliente: ${clientName.trim()}`);
    clearClientDraft();
    setSelectedId(editingClient?.id ?? '');
    setEditingClient(null);
    setShowClientForm(false);
    setNotice(editingClient ? 'Cliente actualizado.' : 'Cliente creado.');
    setRefreshKey((value) => value + 1);
  }

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      if (!selectedId) { setTasks([]); setEntries([]); setLoadingHistory(false); return; }
      setLoadingHistory(true); setError(null);
      const projectIds = projects.filter((project) => project.client_id === selectedId).map((project) => project.id);
      if (projectIds.length === 0) { setTasks([]); setEntries([]); setNames({}); setLoadingHistory(false); return; }
      const { data: taskData, error: taskError } = await supabase.from('tasks')
        .select('id,title,status,project_id,assigned_to,created_at,due_date')
        .in('project_id', projectIds).order('created_at', { ascending: false });
      if (!active) return;
      if (taskError) { setError(`No se pudieron cargar las tareas del cliente: ${taskError.message}`); setTasks([]); setEntries([]); setLoadingHistory(false); return; }
      const taskRows = (taskData ?? []) as Task[];
      setTasks(taskRows);
      const taskIds = taskRows.map((task) => task.id);
      if (!taskIds.length) { setEntries([]); setNames({}); setLoadingHistory(false); return; }
      const { data: entryData, error: entryError } = await supabase.from('time_entries')
        .select('id,task_id,user_id,start_time,created_at,duration_minutes,is_manual,justification')
        .in('task_id', taskIds).order('start_time', { ascending: false, nullsFirst: false });
      if (!active) return;
      if (entryError) setError(`No se pudieron cargar los registros de tiempo: ${entryError.message}`);
      const entryRows = (entryData ?? []) as TimeEntry[];
      setEntries(entryRows);
      const actorIds = [...new Set([...taskRows.map((task) => task.assigned_to), ...entryRows.map((entry) => entry.user_id)].filter((id): id is string => Boolean(id)))];
      if (actorIds.length) {
        const { data: profileData, error: profileError } = await supabase.from('profiles').select('id,full_name').in('id', actorIds);
        if (!active) return;
        if (profileError) setError((current) => current ?? `No se pudieron cargar los nombres del equipo: ${profileError.message}`);
        setNames(Object.fromEntries((profileData ?? []).map((profile) => [profile.id, profile.full_name])));
      } else setNames({});
      setLoadingHistory(false);
    }
    void loadHistory();
    return () => { active = false; };
  }, [projects, selectedId]);

  const filteredClients = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('es-MX');
    if (!normalized) return clients;
    return clients.filter((client) => client.name.toLocaleLowerCase('es-MX').includes(normalized) || (client.tax_id ?? '').toLocaleLowerCase('es-MX').includes(normalized));
  }, [clients, search]);
  const selectedClient = clients.find((client) => client.id === selectedId) ?? null;
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const completedTasks = tasks.filter((task) => task.status.toLowerCase() === 'completed').length;
  const pendingTasks = tasks.length - completedTasks;
  const totalMinutes = entries.reduce((sum, entry) => sum + (Number(entry.duration_minutes) || 0), 0);
  const timeline = useMemo<TimelineEvent[]>(() => [
    ...tasks.map((task): TimelineEvent => ({ id: `task-${task.id}`, date: task.created_at, type: 'task', task, actorName: task.assigned_to ? names[task.assigned_to] ?? 'Contador' : 'Sin asignar' })),
    ...entries.flatMap((entry) => {
      const task = taskById.get(entry.task_id);
      return task ? [{ id: `entry-${entry.id}`, date: entry.start_time ?? entry.created_at, type: 'time' as const, task, entry, actorName: names[entry.user_id] ?? 'Contador' }] : [];
    }),
  ].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()), [entries, names, taskById, tasks]);

  return <div className="mx-auto max-w-7xl space-y-6">
    <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Cartera de clientes</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Expediente e historial</h2><p className="mt-1 text-sm text-slate-500">Busca por nombre o RFC y selecciona un cliente para consultar su actividad.</p></div>{canManageClients && <button type="button" onClick={() => openClientForm()} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Crear cliente</button>}</div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]">
        <div><label htmlFor="client-search" className="mb-1 block text-sm font-medium text-slate-700">Buscar cliente</label><input id="client-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o RFC" className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-slate-200" aria-label="Lista de clientes">{loadingClients ? <p className="p-4 text-sm text-slate-500">Cargando clientes…</p> : filteredClients.length === 0 ? <p className="p-4 text-sm text-slate-500">No se encontraron clientes.</p> : <ul className="divide-y divide-slate-100">{filteredClients.map((client) => <li key={client.id}><button type="button" onClick={() => setSelectedId(client.id)} aria-pressed={selectedId === client.id} className={`w-full px-4 py-3 text-left ${selectedId === client.id ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'}`}><span className="block font-semibold">{client.name}</span><span className="mt-0.5 block text-xs text-slate-500">RFC: {client.tax_id || 'No registrado'}</span></button></li>)}</ul>}</div>
        </div>
        {selectedClient ? <div className="rounded-xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Información general</p><h3 className="mt-1 text-xl font-bold text-slate-900">{selectedClient.name}</h3></div><div className="flex items-center gap-2"><span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{formatMinutes(totalMinutes)} acumuladas</span>{canManageClients && <button type="button" onClick={() => openClientForm(selectedClient)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Editar cliente</button>}</div></div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">RFC</dt><dd className="font-medium text-slate-800">{selectedClient.tax_id || 'No registrado'}</dd></div><div><dt className="text-slate-500">Régimen fiscal</dt><dd className="font-medium text-slate-800">{formatTaxRegime(selectedClient.tax_regime ?? selectedClient.tax_regimes)}</dd></div><div><dt className="text-slate-500">Email de contacto</dt><dd className="font-medium text-slate-800">{selectedClient.contact_email || 'No registrado'}</dd></div><div><dt className="text-slate-500">Teléfono</dt><dd className="font-medium text-slate-800">{selectedClient.phone || 'No registrado'}</dd></div></dl>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">{[['Giro',selectedClient.industry],['Tipo de persona',selectedClient.person_type],['Forma de pago',selectedClient.payment_method],['Contador asignado',accountants.find((person) => person.id === selectedClient.assigned_accountant_id)?.full_name],['Domicilio', [selectedClient.street,selectedClient.exterior_number,selectedClient.interior_number,selectedClient.neighborhood,selectedClient.postal_code,selectedClient.city,selectedClient.state].filter(Boolean).join(', ')],['Nómina',selectedClient.has_employees ? `Sí \u00b7 ${selectedClient.payroll_frequency ?? ''}` : selectedClient.has_employees === false ? 'Sin trabajadores' : null],['Contacto principal', [selectedClient.primary_contact_name,selectedClient.primary_contact_title,selectedClient.primary_contact_phone,selectedClient.primary_contact_email].filter(Boolean).join(' \u00b7 ')],['Contacto de pagos', [selectedClient.payment_contact_name,selectedClient.payment_contact_title,selectedClient.payment_contact_phone,selectedClient.payment_contact_email].filter(Boolean).join(' \u00b7 ') ]].map(([label,value]) => <div key={String(label)}><dt className="text-slate-500">{label}</dt><dd className="font-medium text-slate-800">{value || 'No registrado'}</dd></div>)}</dl>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Tareas completadas</p><p className="mt-1 text-2xl font-bold text-emerald-800">{completedTasks}</p></div><div className="rounded-lg bg-amber-50 p-3"><p className="text-xs text-amber-700">Pendientes / en proceso</p><p className="mt-1 text-2xl font-bold text-amber-800">{pendingTasks}</p></div></div>
        </div> : <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{loadingClients ? 'Cargando expediente…' : 'Selecciona un cliente para abrir su expediente.'}</div>}
      </div>
    </section>

    {selectedClient && <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wider text-slate-400">Actividad del cliente</p><h2 className="mt-1 text-xl font-bold text-slate-900">Línea de tiempo</h2></div><p className="text-sm text-slate-500">{timeline.length} registros · {tasks.length} tareas</p></div>
      {loadingHistory ? <p className="mt-5 text-sm text-slate-500">Cargando historial…</p> : timeline.length === 0 ? <p className="mt-5 text-sm text-slate-500">Este cliente aún no tiene tareas ni registros de tiempo.</p> : <ol className="mt-5 divide-y divide-slate-100">{timeline.map((event) => <li key={event.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{event.task.title}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${event.type === 'time' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{event.type === 'time' ? 'Registro de tiempo' : `Tarea · ${statusLabel(event.task.status)}`}</span></div><p className="mt-1 text-sm text-slate-500">{formatDate(event.date)} · Contador: {event.actorName}</p></div>{event.entry && <span className="font-semibold text-slate-800">{formatMinutes(event.entry.duration_minutes)}</span>}</div>
        {event.entry && <p className="mt-2 text-sm text-slate-600">{event.entry.is_manual ? 'Entrada manual' : 'Cronómetro'}{event.entry.justification ? ` · Justificación: ${event.entry.justification}` : ''}</p>}
      </li>)}</ol>}
    </section>}
    {showClientForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingClient) setShowClientForm(false); }}><section role="dialog" aria-modal="true" aria-labelledby="client-form-title" className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><h3 id="client-form-title" className="text-xl font-bold">{editingClient ? 'Editar cliente' : 'Crear cliente'}</h3><form onSubmit={(event) => void saveClient(event)} className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Nombre / razón social<input required value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="text-sm font-medium">Giro<input value={clientFields.industry ?? ''} onChange={(e) => setClientFields({...clientFields,industry:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5" /></label>
      <label className="text-sm font-medium">Tipo de persona<select value={clientFields.person_type ?? ''} onChange={(e) => setClientFields({...clientFields,person_type:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Selecciona</option><option value="PHYSICAL">Física</option><option value="MORAL">Moral</option></select></label><label className="text-sm font-medium">Forma de pago<select value={clientFields.payment_method ?? ''} onChange={(e) => setClientFields({...clientFields,payment_method:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Selecciona</option><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option></select></label>
      <label className="text-sm font-medium">RFC<input value={taxId} onChange={(e) => setTaxId(e.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border p-2.5" /></label><fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-medium">Regímenes fiscales</legend><p className="mb-2 text-xs text-slate-500">Marca uno o varios regímenes.</p><div className="max-h-40 space-y-1 overflow-y-auto pr-2">{regimes.map((regime) => <label key={regime} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50"><input type="checkbox" checked={parseTaxRegimes(taxRegime).includes(regime)} onChange={(event) => { const selected = new Set(parseTaxRegimes(taxRegime)); if (event.target.checked) selected.add(regime); else selected.delete(regime); setTaxRegime(Array.from(selected).join(', ')); }} className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span>{regime}</span></label>)}</div></fieldset>
      <label className="text-sm font-medium">Contador asignado<select value={clientFields.assigned_accountant_id ?? ''} onChange={(e) => setClientFields({...clientFields,assigned_accountant_id:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Sin asignar</option>{accountants.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}</select></label><label className="text-sm font-medium">Correo de contacto<input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="text-sm font-medium">Teléfono<input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5" /></label>
      {['postal_code','street','exterior_number','interior_number','neighborhood','city','state'].map((field) => <label key={field} className="text-sm font-medium">{{postal_code:'C.P.',street:'Calle',exterior_number:'No. exterior',interior_number:'No. interior',neighborhood:'Colonia',city:'Ciudad',state:'Estado'}[field]}<input value={clientFields[field] ?? ''} onChange={(e) => setClientFields({...clientFields,[field]:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5" /></label>)}
      <label className="text-sm font-medium">¿Tiene trabajadores?<select value={clientFields.has_employees ?? ''} onChange={(e) => setClientFields({...clientFields,has_employees:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Selecciona</option><option value="true">Sí</option><option value="false">No</option></select></label><label className="text-sm font-medium">Tipo de nómina<select value={clientFields.payroll_frequency ?? ''} onChange={(e) => setClientFields({...clientFields,payroll_frequency:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"><option value="">No aplica</option><option value="WEEKLY">Semanal</option><option value="BIWEEKLY">Quincenal</option><option value="MONTHLY">Mensual</option></select></label>
      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">{[['primary_contact','Contacto principal'],['payment_contact','Contacto de pagos']].map(([prefix,label]) => <fieldset key={prefix} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">{label}</legend>{[['name','Nombre'],['phone','Teléfono'],['email','Correo'],['title','Cargo']].map(([suffix,caption]) => {const key=`${prefix}_${suffix}`; return <label key={key} className="text-xs font-medium">{caption}<input type={suffix==='email'?'email':'text'} value={clientFields[key] ?? ''} onChange={(e) => setClientFields({...clientFields,[key]:e.target.value})} className="mt-1 w-full rounded border p-2" /></label>;})}</fieldset>)}</div>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}<div className="flex justify-end gap-3 pt-2 sm:col-span-2"><button type="button" disabled={savingClient} onClick={() => setShowClientForm(false)} className="rounded-lg border px-4 py-2.5">Cancelar</button><button type="submit" disabled={savingClient} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">{savingClient ? 'Guardando…' : 'Guardar cliente'}</button></div></form></section></div>}
  </div>;
}
