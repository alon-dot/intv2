import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import type { AppRole, Database } from '../types/database';
import { useFormDraft } from '../hooks/useFormDraft';

type CreateUserRole = Exclude<AppRole, 'admin'>;

type CreateUserModalProps = {
  onClose: () => void;
  onCreated?: () => void;
};

type SupervisorOption = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name'>;
type UserDraft = { fullName: string; email: string; role: CreateUserRole; staffFields: Record<string, string>; supervisorId: string };

export default function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
  const { user, role: currentRole } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<CreateUserRole>('contador');
  const [staffFields, setStaffFields] = useState<Record<string, string>>({
    office_phone: '', grade_rank: '', degree_name: '', professional_license: '', personal_phone: '',
    street: '', exterior_interior_number: '', neighborhood: '', municipality: '', state: '',
    emergency_contact_name: '', emergency_contact_phone: '',
  });
  const [supervisorId, setSupervisorId] = useState('');
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userDraft: UserDraft = { fullName, email, role, staffFields, supervisorId };
  const restoreUserDraft = useCallback((draft: Partial<UserDraft> | null) => {
    setFullName(draft?.fullName ?? '');
    setEmail(draft?.email ?? '');
    setPassword('');
    setRole(draft?.role === 'supervisor' ? 'supervisor' : 'contador');
    if (draft?.staffFields && typeof draft.staffFields === 'object') setStaffFields((current) => ({ ...current, ...draft.staffFields }));
    setSupervisorId(draft?.supervisorId ?? '');
  }, []);
  const clearUserDraft = useFormDraft(user ? `create-user-draft:${user.id}` : null, userDraft, restoreUserDraft);

  const canCreateUsers = currentRole === 'admin' || currentRole === 'supervisor';
  const canChooseRole = currentRole === 'admin';

  const registrationClient = useMemo(() => createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL || '',
    import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  ), []);

  useEffect(() => {
    if (!canCreateUsers || currentRole !== 'admin' || role !== 'contador') {
      setSupervisors([]);
      return;
    }

    let active = true;
    setLoadingSupervisors(true);
    void supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'supervisor')
      .order('full_name')
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          setError(`No se pudieron cargar los supervisores: ${queryError.message}`);
        } else {
          setSupervisors(data ?? []);
        }
        if (active) setLoadingSupervisors(false);
      }, (cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los supervisores.');
        setLoadingSupervisors(false);
      });

    return () => {
      active = false;
    };
  }, [canCreateUsers, currentRole, role]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!user || !canCreateUsers) {
      setError('No tienes permiso para crear usuarios.');
      return;
    }

    const assignedRole: CreateUserRole = currentRole === 'supervisor' ? 'contador' : role;
    const assignedSupervisorId = currentRole === 'supervisor'
      ? user.id
      : assignedRole === 'contador'
        ? supervisorId || null
        : null;

    setSubmitting(true);
    try {
      // A separate, non-persistent client prevents signUp from replacing the current user's session.
      const { data, error: signUpError } = await registrationClient.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });

      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Supabase no devolvió el usuario creado.');

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role: assignedRole,
        supervisor_id: assignedSupervisorId,
        ...Object.fromEntries(Object.entries(staffFields).map(([field, value]) => [field, value.trim() || null])),
      }, { onConflict: 'id' });

      if (profileError) {
        throw new Error(`La cuenta se creó, pero no se pudo guardar su perfil: ${profileError.message}`);
      }

      clearUserDraft();
      onCreated?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el usuario.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreateUsers) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section
        aria-labelledby="create-user-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="create-user-title" className="text-2xl font-bold text-slate-900">Crear usuario</h2>
            <p className="mt-1 text-sm text-slate-500">Completa los datos para dar de alta una cuenta.</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Cerrar" className="rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            ×
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="new-user-full-name" className="mb-1.5 block text-sm font-medium text-slate-700">Nombre completo</label>
            <input id="new-user-full-name" name="full_name" type="text" autoComplete="name" required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
          </div>

          <div>
            <label htmlFor="new-user-email" className="mb-1.5 block text-sm font-medium text-slate-700">Correo electrónico</label>
            <input id="new-user-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
          </div>

          <div>
            <label htmlFor="new-user-password" className="mb-1.5 block text-sm font-medium text-slate-700">Contraseña</label>
            <input id="new-user-password" name="password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
          </div>

          <div>
            <label htmlFor="new-user-role" className="mb-1.5 block text-sm font-medium text-slate-700">Rol</label>
            <select id="new-user-role" name="role" value={currentRole === 'supervisor' ? 'contador' : role} disabled={!canChooseRole} onChange={(event) => setRole(event.target.value as CreateUserRole)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100">
              {currentRole === 'admin' && <option value="supervisor">Supervisor</option>}
              <option value="contador">Contador</option>
            </select>
          </div>

          <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <legend className="px-2 text-sm font-semibold text-slate-800">Datos generales e institucionales</legend>
            {[['office_phone', 'Teléfono del despacho']].map(([field, label]) => <label key={field} className="text-sm font-medium text-slate-700">{label}<input type="tel" value={staffFields[field]} onChange={(event) => setStaffFields((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>)}
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <legend className="px-2 text-sm font-semibold text-slate-800">Perfil profesional</legend>
            {[[ 'grade_rank', 'Grado en escalafón' ], [ 'degree_name', 'Nombre de licenciatura' ], [ 'professional_license', 'Número de cédula profesional' ]].map(([field, label]) => <label key={field} className="text-sm font-medium text-slate-700">{label}<input value={staffFields[field]} onChange={(event) => setStaffFields((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>)}
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <legend className="px-2 text-sm font-semibold text-slate-800">Datos personales y domicilio</legend>
            {[[ 'personal_phone', 'Teléfono personal' ], [ 'street', 'Calle' ], [ 'exterior_interior_number', 'Número exterior e interior' ], [ 'neighborhood', 'Colonia' ], [ 'municipality', 'Municipio' ], [ 'state', 'Estado' ]].map(([field, label]) => <label key={field} className="text-sm font-medium text-slate-700">{label}<input value={staffFields[field]} onChange={(event) => setStaffFields((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>)}
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <legend className="px-2 text-sm font-semibold text-slate-800">Contacto de emergencia</legend>
            {[[ 'emergency_contact_name', 'Nombre del contacto' ], [ 'emergency_contact_phone', 'Teléfono de emergencia' ]].map(([field, label]) => <label key={field} className="text-sm font-medium text-slate-700">{label}<input value={staffFields[field]} onChange={(event) => setStaffFields((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>)}
          </fieldset>

          {currentRole === 'admin' && role === 'contador' && (
            <div>
              <label htmlFor="new-user-supervisor" className="mb-1.5 block text-sm font-medium text-slate-700">Supervisor asignado <span className="font-normal text-slate-400">(opcional)</span></label>
              <select id="new-user-supervisor" name="supervisor_id" value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} disabled={loadingSupervisors} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100">
                <option value="">Sin supervisor</option>
                {supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.full_name}</option>)}
              </select>
            </div>
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={submitting || loadingSupervisors} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
