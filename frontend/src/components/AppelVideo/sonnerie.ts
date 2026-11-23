/**
 * SONNERIE DES APPELS ENTRANTS (générée par le navigateur — Web Audio, aucun fichier à héberger)
 *   - appel de télémédecine : sonnerie de téléphone (deux tonalités 440 + 480 Hz, 2 × 0,4 s, pause) ;
 *   - appel d'urgence : bips rapides et plus aigus.
 * Les navigateurs n'autorisent le son qu'après une première interaction (toucher, clic, touche) :
 * le contexte audio est donc « déverrouillé » au premier geste de l'utilisateur dans l'application.
 */

type FenetreAudio = typeof window & { webkitAudioContext?: typeof AudioContext };

let contexte: AudioContext | null = null;
let minuterie: ReturnType<typeof setInterval> | null = null;
let enCours: 'normal' | 'urgence' | null = null;

function audio(): AudioContext | null {
  if (contexte) return contexte;
  const Ctx = window.AudioContext ?? (window as FenetreAudio).webkitAudioContext;
  if (!Ctx) return null;
  contexte = new Ctx();
  return contexte;
}

/** Au premier geste de l'utilisateur : le son devient possible (règle des navigateurs) */
export function preparerSonnerie() {
  const deverrouiller = () => {
    const ctx = audio();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  };
  for (const evt of ['pointerdown', 'touchstart', 'keydown'] as const) window.addEventListener(evt, deverrouiller, { passive: true });
  return () => {
    for (const evt of ['pointerdown', 'touchstart', 'keydown'] as const) window.removeEventListener(evt, deverrouiller);
  };
}

/** Une tonalité : fréquences jouées ensemble, de « debut » à « debut + duree » (en secondes, horloge audio) */
function tonalite(ctx: AudioContext, frequences: number[], debut: number, duree: number, volume = 0.18) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, debut);
  gain.gain.linearRampToValueAtTime(volume, debut + 0.02);
  gain.gain.setValueAtTime(volume, debut + duree - 0.03);
  gain.gain.linearRampToValueAtTime(0, debut + duree);
  gain.connect(ctx.destination);
  for (const f of frequences) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, debut);
    osc.connect(gain);
    osc.start(debut);
    osc.stop(debut + duree + 0.05);
  }
}

function sonner(type: 'normal' | 'urgence') {
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime + 0.05;
  if (type === 'urgence') {
    // 4 bips rapides et aigus
    for (let i = 0; i < 4; i++) tonalite(ctx, [880, 1320], t + i * 0.25, 0.15, 0.22);
    navigator.vibrate?.([150, 100, 150, 100, 150]);
  } else {
    // Sonnerie de téléphone : deux sonneries
    tonalite(ctx, [440, 480], t, 0.4);
    tonalite(ctx, [440, 480], t + 0.6, 0.4);
    navigator.vibrate?.([400, 200, 400]);
  }
}

/** Démarre la sonnerie (répétée) ; sans effet si elle sonne déjà de la même façon */
export function demarrerSonnerie(type: 'normal' | 'urgence') {
  if (enCours === type) return;
  arreterSonnerie();
  enCours = type;
  sonner(type);
  minuterie = setInterval(() => sonner(type), type === 'urgence' ? 1500 : 3000);
}

/** Arrête la sonnerie */
export function arreterSonnerie() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
  enCours = null;
  navigator.vibrate?.(0);
}
