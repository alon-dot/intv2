import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { AppRole } from '../types/database';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: { full_name: string } | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AppRole>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== 'string') return null;
  switch (value.trim().toLowerCase()) {
    case 'admin':
    case 'administrator':
      return 'admin';
    case 'supervisor':
      return 'supervisor';
    case 'contador':
    case 'accountant':
      return 'contador';
    default:
      return null;
  }
}

type AuthProviderProps = { children: ReactNode };

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ full_name: string } | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRequest = useRef(0);

  const loadProfileRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', userId)
      .single();

    console.log('[auth] Perfil recibido', {
      userId,
      role: data?.role,
      fullName: data?.full_name,
      error: error?.message,
    });

    if (error) {
      setProfile(null);
      setRole(null);
      throw new Error(`No se pudo cargar el perfil: ${error.message}`);
    }

    const role = normalizeRole(data.role);
    if (!role) {
      throw new Error(`Rol de perfil no reconocido: ${String(data.role)}`);
    }

    return { role, profile: { full_name: data.full_name } };
  }, []);

  const applySession = useCallback(async (nextSession: Session | null): Promise<AppRole | null> => {
    const request = ++sessionRequest.current;
    setLoading(true);
    setSession(nextSession);
    setProfile(null);
    setRole(null);
    if (!nextSession) {
      setLoading(false);
      return null;
    }

    try {
      const result = await loadProfileRole(nextSession.user.id);
      // A newer auth event may own the context state, while this caller still
      // needs the role it just loaded to finish the post-login navigation.
      if (request !== sessionRequest.current) return result.role;
      setRole(result.role);
      setProfile(result.profile);
      return result.role;
    } finally {
      if (request === sessionRequest.current) setLoading(false);
    }
  }, [loadProfileRole]);

  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Defer Supabase queries until the auth callback releases its internal lock.
      setTimeout(() => {
        if (active && event === 'TOKEN_REFRESHED') {
          // A visibility/focus token refresh must not clear the loaded role or
          // remount protected forms while Supabase renews the current session.
          setSession(nextSession);
        } else if (active) {
          void applySession(nextSession).catch((error: unknown) => {
            console.error(error);
          });
        }
      }, 0);
    });

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (active) await applySession(data.session);
    }).catch((error: unknown) => {
      console.error('No se pudo restaurar la sesión:', error);
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string): Promise<AppRole> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error('No se recibió una sesión válida.');
    console.log('[auth] Login recibido', {
      userId: data.user?.id,
      email: data.user?.email,
      appMetadataRole: data.user?.app_metadata?.role,
      userMetadataRole: data.user?.user_metadata?.role,
      sessionReceived: Boolean(data.session),
    });
    const loadedRole = await applySession(data.session);
    if (!loadedRole) throw new Error('No se pudo validar el rol de la cuenta.');
    return loadedRole;
  }, [applySession]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setProfile(null);
    setRole(null);
    setLoading(false);
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    role,
    loading,
    signIn,
    signOut,
  }), [session, profile, role, loading, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de un AuthProvider.');
  return context;
}
