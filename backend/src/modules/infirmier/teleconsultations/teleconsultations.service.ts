import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type Ligne = Record<string, unknown>;

@Injectable()
export class InfirmierTeleconsultationsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private async getInfirmier(userId: number) {
    const [inf] = await this.db.query(
      `SELECT i.id, i.hospital_id, h.is_teleconsultation_active
         FROM infirmiers i
         LEFT JOIN hospitals h ON h.id = i.hospital_id
        WHERE i.user_id = ?
        LIMIT 1`,
      [userId],
    );
    if (!inf) {
      throw new NotFoundException('Profil infirmier introuvable pour cet utilisateur.');
    }
    return {
      infirmierId: Number(inf.id),
      hospitalId: Number(inf.hospital_id),
      teleconsultationActive: Boolean(inf.is_teleconsultation_active),
    };
  }

  /**
   * Nombre de télémédecines (téléconsultations) EN ATTENTE pour le badge de la sidebar :
   * même périmètre que la liste, consultation non terminée (status 0) et appel ni terminé ni annulé.
   */
  async compterEnAttente(userId: number) {
    const { infirmierId, hospitalId } = await this.getInfirmier(userId);
    const [r] = await this.db.query(
      `SELECT COUNT(*) AS n
         FROM consultations c
         LEFT JOIN doctors d ON d.id = c.doctor_id
        WHERE (c.hospital_id = ? OR c.infirmier_id = ? OR d.hospital_id = ?)
          AND (c.orientation_infirmier = 'teleconsultation' OR c.desired_date IS NOT NULL OR c.call_channel IS NOT NULL)
          AND c.status = 0
          AND COALESCE(c.call_status, '') NOT IN ('completed', 'cancelled')
          AND c.deleted_at IS NULL`,
      [hospitalId, infirmierId, hospitalId],
    );
    const [e] = await this.db.query(
      `SELECT COUNT(*) AS n ${InfirmierTeleconsultationsService.FROM_EXPERTISE}
        WHERE o.infirmier_id = ? AND o.doctor_id IS NULL AND fr.resultat_le IS NULL AND COALESCE(dest.status, 0) = 0`,
      [infirmierId],
    );
    return { enAttente: Number(r?.n ?? 0) + Number(e?.n ?? 0) };
  }

  /** Télé-expertises demandées depuis l'hôpital (fm_references) : consultation d'origine, destinataire, résultat */
  private static readonly FROM_EXPERTISE = `
      FROM fm_references fr
      JOIN consultations o ON o.id = fr.consultation_origine_id AND o.deleted_at IS NULL
      LEFT JOIN consultations dest ON dest.id = fr.consultation_destination_id`;

  /** Télé-expertise terminée : résultat reçu, ou consultation de l'expert terminée */
  private static readonly EXPERTISE_FINIE = '(fr.resultat_le IS NOT NULL OR COALESCE(dest.status, 0) = 1)';

  /**
   * Télé-expertises que j'ai demandées (consultations faites par moi, sans médecin), au même format que les téléconsultations (type « teleexpertise »).
   * Date / heure : prise en charge prévue (programmée) ; urgente → jour de la demande.
   */
  private async expertises(infirmierId: number, filter: string) {
    const fin = InfirmierTeleconsultationsService.EXPERTISE_FINIE;
    const jour = "COALESCE(fr.date_prevue, DATE(fr.created_at))";
    const clauses: Record<string, string> = {
      today: `AND ${jour} = CURDATE() AND NOT ${fin}`,
      upcoming: `AND ${jour} > CURDATE() AND NOT ${fin}`,
      completed: `AND ${fin}`,
      all: '',
    };
    const base = `${InfirmierTeleconsultationsService.FROM_EXPERTISE}
       JOIN patients p ON p.id = o.patient_id
       LEFT JOIN users pu ON pu.id = p.user_id
       LEFT JOIN doctors d ON d.id = fr.doctor_destination_id
       LEFT JOIN users du ON du.id = d.user_id
       LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
       LEFT JOIN services s ON s.id = sh.service_id
       LEFT JOIN services rs ON rs.id = fr.service_id
       LEFT JOIN hospitals dh ON dh.id = d.hospital_id
       LEFT JOIN infirmiers i ON i.id = o.infirmier_id
       LEFT JOIN users iu ON iu.id = i.user_id
       LEFT JOIN doctors od ON od.id = o.doctor_id
       LEFT JOIN users odu ON odu.id = od.user_id
      WHERE o.infirmier_id = ? AND o.doctor_id IS NULL`;
    const [counts] = await this.db.query(
      `SELECT COUNT(*) AS count_all,
              SUM(${jour} = CURDATE() AND NOT ${fin}) AS count_today,
              SUM(${jour} > CURDATE() AND NOT ${fin}) AS count_upcoming,
              SUM(${fin}) AS count_completed
         ${base}`,
      [infirmierId],
    );
    const rows: Ligne[] = await this.db.query(
      `SELECT fr.consultation_origine_id, fr.type, fr.urgence, fr.created_at, fr.motif,
              DATE_FORMAT(${jour}, '%Y-%m-%d') AS jour_prevu, TIME_FORMAT(fr.heure_prevue, '%H:%i') AS heure_prevue,
              DATE_FORMAT(fr.echeance, '%Y-%m-%dT%H:%i:%sZ') AS echeance, DATE_FORMAT(fr.resultat_le, '%Y-%m-%dT%H:%i:%sZ') AS resultat_le,
              ${fin} AS finie,
              o.code_consultation, o.tension_arterielle, o.temperature, o.taille, o.poids, o.imc, o.pouls,
              p.id AS patient_id, p.code_patient, TRIM(CONCAT(pu.name, ' ', COALESCE(pu.prenom, ''))) AS patient_nom,
              p.img_url AS patient_img, p.gender AS patient_genre, p.telephone AS patient_telephone,
              d.id AS doctor_id, TRIM(CONCAT(du.name, ' ', COALESCE(du.prenom, ''))) AS doctor_nom,
              COALESCE(s.libelle, rs.libelle) AS doctor_specialite, rs.libelle AS service_externe,
              COALESCE(dh.label, dh.nom_direction_generale, dh.reference) AS doctor_hospital_nom,
              COALESCE(NULLIF(TRIM(CONCAT(iu.name, ' ', COALESCE(iu.prenom, ''))), ''), TRIM(CONCAT('Dr ', odu.name, ' ', COALESCE(odu.prenom, '')))) AS demandeur
         ${base} ${clauses[filter] ?? ''}
        ORDER BY finie ASC, fr.urgence DESC, fr.echeance ASC, fr.id DESC`,
      [infirmierId],
    );
    const items = rows.map((r) => ({
      id: Number(r.consultation_origine_id),
      type: 'teleexpertise' as const,
      motif: (r.motif as string) ?? null,
      code: (r.code_consultation as string) ?? null,
      dateConsultation: null,
      desiredDate: (r.jour_prevu as string) ?? null,
      desiredTime: Number(r.urgence) === 1 ? null : ((r.heure_prevue as string) ?? null),
      createdAt: r.created_at,
      status: Number(r.finie) === 1 ? 1 : 0,
      statusInf: 1,
      terminee: Number(r.finie) === 1,
      callStatus: 'pending',
      isCallActive: false,
      callChannel: null,
      expertise: {
        externe: r.type === 'externe',
        urgente: Number(r.urgence) === 1,
        echeance: (r.echeance as string) ?? null,
        resultatLe: (r.resultat_le as string) ?? null,
      },
      patient: {
        id: r.patient_id != null ? Number(r.patient_id) : null,
        code: (r.code_patient as string) ?? '—',
        nom: (r.patient_nom as string) || 'Patient',
        imgUrl: (r.patient_img as string) ?? null,
        genre: (r.patient_genre as string) ?? null,
        telephone: (r.patient_telephone as string) ?? null,
      },
      doctor: {
        id: r.doctor_id != null ? Number(r.doctor_id) : null,
        // Externe pas encore prise en charge : le service sollicité
        nom: (r.doctor_nom as string) || (r.service_externe ? `Service ${r.service_externe as string}` : 'Non assigné'),
        specialite: (r.doctor_specialite as string) || '—',
        hopital: (r.doctor_hospital_nom as string) || (r.type === 'externe' ? 'En attente de prise en charge' : 'Hôpital partenaire'),
      },
      infirmierNom: (r.demandeur as string) || 'Demandeur',
      constantes: {
        tensionArterielle: (r.tension_arterielle as string) ?? '',
        temperature: (r.temperature as string) ?? '',
        poids: (r.poids as string) ?? '',
        taille: (r.taille as string) ?? '',
        imc: (r.imc as string) ?? '',
        pouls: (r.pouls as string) ?? '',
      },
      notes: '',
    }));
    return { counts, items };
  }

  async getTeleconsultations(userId: number, filter: 'all' | 'today' | 'upcoming' | 'completed' = 'all') {
    const { infirmierId, hospitalId } = await this.getInfirmier(userId);

    const baseWhere = `
      (c.hospital_id = ? OR c.infirmier_id = ? OR d.hospital_id = ?)
      AND (c.orientation_infirmier = 'teleconsultation' OR c.desired_date IS NOT NULL OR c.call_channel IS NOT NULL)
    `;
    const params: any[] = [hospitalId, infirmierId, hospitalId];

    // Compteurs globaux
    const [counts] = await this.db.query(
      `SELECT
         COUNT(*) AS count_all,
         SUM(CASE WHEN c.desired_date = CURDATE() AND c.status = 0 THEN 1 ELSE 0 END) AS count_today,
         SUM(CASE WHEN c.desired_date > CURDATE() AND c.status = 0 THEN 1 ELSE 0 END) AS count_upcoming,
         SUM(CASE WHEN c.status = 1 THEN 1 ELSE 0 END) AS count_completed
       FROM consultations c
       LEFT JOIN doctors d ON d.id = c.doctor_id
      WHERE ${baseWhere}`,
      params,
    );

    let filterClause = '';
    if (filter === 'today') {
      filterClause = ' AND c.desired_date = CURDATE() AND c.status = 0';
    } else if (filter === 'upcoming') {
      filterClause = ' AND c.desired_date > CURDATE() AND c.status = 0';
    } else if (filter === 'completed') {
      filterClause = ' AND c.status = 1';
    }

    const rows = await this.db.query(
      `SELECT c.id, c.code_consultation, c.date_consultation, c.created_at,
              c.status, c.status_inf, c.call_status, c.is_call_active, c.call_channel,
              -- Texte « AAAA-MM-JJ » / « HH:MM » : pas de décalage de fuseau horaire (compte à rebours)
              DATE_FORMAT(c.desired_date, '%Y-%m-%d') AS desired_date, TIME_FORMAT(c.desired_time, '%H:%i') AS desired_time,
              c.orientation_infirmier, c.is_urgence,
              COALESCE(NULLIF(c.motif_consultation, ''), a.motif_consultation) AS motif,
              c.tension_arterielle, c.temperature, c.taille, c.poids, c.imc, c.pouls,
              c.observation_infirmiere,
              p.id AS patient_id, p.code_patient,
              TRIM(CONCAT(pu.name, ' ', COALESCE(pu.prenom, ''))) AS patient_nom,
              p.img_url AS patient_img, p.gender AS patient_genre, p.telephone AS patient_telephone,
              d.id AS doctor_id,
              TRIM(CONCAT(du.name, ' ', COALESCE(du.prenom, ''))) AS doctor_nom,
              s.libelle AS doctor_specialite,
              COALESCE(dh.label, dh.nom_direction_generale, dh.reference, 'Hôpital partenaire') AS doctor_hospital_nom,
              TRIM(CONCAT(iu.name, ' ', COALESCE(iu.prenom, ''))) AS infirmier_nom
         FROM consultations c
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN hospitals dh ON dh.id = d.hospital_id
         LEFT JOIN infirmiers i ON i.id = c.infirmier_id
         LEFT JOIN users iu ON iu.id = i.user_id
        WHERE ${baseWhere} ${filterClause}
        ORDER BY
          CASE WHEN c.desired_date = CURDATE() THEN 0 ELSE 1 END ASC,
          c.desired_date DESC,
          c.desired_time DESC,
          c.id DESC`,
      params,
    );

    const items = rows.map((r: Ligne) => ({
      id: Number(r.id),
      // Appel d'urgence (vers les médecins de garde) ou téléconsultation programmée
      type: r.orientation_infirmier === 'urgence' || Number(r.is_urgence) === 1 ? ('urgence' as const) : ('teleconsultation' as const),
      expertise: null,
      motif: (r.motif as string) ?? null,
      code: (r.code_consultation as string) ?? null,
      dateConsultation: (r.date_consultation as string) ?? null,
      desiredDate: (r.desired_date as string) ?? null,
      desiredTime: (r.desired_time as string) ?? null,
      createdAt: r.created_at,
      status: Number(r.status),
      statusInf: Number(r.status_inf),
      terminee: Number(r.status) === 1,
      callStatus: (r.call_status as string) ?? 'pending',
      isCallActive: Boolean(r.is_call_active),
      callChannel: (r.call_channel as string) ?? null,
      patient: {
        id: r.patient_id != null ? Number(r.patient_id) : null,
        code: (r.code_patient as string) ?? '—',
        nom: (r.patient_nom as string) || 'Patient',
        imgUrl: (r.patient_img as string) ?? null,
        genre: (r.patient_genre as string) ?? null,
        telephone: (r.patient_telephone as string) ?? null,
      },
      doctor: {
        id: r.doctor_id != null ? Number(r.doctor_id) : null,
        nom: (r.doctor_nom as string) || 'Non assigné',
        specialite: (r.doctor_specialite as string) || 'Médecine générale',
        hopital: (r.doctor_hospital_nom as string) || 'Hôpital partenaire',
      },
      infirmierNom: (r.infirmier_nom as string) || 'Infirmier référent',
      constantes: {
        tensionArterielle: (r.tension_arterielle as string) ?? '',
        temperature: (r.temperature as string) ?? '',
        poids: (r.poids as string) ?? '',
        taille: (r.taille as string) ?? '',
        imc: (r.imc as string) ?? '',
        pouls: (r.pouls as string) ?? '',
      },
      notes: (r.observation_infirmiere as string) ?? '',
    }));

    // Télé-expertises que j'ai demandées, après les téléconsultations (les non terminées d'abord, urgentes en tête)
    const ex = await this.expertises(infirmierId, filter);
    const n = (a: unknown, b: unknown) => Number(a || 0) + Number(b || 0);
    return {
      filter,
      counts: {
        all: n(counts?.count_all, ex.counts?.count_all),
        today: n(counts?.count_today, ex.counts?.count_today),
        upcoming: n(counts?.count_upcoming, ex.counts?.count_upcoming),
        completed: n(counts?.count_completed, ex.counts?.count_completed),
      },
      teleconsultations: [...items, ...ex.items].sort((a, b) => Number(a.terminee) - Number(b.terminee)),
    };
  }

  async lancerAppel(userId: number, consultationId: number) {
    const { infirmierId } = await this.getInfirmier(userId);

    const [cons] = await this.db.query(
      `SELECT id, call_channel, call_status, is_call_active
         FROM consultations
        WHERE id = ?
        LIMIT 1`,
      [consultationId],
    );

    if (!cons) {
      throw new NotFoundException('Consultation introuvable.');
    }

    let channel = cons.call_channel as string;
    if (!channel) {
      channel = `teleconsult_sch_${consultationId}_${Math.random().toString(36).substring(2, 9)}`;
    }

    await this.db.query(
      `UPDATE consultations
          SET call_channel = ?,
              call_status = 'calling',
              is_call_active = 1,
              call_started_at = NOW(),
              infirmier_id = COALESCE(infirmier_id, ?)
        WHERE id = ?`,
      [channel, infirmierId, consultationId],
    );

    return {
      success: true,
      message: 'Appel téléconsultation lancé avec succès.',
      callChannel: channel,
      callStatus: 'calling',
      isCallActive: true,
    };
  }
}
