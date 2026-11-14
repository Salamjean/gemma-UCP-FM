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
    return { enAttente: Number(r?.n ?? 0) };
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
              c.desired_date, c.desired_time, c.orientation_infirmier,
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

    return {
      filter,
      counts: {
        all: Number(counts?.count_all || 0),
        today: Number(counts?.count_today || 0),
        upcoming: Number(counts?.count_upcoming || 0),
        completed: Number(counts?.count_completed || 0),
      },
      teleconsultations: items,
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
