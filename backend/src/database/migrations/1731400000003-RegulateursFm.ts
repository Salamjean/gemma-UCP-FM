import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RÉGULATEURS (Gemma FM uniquement — n'existe pas dans Laravel)
 *  - fm_regulateurs : profil d'un compte users.role_as = 'regulateur', créé par l'hôpital (Personnel de santé).
 *    Mêmes conventions que les tables d'agents Laravel : status 0 = activé / 1 = désactivé, `delete` 1 = supprimé.
 *  - fm_reattributions : historique des patients réattribués à un autre médecin par un régulateur
 *    (le médecin choisi par l'infirmier·ère n'était pas disponible).
 */
export class RegulateursFm1731400000003 implements MigrationInterface {
  name = 'RegulateursFm1731400000003';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_regulateurs (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        hospital_id INT UNSIGNED NOT NULL,
        matricule VARCHAR(191) NULL,
        contact VARCHAR(191) NULL,
        address VARCHAR(191) NULL,
        img_url VARCHAR(191) NULL,
        status TINYINT NOT NULL DEFAULT 0,
        \`delete\` TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NULL,
        updated_at DATETIME NULL,
        UNIQUE KEY fm_regulateurs_user (user_id),
        KEY fm_regulateurs_hopital (hospital_id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_reattributions (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        consultation_id INT UNSIGNED NOT NULL,
        hospital_id INT UNSIGNED NOT NULL,
        ancien_doctor_id INT UNSIGNED NULL,
        nouveau_doctor_id INT UNSIGNED NOT NULL,
        regulateur_id INT UNSIGNED NOT NULL,
        raison VARCHAR(100) NULL,
        motif VARCHAR(500) NULL,
        created_at DATETIME NOT NULL,
        KEY fm_reattributions_hopital (hospital_id, created_at),
        KEY fm_reattributions_consultation (consultation_id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_reattributions');
    await q.query('DROP TABLE IF EXISTS fm_regulateurs');
  }
}
