import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Service "Soins infirmier" (table services) — même règle que DashboardController Laravel */
const SERVICE_SOINS = 5;

const nomComplet = (nom?: string | null, prenom?: string | null) =>
  `${nom ?? ''} ${prenom ?? ''}`.trim() || 'Patient';

/**
 * INFIRMIER > TABLEAU DE BORD
 * Reprend Laravel :
 *  - app/Http/Controllers/DashboardController.php (rôle infirmier)
 *  - app/Repositories/Infirmier/DashboardInfirmierRepository.php
 *  - resources/views/partials/dashboard/infirmier.blade.php
 * Deux variantes :
 *  - service 5 (Soins infirmier) → compteurs + soins du jour
 *  - autres services → patients à consulter, téléconsultations, consultations, hospitalisés
 * Toutes les données sont limitées à l'hôpital de l'infirmier connecté. Lecture seule.
 */
@Injectable()
export class InfirmierTableauDeBordService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getDonnees(userId: number) {
    const [inf] = await this.db.query(
      `SELECT i.id, i.hospital_id, sh.service_id
         FROM infirmiers i
         LEFT JOIN service_hospitals sh ON sh.id = i.service_hospital_id
        WHERE i.user_id = ? LIMIT 1`,
      [userId],
    );
    if (!inf) throw new NotFoundException('Profil infirmier introuvable');

    const infirmierId = Number(inf.id);
    const hospitalId = Number(inf.hospital_id);
    const serviceId = inf.service_id != null ? Number(inf.service_id) : null;

