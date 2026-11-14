import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_permissions_regulateurs : demandes d'absence des régulateurs (Gemma FM uniquement).
 * La table Laravel « permissions » ne peut pas les recevoir : sa colonne type est un ENUM
 * (doctor, male_nurse, secreteriat, cashier, accountant, pharmacy) qu'on ne modifie pas.
 * Mêmes colonnes et mêmes statuts (pending | agree | reject) ; l'hôpital les traite dans ses pages « Permission ».
 */
export class PermissionsRegulateursFm1731400000004 implements MigrationInterface {
  name = 'PermissionsRegulateursFm1731400000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_permissions_regulateurs (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(191) NULL,
        user_id INT UNSIGNED NOT NULL,
        hospital_id INT UNSIGNED NOT NULL,
        beging_date DATE NOT NULL,
        end_date DATE NOT NULL,
        beging_time TIME NULL,
        end_time TIME NULL,
        description TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at DATETIME NULL,
        updated_at DATETIME NULL,
        KEY fm_permissions_regulateurs_hopital (hospital_id, status),
        KEY fm_permissions_regulateurs_user (user_id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_permissions_regulateurs');
  }
}
