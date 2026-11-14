import type { IconType } from 'react-icons';
import { FaAndroid, FaApple, FaClock, FaExclamationTriangle, FaHospital, FaInfoCircle, FaSyncAlt, FaUser, FaUsers } from 'react-icons/fa';
import type { CategorieDiffusion, CibleDiffusion } from '../../../types';

/**
 * NOTIFICATIONS PUSH — libellés, icônes et couleurs (repris de la vue Laravel notifications/add.blade.php)
 * Couleurs unies : fond léger + texte foncé.
 */
export const CATEGORIES: Record<CategorieDiffusion, { label: string; icone: IconType; fond: string; texte: string }> = {
  general: { label: 'Information générale', icone: FaInfoCircle, fond: '#eaf3fe', texte: '#1f6fc6' },
  alert: { label: 'Alerte sanitaire', icone: FaExclamationTriangle, fond: '#fde0e6', texte: '#c4213f' },
  reminder: { label: 'Rappel médical', icone: FaClock, fond: '#fff3df', texte: '#b56b00' },
  update: { label: "Mise à jour de l'application", icone: FaSyncAlt, fond: '#efe9fd', texte: '#6a3fd6' },
  info: { label: 'Informations hôpitaux', icone: FaHospital, fond: '#e3f5ee', texte: '#0b7a54' },
};

export const CIBLES: Record<CibleDiffusion, { label: string; detail: string; icone: IconType }> = {
  all: { label: 'Tous les patients', detail: 'Android et iOS', icone: FaUsers },
  android: { label: 'Android', detail: 'Appareils Android', icone: FaAndroid },
  ios: { label: 'iOS (Apple)', detail: 'iPhone et iPad', icone: FaApple },
  specific: { label: 'Patient spécifique', detail: 'Un seul patient', icone: FaUser },
};

/** "2026-11-11T15:04:05.000Z" → "11/11/2026 - 15:04" (heure UTC, comme Laravel) */
export const dateHeure = (iso: string | null, secondes = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} - ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${secondes ? `:${p(d.getUTCSeconds())}` : ''}`;
};
