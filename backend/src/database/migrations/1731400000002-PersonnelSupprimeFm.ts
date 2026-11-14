import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_personnels_supprimes : agents supprimés DÉFINITIVEMENT par l'admin UCP-FM alors qu'ils ont un historique
 * médical (consultations, hospitalisations…). Leur ligne Laravel est gardée (les dossiers patients y font
 * référence) mais le compte est neutralisé ; cette table les retire de la liste « Personnel supprimé »
 * et garde l'adresse email d'origine. Table Gemma FM uniquement.
 */
export class PersonnelSupprimeFm1731400000002 implements MigrationInterface {
  name = 'PersonnelSupprimeFm1731400000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_personnels_supprimes (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        type_agent VARCHAR(20) NOT NULL,
        agent_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        nom VARCHAR(255) NULL,
        email_origine VARCHAR(255) NULL,
        hospital_id INT UNSIGNED NULL,
        supprime_par INT UNSIGNED NULL,
        created_at DATETIME NOT NULL,
        UNIQUE KEY fm_personnels_supprimes_agent (type_agent, agent_id)
      ) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_personnels_supprimes');
  }
}
