import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
    
    // Filtramos los perfiles que pertenecen específicamente al supervisor logueado
    const { data: members, error: memberError } = await supabase
      .from('profiles')
      .select('id,full_name,role')
      .eq('supervisor_id', user.id)
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

      {/* Panel de Avance del equipo optimizado con diseño horizontal en grid */}
      <div>
        <Panel title={`Avance del equipo (${team.length} contadores)`}>
          {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
          {team.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no tienes contadores asignados.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {team.map((member) => {
                const memberTasks = tasks.filter((task) => task.assigned_to === member.id);
                const completed = memberTasks.filter((task) => task.status === 'completed').length;
                return (
                  <div key={member.id} className="flex flex-col justify-between rounded-xl bg-slate-50 p-4 border border-slate-100 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-800 truncate" title={member.full_name}>{member.full_name}</p>
                        <span className="text-xs font-medium text-slate-500 shrink-0">{completed}/{memberTasks.length}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Progreso</span>
                        <span>{Math.round(memberTasks.length ? (completed / memberTasks.length) * 100 : 0)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${memberTasks.length ? (completed / memberTasks.length) * 100 : 0}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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