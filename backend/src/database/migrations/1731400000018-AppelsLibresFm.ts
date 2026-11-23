import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * APPELS SANS CONDITION DE SERVICE
 *   fm_urgences_medecin : cible de TOUT appel d'urgence (infirmier·ère ou médecin) —
 *     service_id = service choisi (NULL = tous les services du réseau), doctor_origine_id = médecin qui appelle (NULL = infirmier·ère).
 *   fm_appels_demandeurs : médecin qui a demandé une téléconsultation à un autre médecin → il participe à l'appel vidéo
 *     (appel entre médecin et médecin).
 * Tables Gemma FM uniquement.
 */
export class AppelsLibresFm1731400000018 implements MigrationInterface {
  name = 'AppelsLibresFm1731400000018';

  public async up(q: QueryRunner): Promise<void> {
    const nullable = async (col: string) => {
      const [r] = await q.query(
        "SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fm_urgences_medecin' AND COLUMN_NAME = ? LIMIT 1",
        [col],
      );
      return r?.n === 'YES';
    };
    if (!(await nullable('doctor_origine_id'))) await q.query('ALTER TABLE fm_urgences_medecin MODIFY doctor_origine_id BIGINT UNSIGNED NULL');
    if (!(await nullable('service_id'))) await q.query('ALTER TABLE fm_urgences_medecin MODIFY service_id BIGINT UNSIGNED NULL');
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_appels_demandeurs (
        consultation_id BIGINT UNSIGNED NOT NULL,
        doctor_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (consultation_id),
        KEY fm_appels_demandeurs_doctor_index (doctor_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_appels_demandeurs');
  }
}
