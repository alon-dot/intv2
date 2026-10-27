import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return <button type="button" role="switch" aria-checked={isDark} aria-label={`Cambiar a modo ${isDark ? 'claro' : 'oscuro'}`} title={`Cambiar a modo ${isDark ? 'claro' : 'oscuro'}`} onClick={toggleTheme} className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
    <span aria-hidden="true" className="text-base">{isDark ? '🌙' : '☀️'}</span>
    <span className="hidden sm:inline">{isDark ? 'Oscuro' : 'Claro'}</span>
    <span aria-hidden="true" className={`relative h-5 w-9 overflow-hidden rounded-full transition ${isDark ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0'}`} /></span>
  </button>;
}
