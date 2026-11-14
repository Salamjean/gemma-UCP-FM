import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { agentDuCompte } from '../../../common/agent-sante';

export interface MajDisponibilitesDto {
  days: number[];
  hour_start: string[];
  hour_end: string[];
}

const JOURS_SEMAINE = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

@Injectable()
export class InfirmierPlanningService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Infirmier·ère OU médecin connecté (services partagés par les deux espaces) */
  private async getInfirmier(userId: number) {
    const a = await agentDuCompte(this.db, userId);
    return { infirmierId: a.infirmierId, hospitalId: a.hospitalId, hospitalNom: a.hospitalNom, typePermission: a.typePermission, role: a.role };
  }

  async getPlanning(userId: number) {
    const { hospitalId, hospitalNom } = await this.getInfirmier(userId);

    // 1. Récupérer les disponibilités de travail
    const [avail] = await this.db.query(
      `SELECT days, hour_start, hour_end FROM availabilities WHERE user_id = ? LIMIT 1`,
      [userId],
    );

    // Même lecture que Laravel (isDoctorAvailable) : jours stockés en texte ("2"), 0 = lundi ;
    // début "00:00" = toute la journée ; fin absente = 23:59.
    let activeDays: number[] = [];
    let hourStart: (string | null)[] = [];
    let hourEnd: (string | null)[] = [];

    if (avail) {
      const lire = (v: unknown) => {
        try {
          const r = typeof v === 'string' ? JSON.parse(v) : v;
          return Array.isArray(r) ? r : [];
        } catch {
          return [];
        }
      };
      activeDays = lire(avail.days).map(Number).filter((n: number) => Number.isInteger(n));
      hourStart = lire(avail.hour_start);
      hourEnd = lire(avail.hour_end);
    }

    const grilleJours = JOURS_SEMAINE.map((nom, index) => {
      const debut = hourStart[index] || '00:00';
      return {
        index,
        nom,
        travaille: activeDays.includes(index),
        debut,
        fin: hourEnd[index] || '23:59',
        journeeEntiere: debut === '00:00' && !hourEnd[index],
      };
    });

    // 2. Récupérer les rendez-vous & séances programmées cette semaine
    const rdvs = await this.db.query(
      `SELECT r.id, r.date, r.heure, r.status, r.motif,
              p.code_patient,
              TRIM(CONCAT(pu.name, ' ', COALESCE(pu.prenom, ''))) AS patient_nom,
              p.telephone AS patient_telephone,
              TRIM(CONCAT(du.name, ' ', COALESCE(du.prenom, ''))) AS medecin_nom
         FROM rendez_vouses r
         LEFT JOIN consultations c ON c.id = r.consultation_id
         LEFT JOIN patients p ON p.id = r.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = r.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
        WHERE (d.hospital_id = ? OR c.hospital_id = ? OR r.doctor_id IS NULL)
          AND (r.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) OR r.date IS NULL)
        ORDER BY r.date DESC, r.heure ASC
        LIMIT 20`,
      [hospitalId, hospitalId],
    );

    return {
      hospitalNom,
      jours: grilleJours,
      rendezVous: rdvs.map((r: any) => ({
        id: Number(r.id),
        date: r.date || new Date().toISOString().slice(0, 10),
        heure: r.heure || '—',
        motif: r.motif || 'Consultation / Soins de service',
        patient: {
          code: r.code_patient || '—',
          nom: r.patient_nom || 'Patient',
          telephone: r.patient_telephone || '—',
        },
        medecin: r.medecin_nom || 'Médecin de garde',
        statut: r.status === 'complete' ? 'Terminé' : 'En attente',
      })),
    };
  }

  async majDisponibilites(userId: number, dto: MajDisponibilitesDto) {
    const daysJson = JSON.stringify(dto.days || []);
    const startJson = JSON.stringify(dto.hour_start || []);
    const endJson = JSON.stringify(dto.hour_end || []);

    const [exist] = await this.db.query(
      `SELECT id FROM availabilities WHERE user_id = ? LIMIT 1`,
      [userId],
    );

    if (exist) {
      await this.db.query(
        `UPDATE availabilities
            SET days = ?, hour_start = ?, hour_end = ?, updated_at = NOW()
          WHERE user_id = ?`,
        [daysJson, startJson, endJson, userId],
      );
    } else {
      await this.db.query(
        `INSERT INTO availabilities (user_id, days, hour_start, hour_end, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [userId, daysJson, startJson, endJson],
      );
    }

    return {
      success: true,
      message: 'Vos tranches horaires de service ont été mises à jour.',
    };
  }
}