    if (serviceId === SERVICE_SOINS) {
      return { mode: 'soins' as const, ...(await this.soins(infirmierId, hospitalId)) };
    }
    return { mode: 'consultations' as const, ...(await this.consultations(infirmierId, hospitalId)) };
  }

  /* =========================================================
     VARIANTE SOINS INFIRMIER (service 5)
     ========================================================= */
  private async soins(infirmierId: number, hospitalId: number) {
    // Admissions de l'infirmier ou non attribuées (comme Laravel), dans son hôpital
    const filtreAdmission = `a.hospital_id = ? AND (a.infirmier_id = ? OR a.infirmier_id IS NULL)`;

    const [compteurs] = await this.db.query(
      `SELECT
         SUM(cr.status = 'pending')         AS pending,
         SUM(cr.status = 'success')         AS success,
         SUM(cr.status = 'payment_pending') AS payment_pending,
         SUM(cr.status = 'payment_success') AS payment_success
         FROM care_requesteds cr
         JOIN admissions a ON a.id = cr.admission_id
        WHERE ${filtreAdmission} AND DATE(cr.created_at) = CURDATE()`,
      [hospitalId, infirmierId],
    );

    const [total] = await this.db.query(
      `SELECT COUNT(*) AS n
         FROM care_requesteds cr
         JOIN admissions a ON a.id = cr.admission_id
        WHERE a.hospital_id = ? AND a.infirmier_id = ? AND cr.status <> 'success'`,
      [hospitalId, infirmierId],
    );

    const rows = await this.db.query(
      `SELECT cr.id, cr.status, cr.created_at,
              p.id AS patient_id, p.code_patient, pu.name, pu.prenom,
              ps.libelle AS acte, a.motif_consultation
         FROM care_requesteds cr
         JOIN admissions a ON a.id = cr.admission_id
         LEFT JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = a.prestation_hopital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
        WHERE ${filtreAdmission} AND cr.status <> 'success' AND DATE(cr.created_at) = CURDATE()
        ORDER BY cr.created_at DESC`,
      [hospitalId, infirmierId],
    );

    return {
      compteurs: {
        enAttente: Number(compteurs?.pending ?? 0),
        effectues: Number(compteurs?.success ?? 0),
        paiementsEnAttente: Number(compteurs?.payment_pending ?? 0),
        paiementsEffectues: Number(compteurs?.payment_success ?? 0),
      },
      totalSoinsNonTermines: Number(total?.n ?? 0),
      soins: rows.map((r: any) => ({
        id: Number(r.id),
        statut: String(r.status),
        heure: r.created_at,
        patient: {
          id: r.patient_id != null ? Number(r.patient_id) : null,
          code: r.code_patient ?? '—',
          nom: nomComplet(r.name, r.prenom),
        },
        acte: r.acte ?? null,
        motif: r.motif_consultation ?? null,
      })),
    };
  }

  /* =========================================================
     VARIANTE CONSULTATIONS (autres services)
     ========================================================= */
  private async consultations(infirmierId: number, hospitalId: number) {
    const filtreInf = `c.hospital_id = ? AND (c.infirmier_id = ? OR c.infirmier_id IS NULL)`;

    const [aConsulterRows, [total], teleRows, historiqueRows, hospRows] = await Promise.all([
      // File d'attente du jour : consultations effectuées aujourd'hui par l'infirmier·ère connecté·e
      // (bouton « Consulter » : à son nom, sans médecin) — en cours ou terminées
      this.db.query(
        `SELECT c.id, c.code_consultation, c.created_at, c.status,
                p.id AS patient_id, p.code_patient, pu.name, pu.prenom,
                ps.libelle AS type_visite, COALESCE(a.motif_consultation, c.motif_consultation) AS motif
           FROM consultations c
           LEFT JOIN patients p ON p.id = c.patient_id
           LEFT JOIN users pu ON pu.id = p.user_id
           LEFT JOIN admissions a ON a.id = c.admission_id
           LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
           LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
          WHERE c.hospital_id = ? AND c.infirmier_id = ? AND c.doctor_id IS NULL AND c.deleted_at IS NULL
            AND c.date_consultation = CURDATE()
          ORDER BY c.status ASC, c.created_at DESC`,
        [hospitalId, infirmierId],
      ),
      // Lien « Historique » : toutes les consultations effectuées par l'infirmier·ère
      this.db.query(
        `SELECT COUNT(*) AS n FROM consultations c
          WHERE c.hospital_id = ? AND c.infirmier_id = ? AND c.doctor_id IS NULL AND c.deleted_at IS NULL`,
        [hospitalId, infirmierId],
      ),
      // Téléconsultations avec les médecins
      this.db.query(
        `SELECT c.id, c.desired_date, c.desired_time, c.date_consultation, c.created_at,
                c.orientation_infirmier, c.is_urgence, c.is_call_active, c.call_status,
                c.doctor_id, c.motif_consultation,
                p.code_patient, pu.name, pu.prenom,
                du.name AS doc_nom, du.prenom AS doc_prenom,
                ps.libelle AS prestation
           FROM consultations c
           LEFT JOIN patients p ON p.id = c.patient_id
           LEFT JOIN users pu ON pu.id = p.user_id
           LEFT JOIN doctors d ON d.id = c.doctor_id
           LEFT JOIN users du ON du.id = d.user_id
           LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
           LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
          WHERE ${filtreInf} AND c.deleted_at IS NULL
            AND (c.orientation_infirmier IN ('teleconsultation', 'urgence') OR c.is_urgence = 1)
            AND c.status = 0
            AND c.call_status NOT IN ('completed', 'cancelled')
          ORDER BY c.created_at DESC`,
        [hospitalId, infirmierId],
      ),
      // Liste de vos consultations (terminées côté infirmier)
      this.db.query(
        `SELECT c.id, c.date_consultation, c.created_at, c.status, c.status_inf,
                p.id AS patient_id, p.code_patient, pu.name, pu.prenom,
                COALESCE(ps.libelle, s.libelle) AS motif,
                (SELECT COUNT(*) FROM ordonnances o WHERE o.consultation_id = c.id)      AS nb_ordonnances,
                (SELECT COUNT(*) FROM arret_travails art WHERE art.consultation_id = c.id) AS nb_arrets,
                (SELECT COUNT(*) FROM bulletin_examens b WHERE b.consultation_id = c.id) AS nb_examens
           FROM consultations c
           LEFT JOIN patients p ON p.id = c.patient_id
           LEFT JOIN users pu ON pu.id = p.user_id
           LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
           LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
           LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
           LEFT JOIN services s ON s.id = sh.service_id
          WHERE c.infirmier_id = ? AND c.deleted_at IS NULL AND c.status_inf = 1
          ORDER BY c.created_at DESC
          LIMIT 50`,
        [infirmierId],
      ),
      // Patients hospitalisés de l'hôpital (même périmètre que « Hospitalisations en cours »),
      // une ligne par hospitalisation (dernière journée) ; ceux confiés à l'infirmier(ère) connecté(e) d'abord.
      this.db.query(
        `SELECT dh.id, dh.status, h.created_at, dh.infirmier_id,
                h.id AS hospitalisation_id, h.code, h.type,
                p.code_patient, p.img_url, p.gender, pu.name, pu.prenom,
                du.name AS doc_nom, du.prenom AS doc_prenom,
                (SELECT CONCAT(r.number, ' · lit ', b.number) FROM beds b JOIN bedrooms r ON r.id = b.bedroom_id WHERE b.id = dh.bed_id) AS lit
           FROM hospitalisations h
           JOIN consultations c ON c.id = h.consultation_id
           LEFT JOIN day_hospitalisations dh ON dh.id = (SELECT MAX(x.id) FROM day_hospitalisations x WHERE x.hospitalisation_id = h.id)
           LEFT JOIN patients p ON p.id = c.patient_id
           LEFT JOIN users pu ON pu.id = p.user_id
           LEFT JOIN doctors d ON d.id = COALESCE(dh.doctor_id, h.doctor_id)
           LEFT JOIN users du ON du.id = d.user_id
          WHERE c.hospital_id = ? AND h.status = 'in_progress' AND h.deleted_at IS NULL
          ORDER BY (dh.infirmier_id = ?) DESC, h.created_at DESC`,
        [hospitalId, String(infirmierId)],
      ),
    ]);

    return {
      totalAConsulter: Number(total?.n ?? 0),
      aConsulter: aConsulterRows.map((r: any) => ({
        id: Number(r.id),
        code: r.code_consultation ?? null,
        heure: r.created_at,
        patient: {
          id: r.patient_id != null ? Number(r.patient_id) : null,
          code: r.code_patient ?? '—',
          nom: nomComplet(r.name, r.prenom),
        },
        typeVisite: r.type_visite ?? null,
        motif: r.motif ?? null,
        terminee: Number(r.status) === 1,
      })),
      teleconsultations: teleRows.map((r: any) => {
        const urgence = r.orientation_infirmier === 'urgence' || Number(r.is_urgence) === 1;
        const medecinAssigne = r.doctor_id != null && !!r.doc_nom;
        const enAppel = Number(r.is_call_active) === 1 && ['calling', 'accepted', 'in_call'].includes(r.call_status);
        return {
          id: Number(r.id),
          urgence,
          patient: { code: r.code_patient ?? '—', nom: nomComplet(r.name, r.prenom) },
          medecin: medecinAssigne ? `Dr ${nomComplet(r.doc_nom, r.doc_prenom).replace(/^dr\.?\s*/i, '')}` : 'Médecins de garde',
          date: r.desired_date ?? r.date_consultation ?? null,
          heure: r.desired_time ?? null,
          creeLe: r.created_at,
          motif: r.prestation ?? r.motif_consultation ?? (urgence ? 'Urgence médicale' : 'Téléconsultation'),
          etatAppel: enAppel
            ? medecinAssigne || ['accepted', 'in_call'].includes(r.call_status)
              ? ('connecte' as const)
              : ('appel' as const)
            : ('attente' as const),
        };
      }),
      historique: historiqueRows.map((r: any) => ({
        id: Number(r.id),
        date: r.date_consultation ?? null,
        creeLe: r.created_at,
        patient: {
          id: r.patient_id != null ? Number(r.patient_id) : null,
          code: r.code_patient ?? '—',
          nom: nomComplet(r.name, r.prenom),
        },
        motif: r.motif ?? 'Consultation',
        terminee: Number(r.status_inf) === 1,
        nbOrdonnances: Number(r.nb_ordonnances),
        nbArrets: Number(r.nb_arrets),
        nbExamens: Number(r.nb_examens),
      })),
      hospitalises: hospRows.map((r: any) => ({
        id: Number(r.id),
        hospitalisationId: Number(r.hospitalisation_id),
        code: r.code ?? null,
        type: r.type ?? null,
        statut: r.status,
        heure: r.created_at,
        patient: {
          nom: nomComplet(r.name, r.prenom),
          code: r.code_patient ?? '—',
          imgUrl: r.img_url ?? null,
          genre: r.gender ?? null,
        },
        medecin: r.doc_nom ? nomComplet(r.doc_nom, r.doc_prenom) : null,
        lit: r.lit ?? null,
        confieAMoi: Number(r.infirmier_id) === infirmierId,
      })),
    };
  }
}
