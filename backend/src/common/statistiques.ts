import type { DataSource } from 'typeorm';

/**
 * OUTILS DE STATISTIQUES PAR MOIS — partagés par les tableaux de bord (super, hôpital…)
 * Reprend la logique Laravel des Dashboard*Repository :
 *   mois courant + 9 précédents, 0 pour les mois sans données.
 */
export const NB_MOIS = 10;

/** ['2026-02', …, '2026-11'] — en UTC, comme Laravel (config/app.php : timezone UTC) */
export function derniersMois(nb = NB_MOIS): string[] {
  const now = new Date();
  return Array.from({ length: nb }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (nb - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/** Les 12 mois de l'année (janvier → décembre), ex. ['2026-01', …, '2026-12'] — année en cours par défaut (UTC) */
export function moisDeLAnnee(annee = new Date().getUTCFullYear()): string[] {
  return Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * Nombre de lignes par mois dans une table.
 * @param table   nom de table CONSTANT (jamais une saisie utilisateur)
 * @param filtre  conditions SQL supplémentaires avec "?" (ex. "type = ? AND hospital_id = ?")
 */
export async function compterParMois(
  db: DataSource,
  table: string,
  mois: string[],
  filtre = '',
  params: unknown[] = [],
): Promise<number[]> {
  const where = filtre ? `${filtre} AND ` : '';
  const rows: { month: string; count: string | number }[] = await db.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM \`${table}\`
      WHERE ${where}DATE_FORMAT(created_at, '%Y-%m') IN (?)
      GROUP BY month`,
    [...params, mois],
  );
  const parMois = new Map(rows.map((r) => [r.month, Number(r.count)]));
  return mois.map((m) => parMois.get(m) ?? 0);
}
