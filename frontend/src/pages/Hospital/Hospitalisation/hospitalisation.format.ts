/**
 * HÔPITAL > HOSPITALISATION — formats partagés (dates, durées, statuts).
 * Les dates arrivent soit en "2026-11-10" / "2026-11-10 14:30:00" (colonnes texte Laravel),
 * soit en ISO (timestamps). Les heures sont affichées telles qu'enregistrées (UTC, comme Laravel).
 */

const p2 = (n: number) => String(n).padStart(2, '0');

/** Lit une date Laravel ("Y-m-d", "Y-m-d H:i:s" ou ISO) sans décalage de fuseau */
export function lireDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
}

/** "10/11/2026" */
export const jourFr = (v: string | null | undefined) => {
  const d = lireDate(v);
  return d ? `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : '—';
};

/** "10/11/2026 à 14:30" (l'heure seulement si la valeur en contient une) */
export const jourHeureFr = (v: string | null | undefined) => {
  const d = lireDate(v);
  if (!d) return '—';
  // Colonne "date" (sans heure) renvoyée en ISO minuit "…T00:00:00.000Z" : on n'affiche que le jour
  const avecHeure = /[ T]\d{2}:\d{2}/.test(v ?? '') && !/T00:00:00(\.000)?Z$/.test(v ?? '');
  return avecHeure ? `${jourFr(v)} à ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : jourFr(v);
};

/** Nombre de jours entre deux dates (fin absente = aujourd'hui), au moins 1 */
export function nombreJours(debut: string, fin: string | null): number {
  const a = lireDate(debut);
  const b = fin ? lireDate(fin) : new Date();
  if (!a || !b) return 0;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export const joursTexte = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;

/** Libellé + couleur d'un statut d'hospitalisation (in_progress, finished…) */
export function statutHospitalisation(statut: string) {
  if (statut === 'in_progress') return { libelle: 'En cours', fond: '#eaf3fe', texte: '#1f6fc6' };
  if (statut === 'finished') return { libelle: 'Terminée', fond: '#e3f5ee', texte: '#0b7a54' };
  return { libelle: statut.charAt(0).toUpperCase() + statut.slice(1).replace(/_/g, ' '), fond: '#f1f3f8', texte: '#5d6577' };
}

/** Une observation est en cours tant que sa date de fin n'est pas passée */
export const observationEnCours = (fin: string | null) => {
  const d = lireDate(fin);
  return !d || d.getTime() > Date.now();
};
