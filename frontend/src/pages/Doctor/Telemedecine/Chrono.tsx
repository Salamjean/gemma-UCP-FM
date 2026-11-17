import { useEffect, useState } from 'react';
import { FaHourglassHalf, FaInbox } from 'react-icons/fa';
import s from './Telemedecine.module.css';

/** Heure courante, rafraîchie chaque seconde (un seul minuteur par chrono) */
function useMaintenant() {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return maintenant;
}

/** Durée lisible : « 45 s », « 12 min 05 s », « 2 h 05 min », « 3 j 4 h » */
export function duree(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const j = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s2 = sec % 60;
  if (j > 0) return `${j} j${h ? ` ${h} h` : ''}`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(s2).padStart(2, '0')} s`;
  return `${s2} s`;
}

/** Instant de la prise en charge prévue (date « AAAA-MM-JJ » et heure « HH:MM », heure locale) */
const instantPrevu = (date: string | null, heure: string | null) => {
  if (!date) return null;
  const d = new Date(`${date}T${heure && /^\d{2}:\d{2}/.test(heure) ? heure.slice(0, 5) : '00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

/**
 * Couleur du compte à rebours selon le temps restant :
 *   - par défaut (téléconsultation) : plus d'1 h → vert ; 15 min à 1 h → orange ; moins de 15 min → rouge ;
 *   - télé-expertise urgente (< 30 min) : plus de 15 min → vert ; 5 à 15 min → orange ; moins de 5 min → rouge ;
 *   - télé-expertise programmée (24 à 48 h) : plus de 24 h → vert ; 6 à 24 h → orange ; moins de 6 h → rouge ;
 *   - dépassé → retard (rouge foncé).
 */
export type TonChrono = 'large' | 'proche' | 'imminent' | 'retard';
/** Délai d'une télé-expertise : urgente, programmée ; absent = téléconsultation */
export type DelaiChrono = 'urgente' | 'programmee';
const SEUILS: Record<DelaiChrono | 'defaut', [number, number]> = {
  defaut: [15 * 60_000, 60 * 60_000],
  urgente: [5 * 60_000, 15 * 60_000],
  programmee: [6 * 3600_000, 24 * 3600_000],
};
export const ton = (reste: number, delai?: DelaiChrono): TonChrono => {
  const [rouge, orange] = SEUILS[delai ?? 'defaut'];
  return reste < 0 ? 'retard' : reste <= rouge ? 'imminent' : reste <= orange ? 'proche' : 'large';
};

/** Délai d'une télé-expertise (urgente / programmée) à partir de son indicateur */
export const delaiExpertise = (e?: { urgente: boolean } | null): DelaiChrono | undefined => (e ? (e.urgente ? 'urgente' : 'programmee') : undefined);

/** Échéance ISO (UTC) → instant */
const instantEcheance = (echeance?: string | null) => {
  if (!echeance) return null;
  const t = new Date(echeance).getTime();
  return Number.isNaN(t) ? null : t;
};

const LIBELLES_TON: Record<TonChrono, string> = {
  large: 'Largement le temps',
  proche: 'Bientôt',
  imminent: 'Imminent',
  retard: 'En retard',
};

const p2 = (n: number) => String(n).padStart(2, '0');
/** Compteur « HH:MM:SS », précédé des jours au-delà de 24 h (« 2 j 03:15:09 ») */
const compteur = (ms: number) => {
  const sec = Math.floor(Math.abs(ms) / 1000);
  const j = Math.floor(sec / 86400);
  const hms = `${p2(Math.floor((sec % 86400) / 3600))}:${p2(Math.floor((sec % 3600) / 60))}:${p2(sec % 60)}`;
  return j > 0 ? `${j} j ${hms}` : hms;
};

/**
 * TABLEAU DE BORD MÉDECIN > compte à rebours de la prochaine demande programmée, à côté du titre et à sa taille :
 * « Début dans HH:MM:SS », fond coloré selon le temps restant, puis « En retard de … » une fois l'heure dépassée.
 */
export function CompteARebours({ date, heure, echeance, delai }: { date: string | null; heure: string | null; echeance?: string | null; delai?: DelaiChrono }) {
  const maintenant = useMaintenant();
  // Télé-expertise : jusqu'à l'heure limite de la réponse ; sinon jusqu'à la date et l'heure prévues
  const fin = instantEcheance(echeance) ?? instantPrevu(date, heure);
  if (fin === null) return null;
  const reste = fin - maintenant;
  const libelle = echeance ? (reste >= 0 ? 'Réponse dans' : 'Réponse en retard de') : reste >= 0 ? 'Début dans' : 'En retard de';
  return (
    <span className={`${s.rebours} ${s[`rebours_${ton(reste, delai)}`]}`} role="timer" title={LIBELLES_TON[ton(reste, delai)]}>
      <FaHourglassHalf aria-hidden="true" /> {libelle} <strong>{compteur(reste)}</strong>
    </span>
  );
}

/**
 * MÉDECIN > Chronos d'une demande de téléconsultation / télé-expertise :
 *   - « Reçue il y a … » : temps écoulé depuis l'arrivée de la demande ;
 *   - « Prévue dans … » : compte à rebours jusqu'à la date et l'heure prévues, puis « En retard de … ».
 */
export default function Chrono({
  recueLe,
  date,
  heure,
  compact,
  echeance,
  delai,
}: {
  recueLe: string | null;
  date: string | null;
  heure: string | null;
  compact?: boolean;
  /** Télé-expertise : heure limite de la réponse (ISO UTC) */
  echeance?: string | null;
  delai?: DelaiChrono;
}) {
  const maintenant = useMaintenant();
  const recue = recueLe ? new Date(recueLe).getTime() : NaN;
  const fin = instantEcheance(echeance) ?? instantPrevu(date, heure);
  const reste = fin === null ? null : fin - maintenant;
  const avant = echeance ? 'Réponse dans' : 'Prévue dans';

  return (
    <span className={`${s.chrono} ${compact ? s.chronoCompact : ''}`}>
      {!Number.isNaN(recue) && (
        <span className={s.chronoRecue} title="Temps écoulé depuis l'arrivée de la demande">
          <FaInbox aria-hidden="true" /> Reçue il y a {duree(maintenant - recue)}
        </span>
      )}
      {reste !== null && (
        <span className={s[`ton_${ton(reste, delai)}`]} title={echeance ? 'Compte à rebours jusqu’à l’heure limite de la réponse' : 'Compte à rebours jusqu’à l’heure prévue'}>
          <FaHourglassHalf aria-hidden="true" /> {reste >= 0 ? `${avant} ${duree(reste)}` : `En retard de ${duree(-reste)}`}
        </span>
      )}
    </span>
  );
}
