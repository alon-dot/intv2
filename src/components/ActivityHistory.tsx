import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

type ActivityLog = { id: string; user_id: string; action_type: string; description: string; created_at: string };
type Collaborator = { id: string; full_name: string };

function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date),
    time: new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' }).format(date),
  };
}

export default function ActivityHistory() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [selectedCollaborator, setSelectedCollaborator] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateInputValue());
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void supabase.from('profiles').select('id,full_name').order('full_name').then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(`No se pudo cargar la lista de colaboradores: ${queryError.message}`);
      setCollaborators((data ?? []) as Collaborator[]);
    });
    return () => { active = false; };
  }, [isAdmin]);

  useEffect(() => {
    let active = true;
    async function loadActivities() {
      if (!user) { setActivities([]); setLoading(false); return; }
      setLoading(true);
      setError(null);
      let query = supabase.from('activity_logs').select('id,user_id,action_type,description,created_at').order('created_at', { ascending: false });
      if (selectedDate) {
        const [year, month, day] = selectedDate.split('-').map(Number);
        const localDayStart = new Date(year, month - 1, day);
        const localTomorrowStart = new Date(localDayStart);
        localTomorrowStart.setDate(localTomorrowStart.getDate() + 1);
        query = query.gte('created_at', localDayStart.toISOString()).lt('created_at', localTomorrowStart.toISOString());
      }
      if (!isAdmin) query = query.eq('user_id', user.id);
      else if (selectedCollaborator) query = query.eq('user_id', selectedCollaborator);
      const { data, error: queryError } = await query;
      if (!active) return;
      if (queryError) {
        setError(`No se pudo cargar el historial: ${queryError.message}`);
        setActivities([]);
        setNames({});
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as ActivityLog[];
      setActivities(rows);
      const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
      if (isAdmin && userIds.length) {
        const { data: profileData, error: profileError } = await supabase.from('profiles').select('id,full_name').in('id', userIds);
        if (!active) return;
        if (profileError) setError(`Se cargó el historial, pero no los nombres de los colaboradores: ${profileError.message}`);
        setNames(Object.fromEntries(((profileData ?? []) as Collaborator[]).map((profile) => [profile.id, profile.full_name])));
      } else setNames({});
      setLoading(false);
    }
    void loadActivities();
    return () => { active = false; };
  }, [user, isAdmin, selectedCollaborator, selectedDate]);

  return <section className="mx-auto max-w-7xl rounded-2xl bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-xl font-bold text-slate-900">Historial de actividad</h2><p className="mt-1 text-sm text-slate-500">Consulta las acciones registradas en el sistema.</p></div>
      <label className="text-sm font-medium text-slate-600">Fecha
        <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" />
      </label>
      <button type="button" onClick={() => setSelectedDate('')} disabled={!selectedDate} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Ver todo el historial</button>
      {isAdmin && <label className="text-sm font-medium text-slate-600">Colaborador
        <select value={selectedCollaborator} onChange={(event) => setSelectedCollaborator(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2">
          <option value="">Todos los colaboradores</option>
          {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.full_name}</option>)}
        </select>
      </label>}
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {loading ? <p className="mt-5 text-sm text-slate-500">Cargando historial…</p> : activities.length === 0 ? <p className="mt-5 text-sm text-slate-500">No hay actividades registradas.</p> : <ol className="mt-5 divide-y divide-slate-100">
      {activities.map((activity) => {
        const formatted = formatDate(activity.created_at);
        return <li key={activity.id} className="flex flex-wrap items-start justify-between gap-2 py-4 first:pt-0 last:pb-0">
          <div><p className="font-medium text-slate-800">{activity.description}</p><p className="mt-1 text-xs text-slate-500">{activity.action_type.replaceAll('_', ' ')}{isAdmin && ` · ${names[activity.user_id] ?? 'Colaborador'}`}</p></div>
          <time dateTime={activity.created_at} className="whitespace-nowrap text-sm text-slate-500">{formatted.date} · {formatted.time}</time>
        </li>;
      })}
    </ol>}
  </section>;
}
