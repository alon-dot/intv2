import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // Estado para el ojito
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const role = await signIn(email.trim(), password);
      const destination = role === 'admin'
        ? '/admin'
        : role === 'supervisor'
          ? '/supervisor'
          : '/contador';
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white dark:bg-slate-950 px-6 py-12 lg:px-24 transition-colors duration-300">
      {/* Contenedor principal */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        
        {/* Columna Izquierda: Logo e Ilustración */}
        <div className="relative hidden lg:flex justify-start items-center h-[600px] overflow-hidden order-1 lg:order-1">
          {/* Círculos decorativos adaptados a modo claro y oscuro */}
          <div className="absolute left-[-150px] top-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-[#0F1E36]/5 dark:bg-[#C5A059]/10 -z-10" />
          <div className="absolute left-[-80px] top-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full bg-[#C5A059]/10 dark:bg-[#0F1E36]/30 -z-10" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#0F1E36]/10 dark:bg-[#C5A059]/15 -z-10" />

          {/* Imagen para Modo Claro (Se oculta en dark) */}
          <img 
            src="/Telles%20Ponce%20Blanco.svg" 
            alt="Logo Téllez Ponce & Asociados" 
            className="max-w-md w-full object-contain drop-shadow-md select-none ml-4 dark:hidden"
          />

          {/* Imagen para Modo Oscuro (Solo se muestra en dark) */}
          <img 
            src="/Telles%20Ponce%20Azul.svg" 
            alt="Logo Téllez Ponce & Asociados" 
            className="hidden dark:block max-w-md w-full object-contain drop-shadow-md select-none ml-4"
          />
        </div>

        {/* Columna Derecha: Formulario */}
        <section className="w-full max-w-md z-10 mx-auto lg:mx-0 order-2 lg:order-2">
          {/* Pestañas Login */}
          <div className="flex space-x-8 border-b border-slate-100 dark:border-slate-800 pb-4 mb-8">
            <div>
              <button type="button" className="text-xl font-bold text-[#0F1E36] dark:text-[#C5A059] pb-1 border-b-2 border-[#0F1E36] dark:border-[#C5A059]">
                Login
              </button>
            </div>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Input Email / Usuario */}
            <div>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-slate-400 dark:text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-full border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/80 py-3.5 pl-12 pr-4 text-slate-900 dark:text-slate-100 shadow-sm outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#0F1E36] dark:focus:border-[#C5A059] focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-[#0F1E36]/10 dark:focus:ring-[#C5A059]/20"
                  placeholder="Email or phone number"
                />
              </div>
            </div>

            {/* Input Password con el botón del ojito */}
            <div>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-slate-400 dark:text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'} // Alterna entre puntos y texto plano
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-full border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/80 py-3.5 pl-12 pr-12 text-slate-900 dark:text-slate-100 shadow-sm outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#0F1E36] dark:focus:border-[#C5A059] focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-[#0F1E36]/10 dark:focus:ring-[#C5A059]/20"
                  placeholder="Password"
                />

                {/* Botón interactivo para ver/ocultar contraseña */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 focus:outline-none transition-colors"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? (
                    /* Icono de Ojo tachado (Ocultar) */
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411l0 0L21 21" />
                    </svg>
                  ) : (
                    /* Icono de Ojo abierto (Ver) */
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 border border-transparent dark:border-red-800/50">
                {error}
              </p>
            )}

            {/* Fila inferior: Forgot password y Botón */}
            <div className="flex items-center justify-between pt-2">
              <a href="#forgot" onClick={(e) => e.preventDefault()} className="text-sm font-medium text-[#0F1E36] dark:text-[#C5A059] hover:underline">
                ¿Olvidaste tu contraseña? 
              </a>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-[#0F1E36] dark:bg-[#C5A059] px-8 py-3.5 font-semibold text-white dark:text-slate-950 shadow-lg shadow-[#0F1E36]/30 dark:shadow-[#C5A059]/20 transition hover:bg-[#1a315a] dark:hover:bg-[#d6b168] focus:outline-none focus:ring-4 focus:ring-[#0F1E36]/20 dark:focus:ring-[#C5A059]/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Ingresando…' : 'Login'}
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 text-left mt-2">
                Contacta al administrador para restablecerla.
            </p>

          </form>
        </section>

      </div>
    </main>
  );
}