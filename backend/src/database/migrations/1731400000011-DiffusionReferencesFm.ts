import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Télé-expertise adressée à un SERVICE plutôt qu'à un médecin précis :
 *   fm_references.diffusee                = 1 : envoyée à tous les médecins du service (le premier qui la prend en charge l'obtient,
 *                                              elle disparaît alors chez les autres) ; 0 : adressée directement à un médecin ;
 *   fm_references.hospital_destination_id = hôpital visé : interne → l'hôpital du demandeur ; externe → l'hôpital choisi,
 *                                              NULL = tous les hôpitaux de la DMHP.
 * Reprise : les télé-expertises externes existantes étaient toutes envoyées au service (diffusee = 1).
 * Table Gemma FM uniquement.
 */
export class DiffusionReferencesFm1731400000011 implements MigrationInterface {
  name = 'DiffusionReferencesFm1731400000011';

  public async up(q: QueryRunner): Promise<void> {
    const colonne = async (nom: string) =>
      !!(
        await q.query(
          "SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fm_references' AND COLUMN_NAME = ? LIMIT 1",
          [nom],
        )
      )[0];
    if (!(await colonne('diffusee'))) {
      await q.query('ALTER TABLE fm_references ADD COLUMN diffusee TINYINT(1) NOT NULL DEFAULT 0 AFTER service_id');
      await q.query("UPDATE fm_references SET diffusee = 1 WHERE type = 'externe'");
    }
    if (!(await colonne('hospital_destination_id'))) {
      await q.query('ALTER TABLE fm_references ADD COLUMN hospital_destination_id BIGINT UNSIGNED NULL AFTER diffusee, ADD KEY fm_references_hopital_dest_index (hospital_destination_id)');
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE fm_references DROP KEY fm_references_hopital_dest_index, DROP COLUMN hospital_destination_id, DROP COLUMN diffusee');
  }
}
