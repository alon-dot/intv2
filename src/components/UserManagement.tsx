import { useCallback, useEffect, useState, type FormEvent } from 'react';
import CreateUserModal from './CreateUserModal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

type ManagedUser = { id: string; full_name: string; email: string | null; role: string; [key: string]: any };
type RoleFilter = 'all' | 'supervisor' | 'contador';

function roleLabel(role: string) {
  return role.toLowerCase() === 'supervisor' ? 'Supervisor' : role.toLowerCase() === 'contador' || role.toLowerCase() === 'accountant' ? 'Contador' : role;
}

export default function UserManagement() {
  const { role, user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'supervisor' | 'contador'>('contador');
  const [savingEdit, setSavingEdit] = useState(false);
  const [profileFields, setProfileFields] = useState<Record<string, string>>({});
  const dossierFields = ['office_phone','personal_phone','grade_rank','degree_name','professional_license','street','exterior_interior_number','neighborhood','municipality','state','emergency_contact_name','emergency_contact_phone'];
  const dossierLabels: Record<string, string> = {
    office_phone: 'Teléfono del despacho', personal_phone: 'Teléfono personal', grade_rank: 'Grado en escalafón',
    degree_name: 'Nombre de licenciatura', professional_license: 'Número de cédula profesional', street: 'Calle',
    exterior_interior_number: 'Número exterior e interior', neighborhood: 'Colonia', municipality: 'Municipio',
    state: 'Estado', emergency_contact_name: 'Contacto de emergencia', emergency_contact_phone: 'Teléfono de emergencia',
  };

  const loadUsers = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: queryError } = await supabase.from('profiles').select('*').order('full_name');
    if (queryError) {
      setError(`No se pudieron cargar los usuarios: ${queryError.message}`);
      setUsers([]);
    } else setUsers(((data ?? []) as ManagedUser[])
      .filter((profile) => ['supervisor', 'contador', 'accountant'].includes(String(profile.role).toLowerCase()))
      .map((profile) => ({
        ...profile,
        email: profile.email || (profile.id === currentUser?.id ? currentUser.email ?? null : null),
      })));
    setLoading(false);
  }, [currentUser?.email, currentUser?.id]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function sendResetEmail(user: ManagedUser) {
    if (!user.email) return;
    setSendingId(user.id); setError(null); setNotice(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingId(null);
    if (resetError) setError(`No se pudo enviar el enlace a ${user.email}: ${resetError.message}`);
    else setNotice(`Se envió un enlace para actualizar la contraseña a ${user.email}.`);
  }

  function openEdit(user: ManagedUser) {
    setEditingUser(user);
    setEditName(user.full_name);
    setEditEmail(user.email ?? '');
    setEditRole(user.role.toLowerCase() === 'supervisor' ? 'supervisor' : 'contador');
    setProfileFields(Object.fromEntries(dossierFields.map((field) => [field, String(user[field] ?? '')])));
    setError(null);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser || savingEdit) return;
    const fullName = editName.trim();
    if (!fullName) { setError('El nombre completo es obligatorio.'); return; }
    const email = editEmail.trim().toLowerCase();
    if (!email) { setError('El correo electrónico es obligatorio.'); return; }
    setSavingEdit(true); setError(null); setNotice(null);
    const updateData = {
      full_name: fullName,
      email,
      role: editRole,
      ...Object.fromEntries(dossierFields.map((field) => [field, profileFields[field]?.trim() || null])),
    };
    const { error: updateError } = await supabase.from('profiles')
      .update(updateData)
      .eq('id', editingUser.id);
    setSavingEdit(false);
    if (updateError) { setError(`No se pudo actualizar el colaborador: ${updateError.message}`); return; }
    setUsers((current) => current.map((item) => item.id === editingUser.id ? { ...item, full_name: fullName, email, role: editRole, ...profileFields } : item));
    setNotice(`Se actualizaron los datos de ${fullName}.`);
    setEditingUser(null);
  }

  if (role !== 'admin') return null;
  const visibleUsers = users.filter((user) => filter === 'all' || user.role.toLowerCase() === filter || (filter === 'contador' && user.role.toLowerCase() === 'accountant'));

  return <section className="mx-auto max-w-7xl rounded-2xl bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Administración</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Gestión de usuarios</h2><p className="mt-1 text-sm text-slate-500">Administra colaboradores y envía enlaces seguros para cambiar contraseñas.</p></div><button type="button" onClick={() => setShowCreateUser(true)} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700">Dar de alta usuario</button></div>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><p className="text-sm text-slate-500">{visibleUsers.length} usuarios</p><label className="text-sm font-medium text-slate-600">Filtrar por rol<select value={filter} onChange={(event) => setFilter(event.target.value as RoleFilter)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="all">Todos</option><option value="supervisor">Supervisor</option><option value="contador">Contador</option></select></label></div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
    {loading ? <p className="mt-5 text-sm text-slate-500">Cargando usuarios…</p> : visibleUsers.length === 0 ? <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No hay usuarios para este filtro.</p> : <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Nombre</th><th className="px-4 py-3 font-semibold">Correo</th><th className="px-4 py-3 font-semibold">Rol</th><th className="px-4 py-3 text-right font-semibold">Contraseña</th><th className="px-4 py-3 text-right font-semibold">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleUsers.map((user) => <tr key={user.id}><td className="px-4 py-3 font-medium text-slate-800">{user.full_name}</td><td className="px-4 py-3 text-slate-600">{user.email ?? 'No disponible en el perfil'}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{roleLabel(user.role)}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => void sendResetEmail(user)} disabled={!user.email || sendingId !== null} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">{sendingId === user.id ? 'Enviando…' : 'Enviar enlace'}</button></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => openEdit(user)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Editar</button></td></tr>)}</tbody></table></div>}
    {showCreateUser && <CreateUserModal onClose={() => setShowCreateUser(false)} onCreated={() => void loadUsers()} />}
    {editingUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingEdit) setEditingUser(null); }}><section role="dialog" aria-modal="true" aria-labelledby="edit-user-title" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h3 id="edit-user-title" className="text-xl font-bold text-slate-900">Editar colaborador</h3><p className="mt-1 text-sm text-slate-500">Datos de cuenta y expediente profesional.</p></div><button type="button" aria-label="Cerrar" disabled={savingEdit} onClick={() => setEditingUser(null)} className="rounded-lg px-2 py-1 text-xl text-slate-500">×</button></div><form onSubmit={(event) => void saveEdit(event)} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Nombre completo<input required value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1 block w-full rounded-lg border p-2.5" /></label><label className="text-sm font-medium">Correo electrónico<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} className="mt-1 block w-full rounded-lg border p-2.5" /></label><label className="text-sm font-medium">Rol<select value={editRole} onChange={(event) => setEditRole(event.target.value as 'supervisor' | 'contador')} className="mt-1 block w-full rounded-lg border p-2.5"><option value="supervisor">Supervisor</option><option value="contador">Contador</option></select></label>{dossierFields.map((field) => <label key={field} className="text-sm font-medium">{dossierLabels[field]}<input value={profileFields[field] ?? ''} onChange={(event) => setProfileFields((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 block w-full rounded-lg border p-2.5" /></label>)}{error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}<div className="flex justify-end gap-3 sm:col-span-2"><button type="button" disabled={savingEdit} onClick={() => setEditingUser(null)} className="rounded-lg border px-4 py-2.5">Cancelar</button><button type="submit" disabled={savingEdit} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">{savingEdit ? 'Guardando…' : 'Guardar cambios'}</button></div></form></section></div>}
  </section>;
}
