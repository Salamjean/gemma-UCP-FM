import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Réattribution vers un autre hôpital SANS médecin choisi : le patient est envoyé à tous les médecins du service
 * dans cet hôpital (le premier qui le prend en charge l'obtient).
 *   fm_reattributions.nouveau_doctor_id devient facultatif (NULL = envoyé au service) ;
 *   service_id / hospital_destination_id : service et hôpital visés.
 * Table Gemma FM uniquement.
 */
export class ReattributionServiceFm1731400000014 implements MigrationInterface {
  name = 'ReattributionServiceFm1731400000014';

  public async up(q: QueryRunner): Promise<void> {
    const colonne = async (nom: string) =>
      !!(
        await q.query(
          "SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fm_reattributions' AND COLUMN_NAME = ? LIMIT 1",
          [nom],
        )
      )[0];
    const [nullable] = await q.query(
      "SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fm_reattributions' AND COLUMN_NAME = 'nouveau_doctor_id' LIMIT 1",
    );
    if (nullable && nullable.n !== 'YES') await q.query('ALTER TABLE fm_reattributions MODIFY nouveau_doctor_id INT UNSIGNED NULL');
    if (!(await colonne('service_id'))) await q.query('ALTER TABLE fm_reattributions ADD COLUMN service_id BIGINT UNSIGNED NULL');
    if (!(await colonne('hospital_destination_id'))) await q.query('ALTER TABLE fm_reattributions ADD COLUMN hospital_destination_id BIGINT UNSIGNED NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE fm_reattributions DROP COLUMN hospital_destination_id, DROP COLUMN service_id');
  }
}
