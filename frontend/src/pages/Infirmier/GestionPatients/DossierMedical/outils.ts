import type { InterventionDossier } from '../../../../types';

const p2 = (n: number) => String(n).padStart(2, '0');
/** Date + heure (heure telle qu'enregistrée, comme Laravel) */
export function dateHeure(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} à ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** Âge à partir de "JJ/MM/AAAA" (format Laravel) ou "AAAA-MM-JJ" */
export function age(date: string | null) {
  if (!date) return null;
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(date);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  const [j, m, a] = fr ? [+fr[1], +fr[2], +fr[3]] : iso ? [+iso[3], +iso[2], +iso[1]] : [0, 0, 0];
  if (!a) return null;
  const auj = new Date();
  let n = auj.getFullYear() - a;
  if (auj.getMonth() + 1 < m || (auj.getMonth() + 1 === m && auj.getDate() < j)) n--;
  return n >= 0 ? `${n} ans` : null;
}

export const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase() || 'P';

export const CONSTANTES: { cle: keyof InterventionDossier['constantes']; libelle: string; unite: string }[] = [
  { cle: 'tension', libelle: 'Tension artérielle', unite: 'mmHg' },
  { cle: 'temperature', libelle: 'Température', unite: '°C' },
  { cle: 'pouls', libelle: 'Pouls', unite: 'bpm' },
  { cle: 'poids', libelle: 'Poids', unite: 'kg' },
  { cle: 'taille', libelle: 'Taille', unite: 'cm' },
  { cle: 'imc', libelle: 'IMC', unite: 'kg/m²' },
  { cle: 'saturation', libelle: 'Saturation O₂', unite: '%' },
  { cle: 'glycemie', libelle: 'Glycémie à jeun', unite: 'g/l' },
];
