import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Télé-expertise : délai de réponse et résultat de l'expert. Tables Gemma FM uniquement (Laravel n'y touche pas).
 *
 * fm_references :
 *   - urgence            : 1 = urgente (synchrone, réponse en moins de 30 min), 0 = programmée (asynchrone, 24 à 48 h) ;
 *   - echeance           : heure limite de la réponse (UTC) ;
 *   - resultat_avis      : avis / conclusion de l'expert ;
 *   - resultat_conduite  : conduite à tenir proposée ;
 *   - resultat_le        : envoi du résultat (UTC) ; resultat_par : médecin expert (doctors.id) ;
 *   - resultat_lu_le     : lecture du résultat par le demandeur (UTC).
 * fm_documents_references.nature : « demande » (joints par le demandeur) ou « resultat » (joints par l'expert).
 */
export class ResultatsExpertiseFm1731400000008 implements MigrationInterface {
  name = 'ResultatsExpertiseFm1731400000008';

  private async ajouter(q: QueryRunner, table: string, colonne: string, ddl: string) {
    const [existe] = await q.query(
      'SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
      [table, colonne],
    );
    if (!existe) await q.query(`ALTER TABLE ${table} ${ddl}`);
  }

  public async up(q: QueryRunner): Promise<void> {
    await this.ajouter(q, 'fm_references', 'urgence', 'ADD COLUMN urgence TINYINT(1) NOT NULL DEFAULT 0 AFTER heure_prevue');
    await this.ajouter(q, 'fm_references', 'echeance', 'ADD COLUMN echeance DATETIME NULL AFTER urgence');
    await this.ajouter(q, 'fm_references', 'resultat_avis', 'ADD COLUMN resultat_avis TEXT NULL AFTER motif');
    await this.ajouter(q, 'fm_references', 'resultat_conduite', 'ADD COLUMN resultat_conduite TEXT NULL AFTER resultat_avis');
    await this.ajouter(q, 'fm_references', 'resultat_le', 'ADD COLUMN resultat_le DATETIME NULL AFTER resultat_conduite');
    await this.ajouter(q, 'fm_references', 'resultat_par', 'ADD COLUMN resultat_par BIGINT UNSIGNED NULL AFTER resultat_le');
    await this.ajouter(q, 'fm_references', 'resultat_lu_le', 'ADD COLUMN resultat_lu_le DATETIME NULL AFTER resultat_par');
    await this.ajouter(q, 'fm_documents_references', 'nature', "ADD COLUMN nature VARCHAR(20) NOT NULL DEFAULT 'demande' AFTER consultation_id");
    // Anciennes télé-expertises : échéance de 48 h après la demande (programmées)
    await q.query('UPDATE fm_references SET echeance = DATE_ADD(created_at, INTERVAL 48 HOUR) WHERE echeance IS NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE fm_documents_references DROP COLUMN nature');
    await q.query(
      'ALTER TABLE fm_references DROP COLUMN resultat_lu_le, DROP COLUMN resultat_par, DROP COLUMN resultat_le, DROP COLUMN resultat_conduite, DROP COLUMN resultat_avis, DROP COLUMN echeance, DROP COLUMN urgence',
    );
  }
}
