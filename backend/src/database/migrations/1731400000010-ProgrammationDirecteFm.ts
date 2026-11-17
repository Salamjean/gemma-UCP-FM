import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_references.programmation_directe : 1 = télé-expertise programmée directement depuis l'onglet Télémédecine
 * (aucune consultation faite avant) → l'expert joint seulement son résultat ;
 * 0 = télé-expertise issue d'une vraie consultation → l'expert a aussi le formulaire de consultation.
 * Table Gemma FM uniquement.
 */
export class ProgrammationDirecteFm1731400000010 implements MigrationInterface {
  name = 'ProgrammationDirecteFm1731400000010';

  public async up(q: QueryRunner): Promise<void> {
    const [existe] = await q.query(
      "SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fm_references' AND COLUMN_NAME = 'programmation_directe' LIMIT 1",
    );
    if (existe) return;
    await q.query('ALTER TABLE fm_references ADD COLUMN programmation_directe TINYINT(1) NOT NULL DEFAULT 0 AFTER echeance');
    // Reprise : consultation d'origine sans examen ni diagnostic (programmation directe : motif seulement)
    await q.query(`
      UPDATE fm_references fr
         SET fr.programmation_directe = 1
       WHERE NOT EXISTS (
               SELECT 1 FROM registres r
                 JOIN registre_consultation_curatives rc ON rc.registre_id = r.id
                WHERE r.consultation_id = fr.consultation_origine_id
                  AND (NULLIF(TRIM(rc.diagnostic_retenu), '') IS NOT NULL OR NULLIF(TRIM(rc.examen_physique), '') IS NOT NULL))
         AND NOT EXISTS (SELECT 1 FROM ordonnances o WHERE o.consultation_id = fr.consultation_origine_id AND o.deleted_at IS NULL)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE fm_references DROP COLUMN programmation_directe');
  }
}
