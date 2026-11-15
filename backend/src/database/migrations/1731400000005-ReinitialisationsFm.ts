import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_reinitialisations : codes de réinitialisation du mot de passe (« Mot de passe oublié »).
 * Un code à 6 chiffres par compte (le dernier demandé), stocké haché, valable 15 min, 5 essais maximum.
 * Table Gemma FM uniquement (la réinitialisation de Laravel est désactivée : Auth::routes() commenté).
 */
export class ReinitialisationsFm1731400000005 implements MigrationInterface {
  name = 'ReinitialisationsFm1731400000005';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_reinitialisations (
        user_id INT UNSIGNED NOT NULL PRIMARY KEY,
        code_hash VARCHAR(191) NOT NULL,
        expire_le DATETIME NOT NULL,
        tentatives TINYINT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_reinitialisations');
  }
}
