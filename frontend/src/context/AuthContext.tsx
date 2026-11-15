import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from '../services/api';
import { tokenStorage } from '../services/token';
import type { AuthUser, LoginCredentials } from '../types';

interface AuthContextValue {
  /** Utilisateur connecté (null si déconnecté) */
  user: AuthUser | null;
  /** true pendant la vérification de la session au démarrage */
  checking: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => void;
  /** Recharge l'utilisateur connecté (ex. après modification du profil : nom, photo) */
  rafraichir: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Garantit un profil complet, même si le backend (ancienne version) ne l'envoie pas */
const normalize = (u: AuthUser): AuthUser => ({
  ...u,
  profile: {
    imgUrl: u.profile?.imgUrl ?? null,
    typeAgentId: u.profile?.typeAgentId ?? null,
    typeAgent: u.profile?.typeAgent ?? null,
    typeName: u.profile?.typeName ?? null,
    serviceId: u.profile?.serviceId ?? null,
    teleconsultationActive: u.profile?.teleconsultationActive,
  },
});

/**
 * SESSION DE L'UTILISATEUR — à utiliser avec useAuth().
 * Au démarrage : si un jeton existe, on recharge l'utilisateur via GET /api/auth/me.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(() => tokenStorage.get() !== null);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  // Session expirée côté backend → déconnexion automatique
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Reprise de session au chargement
  useEffect(() => {
    if (!tokenStorage.get()) return;
    api
      .me()
      .then((u) => setUser(normalize(u)))
      .catch(() => tokenStorage.clear())
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async ({ remember = false, ...credentials }: LoginCredentials) => {
    const res = await api.login({ ...credentials, remember });
    tokenStorage.set(res.accessToken, remember);
    tokenStorage.setRememberedEmail(remember ? credentials.email : null);
    const connected = normalize(res.user);
    setUser(connected);
    return connected;
  }, []);

  const rafraichir = useCallback(async () => {
    const u = await api.me();
    setUser(normalize(u));
  }, []);

  const value = useMemo(() => ({ user, checking, login, logout, rafraichir }), [user, checking, login, logout, rafraichir]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
