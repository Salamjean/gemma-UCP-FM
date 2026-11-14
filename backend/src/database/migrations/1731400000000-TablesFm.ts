import { existsSync, readdirSync, readFileSync, renameSync } from 'fs';
import { join } from 'path';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TABLES PROPRES À GEMMA FM (préfixe « fm_ »), créées au démarrage du backend si elles n'existent pas.
 * Les tables de Laravel ne sont jamais créées, modifiées ni supprimées ici.
 *
 *   fm_references            : une référence (interne / externe) d'une consultation,
 *                              avec la consultation et le médecin destinataires (référence interne) ;
 *   fm_documents_references  : documents joints à une référence (le fichier reste dans le stockage privé de Laravel).
 *
 * Reprise des données existantes : références déjà faites (registres « refere-… ») et index documents.json.
 */
export class TablesFm1731400000000 implements MigrationInterface {
  name = 'TablesFm1731400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_references (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        type ENUM('interne', 'externe') NOT NULL,
        consultation_origine_id BIGINT UNSIGNED NOT NULL,
        consultation_destination_id BIGINT UNSIGNED NULL,
        doctor_origine_id BIGINT UNSIGNED NULL,
        doctor_destination_id BIGINT UNSIGNED NULL,
        hospital_id BIGINT UNSIGNED NULL,
        motif TEXT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY fm_references_origine_unique (consultation_origine_id),
        KEY fm_references_destinataire_index (doctor_destination_id),
        KEY fm_references_type_index (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS fm_documents_references (
        id CHAR(16) NOT NULL,
        consultation_id BIGINT UNSIGNED NOT NULL,
        libelle VARCHAR(191) NOT NULL,
        fichier VARCHAR(191) NOT NULL,
        nom_original VARCHAR(255) NOT NULL,
        type VARCHAR(150) NOT NULL,
        taille INT UNSIGNED NOT NULL,
        ajoute_par BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY fm_documents_references_consultation_index (consultation_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // --- Reprise : références déjà enregistrées dans les registres ---
    await q.query(`
      INSERT IGNORE INTO fm_references (type, consultation_origine_id, doctor_origine_id, hospital_id, motif, created_at, updated_at)
      SELECT IF(LOWER(r.issue_consultation) = 'refere-externe', 'externe', 'interne'), c.id, c.doctor_id, c.hospital_id,
             r.issue_consultation_justification, COALESCE(r.created_at, c.updated_at, UTC_TIMESTAMP()), UTC_TIMESTAMP()
        FROM consultations c
        JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
       WHERE LOWER(r.issue_consultation) IN ('refere-interne', 'refere-externe') AND c.deleted_at IS NULL`);
    // Destinataire d'une référence interne : consultation « Référé par Dr … » créée ensuite pour le même patient
    await q.query(`
      UPDATE fm_references fr
         SET consultation_destination_id = (
               SELECT d2.id FROM consultations d2 JOIN consultations o ON o.id = fr.consultation_origine_id
                WHERE d2.patient_id = o.patient_id AND d2.id <> o.id AND d2.motif_consultation LIKE 'Référé par %'
                  AND d2.created_at >= o.created_at AND d2.deleted_at IS NULL
                ORDER BY d2.created_at ASC, d2.id ASC LIMIT 1)
       WHERE fr.type = 'interne' AND fr.consultation_destination_id IS NULL`);
    await q.query(`
      UPDATE fm_references fr
         SET doctor_destination_id = (SELECT doctor_id FROM consultations WHERE id = fr.consultation_destination_id)
       WHERE fr.consultation_destination_id IS NOT NULL AND fr.doctor_destination_id IS NULL`);

    // --- Reprise : index documents.json du stockage privé ---
    const publicPath = process.env.LARAVEL_PUBLIC_PATH;
    const racine = publicPath ? join(publicPath, '..', 'storage', 'app', 'gemma-fm', 'references') : null;
    if (racine && existsSync(racine)) {
      for (const dossier of readdirSync(racine)) {
        const m = /^consultation-(\d+)$/.exec(dossier);
        const manifeste = join(racine, dossier, 'documents.json');
        if (!m || !existsSync(manifeste)) continue;
        let liste: Record<string, unknown>[] = [];
        try {
          liste = JSON.parse(readFileSync(manifeste, 'utf8'));
        } catch {
          continue;
        }
        for (const x of Array.isArray(liste) ? liste : []) {
          const nom = String(x.nom ?? x.fichier ?? '');
          // Noms d'origine mal décodés (UTF-8 lu en latin1) : « mÃ©dicale » → « médicale »
          const nomCorrige = /Ã|Â/.test(nom) ? Buffer.from(nom, 'latin1').toString('utf8') : nom;
          await q.query(
            `INSERT IGNORE INTO fm_documents_references (id, consultation_id, libelle, fichier, nom_original, type, taille, ajoute_par, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              String(x.id),
              Number(m[1]),
              String(x.libelle ?? 'Document'),
              String(x.fichier),
              nomCorrige,
              String(x.type ?? 'application/octet-stream'),
              Number(x.taille ?? 0),
              x.ajoutePar ? Number(x.ajoutePar) : null,
              new Date(String(x.ajouteLe ?? Date.now())).toISOString().slice(0, 19).replace('T', ' '),
            ],
          );
        }
        renameSync(manifeste, `${manifeste}.importe`); // conservé comme sauvegarde, plus utilisé
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS fm_documents_references');
    await q.query('DROP TABLE IF EXISTS fm_references');
  }
}
