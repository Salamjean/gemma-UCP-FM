import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';

/**
 * HÔPITAL > HOSPITALISATION > HOSPITALISATIONS & OBSERVATIONS (consultation seule)
 * Équivalent Laravel : Hospital\HospitalisationController, Hospital\ObservationController (+ leurs Repositories).
 * Ce sont les médecins qui créent et clôturent les hospitalisations / mises en observation ;
 * l'hôpital les suit. Données limitées aux consultations de l'hôpital (consultations.hospital_id).
 *
 * Remarque : les vues Laravel de l'hôpital lisent des colonnes qui n'existent plus (date_cloture, no_chambre…) ;
 * on s'appuie ici sur le vrai schéma : hospitalisations (code, date, end_date, status in_progress | finished…),
 * day_hospitalisations (jours, médecin, infirmier, lit), observations (date_debut, duree, date_fin…).
 */
type Ligne = Record<string, unknown>;

const NOM_PATIENT = "TRIM(CONCAT(COALESCE(pu.name, ''), ' ', COALESCE(pu.prenom, '')))";
const NOM_MEDECIN = "TRIM(CONCAT(COALESCE(du.name, ''), ' ', COALESCE(du.prenom, '')))";

@Injectable()
export class SuiviService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // --------------------------- Hospitalisations ---------------------------

  async hospitalisations(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const rows = await this.db.query(
      `SELECT h.id, h.code, h.date, h.end_date, h.status, h.motif, h.number_days, h.price,
              c.code_consultation, p.code_patient, ${NOM_PATIENT} AS patient, ${NOM_MEDECIN} AS medecin,
              (SELECT CONCAT(r.number, ' · lit ', b.number)
                 FROM day_hospitalisations dh
                 JOIN beds b ON b.id = dh.bed_id
                 JOIN bedrooms r ON r.id = b.bedroom_id
                WHERE dh.hospitalisation_id = h.id AND dh.bed_id IS NOT NULL AND dh.bed_id <> ''
                ORDER BY dh.day DESC, dh.id DESC LIMIT 1) AS lit
         FROM hospitalisations h
         JOIN consultations c ON c.id = h.consultation_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = h.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
        WHERE c.hospital_id = ? AND h.deleted_at IS NULL
        ORDER BY h.id DESC`,
      [hospitalId],
    );
    return rows.map((r: Ligne) => ({
      id: Number(r.id),
      code: r.code,
      patient: { code: r.code_patient ?? null, nom: (r.patient as string) || '—' },
      medecin: (r.medecin as string) || null,
      consultation: r.code_consultation ?? null,
      debut: r.date,
      fin: r.end_date ?? null,
      jours: r.number_days === null ? null : Number(r.number_days),
      enCours: r.status === 'in_progress',
      statut: r.status,
      motif: r.motif ?? null,
      lit: r.lit ?? null,
      prix: r.price === null || r.price === '' ? null : Number(r.price),
    }));
  }

  async hospitalisation(userId: number, id: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const [h] = await this.db.query(
      `SELECT h.*, c.code_consultation, c.motif_consultation, p.code_patient, p.gender, p.birth_date, pu.prenom AS patient_prenom,
              ${NOM_PATIENT} AS patient, ${NOM_MEDECIN} AS medecin
         FROM hospitalisations h
         JOIN consultations c ON c.id = h.consultation_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = h.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
        WHERE h.id = ? AND c.hospital_id = ? AND h.deleted_at IS NULL`,
      [id, hospitalId],
    );
    if (!h) throw new NotFoundException('Hospitalisation introuvable');

    const [jours, suivi] = await Promise.all([
      this.db.query(
        `SELECT dh.id, dh.day, dh.end_date, dh.number_days, dh.price, dh.status,
                ${NOM_MEDECIN} AS medecin,
                TRIM(CONCAT(COALESCE(iu.name, ''), ' ', COALESCE(iu.prenom, ''))) AS infirmier,
                r.number AS chambre, b.number AS lit
           FROM day_hospitalisations dh
           LEFT JOIN doctors d ON d.id = dh.doctor_id
           LEFT JOIN users du ON du.id = d.user_id
           LEFT JOIN infirmiers i ON i.id = dh.infirmier_id
           LEFT JOIN users iu ON iu.id = i.user_id
           LEFT JOIN beds b ON b.id = dh.bed_id
           LEFT JOIN bedrooms r ON r.id = b.bedroom_id
          WHERE dh.hospitalisation_id = ?
          ORDER BY dh.day DESC, dh.id DESC`,
        [id],
      ),
      this.soinsDe('hospitalisation_id', id),
    ]);

    return {
      id,
      code: h.code,
      statut: h.status,
      enCours: h.status === 'in_progress',
      debut: h.date,
      fin: h.end_date ?? null,
      jours: h.number_days === null ? null : Number(h.number_days),
      prix: h.price === null || h.price === '' ? null : Number(h.price),
      patient: { code: h.code_patient ?? null, nom: (h.patient as string) || '—', sexe: h.gender ?? null, naissance: h.birth_date ?? null },
      medecin: (h.medecin as string) || null,
      consultation: { code: h.code_consultation ?? null, motif: h.motif_consultation ?? null },
      dossier: {
        motif: h.motif ?? null,
        diagnostic: h.diagnostic ?? null,
        regime: h.regime ?? null,
        analyses: h.analyse_medical ?? null,
        sonde: h.sonde ?? null,
        oxygenotherapie: h.oxygenotherapie ?? null,
        volume: h.volume ?? null,
        remarque: h.remark ?? null,
        motifSortie: h.mot_sortie ?? null,
      },
      journees: jours.map((j: Ligne) => ({
        id: Number(j.id),
        jour: j.day,
        fin: j.end_date ?? null,
        nombre: Number(j.number_days ?? 0),
        prix: j.price === null ? null : Number(j.price),
        statut: j.status,
        medecin: (j.medecin as string) || null,
        infirmier: (j.infirmier as string) || null,
        lit: j.chambre ? `${j.chambre} · lit ${j.lit}` : null,
      })),
      ...suivi,
    };
  }

  // ----------------------------- Observations -----------------------------

  async observations(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const rows = await this.db.query(
      `SELECT o.id, o.code_observation, o.date_debut, o.date_fin, o.duree, o.diagnostic, o.created_at,
              c.code_consultation, p.code_patient, ${NOM_PATIENT} AS patient
         FROM observations o
         JOIN consultations c ON c.id = o.consultation_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
        WHERE c.hospital_id = ?
        ORDER BY o.created_at DESC, o.id DESC`,
      [hospitalId],
    );
    return rows.map((r: Ligne) => ({
      id: Number(r.id),
      code: r.code_observation,
      patient: { code: r.code_patient ?? null, nom: (r.patient as string) || '—' },
      consultation: r.code_consultation ?? null,
      debut: r.date_debut || r.created_at,
      fin: r.date_fin ?? null,
      duree: r.duree ?? null,
      diagnostic: r.diagnostic ?? null,
    }));
  }

  async observation(userId: number, id: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const [o] = await this.db.query(
      `SELECT o.*, c.code_consultation, c.motif_consultation, p.code_patient, p.gender, p.birth_date, ${NOM_PATIENT} AS patient
         FROM observations o
         JOIN consultations c ON c.id = o.consultation_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
        WHERE o.id = ? AND c.hospital_id = ?`,
      [id, hospitalId],
    );
    if (!o) throw new NotFoundException('Mise en observation introuvable');
    return {
      id,
      code: o.code_observation,
      debut: o.date_debut || o.created_at,
      fin: o.date_fin ?? null,
      duree: o.duree ?? null,
      patient: { code: o.code_patient ?? null, nom: (o.patient as string) || '—', sexe: o.gender ?? null, naissance: o.birth_date ?? null },
      consultation: { code: o.code_consultation ?? null, motif: o.motif_consultation ?? null },
      observations: o.observations ?? null,
      diagnostic: o.diagnostic ?? null,
      ...(await this.soinsDe('observation_id', id)),
    };
  }

  // ---------------------------------------------------------------------------

  /** Pathologies, soins administrés et traitements (tables partagées hospitalisation / observation) */
  private async soinsDe(colonne: 'hospitalisation_id' | 'observation_id', id: number) {
    const [pathologies, soins, traitements] = await Promise.all([
      this.db.query(`SELECT id, libelle, date FROM pathologies WHERE ${colonne} = ? ORDER BY date DESC, id DESC`, [id]),
      this.db.query(`SELECT id, libelle, date FROM soins_administres WHERE ${colonne} = ? ORDER BY date DESC, id DESC`, [id]),
      this.db.query(`SELECT id, libelle, date FROM traitements WHERE ${colonne} = ? AND deleted_at IS NULL ORDER BY id DESC`, [id]),
    ]);
    const format = (l: Ligne[]) => l.map((x) => ({ id: Number(x.id), libelle: x.libelle ?? '—', date: x.date ?? null }));
    return { pathologies: format(pathologies), soins: format(soins), traitements: format(traitements) };
  }
}
