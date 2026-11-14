import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';

type Ligne = Record<string, unknown>;

const NOM_PATIENT = "TRIM(CONCAT(COALESCE(pu.name, ''), ' ', COALESCE(pu.prenom, '')))";
const NOM_MEDECIN = "TRIM(CONCAT(COALESCE(du.name, ''), ' ', COALESCE(du.prenom, '')))";
const NOM_INFIRMIER = "TRIM(CONCAT(COALESCE(iu.name, ''), ' ', COALESCE(iu.prenom, '')))";

/**
 * HÔPITAL > CONSULTATIONS
 * Équivalent Laravel : Hospital\ConsultationController + ConsultationRepository
 *   today   → consultations nouvelles / du jour en cours (status = 0)
 *   history → historique des consultations avec ordonnances, arrêts et examens
 *   detail  → fiche détaillée d'une consultation
 */
@Injectable()
export class ConsultationsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Consultations nouvelles / en cours (today.blade.php) */
  async nouvelles(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);

    const rows: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.date_consultation, c.motif_consultation,
              c.status, c.created_at, c.montant,
              p.id AS patient_id, p.code_patient, p.img_url AS patient_img, p.gender AS patient_genre,
              ${NOM_PATIENT} AS patient_nom,
              ${NOM_MEDECIN} AS medecin_nom,
              s.libelle AS service_libelle
         FROM consultations c
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
        WHERE c.hospital_id = ? AND c.status = 0
        ORDER BY c.date_consultation DESC, c.id DESC`,
      [hospitalId],
    );

    return rows.map((r) => ({
      id: Number(r.id),
      code: (r.code_consultation as string) ?? null,
      date: (r.date_consultation as string) ?? null,
      createdAt: r.created_at,
      motif: (r.service_libelle as string) ?? (r.motif_consultation as string) ?? 'Consultation',
      motifDetail: (r.motif_consultation as string) ?? null,
      montant: r.montant != null ? Number(r.montant) : null,
      patient: {
        id: r.patient_id != null ? Number(r.patient_id) : null,
        code: (r.code_patient as string) ?? '—',
        nom: (r.patient_nom as string) || '—',
        imgUrl: (r.patient_img as string) ?? null,
        genre: (r.patient_genre as string) ?? null,
      },
      medecin: (r.medecin_nom as string) || 'Non assigné',
      terminee: Number(r.status) === 1,
    }));
  }

  /** Historique des consultations (history.blade.php) */
  async historique(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);

    const rows: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.date_consultation, c.motif_consultation,
              c.status, c.created_at, c.montant,
              p.id AS patient_id, p.code_patient, p.img_url AS patient_img, p.gender AS patient_genre,
              ${NOM_PATIENT} AS patient_nom,
              ${NOM_MEDECIN} AS medecin_nom,
              s.libelle AS service_libelle,
              (SELECT COUNT(*) FROM ordonnances o WHERE o.consultation_id = c.id) AS nb_ordonnances,
              (SELECT COUNT(*) FROM arret_travails a WHERE a.consultation_id = c.id) AS nb_arrets,
              (SELECT COUNT(*) FROM bulletin_examens b WHERE b.consultation_id = c.id) AS nb_examens
         FROM consultations c
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
        WHERE c.hospital_id = ?
        ORDER BY c.date_consultation DESC, c.id DESC`,
      [hospitalId],
    );

    return rows.map((r) => ({
      id: Number(r.id),
      code: (r.code_consultation as string) ?? null,
      date: (r.date_consultation as string) ?? null,
      createdAt: r.created_at,
      motif: (r.service_libelle as string) ?? (r.motif_consultation as string) ?? 'Consultation',
      motifDetail: (r.motif_consultation as string) ?? null,
      montant: r.montant != null ? Number(r.montant) : null,
      patient: {
        id: r.patient_id != null ? Number(r.patient_id) : null,
        code: (r.code_patient as string) ?? '—',
        nom: (r.patient_nom as string) || '—',
        imgUrl: (r.patient_img as string) ?? null,
        genre: (r.patient_genre as string) ?? null,
      },
      medecin: (r.medecin_nom as string) || '—',
      terminee: Number(r.status) === 1,
      nbOrdonnances: Number(r.nb_ordonnances ?? 0),
      nbArrets: Number(r.nb_arrets ?? 0),
      nbExamens: Number(r.nb_examens ?? 0),
    }));
  }

  /** Détail complet d'une consultation (detail.blade.php) */
  async detail(userId: number, id: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);

    const [r]: Ligne[] = await this.db.query(
      `SELECT c.*,
              p.id AS patient_id, p.code_patient, p.gender AS patient_genre, p.birth_date AS patient_naissance,
              p.telephone AS patient_tel, p.img_url AS patient_img,
              ${NOM_PATIENT} AS patient_nom,
              ${NOM_MEDECIN} AS medecin_nom,
              ${NOM_INFIRMIER} AS infirmier_nom,
              s.libelle AS service_libelle,
              ic.libelle AS issue_libelle
         FROM consultations c
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN infirmiers i ON i.id = c.infirmier_id
         LEFT JOIN users iu ON iu.id = i.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN issue_consultations ic ON ic.id = c.issue_consultation_id
        WHERE c.id = ? AND c.hospital_id = ?
        LIMIT 1`,
      [id, hospitalId],
    );

    if (!r) throw new NotFoundException('Consultation introuvable');

    const [ordonnances, arrets, examens] = await Promise.all([
      this.db
        .query(`SELECT id, code, type, date, created_at FROM ordonnances WHERE consultation_id = ? ORDER BY id DESC`, [id])
        .catch(() => []),
      this.db
        .query(
          `SELECT id, code, date_debut, date_fin, nb_jour, motif, created_at FROM arret_travails WHERE consultation_id = ? ORDER BY id DESC`,
          [id],
        )
        .catch(() => []),
      this.db
        .query(`SELECT id, code, nature_examen, renseignement_clinique, created_at FROM bulletin_examens WHERE consultation_id = ? ORDER BY id DESC`, [id])
        .catch(() => []),
    ]);

    return {
      id: Number(r.id),
      code: (r.code_consultation as string) ?? null,
      date: (r.date_consultation as string) ?? null,
      createdAt: r.created_at,
      terminee: Number(r.status) === 1,
      service: (r.service_libelle as string) ?? null,
      motif: (r.motif_consultation as string) ?? null,
      issue: (r.issue_libelle as string) ?? null,
      montant: r.montant != null ? Number(r.montant) : null,
      constantes: {
        temperature: r.temperature ?? null,
        tension: r.tension ?? r.ta ?? null,
        poids: r.poids ?? null,
        taille: r.taille ?? null,
        pouls: r.pouls ?? null,
        frequenceRespiratoire: r.frequence_respiratoire ?? null,
      },
      diagnostic: (r.diagnostic as string) ?? (r.observation as string) ?? (r.resume_syndromique as string) ?? null,
      patient: {
        id: r.patient_id != null ? Number(r.patient_id) : null,
        code: (r.code_patient as string) ?? '—',
        nom: (r.patient_nom as string) || '—',
        genre: (r.patient_genre as string) ?? null,
        dateNaissance: (r.patient_naissance as string) ?? null,
        telephone: (r.patient_tel as string) ?? null,
        imgUrl: (r.patient_img as string) ?? null,
      },
      medecin: (r.medecin_nom as string) || null,
      infirmier: (r.infirmier_nom as string) || null,
      ordonnances: (ordonnances as Ligne[]).map((o) => ({
        id: Number(o.id),
        code: (o.code as string) ?? null,
        type: (o.type as string) ?? null,
        date: (o.date as string) ?? o.created_at,
      })),
      arrets: (arrets as Ligne[]).map((a) => ({
        id: Number(a.id),
        code: (a.code as string) ?? null,
        debut: (a.date_debut as string) ?? null,
        fin: (a.date_fin as string) ?? null,
        jours: a.nb_jour != null ? Number(a.nb_jour) : null,
        motif: (a.motif as string) ?? null,
      })),
      examens: (examens as Ligne[]).map((e) => ({
        id: Number(e.id),
        code: (e.code as string) ?? null,
        nature: (e.nature_examen as string) ?? null,
        renseignement: (e.renseignement_clinique as string) ?? null,
      })),
    };
  }
}

