import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_documents_references : numéro d'ordre (auto-incrément) pour garder l'ordre d'ajout des documents,
 * même quand plusieurs sont envoyés dans la même seconde. Table Gemma FM uniquement.
 */
export class OrdreDocumentsFm1731400000001 implements MigrationInterface {
  name = 'OrdreDocumentsFm1731400000001';

  public async up(q: QueryRunner): Promise<void> {
    const [col] = await q.query("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'fm_documents_references' AND column_name = 'numero'");
    if (Number(col?.n) === 0) {
      await q.query('ALTER TABLE fm_documents_references ADD COLUMN numero BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE FIRST');
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE fm_documents_references DROP COLUMN numero');
  }
}
