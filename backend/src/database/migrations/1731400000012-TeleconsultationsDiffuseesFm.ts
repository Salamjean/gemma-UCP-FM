import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_teleconsultations_diffusees : téléconsultation envoyée à un SERVICE (aucun médecin choisi).
 *   interne → tous les médecins du service dans l'hôpital du demandeur ;
 *   externe → tous les médecins du service dans l'hôpital choisi (hospital_destination_id), ou dans toute la DMHP (NULL).
 * Le premier médecin qui la prend en charge l'obtient (consultations.doctor_id), elle disparaît alors chez les autres.
 * infirmier_origine_id : infirmier·ère demandeur, remis sur la consultation à la prise en charge
 * (la consultation reste sans infirmier tant qu'elle n'est pas prise, pour ne pas passer pour une consultation de l'infirmier·ère).
 * Table Gemma FM uniquement (la table Laravel « consultations » n'est pas modifiée).
 */
export class TeleconsultationsDiffuseesFm1731400000012 implements MigrationInterface {
  name = 'TeleconsultationsDiffuseesFm1731400000012';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_teleconsultations_diffusees (
        consultation_id BIGINT UNSIGNED NOT NULL,
        type ENUM('interne', 'externe') NOT NULL,
        service_id BIGINT UNSIGNED NOT NULL,
        hospital_destination_id BIGINT UNSIGNED NULL,
        doctor_origine_id BIGINT UNSIGNED NULL,
        infirmier_origine_id BIGINT UNSIGNED NULL,
        pris_par BIGINT UNSIGNED NULL,
        pris_le DATETIME NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (consultation_id),
        KEY fm_tele_diff_service_index (service_id),
        KEY fm_tele_diff_hopital_index (hospital_destination_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_teleconsultations_diffusees');
  }
}
