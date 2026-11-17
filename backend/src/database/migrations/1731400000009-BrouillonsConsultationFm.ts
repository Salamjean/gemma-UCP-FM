import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_brouillons_consultation : saisie d'une consultation commencée par l'infirmier·ère puis « envoyée au médecin ».
 * La consultation (Laravel) reste ouverte et passe au médecin choisi ; ces valeurs pré-remplissent son formulaire.
 * Table Gemma FM uniquement (Laravel n'y touche pas).
 */
export class BrouillonsConsultationFm1731400000009 implements MigrationInterface {
  name = 'BrouillonsConsultationFm1731400000009';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_brouillons_consultation (
        consultation_id BIGINT UNSIGNED NOT NULL,
        valeurs LONGTEXT NOT NULL,
        envoye_par BIGINT UNSIGNED NULL,
        doctor_id BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (consultation_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_brouillons_consultation');
  }
}
