import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService, type ContexteAudit } from '../../common/audit/audit.service';
import { laravelNow } from '../../common/laravel';
import { smsAffectationPatient } from '../../common/sms';
import { creneauDuJour } from '../infirmier/gestion-patients/accueil.service';
import { SQL_EN_PERMISSION } from '../../common/permission-en-cours';

/** Raison pour laquelle le médecin de la consultation ne peut pas recevoir le patient maintenant */
export type RaisonIndisponible = 'sans_medecin' | 'desactive' | 'permission' | 'hors_planning';

export const LIBELLES: Record<RaisonIndisponible, string> = {
  sans_medecin: 'Aucun médecin attribué',
  desactive: 'Compte du médecin désactivé',
  permission: 'Médecin en permission',
  hors_planning: 'Hors de son planning',
};

type Ligne = Record<string, any>;

/** Affectation en attente depuis au moins ce délai (minutes) → « À réguler », même si le médecin est disponible */
export const ATTENTE_MAX_MINUTES = 30;
export const nom = (n: unknown, p: unknown) => `${(n as string) ?? ''} ${(p as string) ?? ''}`.trim();
export const sansDr = (n: string) => n.replace(/^dr\.?\s*/i, '');

/** Permission accordée couvrant maintenant (règle commune : common/permission-en-cours) */
const EN_PERMISSION = SQL_EN_PERMISSION('d.user_id');

/** Colonnes de disponibilité d'un médecin (alias d) : planning + permission */
export const DISPO_MEDECIN = `d.status AS d_status, d.\`delete\` AS d_delete, d.deleted_at AS d_deleted_at,
  av.days AS av_days, av.hour_start AS av_debut, av.hour_end AS av_fin, ${EN_PERMISSION} AS en_permission`;
export const JOINTURE_PLANNING = 'LEFT JOIN availabilities av ON av.id = (SELECT MAX(id) FROM availabilities WHERE user_id = d.user_id)';

/** Médecin indisponible maintenant ? (colonnes de DISPO_MEDECIN + doctor_id) Renvoie la raison, ou null s'il peut recevoir un patient */
export function raisonIndisponible(r: Ligne): RaisonIndisponible | null {
  if (!r.doctor_id) return 'sans_medecin';
  if (Number(r.d_status) === 1 || Number(r.d_delete) === 1 || r.d_deleted_at) return 'desactive';
  if (Number(r.en_permission) === 1) return 'permission';
  if (!creneauDuJour(r.av_days, r.av_debut, r.av_fin)) return 'hors_planning';
  return null;
}

/** Régulateur connecté (actif) et son hôpital */
export async function regulateurDuCompte(db: DataSource, userId: number) {
  const [r] = await db.query(
    'SELECT r.id, r.hospital_id, h.label AS hopital FROM fm_regulateurs r LEFT JOIN hospitals h ON h.id = r.hospital_id WHERE r.user_id = ? AND r.`delete` = 0 AND r.status = 0 LIMIT 1',
    [userId],
  );
  if (!r) throw new ForbiddenException('Profil de régulateur introuvable ou désactivé.');
  return { regulateurId: Number(r.id), hospitalId: Number(r.hospital_id), hopital: (r.hopital as string) ?? 'Hôpital' };
}

/**
 * RÉGULATEUR (rôle Gemma FM « regulateur », créé par l'hôpital dans Personnel de santé)
 * Quand le médecin choisi par l'infirmier·ère à l'affectation n'est pas disponible, le régulateur attribue
 * le patient à un autre médecin de l'hôpital, disponible maintenant. Chaque réattribution est gardée
 * dans fm_reattributions et dans le journal d'audit ; le patient reçoit un SMS avec le nouveau médecin.
 */
