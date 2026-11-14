import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';

type Ligne = Record<string, unknown>;

const NOM_COMPLET = "TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, '')))";
const NOM_MEDECIN = "TRIM(CONCAT(COALESCE(du.name, ''), ' ', COALESCE(du.prenom, '')))";

/**
 * HÔPITAL > PATIENTS
 * Équivalent Laravel : Hospital\PatientController + PatientRepository
 *   index → liste des patients passés par l'établissement
 *   show  → fiche détaillée du patient + historique des consultations à l'hôpital
 */
@Injectable()
export class PatientsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async liste(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);

    const rows: Ligne[] = await this.db.query(
      `SELECT p.id, p.code_patient, p.gender, p.birth_date, p.country, p.numero_identite,
              p.type_piece, p.telephone, p.img_url, p.profession, p.assurer, p.no_assurance,
              p.status, p.created_at,
              u.name, u.prenom, u.email, ${NOM_COMPLET} AS nom_complet,
              sp_act.name AS residence_actuelle,
              sp_nais.name AS lieu_naissance,
              (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = p.id AND c.hospital_id = ?) AS nb_consultations
         FROM patients p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN sub_prefectures sp_act ON sp_act.id = p.residence_actuelle_id
         LEFT JOIN sub_prefectures sp_nais ON sp_nais.id = p.lieu_de_naissance_id
        WHERE p.deleted_at IS NULL
          AND (
            p.hospital_id = ?
            OR EXISTS (SELECT 1 FROM passage_patients pp WHERE pp.patient_id = p.id AND pp.hospital_id = ?)
            OR EXISTS (SELECT 1 FROM consultations c WHERE c.patient_id = p.id AND c.hospital_id = ?)
          )
        ORDER BY p.id DESC`,
      [hospitalId, hospitalId, hospitalId, hospitalId],
    );

    return rows.map((r) => ({
      id: Number(r.id),
      codePatient: (r.code_patient as string) ?? '—',
      nom: (r.name as string) ?? '',
      prenom: (r.prenom as string) ?? '',
      nomComplet: (r.nom_complet as string) || '—',
      genre: (r.gender as string) ?? null,
      dateNaissance: (r.birth_date as string) ?? null,
      lieuNaissance: (r.lieu_naissance as string) ?? null,
      pays: (r.country as string) ?? null,
      typePiece: (r.type_piece as string) ?? null,
      numeroIdentite: (r.numero_identite as string) ?? null,
      telephone: (r.telephone as string) ?? null,
      email: (r.email as string) ?? null,
      residence: (r.residence_actuelle as string) ?? null,
      profession: (r.profession as string) ?? null,
      assure: Boolean(r.assurer && r.assurer !== '0' && r.assurer !== 'non'),
      numeroAssurance: (r.no_assurance as string) ?? null,
      imgUrl: (r.img_url as string) ?? null,
      actif: r.status == null ? true : Number(r.status) === 1,
      nbConsultations: Number(r.nb_consultations ?? 0),
      createdAt: r.created_at,
    }));
  }

  async detail(userId: number, id: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);

    const [r]: Ligne[] = await this.db.query(
      `SELECT p.*,
              u.name, u.prenom, u.email, ${NOM_COMPLET} AS nom_complet,
              sp_act.name AS residence_actuelle,
              sp_hab.name AS residence_habituelle,
              sp_nais.name AS lieu_naissance
         FROM patients p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN sub_prefectures sp_act ON sp_act.id = p.residence_actuelle_id
         LEFT JOIN sub_prefectures sp_hab ON sp_hab.id = p.residence_habituelle_id
         LEFT JOIN sub_prefectures sp_nais ON sp_nais.id = p.lieu_de_naissance_id
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1`,
      [id],
    );

    if (!r) throw new NotFoundException('Patient introuvable');

    const consultations: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.date_consultation, c.motif_consultation,
              c.status, c.created_at,
              ${NOM_MEDECIN} AS medecin,
              s.libelle AS service_libelle
         FROM consultations c
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
        WHERE c.patient_id = ? AND c.hospital_id = ?
        ORDER BY c.date_consultation DESC, c.id DESC`,
      [id, hospitalId],
    );

    return {
      id: Number(r.id),
      codePatient: (r.code_patient as string) ?? '—',
      nom: (r.name as string) ?? '',
      prenom: (r.prenom as string) ?? '',
      nomComplet: (r.nom_complet as string) || '—',
      genre: (r.gender as string) ?? null,
      dateNaissance: (r.birth_date as string) ?? null,
      lieuNaissance: (r.lieu_naissance as string) ?? null,
      pays: (r.country as string) ?? null,
      ethnie: (r.ethnie as string) ?? null,
      typePiece: (r.type_piece as string) ?? null,
      numeroIdentite: (r.numero_identite as string) ?? null,
      profession: (r.profession as string) ?? null,
      nbreEnfants: r.nbre_enfant != null ? Number(r.nbre_enfant) : null,
      telephone: (r.telephone as string) ?? null,
      telephone2: (r.contact2 as string) ?? null,
      email: (r.email as string) ?? null,
      residenceActuelle: (r.residence_actuelle as string) ?? null,
      residenceHabituelle: (r.residence_habituelle as string) ?? null,
      adresse: (r.address as string) ?? null,
      assure: Boolean(r.assurer && r.assurer !== '0' && r.assurer !== 'non'),
      numeroAssurance: (r.no_assurance as string) ?? null,
      imgUrl: (r.img_url as string) ?? null,
      actif: r.status == null ? true : Number(r.status) === 1,
      urgence1: {
        nom: (r.nom_personne_cas_urgence as string) ?? null,
        telephone: (r.telephone_personne_cas_urgence as string) ?? null,
        lien: (r.lien_personne_cas_urgence as string) ?? null,
      },
      urgence2: {
        nom: (r.nom_personne2_cas_urgence as string) ?? null,
        telephone: (r.telephone_personne2_cas_urgence as string) ?? null,
        lien: (r.lien_personne2_cas_urgence as string) ?? null,
      },
      createdAt: r.created_at,
      consultations: consultations.map((c) => ({
        id: Number(c.id),
        code: (c.code_consultation as string) ?? null,
        date: (c.date_consultation as string) ?? null,
        motif: (c.service_libelle as string) ?? (c.motif_consultation as string) ?? null,
        medecin: (c.medecin as string) || null,
        terminee: Number(c.status) === 1,
        createdAt: c.created_at,
      })),
    };
  }
}

