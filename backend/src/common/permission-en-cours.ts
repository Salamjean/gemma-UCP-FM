import type { DataSource } from 'typeorm';

/**
 * PERMISSION ACCORDÉE EN COURS → l'agent est HORS SERVICE pendant sa permission.
 * Règle unique, utilisée partout où l'on décide si un agent est « en service » (affectation, urgences,
 * régulation, planning, tableau de bord, références…).
 *
 * Une permission accordée (status 'agree') couvre la période :
 *   du jour de début à l'heure de début (00:00 si non précisée)
 *   jusqu'au jour de fin à l'heure de fin (23:59:59 si non précisée).
 * Tables : permissions (Laravel : médecins, sages-femmes, infirmiers…) et fm_permissions_regulateurs (régulateurs).
 * Dates et heures saisies en heure locale (Côte d'Ivoire = UTC), comparées à NOW() du serveur MySQL.
 */
const PERIODE = (alias: string) =>
  `NOW() BETWEEN TIMESTAMP(${alias}.beging_date, COALESCE(${alias}.beging_time, '00:00:00'))
             AND TIMESTAMP(${alias}.end_date, COALESCE(${alias}.end_time, '23:59:59'))`;

/** Expression SQL (0/1) : l'utilisateur `colonneUserId` est-il en permission accordée maintenant ? */
export const SQL_EN_PERMISSION = (colonneUserId: string) => `(
  EXISTS (SELECT 1 FROM permissions pe WHERE pe.user_id = ${colonneUserId} AND pe.status = 'agree' AND ${PERIODE('pe')})
  OR EXISTS (SELECT 1 FROM fm_permissions_regulateurs pr WHERE pr.user_id = ${colonneUserId} AND pr.status = 'agree' AND ${PERIODE('pr')})
)`;

/** Permission accordée en cours d'un utilisateur (pour l'afficher : « En permission jusqu'au … »), sinon null */
export async function permissionEnCours(db: DataSource, userId: number) {
  const champs = `DATE_FORMAT(x.beging_date, '%Y-%m-%d') AS debut, DATE_FORMAT(x.end_date, '%Y-%m-%d') AS fin,
                  TIME_FORMAT(x.beging_time, '%H:%i') AS heure_debut, TIME_FORMAT(x.end_time, '%H:%i') AS heure_fin`;
  const [p] = await db.query(
    `SELECT * FROM (
       SELECT ${champs} FROM permissions x WHERE x.user_id = ? AND x.status = 'agree' AND ${PERIODE('x')}
       UNION ALL
       SELECT ${champs} FROM fm_permissions_regulateurs x WHERE x.user_id = ? AND x.status = 'agree' AND ${PERIODE('x')}
     ) t ORDER BY fin DESC LIMIT 1`,
    [userId, userId],
  );
  return p
    ? { debut: p.debut as string, fin: p.fin as string, heureDebut: (p.heure_debut as string) ?? null, heureFin: (p.heure_fin as string) ?? null }
    : null;
}
