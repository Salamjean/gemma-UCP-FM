/**
 * STOCKAGE DU JETON DE CONNEXION
 * - "Se souvenir de moi" coché → localStorage (garde la session après fermeture du navigateur)
 * - sinon → sessionStorage (session perdue à la fermeture de l'onglet)
 */
const TOKEN_KEY = 'gemma_token';
const REMEMBER_EMAIL_KEY = 'gemma_remember_email';

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback; // stockage indisponible (navigation privée…)
  }
};

export const tokenStorage = {
  get: () => safe(() => sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY), null),

  set: (token: string, remember: boolean) =>
    safe(() => {
      tokenStorage.clear();
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    }, undefined),

  clear: () =>
    safe(() => {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }, undefined),

  getRememberedEmail: () => safe(() => localStorage.getItem(REMEMBER_EMAIL_KEY) ?? '', ''),

  setRememberedEmail: (email: string | null) =>
    safe(() => {
      if (email) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
      else localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }, undefined),
};
