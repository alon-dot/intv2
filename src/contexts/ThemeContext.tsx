import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
type ThemeContextValue = { theme: Theme; toggleTheme: () => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'integradora-theme';

function readTheme(): Theme {
  try { return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* Storage may be disabled. */ }
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark') }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return context;
}
