/** FORMATS D'AFFICHAGE partagés (montants, dates) */

/** 15000 → "15 000 FCFA" */
export const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

/** "2026-11-11T15:04:05.000Z" → "11/11/2026" (date UTC, comme Laravel) */
export const dateCourte = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
