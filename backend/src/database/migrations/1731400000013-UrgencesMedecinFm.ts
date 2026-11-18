import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fm_urgences_medecin : appel d'urgence lancé par un MÉDECIN (issue « Appel d'urgence » de sa consultation).
 * L'appel sonne chez tous les médecins actifs de SON service (services.id) dans les hôpitaux de la DMHP, lui exclu ;
 * le premier qui décroche prend le patient. (Appel lancé par l'infirmier·ère : règle habituelle, pas de ligne ici.)
 * Table Gemma FM uniquement.
 */
export class UrgencesMedecinFm1731400000013 implements MigrationInterface {
  name = 'UrgencesMedecinFm1731400000013';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_urgences_medecin (
        consultation_id BIGINT UNSIGNED NOT NULL,
        doctor_origine_id BIGINT UNSIGNED NOT NULL,
        service_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (consultation_id),
        KEY fm_urgences_medecin_service_index (service_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_urgences_medecin');
  }
}
