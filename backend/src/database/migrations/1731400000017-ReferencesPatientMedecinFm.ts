import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_references_patient.doctor_origine_id : la référence du patient peut aussi être faite par un MÉDECIN
 * (issue « Référence » de sa consultation). NULL quand c'est l'infirmier·ère (infirmier_origine_id).
 * Table Gemma FM uniquement.
 */
export class ReferencesPatientMedecinFm1731400000017 implements MigrationInterface {
  name = 'ReferencesPatientMedecinFm1731400000017';

  public async up(q: QueryRunner): Promise<void> {
    const [existe] = await q.query(
      "SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fm_references_patient' AND COLUMN_NAME = 'doctor_origine_id' LIMIT 1",
    );
    if (!existe) await q.query('ALTER TABLE fm_references_patient ADD COLUMN doctor_origine_id BIGINT UNSIGNED NULL AFTER infirmier_origine_id');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE fm_references_patient DROP COLUMN doctor_origine_id');
  }
}
