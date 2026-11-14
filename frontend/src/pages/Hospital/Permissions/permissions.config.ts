import type { IconType } from 'react-icons';
import { FaCheckCircle, FaHourglassHalf, FaTimesCircle } from 'react-icons/fa';
import type { DemandePermission, StatutPermission } from '../../../types';

/** HÔPITAL > PERMISSIONS — libellés, couleurs et adresses des 3 statuts (pending / agree / reject de Laravel) */
export const STATUTS: Record<StatutPermission, { libelle: string; pluriel: string; chemin: string; icone: IconType; fond: string; texte: string }> = {
  pending: { libelle: 'En attente', pluriel: 'En attente', chemin: 'en-attente', icone: FaHourglassHalf, fond: '#fff3df', texte: '#b56b00' },
  agree: { libelle: 'Accordée', pluriel: 'Accordées', chemin: 'accordees', icone: FaCheckCircle, fond: '#e3f5ee', texte: '#0b7a54' },
  reject: { libelle: 'Refusée', pluriel: 'Refusées', chemin: 'refusees', icone: FaTimesCircle, fond: '#fde0e6', texte: '#c4213f' },
};

export const ORDRE_STATUTS: StatutPermission[] = ['pending', 'agree', 'reject'];

/** Type d'agent (colonne permissions.type de Laravel) */
export function typeAgent(d: DemandePermission) {
  if (d.type === 'doctor') return d.sageFemme ? 'Sage-femme' : 'Médecin';
  return (
    { male_nurse: 'Infirmier(e)', regulateur: 'Régulateur', secreteriat: 'Secrétaire', cashier: 'Caissier(e)', accountant: 'Comptable', pharmacy: 'Pharmacie' }[d.type] ?? d.type
  );
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** "2026-11-12" ou ISO → Date UTC (sans décalage) */
function lire(v: string | null) {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

export const jour = (v: string | null) => {
  const d = lire(v);
  return d ? `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : '—';
};

/** "14:30:00" → "14h30" */
export const heure = (v: string | null) => (v ? v.slice(0, 5).replace(':', 'h') : null);

/** Nombre de jours d'absence (bornes incluses) */
export function nombreJours(debut: string, fin: string) {
  const a = lire(debut);
  const b = lire(fin);
  if (!a || !b) return 0;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
}

/** La période d'absence est-elle en cours aujourd'hui ? */
export function absentAujourdhui(debut: string, fin: string) {
  const a = lire(debut);
  const b = lire(fin);
  const t = new Date();
  const auj = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return !!a && !!b && a.getTime() <= auj && auj <= b.getTime();
}
