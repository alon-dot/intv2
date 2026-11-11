import { useCallback, useEffect, useMemo, useState } from 'react';
import CreateUserModal from './CreateUserModal';
import { DashboardShell, Panel, StatusBadge, type Profile, type Task } from './DashboardShared';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const [team, setTeam] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    const { data: members, error: memberError } = await supabase
      .from('profiles')
      .select('id,full_name,role')
      .order('full_name');
    if (memberError) {
      setError(memberError.message);
      setTeam([]);
      setTasks([]);
      return;
    }
    const accountants = (members ?? []).filter((member) =>
      ['contador', 'accountant'].includes(String(member.role).trim().toLowerCase()),
    );
    setTeam(accountants);
    if (accountants.length === 0) {
      setTasks([]);
      return;
    }
    const { data, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .in('assigned_to', accountants.map((member) => member.id))
      .order('created_at', { ascending: false });
    setTasks(data ?? []);
    setError(taskError?.message ?? null);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const names = useMemo(
    () => Object.fromEntries(team.map((member) => [member.id, member.full_name])),
    [team],
  );

  return (
    <DashboardShell title="Panel de supervisión">
      <div className="mb-6 flex justify-end">
        <button type="button" onClick={() => setShowCreateUser(true)} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700">
          Dar de alta contador
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Avance del equipo (${team.length} contadores)`}>
          {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
          {team.length === 0 ? <p className="text-sm text-slate-500">Aún no tienes contadores asignados.</p> : (
            <ul className="space-y-3">{team.map((member) => {
              const memberTasks = tasks.filter((task) => task.assigned_to === member.id);
              const completed = memberTasks.filter((task) => task.status === 'completed').length;
              return <li key={member.id} className="rounded-xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-800">{member.full_name}</p><span className="text-xs text-slate-500">{completed}/{memberTasks.length} completadas</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${memberTasks.length ? completed / memberTasks.length * 100 : 0}%` }} /></div></li>;
            })}</ul>
          )}
        </Panel>
      </div>
      <div className="mt-6">
        <Panel title={`Tareas del equipo (${tasks.length})`}>
          {tasks.length === 0 ? <p className="text-sm text-slate-500">Tu equipo todavía no tiene tareas.</p> : (
            <ul className="divide-y divide-slate-100">{tasks.map((task) => <li key={task.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-semibold text-slate-800">{task.title}</p><p className="text-xs text-slate-500">{task.assigned_to ? names[task.assigned_to] : ''}</p></div><StatusBadge status={task.status} /></li>)}</ul>
          )}
        </Panel>
      </div>
      {showCreateUser && <CreateUserModal onClose={() => setShowCreateUser(false)} onCreated={() => void load()} />}
    </DashboardShell>
  );
}
