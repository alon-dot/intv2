import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function PasswordReset() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setReady(Boolean(data.session)); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && (event === 'PASSWORD_RECOVERY' || session)) setReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) { setError(`No se pudo actualizar la contraseña: ${updateError.message}`); return; }
    await supabase.auth.signOut();
    navigate('/login', { replace: true, state: { passwordUpdated: true } });
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12"><section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
    <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Cuenta segura</p><h1 className="mt-2 text-2xl font-bold text-slate-900">Actualizar contraseña</h1>
    {ready ? <form onSubmit={(event) => void updatePassword(event)} className="mt-6 space-y-4"><label className="block text-sm font-medium text-slate-700">Nueva contraseña<input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label><label className="block text-sm font-medium text-slate-700">Confirmar contraseña<input type="password" autoComplete="new-password" minLength={6} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>{error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<button type="submit" disabled={submitting} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Actualizando…' : 'Guardar contraseña'}</button></form> : <div className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">No hay una sesión de recuperación activa. Abre el enlace que recibiste por correo o solicita uno nuevo desde la pantalla de inicio de sesión.<p className="mt-3"><Link to="/login" className="font-semibold text-blue-700 hover:underline">Volver al inicio de sesión</Link></p></div>}
  </section></main>;
}
