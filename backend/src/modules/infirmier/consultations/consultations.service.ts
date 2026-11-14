import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type Ligne = Record<string, unknown>;

const NOM_PATIENT = "TRIM(CONCAT(COALESCE(pu.name, ''), ' ', COALESCE(pu.prenom, '')))";
const NOM_MEDECIN = "TRIM(CONCAT(COALESCE(du.name, ''), ' ', COALESCE(du.prenom, '')))";

export interface EnregistrerConstantesDto {
  consultation_id: number;
  tension_arterielle?: string | null;
  temperature?: string | null;
  taille?: string | null;
  poids?: string | null;
  imc?: string | null;
  pouls?: string | null;
  observation_infirmiere?: string | null;
  orientation_infirmier?: 'sortie' | 'teleconsultation' | 'urgence' | null;
  type_soins_infirmier?: string | null;
  observation_soins?: string | null;
  doctor_id?: number | null;
  teleconsultation_hospital_id?: number | null;
  desired_date?: string | null;
  desired_time?: string | null;
}

@Injectable()
export class InfirmierConsultationsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Récupère les IDs infirmier et hôpital depuis le compte utilisateur */
  private async getInfirmier(userId: number) {
    const [inf] = await this.db.query(
      `SELECT i.id, i.hospital_id, h.is_teleconsultation_active, h.label AS hospital_label,
              h.nom_direction_generale, h.reference AS hospital_reference, h.district_sanitaire
         FROM infirmiers i
         LEFT JOIN hospitals h ON h.id = i.hospital_id
        WHERE i.user_id = ? LIMIT 1`,
      [userId],
    );
    if (!inf) throw new NotFoundException('Profil infirmier introuvable');
    return {
      infirmierId: Number(inf.id),
      hospitalId: Number(inf.hospital_id),
      teleconsultationActive: Number(inf.is_teleconsultation_active) === 1,
      hospitalLabel: inf.hospital_label || inf.nom_direction_generale || 'Hôpital',
      hospitalReference: inf.hospital_reference || '',
      hospitalDistrict: inf.district_sanitaire || '',
    };
  }

  /** Consultations du jour en attente (today) - status_inf = 0 */
  async today(userId: number) {
    const { infirmierId, hospitalId } = await this.getInfirmier(userId);

    const rows: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.date_consultation, c.created_at,
              c.status, c.status_inf, c.orientation_infirmier,
              COALESCE(a.motif_consultation, c.motif_consultation) AS motif,
              p.id AS patient_id, p.code_patient, p.img_url AS patient_img, p.gender AS patient_genre,
              ${NOM_PATIENT} AS patient_nom,
              ${NOM_MEDECIN} AS medecin_nom,
              ps.libelle AS prestation_libelle,
              (SELECT COUNT(*) FROM ordonnances o WHERE o.consultation_id = c.id) AS nb_ordonnances,
              (SELECT COUNT(*) FROM arret_travails a WHERE a.consultation_id = c.id) AS nb_arrets,
              (SELECT COUNT(*) FROM bulletin_examens b WHERE b.consultation_id = c.id) AS nb_examens
         FROM consultations c
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
        WHERE c.hospital_id = ?
          AND (c.infirmier_id = ? OR c.infirmier_id IS NULL)
          AND c.date_consultation = CURDATE()
          AND c.status_inf = 0
          AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC`,
      [hospitalId, infirmierId],
    );

    return rows.map((r) => this.mapperConsultation(r));
  }

  /** Toutes les consultations sans filtre (all) - non terminées côté infirmier (status_inf = 0) */
  async all(userId: number) {
    const { infirmierId, hospitalId } = await this.getInfirmier(userId);

    const rows: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.date_consultation, c.created_at,
              c.status, c.status_inf, c.orientation_infirmier,
              COALESCE(a.motif_consultation, c.motif_consultation) AS motif,
              p.id AS patient_id, p.code_patient, p.img_url AS patient_img, p.gender AS patient_genre,
              ${NOM_PATIENT} AS patient_nom,
              ${NOM_MEDECIN} AS medecin_nom,
              ps.libelle AS prestation_libelle,
              (SELECT COUNT(*) FROM ordonnances o WHERE o.consultation_id = c.id) AS nb_ordonnances,
              (SELECT COUNT(*) FROM arret_travails a WHERE a.consultation_id = c.id) AS nb_arrets,
              (SELECT COUNT(*) FROM bulletin_examens b WHERE b.consultation_id = c.id) AS nb_examens
         FROM consultations c
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
        WHERE c.hospital_id = ?
          AND (c.infirmier_id = ? OR c.infirmier_id IS NULL)
          AND c.status_inf = 0
          AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC`,
      [hospitalId, infirmierId],
    );

    return rows.map((r) => this.mapperConsultation(r));
  }

  /** Historique des consultations (history) */
  async history(userId: number) {
    const { infirmierId, hospitalId } = await this.getInfirmier(userId);

    const rows: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.date_consultation, c.created_at,
              c.status, c.status_inf, c.orientation_infirmier,
              COALESCE(a.motif_consultation, c.motif_consultation) AS motif,
              p.id AS patient_id, p.code_patient, p.img_url AS patient_img, p.gender AS patient_genre,
              ${NOM_PATIENT} AS patient_nom,
              ${NOM_MEDECIN} AS medecin_nom,
              ps.libelle AS prestation_libelle,
              (SELECT COUNT(*) FROM ordonnances o WHERE o.consultation_id = c.id) AS nb_ordonnances,
              (SELECT COUNT(*) FROM arret_travails a WHERE a.consultation_id = c.id) AS nb_arrets,
              (SELECT COUNT(*) FROM bulletin_examens b WHERE b.consultation_id = c.id) AS nb_examens
         FROM consultations c
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
        WHERE c.hospital_id = ?
          AND (c.infirmier_id = ? OR (c.infirmier_id IS NULL AND c.status_inf = 1))
          AND (c.date_consultation < CURDATE() OR c.status_inf = 1)
          AND c.deleted_at IS NULL
        ORDER BY c.date_consultation DESC, c.created_at DESC`,
      [hospitalId, infirmierId],
    );

    return rows.map((r) => this.mapperConsultation(r));
  }

  /** Détail d'une consultation (formulaire prise de constantes ou consultation terminée) */
  async getFormulaire(userId: number, consultationId: number) {
    const infInfo = await this.getInfirmier(userId);

    const [row] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.date_consultation, c.created_at,
              c.status, c.status_inf, c.orientation_infirmier, c.is_urgence,
              c.tension_arterielle, c.temperature, c.taille, c.poids, c.imc, c.pouls,
              c.observation_infirmiere, c.type_soins_infirmier, c.observation_soins,
              c.desired_date, c.desired_time, c.doctor_id, c.hospital_id,
              COALESCE(a.motif_consultation, c.motif_consultation) AS motif,
              p.id AS patient_id, p.code_patient, p.img_url AS patient_img,
              p.gender AS patient_genre, p.birth_date AS patient_birth_date,
              p.profession AS patient_profession, p.telephone AS patient_telephone,
              p.num_cmu AS patient_num_cmu, p.no_assurance AS patient_no_assurance,
              p.address AS patient_adresse,
              sp_nais.name AS lieu_naissance_nom,
              sp_res.name AS residence_nom,
              ${NOM_PATIENT} AS patient_nom,
              d.id AS current_doctor_id,
              ${NOM_MEDECIN} AS current_doctor_nom,
              ps.libelle AS service_libelle
         FROM consultations c
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN sub_prefectures sp_nais ON sp_nais.id = p.lieu_de_naissance_id
         LEFT JOIN sub_prefectures sp_res ON sp_res.id = p.residence_actuelle_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
        WHERE c.id = ? AND c.hospital_id = ?
        LIMIT 1`,
      [consultationId, infInfo.hospitalId],
    );

    if (!row) throw new NotFoundException('Consultation introuvable.');

    // Médecins actifs de l'hôpital pour assignation ou téléconsultation
    // (Laravel : status 0 = Activé, 1 = Désactivé ; delete = 1 → médecin supprimé de la liste)
    const doctors = await this.db.query(
      `SELECT d.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.prenom, ''))) AS nom,
              s.libelle AS specialite
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
        WHERE d.hospital_id = ? AND d.status = 0 AND d.\`delete\` = 0 AND d.deleted_at IS NULL
        ORDER BY u.name ASC`,
      [infInfo.hospitalId],
    );

    return {
      consultation: {
        id: Number(row.id),
        code: (row.code_consultation as string) ?? null,
        date: (row.date_consultation as string) ?? null,
        createdAt: row.created_at,
        status: Number(row.status),
        statusInf: Number(row.status_inf),
        terminee: Number(row.status_inf) === 1,
        motif: (row.motif as string) ?? 'Consultation générale',
        serviceLibelle: (row.service_libelle as string) ?? 'Consultation générale',
        orientationInfirmier: (row.orientation_infirmier as string) ?? null,
        isUrgence: Number(row.is_urgence) === 1,
        constantes: {
          tensionArterielle: (row.tension_arterielle as string) ?? '',
          temperature: (row.temperature as string) ?? '',
          taille: (row.taille as string) ?? '',
          poids: (row.poids as string) ?? '',
          imc: (row.imc as string) ?? '',
          pouls: (row.pouls as string) ?? '',
        },
        observationInfirmiere: (row.observation_infirmiere as string) ?? '',
        typeSoinsInfirmier: (row.type_soins_infirmier as string) ?? '',
        observationSoins: (row.observation_soins as string) ?? '',
        doctorId: row.current_doctor_id ? Number(row.current_doctor_id) : null,
        doctorNom: (row.current_doctor_nom as string) ?? null,
        desiredDate: (row.desired_date as string) ?? null,
        desiredTime: (row.desired_time as string) ?? null,
        patient: {
          id: row.patient_id != null ? Number(row.patient_id) : null,
          code: (row.code_patient as string) ?? '—',
          nom: (row.patient_nom as string) || '—',
          imgUrl: (row.patient_img as string) ?? null,
          genre: (row.patient_genre as string) ?? null,
          birthDate: (row.patient_birth_date as string) ?? null,
          profession: (row.patient_profession as string) ?? null,
          telephone: (row.patient_telephone as string) ?? null,
          numCmu: (row.patient_num_cmu as string) ?? null,
          noAssurance: (row.patient_no_assurance as string) ?? null,
          adresse: (row.patient_adresse as string) ?? null,
          lieuNaissance: (row.lieu_naissance_nom as string) ?? null,
          residence: (row.residence_nom as string) ?? null,
        },
      },
      doctors: doctors.map((d: any) => ({
        id: Number(d.id),
        nom: d.nom || 'Dr.',
        specialite: d.specialite || 'Médecine générale',
      })),
      hopital: {
        id: infInfo.hospitalId,
        nom: infInfo.hospitalLabel,
        reference: infInfo.hospitalReference,
        district: infInfo.hospitalDistrict,
        teleconsultationActive: infInfo.teleconsultationActive,
      },
    };
  }

  /** Liste des hôpitaux ayant la téléconsultation active pour le modal */
  async getTeleconsultationHospitals(consultationId: number, dateStr?: string) {
    const hospitals = await this.db.query(
      `SELECT h.id, COALESCE(h.label, h.nom_direction_generale, h.reference, CONCAT('Hôpital #', h.id)) AS name,
              h.reference, h.district_sanitaire AS district, h.contact,
              (SELECT COUNT(*) FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.hospital_id = h.id AND d.status = 0 AND d.\`delete\` = 0 AND d.deleted_at IS NULL) AS available_doctors_count
         FROM hospitals h
        WHERE h.is_teleconsultation_active = 1
          AND (h.\`delete\` = 0 OR h.\`delete\` IS NULL)
        ORDER BY h.label ASC`,
    );

    return hospitals.map((h: any) => ({
      id: Number(h.id),
      name: h.name,
      reference: h.reference || `HO-${String(h.id).padStart(4, '0')}`,
      district: h.district || 'Côte d’Ivoire',
      contact: h.contact || '',
      availableDoctorsCount: Number(h.available_doctors_count || 0),
    }));
  }

  /** Médecins d'un hôpital donné disponibles pour la téléconsultation */
  async getTeleconsultationDoctors(hospitalId: number) {
    const doctors = await this.db.query(
      `SELECT d.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.prenom, ''))) AS nom,
              s.libelle AS specialite
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
        WHERE d.hospital_id = ? AND d.status = 0 AND d.\`delete\` = 0 AND d.deleted_at IS NULL
        ORDER BY u.name ASC`,
      [hospitalId],
    );

    return doctors.map((d: any) => ({
      id: Number(d.id),
      nom: d.nom || 'Dr.',
      specialite: d.specialite || 'Médecine générale',
    }));
  }

  /** Enregistrement du formulaire des constantes et orientation */
  async enregistrerConstantes(userId: number, dto: EnregistrerConstantesDto) {
    const { infirmierId, hospitalId } = await this.getInfirmier(userId);

    const [cons] = await this.db.query(
      `SELECT id, status, status_inf, call_channel, tension_arterielle, temperature, poids, pouls
         FROM consultations
        WHERE id = ? AND hospital_id = ? LIMIT 1`,
      [dto.consultation_id, hospitalId],
    );
    if (!cons) throw new NotFoundException('Consultation introuvable.');
    // Constantes déjà prises : la fiche est en consultation seule, plus de nouvelle validation
    if (Number(cons.status_inf) === 1) {
      throw new BadRequestException('Les constantes de cette consultation ont déjà été prises.');
    }

    const orientation = dto.orientation_infirmier || null;

    let newStatus = 0;
    let newStatusInf = 1;
    let isUrgence = 0;
    let callStatus: string | null = null;
    let callChannel = cons.call_channel;
    // Comme Laravel : date/heure souhaitées et médecin ne sont écrits que pour une téléconsultation (télémédecine).
    // Sinon la consultation apparaîtrait dans la liste des téléconsultations (filtre "desired_date IS NOT NULL").
    const tele = orientation === 'teleconsultation';
    const doctorId = tele ? dto.doctor_id || null : null;

    if (orientation === 'sortie') {
      // Consultation terminée par l'infirmier (soins administrés sur place)
      newStatus = 1;
      newStatusInf = 1;
    } else if (orientation === 'teleconsultation') {
      newStatus = 0;
      newStatusInf = 1;
      callStatus = 'pending';
      if (!callChannel) {
        callChannel = `consultation_${cons.id}_${Math.random().toString(36).substring(2, 10)}`;
      }
    } else if (orientation === 'urgence') {
      isUrgence = 1;
      newStatus = 0;
      newStatusInf = 1;
      callStatus = 'calling';
      if (!callChannel) {
        callChannel = `consultation_${cons.id}_${Math.random().toString(36).substring(2, 10)}`;
      }
    } else {
      // Processus standard : envoyé en file d'attente chez le médecin
      newStatus = 0;
      newStatusInf = 1;
    }

    await this.db.query(
      `UPDATE consultations
          SET infirmier_id = ?,
              tension_arterielle = ?,
              temperature = ?,
              taille = ?,
              poids = ?,
              imc = ?,
              pouls = ?,
              orientation_infirmier = ?,
              type_soins_infirmier = ?,
              observation_soins = ?,
              observation_infirmiere = ?,
              -- Soins / sortie : le patient ne va pas chez le médecin, on retire le médecin attribué
              doctor_id = IF(?, NULL, COALESCE(?, doctor_id)),
              status = ?,
              status_inf = ?,
              is_urgence = ?,
              call_status = COALESCE(?, call_status),
              call_channel = COALESCE(?, call_channel),
              desired_date = IF(?, ?, desired_date),
              desired_time = IF(?, ?, desired_time),
              updated_at = NOW()
        WHERE id = ?`,
      [
        infirmierId,
        dto.tension_arterielle || null,
        dto.temperature || null,
        dto.taille || null,
        dto.poids || null,
        dto.imc || null,
        dto.pouls || null,
        orientation,
        dto.type_soins_infirmier || null,
        dto.observation_soins || null,
        dto.observation_infirmiere || dto.observation_soins || null,
        orientation === 'sortie' ? 1 : 0,
        doctorId,
        newStatus,
        newStatusInf,
        isUrgence,
        callStatus,
        callChannel,
        tele ? 1 : 0,
        dto.desired_date || null,
        tele ? 1 : 0,
        dto.desired_time || null,
        dto.consultation_id,
      ],
    );

    let message = 'Prise de constantes enregistrée. Patient orienté vers le médecin.';
    if (orientation === 'sortie') {
      message = 'Soins administrés et consultation clôturée avec succès.';
    } else if (orientation === 'teleconsultation') {
      message = 'Téléconsultation programmée avec succès.';
    } else if (orientation === 'urgence') {
      message = "Appel d'urgence et signalement prioritaire enregistrés.";
    }

    return { success: true, message, consultationId: dto.consultation_id };
  }

  private mapperConsultation(r: Ligne) {
    return {
      id: Number(r.id),
      code: (r.code_consultation as string) ?? null,
      date: (r.date_consultation as string) ?? null,
      createdAt: r.created_at,
      status: Number(r.status),
      statusInf: Number(r.status_inf),
      terminee: Number(r.status_inf) === 1,
      motif: (r.motif as string) ?? (r.prestation_libelle as string) ?? 'Consultation générale',
      orientationInfirmier: (r.orientation_infirmier as string) ?? null,
      patient: {
        id: r.patient_id != null ? Number(r.patient_id) : null,
        code: (r.code_patient as string) ?? '—',
        nom: (r.patient_nom as string) || '—',
        imgUrl: (r.patient_img as string) ?? null,
        genre: (r.patient_genre as string) ?? null,
      },
      medecin: (r.medecin_nom as string) || 'Non assigné',
      nbOrdonnances: Number(r.nb_ordonnances ?? 0),
      nbArrets: Number(r.nb_arrets ?? 0),
      nbExamens: Number(r.nb_examens ?? 0),
    };
  }
}

