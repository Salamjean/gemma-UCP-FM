import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_references_patient : RÉFÉRENCE d'un patient par l'infirmier·ère (issue « Référence »), en interne ou en externe.
 * Le patient se rend physiquement chez le médecin / dans l'hôpital visé avec sa fiche de référence imprimée.
 *   consultation_origine_id      : consultation de l'infirmier·ère (terminée, issue « reference ») ;
 *   consultation_destination_id  : consultation créée pour le médecin (avec la saisie de l'infirmier·ère reprise) ;
 *   diffusee = 1                 : aucun médecin choisi → tous les médecins du service (de l'hôpital visé, ou de la DMHP
 *                                  si hospital_destination_id est NULL) ; le premier qui le prend en charge l'obtient.
 * Table Gemma FM uniquement.
 */
export class ReferencesPatientFm1731400000015 implements MigrationInterface {
  name = 'ReferencesPatientFm1731400000015';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_references_patient (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        code VARCHAR(30) NULL,
        type ENUM('interne', 'externe') NOT NULL,
        consultation_origine_id BIGINT UNSIGNED NOT NULL,
        consultation_destination_id BIGINT UNSIGNED NULL,
        service_id BIGINT UNSIGNED NOT NULL,
        hospital_origine_id BIGINT UNSIGNED NULL,
        hospital_destination_id BIGINT UNSIGNED NULL,
        doctor_destination_id BIGINT UNSIGNED NULL,
        infirmier_origine_id BIGINT UNSIGNED NULL,
        diffusee TINYINT(1) NOT NULL DEFAULT 0,
        motif TEXT NULL,
        pris_le DATETIME NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY fm_references_patient_origine_unique (consultation_origine_id),
        KEY fm_references_patient_destination_index (consultation_destination_id),
        KEY fm_references_patient_service_index (service_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_references_patient');
  }
}
