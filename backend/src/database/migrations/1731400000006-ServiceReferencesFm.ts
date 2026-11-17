import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_references.service_id : service (table Laravel « services ») auquel une télé-expertise EXTERNE est adressée.
 * Seuls les médecins de ce service (dans les autres établissements de la DMHP) la voient et peuvent la prendre en charge.
 * NULL pour les références internes et les références externes faites avant cette colonne (visibles par tous, comme avant).
 * Table Gemma FM uniquement (Laravel n'y touche pas).
 */
export class ServiceReferencesFm1731400000006 implements MigrationInterface {
  name = 'ServiceReferencesFm1731400000006';

  public async up(q: QueryRunner): Promise<void> {
    const [existe] = await q.query(
      "SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fm_references' AND COLUMN_NAME = 'service_id' LIMIT 1",
    );
    if (!existe) {
      await q.query('ALTER TABLE fm_references ADD COLUMN service_id BIGINT UNSIGNED NULL AFTER type, ADD KEY fm_references_service_index (service_id)');
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE fm_references DROP KEY fm_references_service_index, DROP COLUMN service_id');
  }
}
