import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Envois EXTERNES sans hôpital choisi (télé-expertise, téléconsultation, référence du patient) :
 *   district_origine : district sanitaire du demandeur (hospitals.district_sanitaire, en minuscules) ;
 *   hors_district    : 0 → tous les médecins du service DANS ce district ; 1 → dans les AUTRES districts.
 * NULL (anciennes demandes) : tous les hôpitaux de la DMHP, comme avant. Tables Gemma FM uniquement.
 */
export class DistrictEnvoisFm1731400000016 implements MigrationInterface {
  name = 'DistrictEnvoisFm1731400000016';

  public async up(q: QueryRunner): Promise<void> {
    for (const table of ['fm_references', 'fm_teleconsultations_diffusees', 'fm_references_patient']) {
      const colonne = async (nom: string) =>
        !!(
          await q.query('SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1', [table, nom])
        )[0];
      if (!(await colonne('district_origine'))) await q.query(`ALTER TABLE ${table} ADD COLUMN district_origine VARCHAR(191) NULL`);
      if (!(await colonne('hors_district'))) await q.query(`ALTER TABLE ${table} ADD COLUMN hors_district TINYINT(1) NOT NULL DEFAULT 0`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const table of ['fm_references', 'fm_teleconsultations_diffusees', 'fm_references_patient']) {
      await q.query(`ALTER TABLE ${table} DROP COLUMN district_origine, DROP COLUMN hors_district`);
    }
  }
}