@Injectable()
export class RegulateurService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}

  private raison(r: Ligne) {
    return raisonIndisponible(r);
  }

  private regulateur(userId: number) {
    return regulateurDuCompte(this.db, userId);
  }

  /** Consultations ouvertes du jour dans l'hôpital, avec l'état du médecin attribué */
  async consultations(userId: number) {
    const { hospitalId, hopital } = await this.regulateur(userId);
    const rows: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.created_at, c.status_inf, c.orientation_infirmier, c.is_call_active, c.call_status, c.is_urgence,
              c.doctor_id, c.motif_consultation,
              pu.name AS patient_nom, pu.prenom AS patient_prenom, p.code_patient,
              ps.libelle AS prestation, s.libelle AS service, ph.service_hospital_id,
              du.name AS medecin_nom, du.prenom AS medecin_prenom,
              iu.name AS inf_nom, iu.prenom AS inf_prenom,
              (SELECT COUNT(*) FROM fm_reattributions fr WHERE fr.consultation_id = c.id) AS nb_reattributions,
              -- Attente depuis l'affectation, ou depuis la dernière réattribution (dates en UTC, comme Laravel)
              TIMESTAMPDIFF(MINUTE, COALESCE((SELECT MAX(fr2.created_at) FROM fm_reattributions fr2 WHERE fr2.consultation_id = c.id), c.created_at), UTC_TIMESTAMP()) AS attente_min,
              ${DISPO_MEDECIN}
         FROM consultations c
         JOIN patients p ON p.id = c.patient_id JOIN users pu ON pu.id = p.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
         LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN doctors d ON d.id = c.doctor_id LEFT JOIN users du ON du.id = d.user_id
         ${JOINTURE_PLANNING}
         LEFT JOIN infirmiers i ON i.id = c.infirmier_id LEFT JOIN users iu ON iu.id = i.user_id
        WHERE c.hospital_id = ? AND c.status = 0 AND c.deleted_at IS NULL AND c.date_consultation = CURDATE()
        ORDER BY c.created_at DESC`,
      [hospitalId],
    );
    const [{ n }] = await this.db.query('SELECT COUNT(*) AS n FROM fm_reattributions WHERE hospital_id = ? AND DATE(created_at) = CURDATE()', [hospitalId]);

    const liste = rows.map((r) => {
      const raison = this.raison(r);
      const medecin = nom(r.medecin_nom, r.medecin_prenom);
      const enAppel = Number(r.is_call_active) === 1 && r.call_status === 'in_call';
      const attente = Math.max(0, Number(r.attente_min) || 0);
      // Patient pas encore pris en charge depuis 30 min (et pas en télémédecine avec son médecin)
      const attenteLongue = !enAppel && attente >= ATTENTE_MAX_MINUTES;
      return {
        id: Number(r.id),
        code: r.code_consultation as string,
        arrivee: r.created_at,
        patient: { nom: nom(r.patient_nom, r.patient_prenom), code: r.code_patient as string | null },
        prestation: (r.prestation as string) ?? null,
        service: (r.service as string) ?? null,
        motif: (r.motif_consultation as string) ?? null,
        medecin: r.doctor_id ? { id: Number(r.doctor_id), nom: medecin ? `Dr ${sansDr(medecin)}` : 'Médecin' } : null,
        infirmier: nom(r.inf_nom, r.inf_prenom) || null,
        etape: Number(r.status_inf) === 1 ? 'Constantes prises' : 'En attente des constantes',
        urgence: Number(r.is_urgence) === 1 || r.orientation_infirmier === 'urgence',
        enAppel,
        disponible: raison === null,
        raison: raison ? LIBELLES[raison] : null,
        /** Minutes depuis l'affectation (ou la dernière réattribution) */
        attente,
        /** À réguler : médecin indisponible OU attente ≥ 30 min */
        aReguler: raison !== null || attenteLongue,
        reattributions: Number(r.nb_reattributions),
      };
    });
    return {
      hopital,
      stats: { ouvertes: liste.length, aReguler: liste.filter((c) => c.aReguler).length, reattribueesAujourdhui: Number(n) },
      consultations: liste,
    };
  }

  /**
   * Médecins proposés pour une réattribution : ceux du SERVICE où le patient est affecté
   * (service de la prestation de la consultation), disponibles d'abord puis les moins chargés.
   */
  async medecins(userId: number, consultationId: number) {
    const { hospitalId } = await this.regulateur(userId);
    const c = await this.consultation(hospitalId, consultationId);
    if (!c.service_hospital_id) throw new BadRequestException("Cette consultation n'a pas de service : réattribution impossible.");
    const rows: Ligne[] = await this.db.query(
      `SELECT d.id, d.service_hospital_id, d.type_name, u.name, u.prenom, s.libelle AS service, t.label AS specialite, d.type_agent_id,
              (SELECT COUNT(*) FROM consultations c2 WHERE c2.doctor_id = d.id AND c2.status = 0 AND c2.deleted_at IS NULL AND c2.date_consultation = CURDATE()) AS charge,
              d.id AS doctor_id, ${DISPO_MEDECIN}
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN type_doctors t ON t.id = d.type_doctor_id
         ${JOINTURE_PLANNING}
        WHERE d.hospital_id = ? AND d.service_hospital_id = ? AND d.status = 0 AND d.\`delete\` = 0 AND d.deleted_at IS NULL`,
      [hospitalId, c.service_hospital_id],
    );
    const liste = rows
      .map((r) => {
        const raison = this.raison(r);
        const creneau = creneauDuJour(r.av_days, r.av_debut, r.av_fin);
        return {
          id: Number(r.id),
          // Sage-femme : pas de « Dr »
          nom: Number(r.type_agent_id) === 2 ? sansDr(nom(r.name, r.prenom)) : `Dr ${sansDr(nom(r.name, r.prenom))}`,
          service: (r.service as string) ?? null,
          specialite: Number(r.type_agent_id) === 2 ? 'Sage-femme' : r.type_name === 'specialiste' ? ((r.specialite as string) ?? 'Spécialiste') : 'Généraliste',
          disponible: raison === null,
          raison: raison ? LIBELLES[raison] : null,
          creneau: creneau ? (creneau.debut === '00:00' ? 'Toute la journée' : `${creneau.debut} – ${creneau.fin}`) : null,
          charge: Number(r.charge),
          actuel: Number(r.id) === Number(c.doctor_id),
        };
      })
      .sort((a, b) => Number(b.disponible) - Number(a.disponible) || a.charge - b.charge || a.nom.localeCompare(b.nom, 'fr'));
    return { consultationId, service: (c.service as string) ?? null, medecins: liste };
  }

  /** Attribue le patient à un autre médecin disponible */
  async reattribuer(userId: number, consultationId: number, doctorId: number, motif: string | undefined, ctx: ContexteAudit) {
    const { hospitalId, regulateurId } = await this.regulateur(userId);
    const c = await this.consultation(hospitalId, consultationId);
    if (Number(c.is_call_active) === 1 && c.call_status === 'in_call') {
      throw new ConflictException('Le patient est en télémédecine avec son médecin : réattribution impossible pendant l’appel.');
    }
    if (Number(c.doctor_id) === doctorId) throw new BadRequestException('Ce médecin suit déjà ce patient.');

    const [d] = await this.db.query(
      `SELECT d.id, d.service_hospital_id, u.name, u.prenom, ${DISPO_MEDECIN}
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         ${JOINTURE_PLANNING}
        WHERE d.id = ? AND d.hospital_id = ? LIMIT 1`,
      [doctorId, hospitalId],
    );
    if (!d) throw new NotFoundException('Médecin introuvable dans votre hôpital.');
    // Seulement un médecin du service où le patient est affecté
    if (!c.service_hospital_id || Number(d.service_hospital_id) !== Number(c.service_hospital_id)) {
      throw new BadRequestException(`Ce médecin n'appartient pas au service du patient${c.service ? ` (${c.service})` : ''}.`);
    }
    const raisonNouveau = this.raison({ ...d, doctor_id: d.id });
    if (raisonNouveau) throw new BadRequestException(`Ce médecin n'est pas disponible maintenant (${LIBELLES[raisonNouveau].toLowerCase()}).`);

    // Raison de l'ancien médecin, gardée dans l'historique
    const [ancien] = c.doctor_id
      ? await this.db.query(`SELECT d.id AS doctor_id, ${DISPO_MEDECIN} FROM doctors d ${JOINTURE_PLANNING} WHERE d.id = ? LIMIT 1`, [c.doctor_id])
      : [{ doctor_id: null }];
    const raisonAncien = this.raison(ancien ?? { doctor_id: null });

    const now = laravelNow();
    // MyISAM : pas d'annulation possible → tous les contrôles sont faits avant ces écritures
    const r = await this.db.query('UPDATE consultations SET doctor_id = ?, updated_at = ? WHERE id = ? AND status = 0 AND (doctor_id <=> ?)', [
      doctorId,
      now,
      c.id,
      c.doctor_id ?? null,
    ]);
    if (!(r?.affectedRows ?? 0)) throw new ConflictException('La consultation vient d’être modifiée : rechargez la liste.');
    if (c.admission_id) await this.db.query('UPDATE admissions SET doctor_id = ?, updated_at = ? WHERE id = ?', [doctorId, now, c.admission_id]);
    await this.db.query(
      'INSERT INTO fm_reattributions (consultation_id, hospital_id, ancien_doctor_id, nouveau_doctor_id, regulateur_id, raison, motif, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [c.id, hospitalId, c.doctor_id ?? null, doctorId, regulateurId, raisonAncien ? LIBELLES[raisonAncien] : null, motif?.trim() || null, now],
    );

    const nouveau = `Dr ${sansDr(nom(d.name, d.prenom))}`;
    await this.audit.log(
      ctx,
      'REATTRIBUTION_PATIENT',
      'REGULATION',
      `Patient ${c.patient} [${c.code_consultation}] réattribué à ${nouveau}${raisonAncien ? ` (${LIBELLES[raisonAncien].toLowerCase()})` : ''}`,
      { consultation_id: Number(c.id), ancien_doctor_id: c.doctor_id ?? null, nouveau_doctor_id: doctorId },
      hospitalId,
    );
    // SMS au patient avec le nouveau médecin (sans attendre)
    void smsAffectationPatient(this.db, Number(c.id));

    return { message: `${c.patient} est maintenant attribué(e) à ${nouveau}.` };
  }

  /** Historique des réattributions de l'hôpital (200 dernières) */
  async historique(userId: number) {
    const { hospitalId } = await this.regulateur(userId);
    const rows: Ligne[] = await this.db.query(
      `SELECT fr.id, fr.created_at, fr.raison, fr.motif, c.code_consultation,
              pu.name AS patient_nom, pu.prenom AS patient_prenom,
              au.name AS ancien_nom, au.prenom AS ancien_prenom, nu.name AS nouveau_nom, nu.prenom AS nouveau_prenom,
              ru.name AS regulateur_nom, ru.prenom AS regulateur_prenom
         FROM fm_reattributions fr
         JOIN consultations c ON c.id = fr.consultation_id
         JOIN patients p ON p.id = c.patient_id JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors ad ON ad.id = fr.ancien_doctor_id LEFT JOIN users au ON au.id = ad.user_id
         LEFT JOIN doctors nd ON nd.id = fr.nouveau_doctor_id LEFT JOIN users nu ON nu.id = nd.user_id
         LEFT JOIN fm_regulateurs r ON r.id = fr.regulateur_id LEFT JOIN users ru ON ru.id = r.user_id
        WHERE fr.hospital_id = ?
        ORDER BY fr.created_at DESC, fr.id DESC
        LIMIT 200`,
      [hospitalId],
    );
    return rows.map((r) => {
      const ancien = nom(r.ancien_nom, r.ancien_prenom);
      return {
        id: Number(r.id),
        date: r.created_at,
        consultation: r.code_consultation as string,
        patient: nom(r.patient_nom, r.patient_prenom),
        ancienMedecin: ancien ? `Dr ${sansDr(ancien)}` : null,
        nouveauMedecin: `Dr ${sansDr(nom(r.nouveau_nom, r.nouveau_prenom))}`,
        raison: (r.raison as string) ?? null,
        motif: (r.motif as string) ?? null,
        regulateur: nom(r.regulateur_nom, r.regulateur_prenom) || null,
      };
    });
  }

  /** Consultation ouverte de l'hôpital du régulateur */
  private async consultation(hospitalId: number, consultationId: number) {
    const [c] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.doctor_id, c.admission_id, c.is_call_active, c.call_status, c.status, ph.service_hospital_id,
              (SELECT s.libelle FROM service_hospitals sh JOIN services s ON s.id = sh.service_id WHERE sh.id = ph.service_hospital_id) AS service,
              TRIM(CONCAT(COALESCE(pu.name, ''), ' ', COALESCE(pu.prenom, ''))) AS patient
         FROM consultations c
         JOIN patients p ON p.id = c.patient_id JOIN users pu ON pu.id = p.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
        WHERE c.id = ? AND c.hospital_id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [consultationId, hospitalId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable dans votre hôpital.');
    if (Number(c.status) !== 0) throw new BadRequestException('Cette consultation est terminée.');
    return c;
  }
}
