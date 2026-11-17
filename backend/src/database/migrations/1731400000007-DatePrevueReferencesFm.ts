import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_references.date_prevue / heure_prevue : date et heure de prise en charge demandées pour une télé-expertise EXTERNE.
 * La consultation créée pour le médecin qui la prend en charge est datée de ce jour.
 * NULL pour les références internes (leur date est celle de la consultation du destinataire) et les anciennes références.
 * Table Gemma FM uniquement (Laravel n'y touche pas).
 */
export class DatePrevueReferencesFm1731400000007 implements MigrationInterface {
  name = 'DatePrevueReferencesFm1731400000007';

  public async up(q: QueryRunner): Promise<void> {
    const colonnes: { nom: string; ddl: string }[] = [
      { nom: 'date_prevue', ddl: 'ADD COLUMN date_prevue DATE NULL AFTER service_id' },
      { nom: 'heure_prevue', ddl: 'ADD COLUMN heure_prevue TIME NULL AFTER date_prevue' },
    ];
    for (const c of colonnes) {
      const [existe] = await q.query(
        "SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fm_references' AND COLUMN_NAME = ? LIMIT 1",
        [c.nom],
      );
      if (!existe) await q.query(`ALTER TABLE fm_references ${c.ddl}`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE fm_references DROP COLUMN heure_prevue, DROP COLUMN date_prevue');
  }
}
