/**
 * PWA — INSTALLATION DE L'APPLICATION
 * Chrome / Edge (Android, ordinateur) envoient « beforeinstallprompt » quand l'application est installable :
 * on garde cet évènement pour proposer notre propre bouton « Installer » (application ouverte dans sa fenêtre,
 * sans barre d'adresse), au lieu du simple raccourci « Ajouter à l'écran d'accueil ».
 * L'évènement peut arriver avant l'affichage de React : il est capturé dès le chargement (main.tsx).
 */
export interface EvenementInstallation extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let evenement: EvenementInstallation | null = null;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

/** À appeler une seule fois au démarrage */
export function ecouterInstallation() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // pas de mini-bannière du navigateur : notre bouton la remplace
    evenement = e as EvenementInstallation;
    prevenir();
  });
  window.addEventListener('appinstalled', () => {
    evenement = null;
    prevenir();
  });
}

export const installationPossible = () => evenement !== null;

/** Ouvre la fenêtre d'installation du navigateur ; true si l'utilisateur a accepté */
export async function installer(): Promise<boolean> {
  if (!evenement) return false;
  const e = evenement;
  await e.prompt();
  const { outcome } = await e.userChoice;
  evenement = null; // l'évènement ne sert qu'une fois
  prevenir();
  return outcome === 'accepted';
}

export function abonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** Déjà ouverte comme application installée (fenêtre autonome) */
export const dejaInstallee = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: window-controls-overlay)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone / iPad (Safari) : pas d'évènement d'installation, il faut passer par « Partager » */
export const estIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Contexte sécurisé (HTTPS ou localhost) : obligatoire pour installer l'application */
export const contexteSecurise = () => window.isSecureContext;
