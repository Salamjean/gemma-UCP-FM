import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ajouterDocuments, listerDocuments, lireDocument, supprimerDocument, type DocumentPrive } from '../../../common/documents-prives';
import { laravelHash, laravelNow } from '../../../common/laravel';
import { creneauDuJour } from '../../infirmier/gestion-patients/accueil.service';
import { InfirmierConsultationsService } from '../../infirmier/consultations/consultations.service';
import { configLiveKit, lancerUrgence } from '../../../common/appel-video';
import { ConsultationCurativeDto, NaissanceDto } from './dto/consultation.dto';
import { MATERNITE, nettoyerMaternite, typeMaternite, type TypeMaternite } from './dto/maternite';
import { permissionEnCours, SQL_EN_PERMISSION } from '../../../common/permission-en-cours';

type Ligne = Record<string, unknown>;
const texte = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const nom = (n: unknown, p: unknown) => `${(n as string) ?? ''} ${(p as string) ?? ''}`.trim() || null;

/** Libellés des issues (valeurs mode_sortie de Laravel) */
export const LIBELLES_ISSUE: Record<string, string> = {
  sortie: 'Sortie',
  hospitalisation: 'Hospitalisation',
  observation: 'Mise en observation',
  'refere-interne': 'Télé-expertise (interne)',
  'refere-externe': 'Télé-expertise (externe)',
  'cas-presume-tb-resume': 'Cas présumé de TB référé',
  'a-revoir': 'À revoir',
  'declaration-deces-patient': 'Décédé(e)',
  teleconsultation: 'Téléconsultation',
  urgence: 'Appel d’urgence',
  reference: 'Référence',
};

/** Consultations « en attente du médecin » (Laravel : ConsultationRepository@today / allPatients) */
const EN_ATTENTE = `c.status_inf = 1 AND c.status = 0 AND c.call_channel IS NULL
  AND (c.orientation_infirmier IS NULL OR c.orientation_infirmier = '')
  AND NOT EXISTS (SELECT 1 FROM fm_references frx WHERE frx.consultation_destination_id = c.id)`;

/** Télé-expertise : consultation créée pour le médecin par une référence (interne, ou externe prise en charge) */
const TELE_EXPERTISE = `EXISTS (SELECT 1 FROM fm_references frx WHERE frx.consultation_destination_id = c.id)`;

/** Télémédecine programmée par l'infirmier (orientation « teleconsultation ») ou demande en ligne du patient */
const TELEMEDECINE = `(c.orientation_infirmier = 'teleconsultation' OR c.call_channel IS NOT NULL OR ${TELE_EXPERTISE})`;
/** Date prévue : celle de la téléconsultation, sinon celle de la télé-expertise (fm_references) */
const DATE_PREVUE = `COALESCE(c.desired_date, (SELECT frd.date_prevue FROM fm_references frd WHERE frd.consultation_destination_id = c.id LIMIT 1))`;
/** Télé-expertise close : l'expert a envoyé son résultat (même sans avoir rempli la consultation) */
const EXPERTISE_REPONDUE = `EXISTS (SELECT 1 FROM fm_references frr WHERE frr.consultation_destination_id = c.id AND frr.resultat_le IS NOT NULL)`;
const TELE_EN_ATTENTE = `${TELEMEDECINE} AND c.status = 0 AND NOT ${EXPERTISE_REPONDUE} AND COALESCE(c.call_status, '') NOT IN ('completed', 'ended', 'complete', 'cancelled')`;
const TELE_TERMINEE = `(c.status = 1 OR ${EXPERTISE_REPONDUE})`;
const dateSql = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : texte(x)?.slice(0, 10) ?? null);

const SELECT_LISTE = `
  SELECT c.id, c.code_consultation, c.date_consultation, c.created_at, c.status, c.status_inf, c.is_urgence,
         c.call_channel, c.orientation_infirmier, c.is_call_active, c.call_status,
         ${TELE_EXPERTISE} AS est_expertise,
         c.tension_arterielle, c.temperature, c.poids, c.pouls,
         COALESCE(NULLIF(c.motif_consultation, ''), a.motif_consultation) AS motif,
         p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.img_url,
         pu.name AS patient_nom, pu.prenom AS patient_prenom,
         COALESCE(ps.libelle, s.libelle) AS prestation,
         r.issue_consultation,
         (SELECT COUNT(*) FROM ordonnances o WHERE o.consultation_id = c.id AND o.deleted_at IS NULL) AS nb_ordonnances,
         (SELECT COUNT(*) FROM bulletin_examens b WHERE b.consultation_id = c.id) AS nb_examens,
         (SELECT COUNT(*) FROM arret_travails t WHERE t.consultation_id = c.id) AS nb_arrets,
         (SELECT COUNT(*) FROM hospitalisations ho WHERE ho.consultation_id = c.id AND ho.deleted_at IS NULL) AS nb_hosp
    FROM consultations c
    JOIN patients p ON p.id = c.patient_id
    JOIN users pu ON pu.id = p.user_id
    LEFT JOIN admissions a ON a.id = c.admission_id
    LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
    LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
    LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
    LEFT JOIN services s ON s.id = sh.service_id
    LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)`;

/**
 * MÉDECIN > CONSULTATIONS
 * Repris de Laravel : Doctor\ConsultationController (today, allPatients, history, formulaire, storeConsultationCurative),
 * PostConsultationController (ordonnance externe, bulletin d'examen, arrêt de travail) et IssueController
 * (justification, hospitalisation). Pas de pharmacie dans ce projet : seule l'ordonnance externe (table drugs) est gérée.
 */
@Injectable()
export class DoctorConsultationsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly tele: InfirmierConsultationsService,
  ) {}

  /** Télémédecine : hôpitaux de la DMHP (avec date / heure : nombre de médecins disponibles) */
  teleHopitaux(date?: string, heure?: string) {
    return this.tele.getTeleconsultationHospitals(0, date, heure);
  }

  /** Télémédecine : médecins d'un hôpital disponibles à la date / l'heure */
  teleMedecins(hospitalId: number, date?: string, heure?: string) {
    return this.tele.getTeleconsultationDoctors(hospitalId, date, heure);
  }

  /** Profil médecin du compte connecté */
  async medecin(userId: number) {
    const [d] = await this.db.query(
      `SELECT d.id, d.hospital_id, d.type_agent_id, u.name, u.prenom, h.label AS hopital, s.libelle AS service,
              av.days, av.hour_start, av.hour_end
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN hospitals h ON h.id = d.hospital_id
         LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN availabilities av ON av.id = (SELECT MAX(id) FROM availabilities WHERE user_id = d.user_id)
        WHERE d.user_id = ? AND d.deleted_at IS NULL
        LIMIT 1`,
      [userId],
    );
    if (!d) throw new NotFoundException('Profil médecin introuvable.');
    return d as Ligne;
  }

  /**
   * Agent qui remplit le formulaire de consultation : le médecin, ou l'infirmier·ère qui consulte lui-même
   * (bouton « Consulter » de Vérifier / Rechercher). Même forme de ligne (id, hospital_id, name, prenom) + role.
   */
  async acteur(userId: number, role: 'doctor' | 'infirmier'): Promise<Ligne> {
    if (role === 'doctor') return { ...(await this.medecin(userId)), role: 'doctor' };
    const [i] = await this.db.query(
      `SELECT i.id, i.hospital_id, u.name, u.prenom
         FROM infirmiers i JOIN users u ON u.id = i.user_id
        WHERE i.user_id = ? AND i.\`delete\` = 0 LIMIT 1`,
      [userId],
    );
    if (!i) throw new NotFoundException('Profil infirmier introuvable.');
    return { ...i, role: 'infirmier' };
  }

  /** La consultation est-elle à cet agent ? Médecin : doctor_id ; infirmier·ère : à son nom et sans médecin */
  private attribuee(c: Ligne, a: Ligne) {
    return a.role === 'infirmier'
      ? Number(c.infirmier_id) === Number(a.id) && !c.doctor_id
      : Number(c.doctor_id) === Number(a.id);
  }

  /**
   * Lecture de la fiche : l'agent à qui elle est attribuée, ou l'infirmier·ère qui a pris en charge le patient
   * (constantes) — il voit la consultation comme le médecin, en lecture seule.
   */
  private lisible(c: Ligne, a: Ligne) {
    return this.attribuee(c, a) || (a.role === 'infirmier' && Number(c.infirmier_id) === Number(a.id));
  }

  /** Date « AAAA-MM-JJ » et heure « HH:MM » locales du serveur (comme les dates saisies dans le formulaire) */
  static maintenantLocal() {
    const n = new Date();
    const p2 = (x: number) => String(x).padStart(2, '0');
    return { date: `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}`, heure: `${p2(n.getHours())}:${p2(n.getMinutes())}` };
  }

  /**
   * Délais de réponse d'une télé-expertise (tableaux cliniques de télémédecine) :
   *   - urgente (synchrone)    : réponse en moins de 30 minutes → prise en charge immédiate ;
   *   - programmée (asynchrone) : réponse en 24 à 48 heures → prise en charge à venir, dans les 48 h.
   */
  static readonly DELAI_URGENTE_MIN = 30;
  static readonly DELAI_PROGRAMMEE_H = 48;

  private verifierDelaiExpertise(date: string, heure: string, urgente: boolean) {
    if (urgente) return; // date et heure posées par le serveur (maintenant)
    const n = DoctorConsultationsService.maintenantLocal();
    if (date < n.date || (date === n.date && heure < n.heure)) {
      throw new BadRequestException('La date et l’heure de la prise en charge ne peuvent pas être dans le passé.');
    }
    const prevu = new Date(`${date}T${heure}:00`).getTime();
    if (prevu - Date.now() > DoctorConsultationsService.DELAI_PROGRAMMEE_H * 3600_000) {
      throw new BadRequestException('Télé-expertise programmée : la prise en charge doit avoir lieu dans les 48 heures (délai de réponse 24 à 48 h).');
    }
  }

  private ligne(r: Ligne) {
    const issue = texte(r.issue_consultation);
    return {
      id: Number(r.id),
      code: texte(r.code_consultation) ?? `CONS-${r.id}`,
      date: texte(r.date_consultation) ? r.date_consultation : r.created_at,
      creeLe: r.created_at,
      motif: texte(r.motif) ?? 'Consultation',
      prestation: texte(r.prestation) ?? 'Consultation générale',
      urgence: Number(r.is_urgence) === 1,
      enLigne: !!r.call_channel,
      /** Téléconsultation (programmée, en ligne ou appel d'urgence) : appel vidéo possible depuis la liste */
      teleconsultation:
        Number(r.est_expertise) !== 1 &&
        (['teleconsultation', 'urgence'].includes(String(r.orientation_infirmier ?? '')) || !!r.call_channel),
      appelEnCours: Number(r.is_call_active) === 1 || ['calling', 'in_call', 'accepted'].includes(String(r.call_status ?? '')),
      constantesPrises: Number(r.status_inf) === 1,
      terminee: Number(r.status) === 1,
      issue: issue ? (LIBELLES_ISSUE[issue] ?? issue) : null,
      documents: {
        ordonnance: Number(r.nb_ordonnances) > 0,
        examen: Number(r.nb_examens) > 0,
        arret: Number(r.nb_arrets) > 0,
        hospitalisation: Number(r.nb_hosp) > 0,
      },
      patient: {
        id: Number(r.patient_id),
        code: texte(r.code_patient) ?? '—',
        nom: nom(r.patient_nom, r.patient_prenom) ?? '—',
        genre: texte(r.gender),
        dateNaissance: texte(r.birth_date),
        imgUrl: texte(r.img_url),
      },
    };
  }

  /** Nouvelles : patients du jour en attente du médecin (urgences d'abord) */
  async nouvelles(userId: number) {
    const d = await this.medecin(userId);
    const rows: Ligne[] = await this.db.query(
      `${SELECT_LISTE}
        WHERE c.doctor_id = ? AND c.deleted_at IS NULL AND c.date_consultation = CURDATE() AND ${EN_ATTENTE}
        ORDER BY c.is_urgence DESC, c.created_at ASC, c.id ASC`,
      [d.id],
    );
    return rows.map((r) => this.ligne(r));
  }

  /** Tous les patients en attente (tous jours confondus) */
  async enAttente(userId: number) {
    const d = await this.medecin(userId);
    const rows: Ligne[] = await this.db.query(
      `${SELECT_LISTE}
        WHERE c.doctor_id = ? AND c.deleted_at IS NULL AND ${EN_ATTENTE}
        ORDER BY c.is_urgence DESC, c.created_at DESC, c.id DESC`,
      [d.id],
    );
    return rows.map((r) => this.ligne(r));
  }

  /** Historique (Laravel : ConsultationRepository@history) */
  async historique(userId: number) {
    const d = await this.medecin(userId);
    const rows: Ligne[] = await this.db.query(
      `${SELECT_LISTE}
        WHERE c.doctor_id = ? AND c.deleted_at IS NULL
          -- Historique : consultations TERMINÉES seulement (les consultations en attente sont dans les autres listes)
          AND c.status = 1
          -- Sortie décidée par l'infirmier (soins sur place) : le médecin n'a pas vu le patient
          AND (c.orientation_infirmier IS NULL OR c.orientation_infirmier <> 'sortie')
        ORDER BY c.created_at DESC, c.id DESC`,
      [d.id],
    );
    return rows.map((r) => this.ligne(r));
  }

  /** Tableau de bord : file du jour + compteurs + créneau du médecin */
  async tableauDeBord(userId: number) {
    const d = await this.medecin(userId);
    const [[compte], file] = await Promise.all([
      this.db.query(
        `SELECT SUM(${EN_ATTENTE} AND c.date_consultation = CURDATE()) AS du_jour,
                SUM(${EN_ATTENTE}) AS en_attente,
                SUM(c.status = 1 AND COALESCE(c.orientation_infirmier, '') <> 'sortie' AND DATE(c.updated_at) = UTC_DATE()) AS terminees_jour,
                SUM(c.status = 1 AND COALESCE(c.orientation_infirmier, '') <> 'sortie') AS terminees
           FROM consultations c
          WHERE c.doctor_id = ? AND c.deleted_at IS NULL`,
        [d.id],
      ),
      this.nouvelles(userId),
    ]);
    const tele = await this.telemedecines(userId, 'en-attente');
    // En permission accordée : hors service, même dans son créneau
    const enPermission = await permissionEnCours(this.db, Number(userId));
    const c = enPermission ? null : creneauDuJour(d.days, d.hour_start, d.hour_end);
    return {
      medecin: {
        permission: enPermission,
        nom: nom(d.name, d.prenom) ?? 'Docteur',
        hopital: texte(d.hopital) ?? 'Hôpital',
        service: texte(d.service),
        sageFemme: Number(d.type_agent_id) === 2,
        enService: !!c,
        creneau: c ? (c.debut === '00:00' ? 'Toute la journée' : `${c.debut} – ${c.fin}`) : null,
      },
      compteurs: {
        duJour: Number(compte?.du_jour ?? 0),
        enAttente: Number(compte?.en_attente ?? 0),
        termineesJour: Number(compte?.terminees_jour ?? 0),
        terminees: Number(compte?.terminees ?? 0),
      },
      file,
      telemedecines: tele.liste.slice(0, 10),
      telemedecinesEnAttente: tele.compteurs.enAttente,
    };
  }

  /**
   * Télémédecines du médecin (Laravel : getPendingOnlineRequests + consultations programmées par l'infirmier).
   * filtre : en-attente | aujourdhui | terminees | toutes
   */
  async telemedecines(userId: number, filtre = 'en-attente') {
    const d = await this.medecin(userId);
    const [compte] = await this.db.query(
      `SELECT SUM(${TELE_EN_ATTENTE}) AS en_attente,
              SUM(${TELE_EN_ATTENTE} AND ${DATE_PREVUE} = CURDATE()) AS aujourdhui,
              SUM(${TELE_TERMINEE}) AS terminees,
              COUNT(*) AS toutes
         FROM consultations c
        WHERE c.doctor_id = ? AND c.deleted_at IS NULL AND ${TELEMEDECINE}`,
      [d.id],
    );
    const filtres: Record<string, string> = {
      'en-attente': `AND ${TELE_EN_ATTENTE}`,
      aujourdhui: `AND ${TELE_EN_ATTENTE} AND ${DATE_PREVUE} = CURDATE()`,
      terminees: `AND ${TELE_TERMINEE}`,
      toutes: '',
    };
    const rows: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.created_at, c.status, c.call_status, c.is_call_active,
              -- Texte « AAAA-MM-JJ » / « HH:MM » : pas de conversion de fuseau horaire par le pilote MySQL
              DATE_FORMAT(COALESCE(c.desired_date, fr.date_prevue), '%Y-%m-%d') AS desired_date,
              TIME_FORMAT(COALESCE(c.desired_time, fr.heure_prevue), '%H:%i') AS desired_time,
              fr.id AS reference_id, fr.type AS reference_type, fr.consultation_origine_id, fr.created_at AS reference_le,
              fr.urgence AS expertise_urgente, fr.programmation_directe AS expertise_directe, DATE_FORMAT(fr.echeance, '%Y-%m-%dT%H:%i:%sZ') AS expertise_echeance,
              DATE_FORMAT(fr.resultat_le, '%Y-%m-%dT%H:%i:%sZ') AS expertise_resultat_le,
              odu.name AS origine_medecin_nom, odu.prenom AS origine_medecin_prenom, oiu.name AS origine_inf_nom, oiu.prenom AS origine_inf_prenom,
              oh.label AS origine_hopital,
              c.tension_arterielle, c.temperature, c.poids, c.pouls, c.saturation_oxygene, c.observation_infirmiere, c.is_urgence,
              COALESCE(NULLIF(c.motif_consultation, ''), a.motif_consultation) AS motif,
              p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.img_url, pu.name AS patient_nom, pu.prenom AS patient_prenom,
              iu.name AS infirmier_nom, iu.prenom AS infirmier_prenom, ih.label AS hopital_demandeur,
              r.issue_consultation
         FROM consultations c
         JOIN patients p ON p.id = c.patient_id
         JOIN users pu ON pu.id = p.user_id
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN infirmiers i ON i.id = c.infirmier_id
         LEFT JOIN users iu ON iu.id = i.user_id
         LEFT JOIN hospitals ih ON ih.id = COALESCE(i.hospital_id, c.hospital_id)
         LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
         -- Télé-expertise : référence d'origine (qui a demandé l'avis, depuis quel hôpital)
         LEFT JOIN fm_references fr ON fr.consultation_destination_id = c.id
         LEFT JOIN consultations oc ON oc.id = fr.consultation_origine_id
         LEFT JOIN doctors od ON od.id = oc.doctor_id LEFT JOIN users odu ON odu.id = od.user_id
         LEFT JOIN infirmiers oi ON oi.id = oc.infirmier_id AND oc.doctor_id IS NULL LEFT JOIN users oiu ON oiu.id = oi.user_id
         LEFT JOIN hospitals oh ON oh.id = oc.hospital_id
        WHERE c.doctor_id = ? AND c.deleted_at IS NULL AND ${TELEMEDECINE} ${filtres[filtre] ?? filtres['en-attente']}
        ORDER BY ${TELE_TERMINEE} ASC, COALESCE(fr.urgence, 0) DESC, (${DATE_PREVUE} IS NULL) ASC, ${DATE_PREVUE} ${filtre === 'terminees' ? 'DESC' : 'ASC'},
                 COALESCE(c.desired_time, fr.heure_prevue) ASC, c.id DESC`,
      [d.id],
    );
    const issueLib = (x: unknown) => {
      const i = texte(x)?.toLowerCase();
      return i ? (LIBELLES_ISSUE[i] ?? String(x)) : null;
    };
    return {
      compteurs: {
        enAttente: Number(compte?.en_attente ?? 0),
        aujourdhui: Number(compte?.aujourdhui ?? 0),
        terminees: Number(compte?.terminees ?? 0),
        toutes: Number(compte?.toutes ?? 0),
      },
      liste: rows.map((r) => ({
        id: Number(r.id),
        code: texte(r.code_consultation) ?? `CONS-${r.id}`,
        creeLe: r.created_at,
        date: dateSql(r.desired_date),
        heure: texte(r.desired_time)?.slice(0, 5) ?? null,
        motif: texte(r.motif) ?? 'Consultation',
        urgence: Number(r.is_urgence) === 1,
        terminee: Number(r.status) === 1 || !!r.expertise_resultat_le,
        appelEnCours: Number(r.is_call_active) === 1 || ['calling', 'in_call', 'accepted'].includes(String(r.call_status)),
        issue: issueLib(r.issue_consultation),
        /** teleconsultation | teleexpertise | urgence */
        type: r.reference_id ? 'teleexpertise' : Number(r.is_urgence) === 1 ? 'urgence' : 'teleconsultation',
        /** Télé-expertise : interne / externe, et consultation d'origine (documents partagés) */
        expertise: r.reference_id
          ? {
              externe: r.reference_type === 'externe',
              origineId: Number(r.consultation_origine_id),
              /** Urgente (synchrone, < 30 min) ou programmée (asynchrone, 24 à 48 h) */
              urgente: Number(r.expertise_urgente) === 1,
              /** L'expert a le formulaire de consultation : urgente, ou issue d'une vraie consultation (pas une programmation directe) */
              avecConsultation: Number(r.expertise_urgente) === 1 || Number(r.expertise_directe) !== 1,
              /** Heure limite de la réponse (ISO UTC) */
              echeance: texte(r.expertise_echeance),
              /** Résultat envoyé par l'expert (ISO UTC) */
              resultatLe: texte(r.expertise_resultat_le),
            }
          : null,
        // Demandeur : télé-expertise → médecin (ou infirmier·ère) qui a demandé l'avis ; sinon l'infirmier·ère qui a programmé
        infirmier: r.reference_id
          ? r.origine_medecin_nom
            ? `Dr ${String(nom(r.origine_medecin_nom, r.origine_medecin_prenom)).replace(/^dr\.?\s*/i, '')}`
            : nom(r.origine_inf_nom, r.origine_inf_prenom)
          : nom(r.infirmier_nom, r.infirmier_prenom),
        hopitalDemandeur: texte(r.reference_id ? r.origine_hopital : r.hopital_demandeur),
        note: texte(r.observation_infirmiere),
        constantes: {
          tension: texte(r.tension_arterielle),
          temperature: texte(r.temperature),
          pouls: texte(r.pouls),
          poids: texte(r.poids),
          saturation: texte(r.saturation_oxygene),
        },
        patient: {
          id: Number(r.patient_id),
          code: texte(r.code_patient) ?? '—',
          nom: nom(r.patient_nom, r.patient_prenom) ?? '—',
          genre: texte(r.gender),
          dateNaissance: texte(r.birth_date),
          imgUrl: texte(r.img_url),
        },
      })),
    };
  }

  /** Formulaire de consultation (ou fiche en lecture si la consultation est terminée) */
  /**
   * Registre de maternité (CPN / postnatale) : valeurs de la visite ; sinon nouvelle visite pré-remplie
   * (date du jour, constantes de l'infirmier·ère, antécédents repris de la visite précédente de la patiente ;
   * 1re postnatale : antécédents repris de la dernière CPN).
   */
  private async valeursMaternite(type: TypeMaternite, c: Ligne) {
    const conf = MATERNITE[type];
    const [existant] = c.registre_id ? await this.db.query(`SELECT * FROM ${conf.table} WHERE registre_id = ? ORDER BY id DESC LIMIT 1`, [c.registre_id]) : [];
    if (existant) return { valeurs: nettoyerMaternite(type, existant), reprise: null };
    const valeurs = nettoyerMaternite(type, {});
    const d = new Date();
    valeurs.date_consultation = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    if (type === 'prenatale') {
      valeurs.ta = texte(c.tension_arterielle);
      valeurs.pouls = texte(c.pouls);
    }
    if (type === 'accouchement') {
      valeurs.TA = texte(c.tension_arterielle);
      valeurs.Pouls = texte(c.pouls);
      valeurs.temperature = texte(c.temperature);
      valeurs.telephone = texte(c.telephone);
      // PMI : nombre de CPN de la patiente et âge gestationnel à la 1re CPN
      const [[pmi]] = await Promise.all([
        this.db.query(
          `SELECT COUNT(*) AS n,
                  (SELECT rp2.semaine_amenor FROM registre_consultation_pre_natales rp2 JOIN registres r2 ON r2.id = rp2.registre_id
                     JOIN consultations c3 ON c3.id = r2.consultation_id WHERE c3.patient_id = ? ORDER BY c3.created_at ASC LIMIT 1) AS sa
             FROM registre_consultation_pre_natales rp JOIN registres r ON r.id = rp.registre_id
             JOIN consultations c2 ON c2.id = r.consultation_id
            WHERE c2.patient_id = ? AND c2.deleted_at IS NULL`,
          [c.patient_id, c.patient_id],
        ),
      ]);
      if (Number(pmi?.n) > 0) {
        valeurs.nombre_cpn = String(pmi.n);
        valeurs.age_1e_cpn = texte(pmi.sa);
      }
    }
    const precedente = async (table: string) => {
      const [x] = await this.db.query(
        `SELECT t.*, c2.created_at AS visite_le
           FROM ${table} t
           JOIN registres r ON r.id = t.registre_id
           JOIN consultations c2 ON c2.id = r.consultation_id
          WHERE c2.patient_id = ? AND c2.id <> ? AND c2.deleted_at IS NULL
          ORDER BY c2.created_at DESC, t.id DESC LIMIT 1`,
        [c.patient_id, c.id],
      );
      return x as Ligne | undefined;
    };

    // Accouchement : la grossesse en cours vient de la dernière CPN (avant l'accouchement précédent)
    if (conf.cpnDabord && conf.depuisCpn) {
      const cpn = await precedente(MATERNITE.prenatale.table);
      if (cpn) {
        const v = nettoyerMaternite('prenatale', cpn);
        for (const [k, f] of Object.entries(conf.depuisCpn)) valeurs[k] = f(v) ?? valeurs[k];
        return { valeurs, reprise: { date: cpn.visite_le, source: 'prenatale' as TypeMaternite, detail: v.type_visite } };
      }
    }
    const prec = await precedente(conf.table);
    if (prec) {
      for (const k of conf.repris) valeurs[k] = texte(prec[k]);
      if (type === 'prenatale') {
        valeurs.num_gest_prec = texte(prec.num_gest_visite);
        valeurs.derniere_cpn = texte(prec.date_consultation);
        // Semaines d'aménorrhée à la date de cette visite, depuis la DDR reprise
        const ddr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valeurs.ddr ?? '');
        if (ddr) {
          const sa = Math.floor((d.getTime() - new Date(Number(ddr[3]), Number(ddr[2]) - 1, Number(ddr[1])).getTime()) / (7 * 86400000));
          if (sa >= 0 && sa <= 45) valeurs.semaine_amenor = valeurs.age_gest = String(sa);
        }
      }
      return {
        valeurs,
        reprise: { date: prec.visite_le, source: type, detail: texte(type === 'prenatale' ? prec.type_visite : type === 'postnatale' ? prec.type_consultation_postnatale : 'Accouchement précédent') },
      };
    }
    // 1re consultation postnatale : antécédents de la dernière CPN
    if (conf.depuisCpn && !conf.cpnDabord) {
      const cpn = await precedente(MATERNITE.prenatale.table);
      if (cpn) {
        const v = nettoyerMaternite('prenatale', cpn);
        for (const [k, f] of Object.entries(conf.depuisCpn)) valeurs[k] = f(v);
        return { valeurs, reprise: { date: cpn.visite_le, source: 'prenatale' as TypeMaternite, detail: v.type_visite } };
      }
    }
    return { valeurs, reprise: null };
  }

  async formulaire(userId: number, consultationId: number, role: 'doctor' | 'infirmier' = 'doctor') {
    const d = await this.acteur(userId, role);
    const [c] = await this.db.query(
      `SELECT c.*, COALESCE(NULLIF(c.motif_consultation, ''), a.motif_consultation) AS motif,
              p.code_patient, p.gender, p.birth_date, p.img_url, p.telephone, p.profession, p.num_cmu,
              (SELECT CONCAT(dl.id, '|', dl.reference) FROM declarations dl WHERE dl.consultation_id = c.id AND dl.type = 'birth' ORDER BY dl.id DESC LIMIT 1) AS declaration_naissance,
              p.group_sanguin, p.type_allergie_medicamenteuse,
              pu.name AS patient_nom, pu.prenom AS patient_prenom, sr.name AS residence,
              COALESCE(ps.libelle, s.libelle) AS prestation, ps.libelle AS prestation_service,
              ph.service_hospital_id AS consultation_service_hospital_id, s.libelle AS consultation_service,
              iu.name AS infirmier_nom, iu.prenom AS infirmier_prenom,
              r.id AS registre_id, r.code AS registre_code, r.issue_consultation, r.issue_consultation_justification,
              rc.id AS curative_id
         FROM consultations c
         JOIN patients p ON p.id = c.patient_id
         JOIN users pu ON pu.id = p.user_id
         LEFT JOIN sub_prefectures sr ON sr.id = p.residence_actuelle_id
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
         LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN infirmiers i ON i.id = c.infirmier_id
         LEFT JOIN users iu ON iu.id = i.user_id
         LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
         LEFT JOIN registre_consultation_curatives rc ON rc.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = r.id)
        WHERE c.id = ? AND c.deleted_at IS NULL
        LIMIT 1`,
      [consultationId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable.');
    if (!this.lisible(c, d)) throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");

    const [[cur], prescriptions, examens, [arret], [hosp], historique] = await Promise.all([
      c.curative_id ? this.db.query('SELECT * FROM registre_consultation_curatives WHERE id = ?', [c.curative_id]) : Promise.resolve([undefined]),
      this.db.query(
        `SELECT pr.drug_id, dr.name, dr.unite, pr.quantity, pr.dosage, pr.duration, pr.route_administration, pr.health_dietetic_advice
           FROM ordonnances o
           JOIN prescriptions pr ON pr.ordonnance_id = o.id
           LEFT JOIN drugs dr ON dr.id = pr.drug_id
          WHERE o.consultation_id = ? AND o.type = 'externe' AND o.deleted_at IS NULL
          ORDER BY pr.id`,
        [consultationId],
      ),
      this.db.query(
        `SELECT e.nature_examen FROM bulletin_examens b JOIN examens e ON e.bulletin_examen_id = b.id
          WHERE b.consultation_id = ? ORDER BY e.id`,
        [consultationId],
      ),
      this.db.query('SELECT date_debut, date_fin, nb_jour FROM arret_travails WHERE consultation_id = ? ORDER BY id DESC LIMIT 1', [consultationId]),
      this.db.query('SELECT code, status FROM hospitalisations WHERE consultation_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [consultationId]),
      this.db.query(
        `SELECT c2.id, c2.created_at, COALESCE(NULLIF(c2.motif_consultation, ''), 'Consultation') AS motif, rc2.diagnostic_retenu
           FROM consultations c2
           LEFT JOIN registres r2 ON r2.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c2.id)
           LEFT JOIN registre_consultation_curatives rc2 ON rc2.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = r2.id)
          WHERE c2.patient_id = ? AND c2.id <> ? AND c2.deleted_at IS NULL
          ORDER BY c2.created_at DESC LIMIT 5`,
        [c.patient_id, consultationId],
      ),
    ]);

    const v = (k: string) => texte(cur?.[k]);
    const typeMat = typeMaternite(c.prestation_service);
    const maternite = typeMat ? await this.valeursMaternite(typeMat, c) : null;
    const dateIso = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : texte(x)?.slice(0, 10) ?? null);
    // Laravel enregistre « Hospitalisation » avec une majuscule : on retrouve la clé du formulaire
    const issue = texte(c.issue_consultation)?.toLowerCase() ?? null;
    const references = issue && DoctorConsultationsService.ISSUES_REFERENCE.includes(issue)
      ? (await listerDocuments(this.db, consultationId)).map((x) => this.presenterReference(x))
      : [];
    const suite = Number(c.status) === 1 && issue ? await this.suiteDonnee(c, issue) : null;
    // Consultation commencée par l'infirmier·ère puis envoyée au médecin : sa saisie pré-remplit le formulaire
    const brouillon = !c.registre_id ? await this.brouillon(consultationId) : null;
    // Consultation faite pour une télé-expertise reçue (médecin expert) : résultat à joindre une fois terminée
    const [recue] =
      d.role === 'doctor'
        ? await this.db.query('SELECT consultation_origine_id, resultat_le, urgence, programmation_directe FROM fm_references WHERE consultation_destination_id = ? AND doctor_destination_id = ? LIMIT 1', [
            consultationId,
            d.id,
          ])
        : [];
    // Télé-expertise issue d'une vraie consultation : la saisie du demandeur pré-remplit le formulaire de l'expert
    // (tant qu'il n'a rien enregistré ; il peut tout modifier)
    const avecConsultationRecue = !!recue && (Number(recue.urgence) === 1 || Number(recue.programmation_directe) !== 1);
    // Patient référé par l'infirmier·ère (issue « Référence ») : sa saisie pré-remplit aussi le formulaire du médecin
    const [refRecue] =
      d.role === 'doctor' && !recue ? await this.db.query('SELECT id, consultation_origine_id FROM fm_references_patient WHERE consultation_destination_id = ? LIMIT 1', [consultationId]) : [];
    const origineReprise = avecConsultationRecue ? Number(recue.consultation_origine_id) : refRecue ? Number(refRecue.consultation_origine_id) : null;
    const reprise = origineReprise && !c.registre_id && Number(c.status) !== 1 ? await this.repriseOrigine(origineReprise) : null;
    const [demandeur] = reprise
      ? await this.db.query(
          `SELECT du.name AS d_nom, du.prenom AS d_prenom, iu.name AS i_nom, iu.prenom AS i_prenom
             FROM consultations o
             LEFT JOIN doctors od ON od.id = o.doctor_id LEFT JOIN users du ON du.id = od.user_id
             LEFT JOIN infirmiers oi ON oi.id = o.infirmier_id LEFT JOIN users iu ON iu.id = oi.user_id
            WHERE o.id = ? LIMIT 1`,
          [origineReprise],
        )
      : [];
    const nomDemandeur = demandeur
      ? nom(demandeur.d_nom, demandeur.d_prenom)
        ? `Dr ${String(nom(demandeur.d_nom, demandeur.d_prenom)).replace(/^dr\.?\s*/i, '')}`
        : nom(demandeur.i_nom, demandeur.i_prenom)
      : null;
    return {
      /** Télé-expertise reçue : saisie de la consultation du demandeur reprise dans le formulaire */
      repriseExpertise: reprise && !refRecue ? { par: nomDemandeur } : null,
      /** Patient référé (issue « Référence ») : saisie de l'infirmier·ère reprise, et sa fiche de référence */
      repriseReference: refRecue ? { par: nomDemandeur, referenceId: Number(refRecue.id), saisieReprise: !!reprise } : null,
      /** Télé-expertise reçue : consultation d'origine et résultat déjà envoyé ou non */
      expertiseRecue: recue
        ? {
            origineId: Number(recue.consultation_origine_id),
            resultatEnvoye: !!recue.resultat_le,
            urgente: Number(recue.urgence) === 1,
            avecConsultation: Number(recue.urgence) === 1 || Number(recue.programmation_directe) !== 1,
          }
        : null,
      /** Consultation terminée : ce qui a été fait ensuite (télé-expertise, téléconsultation, appel d'urgence) */
      suite,
      // Terminée, ou ouverte par l'infirmier·ère qui n'en est pas l'auteur (consultation du médecin) : lecture seule
      lecture: Number(c.status) === 1 || !this.attribuee(c, d),
      /** Formulaire à afficher : consultation prénatale (CPN), postnatale ou curative */
      type: typeMat ?? 'curative',
      /** Registre de maternité (CPN / postnatale) */
      maternite: maternite?.valeurs ?? null,
      /** Antécédents repris de la visite précédente de la patiente */
      materniteReprise: maternite?.reprise ?? null,
      /** Accouchement : déclaration de naissance faite (certificat) */
      naissance: c.declaration_naissance
        ? { id: Number(String(c.declaration_naissance).split('|')[0]), reference: String(c.declaration_naissance).split('|').slice(1).join('|') }
        : null,
      consultation: {
        id: Number(c.id),
        code: texte(c.code_consultation) ?? `CONS-${c.id}`,
        date: c.created_at,
        prestation: texte(c.prestation) ?? 'Consultation générale',
        /** Service de la consultation (service_hospitals.id) : « Envoyer au médecin » ne propose que ses médecins */
        serviceId: c.consultation_service_hospital_id ? Number(c.consultation_service_hospital_id) : null,
        service: texte(c.consultation_service),
        urgence: Number(c.is_urgence) === 1,
        infirmier: nom(c.infirmier_nom, c.infirmier_prenom),
        observationInfirmiere: texte(c.observation_infirmiere),
        registre: texte(c.registre_code),
        hospitalisation: hosp ? { code: String(hosp.code), statut: String(hosp.status) } : null,
      },
      patient: {
        id: Number(c.patient_id),
        code: texte(c.code_patient) ?? '—',
        nom: nom(c.patient_nom, c.patient_prenom) ?? '—',
        genre: texte(c.gender),
        dateNaissance: texte(c.birth_date),
        imgUrl: texte(c.img_url),
        telephone: texte(c.telephone),
        profession: texte(c.profession),
        residence: texte(c.residence),
        numCmu: texte(c.num_cmu),
        groupeSanguin: texte(c.group_sanguin),
        allergies: texte(c.type_allergie_medicamenteuse),
      },
      references,
      historique: historique.map((h: Ligne) => ({ id: Number(h.id), date: h.created_at, motif: String(h.motif), diagnostic: texte(h.diagnostic_retenu) })),
      // Valeurs du formulaire : registre curatif s'il existe, sinon constantes prises par l'infirmier
      valeurs: {
        motif: v('motif_consultation') ?? texte(c.motif) ?? (typeMat ? MATERNITE[typeMat].motif : ''),
        hta: v('hta'),
        alcool: v('alcool'),
        tabac: v('tabac'),
        drepanocytaire: v('drepanocytaire'),
        traitementMedicamenteux: v('traitement_medicamenteux'),
        traitementAnterieur: v('traitement_medicamenteux_anterieur'),
        antecedentMedical: v('antecedent_medical'),
        autreAntecedentMedical: v('autre_antecedent_medical'),
        antecedentChirurgical: v('antecedent_chirurgical'),
        nomOperation: v('nom_operation'),
        autreAntecedentChirurgical: v('autre_antecedent_chirurgical'),
        grossesse: v('en_cours_de_grossesse'),
        ddr: v('ddr'),
        descriptionGrossesse: v('description_grossesse'),
        poids: v('poids') ?? texte(c.poids),
        taille: v('taille') ?? texte(c.taille),
        imc: v('imc') ?? texte(c.imc),
        temperature: v('temperature') ?? texte(c.temperature),
        tension: v('ta') ?? texte(c.tension_arterielle),
        pouls: v('pouls') ?? texte(c.pouls),
        saturation: v('saturation_oxygene') ?? texte(c.saturation_oxygene),
        glycemieAJeun: v('glycemie_a_jeun') ?? texte(c.gly_a_jeun),
        glycemieNonAJeun: v('glycemie_non_a_jeun'),
        frequenceRespiratoire: v('frequence_respiratoire'),
        perimetreBrachial: v('perimetre_brachial'),
        perimetreCranien: v('perimetre_cranien'),
        zscore: v('zcore'),
        tuberculose: v('tuberculose'),
        examenPhysique: v('examen_physique'),
        diagnostic: v('diagnostic_retenu'),
        autresPathologies: v('autre_pathologie_associee'),
        tdrPaludisme: v('tdr_paludisme'),
        goutteEpaisse: v('goutte_epaise'),
        mildaEligible: v('milda_enfant_eligible'),
        mildaRemise: v('remise_milda_enfant'),
        cdipPropose: v('cdip_propose'),
        cdipRealise: v('cdip_realise'),
        codeDepistage: v('code_depistage_client'),
        medicaments: prescriptions.map((p: Ligne) => ({
          drugId: Number(p.drug_id),
          nom: texte(p.name) ?? `Médicament #${p.drug_id}`,
          unite: texte(p.unite),
          quantite: p.quantity !== null ? Number(p.quantity) : 1,
          posologie: texte(p.dosage),
          duree: texte(p.duration),
          voie: texte(p.route_administration),
          conseil: texte(p.health_dietetic_advice),
        })),
        examens: examens.map((e: Ligne) => String(e.nature_examen)).filter(Boolean),
        arret: arret ? { dateDebut: dateIso(arret.date_debut), dateFin: dateIso(arret.date_fin), nbJour: Number(arret.nb_jour) } : null,
        modeSortie: issue && LIBELLES_ISSUE[issue] ? issue : null,
        justification: texte(c.issue_consultation_justification),
        // Télé-expertise reçue : saisie de la consultation du demandeur (modifiable par l'expert)
        ...(reprise ?? {}),
        // Saisie de l'infirmier·ère (envoi au médecin) : reprise telle quelle, sauf l'issue
        ...(brouillon ?? {}),
      },
      /** Envoyée au médecin par l'infirmier·ère (saisie reprise) */
      envoiMedecin: brouillon ? { par: nom(c.infirmier_nom, c.infirmier_prenom) } : null,
    };
  }

  /**
   * « Consulter » puis quitter le formulaire SANS issue → annulation : la consultation ouverte et son passage du jour
   * sont supprimés, comme si rien ne s'était passé. Seulement une consultation vierge de l'agent connecté
   * (pas terminée, sans registre, ordonnance, examen, arrêt, référence ni envoi au médecin).
   */
  async annulerConsultationOuverte(userId: number, consultationId: number, role: 'doctor' | 'infirmier' = 'doctor') {
    const d = await this.acteur(userId, role);
    const [c] = await this.db.query(
      `SELECT c.id, c.status, c.doctor_id, c.infirmier_id, c.patient_id, c.hospital_id, c.created_at,
              (SELECT COUNT(*) FROM registres r WHERE r.consultation_id = c.id) AS nb_registres,
              (SELECT COUNT(*) FROM ordonnances o WHERE o.consultation_id = c.id) AS nb_ordonnances,
              (SELECT COUNT(*) FROM bulletin_examens b WHERE b.consultation_id = c.id) AS nb_examens,
              (SELECT COUNT(*) FROM arret_travails a WHERE a.consultation_id = c.id) AS nb_arrets,
              (SELECT COUNT(*) FROM fm_references fr WHERE fr.consultation_origine_id = c.id OR fr.consultation_destination_id = c.id) AS nb_references,
              (SELECT COUNT(*) FROM fm_brouillons_consultation fb WHERE fb.consultation_id = c.id) AS nb_brouillons
         FROM consultations c WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [consultationId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable.');
    if (!this.attribuee(c, d)) throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");
    if (Number(c.status) === 1) throw new BadRequestException('Cette consultation est terminée : elle ne peut plus être annulée.');
    const traces = ['nb_registres', 'nb_ordonnances', 'nb_examens', 'nb_arrets', 'nb_references', 'nb_brouillons'].some((k) => Number(c[k]) > 0);
    if (traces) throw new BadRequestException('Cette consultation a déjà des éléments enregistrés : elle ne peut pas être annulée.');

    // Passage du jour créé par « Consulter » (même patient, même hôpital, même moment)
    await this.db.query(
      `DELETE FROM passage_patients
        WHERE patient_id = ? AND hospital_id = ? AND date = CURDATE() AND libelle IN ('Consultation (médecin)', 'Consultation (infirmier)') AND created_at = ?
        ORDER BY id DESC LIMIT 1`,
      [c.patient_id, c.hospital_id, c.created_at],
    );
    await this.db.query('DELETE FROM consultations WHERE id = ? AND status = 0 LIMIT 1', [c.id]);
    return { success: true, message: 'Consultation annulée.' };
  }

  /** Champs du formulaire curatif ↔ colonnes de registre_consultation_curatives */
  private static readonly CHAMPS_CURATIFS: [string, string][] = [
    ['motif', 'motif_consultation'],
    ['hta', 'hta'],
    ['alcool', 'alcool'],
    ['tabac', 'tabac'],
    ['drepanocytaire', 'drepanocytaire'],
    ['traitementMedicamenteux', 'traitement_medicamenteux'],
    ['traitementAnterieur', 'traitement_medicamenteux_anterieur'],
    ['antecedentMedical', 'antecedent_medical'],
    ['autreAntecedentMedical', 'autre_antecedent_medical'],
    ['antecedentChirurgical', 'antecedent_chirurgical'],
    ['nomOperation', 'nom_operation'],
    ['autreAntecedentChirurgical', 'autre_antecedent_chirurgical'],
    ['grossesse', 'en_cours_de_grossesse'],
    ['ddr', 'ddr'],
    ['descriptionGrossesse', 'description_grossesse'],
    ['poids', 'poids'],
    ['taille', 'taille'],
    ['imc', 'imc'],
    ['temperature', 'temperature'],
    ['tension', 'ta'],
    ['pouls', 'pouls'],
    ['saturation', 'saturation_oxygene'],
    ['glycemieAJeun', 'glycemie_a_jeun'],
    ['glycemieNonAJeun', 'glycemie_non_a_jeun'],
    ['frequenceRespiratoire', 'frequence_respiratoire'],
    ['perimetreBrachial', 'perimetre_brachial'],
    ['perimetreCranien', 'perimetre_cranien'],
    ['zscore', 'zcore'],
    ['tuberculose', 'tuberculose'],
    ['examenPhysique', 'examen_physique'],
    ['diagnostic', 'diagnostic_retenu'],
    ['autresPathologies', 'autre_pathologie_associee'],
    ['tdrPaludisme', 'tdr_paludisme'],
    ['goutteEpaisse', 'goutte_epaise'],
    ['mildaEligible', 'milda_enfant_eligible'],
    ['mildaRemise', 'remise_milda_enfant'],
    ['cdipPropose', 'cdip_propose'],
    ['cdipRealise', 'cdip_realise'],
    ['codeDepistage', 'code_depistage_client'],
  ];

  /**
   * Télé-expertise reçue : saisie de la consultation d'ORIGINE (médecin ou infirmier·ère demandeur) —
   * anamnèse, constantes, examen, diagnostic, prescriptions et examens demandés — reprise dans le formulaire
   * de l'expert, qui peut la modifier. Valeurs vides ignorées. L'issue, la justification et l'arrêt de travail ne sont pas repris.
   */
  private async repriseOrigine(origineId: number): Promise<Record<string, unknown> | null> {
    const [[cur], prescriptions, examens] = await Promise.all([
      this.db.query(
        `SELECT rc.* FROM registres r
           JOIN registre_consultation_curatives rc ON rc.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = r.id)
          WHERE r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = ?) LIMIT 1`,
        [origineId],
      ),
      this.db.query(
        `SELECT pr.drug_id, dr.name, dr.unite, pr.quantity, pr.dosage, pr.duration, pr.route_administration, pr.health_dietetic_advice
           FROM ordonnances o JOIN prescriptions pr ON pr.ordonnance_id = o.id LEFT JOIN drugs dr ON dr.id = pr.drug_id
          WHERE o.consultation_id = ? AND o.type = 'externe' AND o.deleted_at IS NULL ORDER BY pr.id`,
        [origineId],
      ),
      this.db.query('SELECT e.nature_examen FROM bulletin_examens b JOIN examens e ON e.bulletin_examen_id = b.id WHERE b.consultation_id = ? ORDER BY e.id', [origineId]),
    ]);
    const reprise: Record<string, unknown> = {};
    if (cur) for (const [cle, colonne] of DoctorConsultationsService.CHAMPS_CURATIFS) {
      const x = texte(cur[colonne]);
      if (x) reprise[cle] = x;
    }
    if (prescriptions.length) {
      reprise.medicaments = prescriptions.map((p: Ligne) => ({
        drugId: Number(p.drug_id),
        nom: texte(p.name) ?? `Médicament #${p.drug_id}`,
        unite: texte(p.unite),
        quantite: p.quantity !== null ? Number(p.quantity) : 1,
        posologie: texte(p.dosage),
        duree: texte(p.duration),
        voie: texte(p.route_administration),
        conseil: texte(p.health_dietetic_advice),
      }));
    }
    const ex = examens.map((e: Ligne) => String(e.nature_examen ?? '')).filter(Boolean);
    if (ex.length) reprise.examens = ex;
    return Object.keys(reprise).length ? reprise : null;
  }

  /** Saisie enregistrée par « Envoyer au médecin » (sans l'issue ni la justification) */
  private async brouillon(consultationId: number): Promise<Record<string, unknown> | null> {
    const [b] = await this.db.query('SELECT valeurs FROM fm_brouillons_consultation WHERE consultation_id = ? LIMIT 1', [consultationId]);
    if (!b) return null;
    try {
      const valeurs = JSON.parse(String(b.valeurs)) as Record<string, unknown>;
      delete valeurs.modeSortie;
      delete valeurs.justification;
      // Valeurs vides ignorées : les constantes de la consultation restent
      return Object.fromEntries(Object.entries(valeurs).filter(([, x]) => x !== null && x !== undefined && x !== ''));
    } catch {
      return null;
    }
  }

  /**
   * INFIRMIER·ÈRE > ISSUE « ENVOYER AU MÉDECIN »
   * La consultation n'est PAS terminée : elle passe au médecin choisi (même hôpital), arrive dans sa file du jour,
   * et ce que l'infirmier·ère a déjà saisi pré-remplit son formulaire (fm_brouillons_consultation).
   */
  async envoyerAuMedecin(userId: number, consultationId: number, doctorId: number, valeurs: Record<string, unknown> | undefined) {
    const d = await this.acteur(userId, 'infirmier');
    const [c] = await this.db.query(
      `SELECT c.id, c.status, c.doctor_id, c.infirmier_id, c.hospital_id, c.patient_id, ph.service_hospital_id,
              (SELECT s.libelle FROM service_hospitals sh JOIN services s ON s.id = sh.service_id WHERE sh.id = ph.service_hospital_id) AS service
         FROM consultations c LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
        WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [consultationId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable.');
    if (!this.attribuee(c, d)) throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");
    if (Number(c.status) === 1) throw new BadRequestException('Cette consultation est déjà terminée.');
    const [m] = await this.db.query(
      `SELECT dc.id, dc.service_hospital_id, u.name, u.prenom FROM doctors dc JOIN users u ON u.id = dc.user_id
        WHERE dc.id = ? AND dc.hospital_id = ? AND dc.status = 0 AND dc.\`delete\` = 0 AND dc.deleted_at IS NULL LIMIT 1`,
      [doctorId, c.hospital_id ?? d.hospital_id],
    );
    if (!m) throw new BadRequestException('Médecin introuvable ou inactif dans votre hôpital.');
    // Consignes : un médecin de l'hôpital (service choisi dans « Référence en interne »), dans son CRÉNEAU maintenant
    const n = DoctorConsultationsService.maintenantLocal();
    const [dispo] = (await this.tele.medecinsDisponibles(Number(c.hospital_id ?? d.hospital_id), n.date, n.heure)).filter((x) => x.id === Number(m.id));
    if (!dispo?.disponible) {
      throw new BadRequestException(`Ce médecin n'est pas dans son créneau maintenant${dispo?.raison ? ` (${String(dispo.raison).toLowerCase()})` : ''}.`);
    }

    const v = valeurs ?? {};
    const txt = (k: string) => (typeof v[k] === 'string' && (v[k] as string).trim() ? (v[k] as string).trim().slice(0, 191) : null);
    const json = JSON.stringify(v);
    if (json.length > 500_000) throw new BadRequestException('Saisie trop volumineuse.');
    const now = laravelNow();
    // Constantes et motif reportés sur la consultation (listes, fiche du médecin) ; elle reste ouverte, au nom du médecin
    await this.db.query(
      `UPDATE consultations SET doctor_id = ?, status_inf = 1,
              motif_consultation = COALESCE(?, motif_consultation),
              poids = COALESCE(?, poids), taille = COALESCE(?, taille), imc = COALESCE(?, imc), temperature = COALESCE(?, temperature),
              tension_arterielle = COALESCE(?, tension_arterielle), pouls = COALESCE(?, pouls), saturation_oxygene = COALESCE(?, saturation_oxygene),
              updated_at = ?
        WHERE id = ? AND status = 0`,
      [m.id, txt('motif'), txt('poids'), txt('taille'), txt('imc'), txt('temperature'), txt('tension'), txt('pouls'), txt('saturation'), now, c.id],
    );
    await this.db.query(
      `INSERT INTO fm_brouillons_consultation (consultation_id, valeurs, envoye_par, doctor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE valeurs = VALUES(valeurs), envoye_par = VALUES(envoye_par), doctor_id = VALUES(doctor_id), updated_at = UTC_TIMESTAMP()`,
      [c.id, json, userId, m.id],
    );
    const medecin = `Dr ${String(nom(m.name, m.prenom) ?? '').replace(/^dr\.?\s*/i, '')}`;
    return { success: true, message: `Patient envoyé à ${medecin} : il poursuivra la consultation avec votre saisie.`, medecin };
  }

  /**
   * Suite donnée à une consultation terminée, pour que son auteur (médecin ou infirmier·ère) voie tout ce qu'il a fait :
   *   - télé-expertise (référé interne / externe) : service, date et heure prévues, médecin destinataire, état ;
   *   - téléconsultation / appel d'urgence : consultation créée juste après pour le patient (médecin, date, état de l'appel).
   */
  private async suiteDonnee(c: Ligne, issue: string) {
    const etat = (x: Ligne | undefined) =>
      !x ? null : Number(x.status) === 1 ? 'Terminée' : Number(x.is_call_active) === 1 ? 'Appel en cours' : 'En attente';
    const dr = (n: unknown, p: unknown) => {
      const x = nom(n, p);
      return x ? `Dr ${x.replace(/^dr\.?\s*/i, '')}` : null;
    };
    if (issue === 'refere-interne' || issue === 'refere-externe') {
      const [r] = await this.db.query(
        `SELECT fr.type, DATE_FORMAT(fr.date_prevue, '%Y-%m-%d') AS date_prevue, TIME_FORMAT(fr.heure_prevue, '%H:%i') AS heure_prevue,
                fr.urgence, DATE_FORMAT(fr.resultat_le, '%Y-%m-%dT%H:%i:%sZ') AS resultat_le,
                rs.libelle AS service_externe, ds.libelle AS service_destinataire,
                du.name, du.prenom, COALESCE(dh.label, th.label) AS hopital, fr.diffusee, dest.status, dest.is_call_active,
                DATE_FORMAT(dest.date_consultation, '%Y-%m-%d') AS date_destination
           FROM fm_references fr
           LEFT JOIN services rs ON rs.id = fr.service_id
           LEFT JOIN hospitals th ON th.id = fr.hospital_destination_id
           LEFT JOIN doctors dd ON dd.id = fr.doctor_destination_id
           LEFT JOIN users du ON du.id = dd.user_id
           LEFT JOIN hospitals dh ON dh.id = dd.hospital_id
           LEFT JOIN service_hospitals dsh ON dsh.id = dd.service_hospital_id
           LEFT JOIN services ds ON ds.id = dsh.service_id
           LEFT JOIN consultations dest ON dest.id = fr.consultation_destination_id
          WHERE fr.consultation_origine_id = ? LIMIT 1`,
        [c.id],
      );
      if (!r) return { type: 'teleexpertise' as const, externe: issue === 'refere-externe', urgente: false, resultatLe: null, service: null, date: null, heure: null, medecin: null, hopital: null, etat: null };
      const externe = r.type === 'externe';
      return {
        type: 'teleexpertise' as const,
        externe,
        urgente: Number(r.urgence) === 1,
        /** Résultat de l'expert reçu (onglet « Résultats d'expertise ») */
        resultatLe: texte(r.resultat_le),
        service: texte(r.service_externe) ?? texte(r.service_destinataire),
        date: texte(r.date_prevue) ?? texte(r.date_destination),
        heure: texte(r.heure_prevue),
        // Envoyée au service, pas encore prise : tous les médecins du service
        medecin: dr(r.name, r.prenom) ?? (Number(r.diffusee) === 1 ? 'Tous les médecins du service' : null),
        hopital: texte(r.hopital) ?? (externe && Number(r.diffusee) === 1 ? 'Réseau des hôpitaux utilisant GEMMA' : null),
        // Envoyée au service, pas encore prise : en attente qu'un médecin du service la prenne en charge
        etat: r.resultat_le ? 'Réponse reçue' : !r.name ? 'En attente de prise en charge' : etat(r),
      };
    }
    if (issue === 'reference') {
      // Référence du patient : où il a été référé, par qui il a été pris en charge, et la fiche de référence
      const [r] = await this.db.query(
        `SELECT rp.id, rp.type, rp.diffusee, s.libelle AS service, COALESCE(dh.label, hd.label) AS hopital,
                du.name, du.prenom, dest.status, DATE_FORMAT(dest.date_consultation, '%Y-%m-%d') AS date_destination
           FROM fm_references_patient rp
           LEFT JOIN services s ON s.id = rp.service_id
           LEFT JOIN hospitals hd ON hd.id = rp.hospital_destination_id
           LEFT JOIN consultations dest ON dest.id = rp.consultation_destination_id
           LEFT JOIN doctors dd ON dd.id = dest.doctor_id LEFT JOIN users du ON du.id = dd.user_id
           LEFT JOIN hospitals dh ON dh.id = dd.hospital_id
          WHERE rp.consultation_origine_id = ? LIMIT 1`,
        [c.id],
      );
      if (!r) return null;
      const externe = r.type === 'externe';
      return {
        type: 'reference' as const,
        externe,
        urgente: false,
        resultatLe: null,
        service: texte(r.service),
        date: texte(r.date_destination),
        heure: null,
        medecin: dr(r.name, r.prenom) ?? (Number(r.diffusee) === 1 ? 'Tous les médecins du service' : null),
        hopital: texte(r.hopital) ?? (externe ? 'Réseau des hôpitaux utilisant GEMMA' : null),
        etat: Number(r.status) === 1 ? 'Consultation faite' : !r.name ? 'En attente de prise en charge' : 'En attente de la consultation',
        /** Fiche de référence imprimable */
        referenceId: Number(r.id),
      };
    }
    if (issue === 'teleconsultation' || issue === 'urgence') {
      // Consultation créée au même enregistrement (même patient, juste après, motif posé par l'enregistrement)
      const [x] = await this.db.query(
        `SELECT n.status, n.is_call_active, n.doctor_id, DATE_FORMAT(n.desired_date, '%Y-%m-%d') AS desired_date, n.desired_time,
                du.name, du.prenom, COALESCE(dh.label, th.label) AS hopital, COALESCE(ds.libelle, ts.libelle) AS service,
                td.consultation_id AS diffusee, td.type AS portee
           FROM consultations n
           -- Téléconsultation envoyée au service (sans médecin choisi)
           LEFT JOIN fm_teleconsultations_diffusees td ON td.consultation_id = n.id
           LEFT JOIN services ts ON ts.id = td.service_id
           LEFT JOIN hospitals th ON th.id = td.hospital_destination_id
           LEFT JOIN doctors dd ON dd.id = n.doctor_id
           LEFT JOIN users du ON du.id = dd.user_id
           LEFT JOIN hospitals dh ON dh.id = dd.hospital_id
           LEFT JOIN service_hospitals dsh ON dsh.id = dd.service_hospital_id
           LEFT JOIN services ds ON ds.id = dsh.service_id
          WHERE n.patient_id = ? AND n.id > ? AND n.deleted_at IS NULL
            AND n.motif_consultation LIKE ?
          ORDER BY n.id ASC LIMIT 1`,
        [c.patient_id, c.id, issue === 'urgence' ? 'Appel d’urgence demandé par %' : 'Téléconsultation demandée par %'],
      );
      return {
        type: issue === 'urgence' ? ('urgence' as const) : ('teleconsultation' as const),
        externe: false,
        urgente: false,
        resultatLe: null,
        service: texte(x?.service),
        date: texte(x?.desired_date),
        heure: texte(x?.desired_time)?.slice(0, 5) ?? null,
        // Urgence pas encore décrochée : pas de médecin ; téléconsultation envoyée au service : pas encore prise
        medecin: x ? (dr(x.name, x.prenom) ?? (issue === 'urgence' ? 'Pas encore décroché' : x.diffusee ? 'Tous les médecins du service' : null)) : null,
        hopital: texte(x?.hopital) ?? (x?.diffusee && x.portee === 'externe' ? 'Réseau des hôpitaux utilisant GEMMA' : null),
        etat: x?.diffusee && !x.doctor_id && Number(x.status) !== 1 ? 'En attente de prise en charge' : etat(x),
      };
    }
    return null;
  }

  /**
   * Documents imprimables d'une consultation (Laravel : PostConsultationController@Impression,
   * vues pdf/ordonnance, pdf/examen, pdf/arret) : en-tête de l'hôpital, médecin, patient et contenu.
   */
  async documents(userId: number, consultationId: number, role: 'doctor' | 'infirmier' = 'doctor') {
    const d = await this.acteur(userId, role);
    const [c] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.created_at, c.doctor_id, c.infirmier_id, c.status,
              COALESCE(NULLIF(c.motif_consultation, ''), a.motif_consultation) AS motif,
              p.code_patient, p.gender, p.birth_date, p.telephone, pu.name AS patient_nom, pu.prenom AS patient_prenom, sr.name AS residence,
              p.address AS patient_adresse, sn.name AS patient_lieu_naissance,
              h.label AS hopital, h.img_url AS hopital_logo, h.watermark_url AS hopital_filigrane, h.contact AS hopital_contact, h.localite,
              sh_loc.name AS hopital_localite, h.district_sanitaire,
              h.reference AS hopital_reference, h.nom_direction_generale,
              -- Prescripteur : le médecin, sinon l'infirmier·ère qui a consulté
              COALESCE(du.name, iu.name) AS medecin_nom, COALESCE(du.prenom, iu.prenom) AS medecin_prenom,
              COALESCE(dc.matricule, inf.matricule) AS matricule, COALESCE(dc.contact, inf.contact) AS medecin_contact, s.libelle AS medecin_service,
              rc.diagnostic_retenu
         FROM consultations c
         JOIN patients p ON p.id = c.patient_id
         JOIN users pu ON pu.id = p.user_id
         LEFT JOIN sub_prefectures sr ON sr.id = p.residence_actuelle_id
         LEFT JOIN sub_prefectures sn ON sn.id = p.lieu_de_naissance_id
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN doctors dc ON dc.id = c.doctor_id
         LEFT JOIN users du ON du.id = dc.user_id
         LEFT JOIN infirmiers inf ON inf.id = c.infirmier_id AND c.doctor_id IS NULL
         LEFT JOIN users iu ON iu.id = inf.user_id
         LEFT JOIN service_hospitals sh ON sh.id = COALESCE(dc.service_hospital_id, inf.service_hospital_id)
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN hospitals h ON h.id = COALESCE(dc.hospital_id, c.hospital_id)
         LEFT JOIN sub_prefectures sh_loc ON sh_loc.id = h.localite
         LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
         LEFT JOIN registre_consultation_curatives rc ON rc.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = r.id)
        WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [consultationId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable.');
    if (!this.lisible(c, d)) {
      if (d.role === 'infirmier') throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");
      // Patient référé : le médecin destinataire (interne) ou tout médecin (externe) voit les documents prescrits
      const [ref] = await this.db.query('SELECT type, diffusee, doctor_destination_id FROM fm_references WHERE consultation_origine_id = ? LIMIT 1', [consultationId]);
      // Envoyée au service (interne ou externe) : visible par les médecins sollicités ; sinon seulement le destinataire
      const autorise = ref && (Number(ref.diffusee) === 1 || Number(ref.doctor_destination_id) === Number(d.id));
      if (!autorise) throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");
    }

    const [ordonnances, examens, [arret]] = await Promise.all([
      this.db.query(
        `SELECT o.id, o.reference, o.date, o.created_at AS o_created_at, pr.quantity, pr.dosage, pr.duration, pr.route_administration, pr.health_dietetic_advice, dr.name, dr.unite
           FROM ordonnances o
           LEFT JOIN prescriptions pr ON pr.ordonnance_id = o.id
           LEFT JOIN drugs dr ON dr.id = pr.drug_id
          WHERE o.consultation_id = ? AND o.type = 'externe' AND o.deleted_at IS NULL
          ORDER BY o.id DESC, pr.id`,
        [consultationId],
      ),
      this.db.query(
        `SELECT b.code_bulletin, b.created_at, e.nature_examen
           FROM bulletin_examens b LEFT JOIN examens e ON e.bulletin_examen_id = b.id
          WHERE b.consultation_id = ? ORDER BY b.id DESC, e.id`,
        [consultationId],
      ),
      this.db.query('SELECT code, date_debut, date_fin, nb_jour, created_at FROM arret_travails WHERE consultation_id = ? ORDER BY id DESC LIMIT 1', [consultationId]),
    ]);
    const dateSql = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : texte(x)?.slice(0, 10) ?? null);
    const ord = ordonnances.filter((o: Ligne) => Number(o.id) === Number(ordonnances[0]?.id));
    const bulletin = examens.filter((e: Ligne) => e.code_bulletin === examens[0]?.code_bulletin);

    return {
      hopital: {
        nom: texte(c.hopital) ?? 'Hôpital',
        logo: texte(c.hopital_logo),
        contact: texte(c.hopital_contact),
        localite: texte(c.localite),
        district: texte(c.district_sanitaire),
        reference: texte(c.hopital_reference),
        direction: texte(c.nom_direction_generale),
        /** Modèles Laravel : nom de la localité de l'hôpital et filigrane propre à l'hôpital */
        localiteNom: texte(c.hopital_localite),
        filigrane: texte(c.hopital_filigrane),
      },
      medecin: {
        nomSeul: texte(c.medecin_nom),
        prenom: texte(c.medecin_prenom),
        nom: nom(c.medecin_nom, c.medecin_prenom),
        service: texte(c.medecin_service),
        matricule: texte(c.matricule),
        contact: texte(c.medecin_contact),
      },
      patient: {
        nom: nom(c.patient_nom, c.patient_prenom) ?? '—',
        code: texte(c.code_patient) ?? '—',
        genre: texte(c.gender),
        dateNaissance: texte(c.birth_date),
        telephone: texte(c.telephone),
        residence: texte(c.residence),
        /** Modèles Laravel : nom / prénom séparés, date de naissance telle qu'enregistrée, lieu de naissance, adresse */
        nomSeul: texte(c.patient_nom),
        prenom: texte(c.patient_prenom),
        naissanceBrute: texte(c.birth_date),
        lieuNaissance: texte(c.patient_lieu_naissance),
        adresse: texte(c.patient_adresse),
      },
      consultation: {
        code: texte(c.code_consultation) ?? `CONS-${c.id}`,
        date: c.created_at,
        motif: texte(c.motif),
        diagnostic: texte(c.diagnostic_retenu),
        terminee: Number(c.status) === 1,
      },
      ordonnance: ord.length
        ? {
            reference: texte(ord[0].reference),
            date: dateSql(ord[0].date),
            creeLe: ord[0].o_created_at,
            medicaments: ord
              .filter((o: Ligne) => o.name)
              .map((o: Ligne) => ({
                nom: String(o.name),
                unite: texte(o.unite),
                quantite: o.quantity !== null ? Number(o.quantity) : 1,
                posologie: texte(o.dosage),
                duree: texte(o.duration),
                voie: texte(o.route_administration),
                conseil: texte(o.health_dietetic_advice),
              })),
          }
        : null,
      examens: bulletin.length
        ? { code: texte(bulletin[0].code_bulletin), date: bulletin[0].created_at, liste: bulletin.map((e: Ligne) => texte(e.nature_examen)).filter(Boolean) }
        : null,
      arret: arret
        ? { code: texte(arret.code), debut: dateSql(arret.date_debut), fin: dateSql(arret.date_fin), nbJour: Number(arret.nb_jour), date: arret.created_at }
        : null,
    };
  }

  /** Médecins de l'hôpital à qui référer un patient en interne (actifs, sauf soi-même) */
  /**
   * Télé-expertise en interne : médecins de l'hôpital avec leur service.
   * Avec une date et une heure : disponibilité à CE moment (planning + permissions), sinon maintenant.
   */
  async medecinsReference(userId: number, role: 'doctor' | 'infirmier' = 'doctor', date?: string, heure?: string) {
    const a = await this.acteur(userId, role);
    // Un médecin ne se réfère pas à lui-même (infirmier·ère : aucun médecin exclu)
    const d = { hospital_id: a.hospital_id, id: role === 'doctor' ? a.id : 0 };
    const rows: Ligne[] = await this.db.query(
      `SELECT dc.id, u.name, u.prenom, s.libelle AS service, dc.service_hospital_id, dc.type_agent_id, av.days, av.hour_start, av.hour_end,
              ${SQL_EN_PERMISSION('dc.user_id')} AS en_permission
         FROM doctors dc
         JOIN users u ON u.id = dc.user_id
         LEFT JOIN service_hospitals sh ON sh.id = dc.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN availabilities av ON av.id = (SELECT MAX(id) FROM availabilities WHERE user_id = dc.user_id)
        WHERE dc.hospital_id = ? AND dc.id <> ? AND dc.status = 0 AND dc.\`delete\` = 0 AND dc.deleted_at IS NULL
        ORDER BY s.libelle, u.name`,
      [d.hospital_id, d.id],
    );
    const moment = this.tele.momentValide(date, heure);
    const aCeMoment = moment?.heure ? await this.tele.medecinsDisponibles(Number(d.hospital_id), moment.date, moment.heure) : null;
    return rows.map((r) => {
      const base = {
        id: Number(r.id),
        nom: nom(r.name, r.prenom) ?? '—',
        service: texte(r.service) ?? 'Service non précisé',
        serviceId: r.service_hospital_id ? Number(r.service_hospital_id) : null,
        sageFemme: Number(r.type_agent_id) === 2,
      };
      if (aCeMoment) {
        const x = aCeMoment.find((m) => m.id === Number(r.id));
        return { ...base, enService: !!x?.disponible, creneau: x?.disponible ? (x.creneau ?? null) : null };
      }
      const c = Number(r.en_permission) === 1 ? null : creneauDuJour(r.days, r.hour_start, r.hour_end);
      return { ...base, enService: !!c, creneau: c ? (c.debut === '00:00' ? 'Toute la journée' : `${c.debut} – ${c.fin}`) : null };
    });
  }

  /** District sanitaire d'un hôpital (hospitals.district_sanitaire, en minuscules), '' s'il n'est pas renseigné */
  async districtDe(hospitalId: unknown): Promise<string> {
    const [h] = await this.db.query("SELECT LOWER(TRIM(COALESCE(district_sanitaire, ''))) AS d FROM hospitals WHERE id = ? LIMIT 1", [hospitalId]);
    return String(h?.d ?? '');
  }

  /** Filtre SQL (hôpital alias « h ») : dans le district du demandeur (horsDistrict = false) ou dans les autres (true) */
  private static filtreDistrict(horsDistrict: boolean | undefined) {
    return horsDistrict === undefined ? '' : `AND LOWER(TRIM(COALESCE(h.district_sanitaire, ''))) ${horsDistrict ? '<>' : '='} ?`;
  }

  /**
   * Envoi en externe : services (actifs) des hôpitaux de la DMHP, par libellé, avec le nombre d'hôpitaux qui les proposent.
   * horsDistrict : false → hôpitaux du MÊME district que le demandeur ; true → hôpitaux des AUTRES districts ; absent → toute la DMHP.
   */
  async servicesExternes(userId: number, role: 'doctor' | 'infirmier' = 'doctor', horsDistrict?: boolean) {
    const a = await this.acteur(userId, role);
    const district = horsDistrict === undefined ? null : await this.districtDe(a.hospital_id);
    const rows: Ligne[] = await this.db.query(
      `SELECT s.id, s.libelle, COUNT(DISTINCT sh.hospital_id) AS nb_hopitaux
         FROM services s
         JOIN service_hospitals sh ON sh.service_id = s.id AND sh.status = 0
         JOIN hospitals h ON h.id = sh.hospital_id AND h.is_ucp_fm = 1 AND h.deleted_at IS NULL
        WHERE 1 = 1 ${DoctorConsultationsService.filtreDistrict(horsDistrict)}
        GROUP BY s.id, s.libelle
        ORDER BY s.libelle`,
      district === null ? [] : [district],
    );
    return rows.map((r) => ({ id: Number(r.id), libelle: String(r.libelle), hopitaux: Number(r.nb_hopitaux) }));
  }

  /** Envoi en externe : hôpitaux de la DMHP qui ont ce service (dans le district, ou hors du district) */
  async hopitauxService(userId: number, serviceId: number, role: 'doctor' | 'infirmier' = 'doctor', horsDistrict?: boolean) {
    const a = await this.acteur(userId, role);
    const district = horsDistrict === undefined ? null : await this.districtDe(a.hospital_id);
    const rows: Ligne[] = await this.db.query(
      `SELECT DISTINCT h.id, COALESCE(NULLIF(h.label, ''), h.reference) AS nom
         FROM service_hospitals sh
         JOIN hospitals h ON h.id = sh.hospital_id AND h.is_ucp_fm = 1 AND h.deleted_at IS NULL
        WHERE sh.service_id = ? AND sh.status = 0 ${DoctorConsultationsService.filtreDistrict(horsDistrict)}
        ORDER BY nom`,
      district === null ? [serviceId] : [serviceId, district],
    );
    return rows.map((r) => ({ id: Number(r.id), nom: String(r.nom ?? `Hôpital ${r.id}`) }));
  }

  /**
   * Télé-expertise en externe : médecins d'un hôpital dans un service (médecin facultatif),
   * avec leur disponibilité à la date et l'heure de la prise en charge (sinon maintenant).
   */
  async medecinsService(userId: number, serviceId: number, hospitalId: number, role: 'doctor' | 'infirmier' = 'doctor', date?: string, heure?: string) {
    const a = await this.acteur(userId, role);
    const moi = role === 'doctor' ? Number(a.id) : 0;
    const rows: Ligne[] = await this.db.query(
      `SELECT dc.id, u.name, u.prenom, s.libelle AS service, dc.service_hospital_id, dc.type_agent_id
         FROM doctors dc
         JOIN users u ON u.id = dc.user_id
         JOIN service_hospitals sh ON sh.id = dc.service_hospital_id
         JOIN services s ON s.id = sh.service_id
        WHERE dc.hospital_id = ? AND sh.service_id = ? AND dc.id <> ? AND dc.status = 0 AND dc.\`delete\` = 0 AND dc.deleted_at IS NULL
        ORDER BY u.name`,
      [hospitalId, serviceId, moi],
    );
    const maintenant = DoctorConsultationsService.maintenantLocal();
    const moment = this.tele.momentValide(date, heure) ?? { date: maintenant.date, heure: maintenant.heure };
    const dispos = rows.length ? await this.tele.medecinsDisponibles(hospitalId, moment.date, moment.heure) : [];
    return rows.map((r) => {
      const x = dispos.find((m) => m.id === Number(r.id));
      return {
        id: Number(r.id),
        nom: nom(r.name, r.prenom) ?? '—',
        service: texte(r.service) ?? 'Service non précisé',
        serviceId: r.service_hospital_id ? Number(r.service_hospital_id) : null,
        sageFemme: Number(r.type_agent_id) === 2,
        enService: !!x?.disponible,
        creneau: x?.disponible ? (x.creneau ?? null) : null,
      };
    });
  }

  /**
   * Destinataire d'une télé-expertise ou d'une téléconsultation : SERVICE obligatoire, médecin facultatif.
   *   - interne : service de l'hôpital du demandeur (service_hospitals.id) ;
   *   - externe : service de la DMHP (services.id), hôpital facultatif, médecin seulement avec un hôpital.
   * Avec un médecin : actif, du service, dans l'hôpital visé, pas soi-même, disponible à la date et l'heure.
   * Sans médecin : envoyée à tout le service (au moins un médecin actif doit pouvoir la recevoir).
   */
  private async resoudreCible(
    userId: number,
    role: 'doctor' | 'infirmier',
    d: Ligne,
    infirmier: boolean,
    o: {
      externe: boolean;
      serviceHospitalId?: number;
      serviceId?: number;
      hopitalId?: number;
      medecinId?: number;
      date: string;
      heure: string;
      quoi: string;
      /** Externe : false (défaut) → hôpitaux du district du demandeur ; true → hors du district */
      horsDistrict?: boolean;
    },
  ) {
    const horsDistrict = o.externe ? !!o.horsDistrict : false;
    const district = o.externe ? await this.districtDe(d.hospital_id) : null;
    let serviceId: number;
    let serviceNom: string | null;
    let hopitalId: number | null = null;
    let hopitalNom: string | null = null;
    if (!o.externe) {
      if (!o.serviceHospitalId) throw new BadRequestException(`Choisissez le service auquel vous adressez la ${o.quoi}.`);
      const [sv] = await this.db.query(
        `SELECT sh.service_id, s.libelle FROM service_hospitals sh JOIN services s ON s.id = sh.service_id
          WHERE sh.id = ? AND sh.hospital_id = ? LIMIT 1`,
        [o.serviceHospitalId, d.hospital_id],
      );
      if (!sv) throw new BadRequestException('Ce service n’existe pas dans votre hôpital.');
      serviceId = Number(sv.service_id);
      serviceNom = texte(sv.libelle);
      hopitalId = Number(d.hospital_id);
    } else {
      if (!o.serviceId) throw new BadRequestException(`Choisissez le service auquel vous adressez la ${o.quoi}.`);
      const sv = (await this.servicesExternes(userId, role, horsDistrict)).find((x) => x.id === Number(o.serviceId));
      if (!sv) throw new BadRequestException(`Ce service n’existe dans aucun hôpital ${horsDistrict ? 'hors de votre district' : 'de votre district'}.`);
      serviceId = sv.id;
      serviceNom = sv.libelle;
      if (o.hopitalId) {
        const h = (await this.hopitauxService(userId, sv.id, role, horsDistrict)).find((x) => x.id === Number(o.hopitalId));
        if (!h) throw new BadRequestException(`Cet hôpital ${horsDistrict ? 'hors de votre district' : 'de votre district'} n’a pas de service ${sv.libelle}.`);
        hopitalId = h.id;
        hopitalNom = h.nom;
      } else if (o.medecinId) {
        throw new BadRequestException('Choisissez l’hôpital du médecin.');
      }
    }

    let medecin: Ligne | null = null;
    if (o.medecinId) {
      const [m] = await this.db.query(
        `SELECT dc.id, dc.hospital_id, dc.service_hospital_id, u.name, u.prenom,
                (SELECT ph.id FROM prestation_hospitals ph JOIN prestation_services ps ON ps.id = ph.prestation_service_id
                  WHERE ph.service_hospital_id = dc.service_hospital_id AND ph.status = 0
                  ORDER BY (ps.libelle LIKE 'Consultation%') DESC, ph.id LIMIT 1) AS prestation_id
           FROM doctors dc JOIN users u ON u.id = dc.user_id
           JOIN service_hospitals sh ON sh.id = dc.service_hospital_id
          WHERE dc.id = ? AND dc.hospital_id = ? AND sh.service_id = ? AND dc.status = 0 AND dc.\`delete\` = 0 AND dc.deleted_at IS NULL LIMIT 1`,
        [o.medecinId, hopitalId, serviceId],
      );
      if (!m) throw new BadRequestException(`Médecin introuvable ou inactif dans le service ${serviceNom ?? 'choisi'}.`);
      if (!infirmier && Number(m.id) === Number(d.id)) throw new BadRequestException(`Vous ne pouvez pas vous adresser la ${o.quoi} à vous-même.`);
      const [dispo] = (await this.tele.medecinsDisponibles(Number(m.hospital_id), o.date, o.heure)).filter((x) => x.id === Number(m.id));
      if (!dispo?.disponible) throw new BadRequestException(`Ce médecin n’est pas disponible à cette date et cette heure${dispo?.raison ? ` (${String(dispo.raison).toLowerCase()})` : ''}.`);
      medecin = m;
    } else {
      const [{ n }] = await this.db.query(
        `SELECT COUNT(*) AS n FROM doctors dc
           JOIN service_hospitals sh ON sh.id = dc.service_hospital_id
           JOIN hospitals h ON h.id = dc.hospital_id AND h.deleted_at IS NULL ${o.externe ? 'AND h.is_ucp_fm = 1' : ''}
          WHERE sh.service_id = ? AND (? IS NULL OR dc.hospital_id = ?) AND dc.id <> ?
            AND dc.status = 0 AND dc.\`delete\` = 0 AND dc.deleted_at IS NULL
            ${o.externe && !hopitalId ? DoctorConsultationsService.filtreDistrict(horsDistrict) : ''}`,
        o.externe && !hopitalId ? [serviceId, hopitalId, hopitalId, infirmier ? 0 : d.id, district] : [serviceId, hopitalId, hopitalId, infirmier ? 0 : d.id],
      );
      if (!Number(n)) throw new BadRequestException(`Aucun médecin actif du service ${serviceNom ?? 'choisi'} ne peut recevoir cette ${o.quoi}.`);
    }
    return {
      medecin,
      serviceId,
      serviceNom,
      hopitalId,
      hopitalNom,
      externe: o.externe,
      /** Externe sans hôpital : district du demandeur et sens (dans / hors du district) — sinon null */
      district: o.externe && !hopitalId ? district : null,
      horsDistrict,
    };
  }

  /** Téléconsultation envoyée au service, visible par un médecin : son service, son hôpital (ou toute la DMHP), pas demandée par lui */
  private static readonly TELE_POUR_MOI = `td.service_id = ? AND (td.hospital_destination_id IS NULL OR td.hospital_destination_id = ?) AND COALESCE(td.doctor_origine_id, 0) <> ?
    AND (td.hospital_destination_id IS NOT NULL OR td.district_origine IS NULL OR (td.hors_district = 0 AND td.district_origine = ?) OR (td.hors_district = 1 AND td.district_origine <> ?))`;

  private async monServiceGlobal(doctorId: unknown): Promise<number> {
    const [r] = await this.db.query('SELECT sh.service_id FROM doctors dc LEFT JOIN service_hospitals sh ON sh.id = dc.service_hospital_id WHERE dc.id = ? LIMIT 1', [doctorId]);
    return Number(r?.service_id ?? 0);
  }

  /**
   * MÉDECIN > TÉLÉMÉDECINE : téléconsultations envoyées à mon service (sans médecin choisi), pas encore prises.
   * Dès qu'un médecin la prend, elle disparaît chez les autres.
   */
  async teleconsultationsDisponibles(userId: number) {
    const d = await this.medecin(userId);
    const rows: Ligne[] = await this.db.query(
      `SELECT c.id, c.created_at, c.motif_consultation, td.type,
              DATE_FORMAT(c.desired_date, '%Y-%m-%d') AS date_prevue, TIME_FORMAT(c.desired_time, '%H:%i') AS heure_prevue,
              s.libelle AS service, h.label AS hopital,
              ou.name AS origine_nom, ou.prenom AS origine_prenom, iu.name AS inf_nom, iu.prenom AS inf_prenom,
              p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.img_url, pu.name AS patient_nom, pu.prenom AS patient_prenom
         FROM fm_teleconsultations_diffusees td
         JOIN consultations c ON c.id = td.consultation_id
         JOIN patients p ON p.id = c.patient_id JOIN users pu ON pu.id = p.user_id
         LEFT JOIN services s ON s.id = td.service_id
         LEFT JOIN hospitals h ON h.id = c.hospital_id
         LEFT JOIN doctors od ON od.id = td.doctor_origine_id LEFT JOIN users ou ON ou.id = od.user_id
         LEFT JOIN infirmiers oi ON oi.id = td.infirmier_origine_id LEFT JOIN users iu ON iu.id = oi.user_id
        WHERE c.doctor_id IS NULL AND c.status = 0 AND c.deleted_at IS NULL AND ${DoctorConsultationsService.TELE_POUR_MOI}
        ORDER BY c.desired_date ASC, c.desired_time ASC, c.id ASC
        LIMIT 100`,
      [await this.monServiceGlobal(d.id), d.hospital_id, d.id, ...Array(2).fill(await this.districtDe(d.hospital_id))],
    );
    return rows.map((r) => {
      const medecin = nom(r.origine_nom, r.origine_prenom);
      const inf = nom(r.inf_nom, r.inf_prenom);
      return {
        consultationId: Number(r.id),
        externe: r.type === 'externe',
        recueLe: r.created_at,
        datePrevue: texte(r.date_prevue),
        heurePrevue: texte(r.heure_prevue),
        motif: texte(r.motif_consultation),
        referePar: medecin ? `Dr ${medecin.replace(/^dr\.?\s*/i, '')}` : inf ? `${inf} (infirmier·ère)` : null,
        hopital: texte(r.hopital),
        service: texte(r.service),
        patient: {
          id: Number(r.patient_id),
          code: texte(r.code_patient) ?? '—',
          nom: nom(r.patient_nom, r.patient_prenom) ?? '—',
          genre: texte(r.gender),
          dateNaissance: texte(r.birth_date),
          imgUrl: texte(r.img_url),
        },
      };
    });
  }

  /** Prise en charge d'une téléconsultation envoyée au service : le premier qui la prend l'obtient */
  async prendreTeleconsultation(userId: number, consultationId: number) {
    const d = await this.medecin(userId);
    const [t] = await this.db.query(
      `SELECT td.consultation_id, td.infirmier_origine_id, c.doctor_id FROM fm_teleconsultations_diffusees td
         JOIN consultations c ON c.id = td.consultation_id AND c.status = 0 AND c.deleted_at IS NULL
        WHERE td.consultation_id = ? AND ${DoctorConsultationsService.TELE_POUR_MOI} LIMIT 1`,
      [consultationId, await this.monServiceGlobal(d.id), d.hospital_id, d.id, ...Array(2).fill(await this.districtDe(d.hospital_id))],
    );
    if (!t) throw new NotFoundException('Téléconsultation introuvable ou non adressée à votre service.');
    if (t.doctor_id) throw new ConflictException('Cette téléconsultation a déjà été prise en charge par un autre médecin.');
    // Attribution : un seul médecin peut la prendre ; l'infirmier·ère demandeur est remis sur la consultation
    const pris = await this.db.query(
      'UPDATE consultations SET doctor_id = ?, infirmier_id = COALESCE(infirmier_id, ?), updated_at = ? WHERE id = ? AND doctor_id IS NULL AND status = 0',
      [d.id, t.infirmier_origine_id ?? null, laravelNow(), consultationId],
    );
    if (Number(pris.affectedRows) !== 1) throw new ConflictException('Cette téléconsultation vient d’être prise en charge par un autre médecin.');
    await this.db.query('UPDATE fm_teleconsultations_diffusees SET pris_par = ?, pris_le = UTC_TIMESTAMP() WHERE consultation_id = ?', [d.id, consultationId]);
    return { success: true, message: 'Téléconsultation prise en charge : elle est dans vos télémédecines.', consultationId };
  }

  /* =========================================================
     RÉFÉRENCE DU PATIENT (issue « Référence » de l'infirmier·ère)
     ========================================================= */

  /**
   * Fiche de référence (document remis au patient) : origine, patient, motif, constantes, diagnostic, destination.
   * Accès : l'infirmier·ère qui a référé, les agents de l'hôpital d'origine, et le médecin destinataire.
   */
  async ficheReference(userId: number, referenceId: number, role: 'doctor' | 'infirmier' = 'doctor') {
    const a = await this.acteur(userId, role);
    const [r] = await this.db.query(
      `SELECT rp.*, DATE_FORMAT(rp.created_at, '%Y-%m-%dT%H:%i:%sZ') AS cree_le,
              o.code_consultation, o.motif_consultation, o.tension_arterielle, o.temperature, o.pouls, o.poids, o.taille, o.imc, o.saturation_oxygene,
              p.code_patient, p.gender, p.birth_date, p.telephone, pu.name AS patient_nom, pu.prenom AS patient_prenom,
              ho.label AS hopital_origine, ho.contact AS hopital_origine_contact, ho.img_url AS hopital_origine_logo,
              iu.name AS inf_nom, iu.prenom AS inf_prenom, ou.name AS medecin_origine_nom, ou.prenom AS medecin_origine_prenom,
              s.libelle AS service, hd.label AS hopital_destination, hd.contact AS hopital_destination_contact,
              du.name AS medecin_nom, du.prenom AS medecin_prenom,
              dest.doctor_id AS dest_doctor_id, pu2.name AS pris_nom, pu2.prenom AS pris_prenom, dh.label AS hopital_prise,
              rco.diagnostic_retenu, rco.examen_physique
         FROM fm_references_patient rp
         JOIN consultations o ON o.id = rp.consultation_origine_id
         JOIN patients p ON p.id = o.patient_id JOIN users pu ON pu.id = p.user_id
         LEFT JOIN hospitals ho ON ho.id = rp.hospital_origine_id
         LEFT JOIN infirmiers i ON i.id = rp.infirmier_origine_id LEFT JOIN users iu ON iu.id = i.user_id
         LEFT JOIN doctors od ON od.id = rp.doctor_origine_id LEFT JOIN users ou ON ou.id = od.user_id
         LEFT JOIN services s ON s.id = rp.service_id
         LEFT JOIN hospitals hd ON hd.id = rp.hospital_destination_id
         LEFT JOIN doctors dd ON dd.id = rp.doctor_destination_id LEFT JOIN users du ON du.id = dd.user_id
         LEFT JOIN consultations dest ON dest.id = rp.consultation_destination_id
         LEFT JOIN doctors pd ON pd.id = dest.doctor_id LEFT JOIN users pu2 ON pu2.id = pd.user_id
         LEFT JOIN hospitals dh ON dh.id = pd.hospital_id
         LEFT JOIN registres ro ON ro.id = (SELECT MAX(id) FROM registres WHERE consultation_id = o.id)
         LEFT JOIN registre_consultation_curatives rco ON rco.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = ro.id)
        WHERE rp.id = ? LIMIT 1`,
      [referenceId],
    );
    if (!r) throw new NotFoundException('Référence introuvable.');
    const autorise =
      (a.role === 'infirmier' && (Number(r.infirmier_origine_id) === Number(a.id) || Number(r.hospital_origine_id) === Number(a.hospital_id))) ||
      (a.role === 'doctor' &&
        (Number(r.dest_doctor_id) === Number(a.id) || Number(r.doctor_origine_id) === Number(a.id) || Number(r.hospital_origine_id) === Number(a.hospital_id)));
    if (!autorise) throw new ForbiddenException('Cette fiche de référence ne vous concerne pas.');
    const dr = (n: unknown, p: unknown) => (nom(n, p) ? `Dr ${String(nom(n, p)).replace(/^dr\.?\s*/i, '')}` : null);
    return {
      id: Number(r.id),
      code: texte(r.code) ?? `REF-${r.id}`,
      date: texte(r.cree_le),
      externe: r.type === 'externe',
      motif: texte(r.motif) ?? texte(r.motif_consultation),
      diagnostic: texte(r.diagnostic_retenu),
      examenPhysique: texte(r.examen_physique),
      consultation: texte(r.code_consultation),
      origine: {
        hopital: texte(r.hopital_origine),
        contact: texte(r.hopital_origine_contact),
        logo: texte(r.hopital_origine_logo),
        infirmier: nom(r.inf_nom, r.inf_prenom),
        /** Référence faite par un médecin */
        medecin: nom(r.medecin_origine_nom, r.medecin_origine_prenom)
          ? `Dr ${String(nom(r.medecin_origine_nom, r.medecin_origine_prenom)).replace(/^dr\.?\s*/i, '')}`
          : null,
      },
      destination: {
        service: texte(r.service),
        // Externe sans hôpital : tout hôpital de la DMHP qui a ce service
        hopital: texte(r.hopital_destination) ?? (r.type === 'externe' ? 'Tout hôpital du réseau utilisant GEMMA (service indiqué)' : null),
        contact: texte(r.hopital_destination_contact),
        medecin: dr(r.medecin_nom, r.medecin_prenom) ?? (Number(r.diffusee) === 1 ? 'Tout médecin du service' : null),
        // Prise en charge (envoyée au service) : par qui, dans quel hôpital
        prisePar: Number(r.diffusee) === 1 && r.dest_doctor_id ? dr(r.pris_nom, r.pris_prenom) : null,
        hopitalPrise: Number(r.diffusee) === 1 && r.dest_doctor_id ? texte(r.hopital_prise) : null,
      },
      patient: {
        nom: nom(r.patient_nom, r.patient_prenom) ?? '—',
        code: texte(r.code_patient),
        genre: texte(r.gender),
        dateNaissance: texte(r.birth_date),
        telephone: texte(r.telephone),
      },
      constantes: {
        tension: texte(r.tension_arterielle),
        temperature: texte(r.temperature),
        pouls: texte(r.pouls),
        poids: texte(r.poids),
        taille: texte(r.taille),
        imc: texte(r.imc),
        saturation: texte(r.saturation_oxygene),
      },
    };
  }

  /** Référence envoyée au service, visible par un médecin : son service, son hôpital (ou toute la DMHP) */
  private static readonly REF_POUR_MOI = `rp.diffusee = 1 AND rp.service_id = ? AND (rp.hospital_destination_id IS NULL OR rp.hospital_destination_id = ?)
    AND (rp.hospital_destination_id IS NOT NULL OR rp.district_origine IS NULL OR (rp.hors_district = 0 AND rp.district_origine = ?) OR (rp.hors_district = 1 AND rp.district_origine <> ?))
    AND COALESCE(rp.doctor_origine_id, 0) <> ?`;

  /** MÉDECIN > TÉLÉMÉDECINE : patients référés à mon service (sans médecin choisi), pas encore pris en charge */
  async referencesDisponibles(userId: number) {
    const d = await this.medecin(userId);
    const rows: Ligne[] = await this.db.query(
      `SELECT rp.id, rp.type, rp.consultation_destination_id, rp.motif, rp.created_at, s.libelle AS service, ho.label AS hopital,
              iu.name AS inf_nom, iu.prenom AS inf_prenom, ou.name AS med_nom, ou.prenom AS med_prenom,
              p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.img_url, pu.name AS patient_nom, pu.prenom AS patient_prenom
         FROM fm_references_patient rp
         JOIN consultations c ON c.id = rp.consultation_destination_id
         JOIN patients p ON p.id = c.patient_id JOIN users pu ON pu.id = p.user_id
         LEFT JOIN services s ON s.id = rp.service_id
         LEFT JOIN hospitals ho ON ho.id = rp.hospital_origine_id
         LEFT JOIN infirmiers i ON i.id = rp.infirmier_origine_id LEFT JOIN users iu ON iu.id = i.user_id
         LEFT JOIN doctors od ON od.id = rp.doctor_origine_id LEFT JOIN users ou ON ou.id = od.user_id
        WHERE c.doctor_id IS NULL AND c.status = 0 AND c.deleted_at IS NULL AND ${DoctorConsultationsService.REF_POUR_MOI}
        ORDER BY rp.created_at ASC LIMIT 100`,
      [await this.monServiceGlobal(d.id), d.hospital_id, ...Array(2).fill(await this.districtDe(d.hospital_id)), d.id],
    );
    return rows.map((r) => ({
      referenceId: Number(r.id),
      consultationId: Number(r.consultation_destination_id),
      externe: r.type === 'externe',
      recueLe: r.created_at,
      motif: texte(r.motif),
      referePar: nom(r.med_nom, r.med_prenom)
        ? `Dr ${String(nom(r.med_nom, r.med_prenom)).replace(/^dr\.?\s*/i, '')}`
        : nom(r.inf_nom, r.inf_prenom)
          ? `${nom(r.inf_nom, r.inf_prenom)} (infirmier·ère)`
          : null,
      hopital: texte(r.hopital),
      service: texte(r.service),
      patient: {
        id: Number(r.patient_id),
        code: texte(r.code_patient) ?? '—',
        nom: nom(r.patient_nom, r.patient_prenom) ?? '—',
        genre: texte(r.gender),
        dateNaissance: texte(r.birth_date),
        imgUrl: texte(r.img_url),
      },
    }));
  }

  /** Prise en charge d'un patient référé au service : le premier médecin l'obtient ; la consultation passe dans son hôpital */
  async prendreReference(userId: number, referenceId: number) {
    const d = await this.medecin(userId);
    const [r] = await this.db.query(
      `SELECT rp.id, rp.consultation_destination_id, rp.service_id, c.doctor_id FROM fm_references_patient rp
         JOIN consultations c ON c.id = rp.consultation_destination_id AND c.status = 0 AND c.deleted_at IS NULL
        WHERE rp.id = ? AND ${DoctorConsultationsService.REF_POUR_MOI} LIMIT 1`,
      [referenceId, await this.monServiceGlobal(d.id), d.hospital_id, ...Array(2).fill(await this.districtDe(d.hospital_id)), d.id],
    );
    if (!r) throw new NotFoundException('Référence introuvable ou non adressée à votre service.');
    if (r.doctor_id) throw new ConflictException('Ce patient a déjà été pris en charge par un autre médecin.');
    const [moi] = await this.db.query(
      `SELECT dc.hospital_id,
              (SELECT ph.id FROM prestation_hospitals ph JOIN prestation_services ps ON ps.id = ph.prestation_service_id
                WHERE ph.service_hospital_id = dc.service_hospital_id AND ph.status = 0
                ORDER BY (ps.libelle LIKE 'Consultation%') DESC, ph.id LIMIT 1) AS prestation_id
         FROM doctors dc WHERE dc.id = ? LIMIT 1`,
      [d.id],
    );
    const pris = await this.db.query(
      `UPDATE consultations SET doctor_id = ?, hospital_id = ?, prestation_hospital_id = COALESCE(?, prestation_hospital_id), updated_at = ?
        WHERE id = ? AND doctor_id IS NULL AND status = 0`,
      [d.id, moi?.hospital_id ?? d.hospital_id, moi?.prestation_id ?? null, laravelNow(), r.consultation_destination_id],
    );
    if (Number(pris.affectedRows) !== 1) throw new ConflictException('Ce patient vient d’être pris en charge par un autre médecin.');
    await this.db.query('UPDATE fm_references_patient SET doctor_destination_id = ?, pris_le = UTC_TIMESTAMP() WHERE id = ?', [d.id, r.id]);
    return { success: true, message: 'Patient pris en charge : sa consultation est prête.', consultationId: Number(r.consultation_destination_id) };
  }

  /** Message « envoyée à tous les médecins du service … » */
  private static messageDiffusion(quoi: string, c: { externe: boolean; serviceNom: string | null; hopitalNom: string | null; horsDistrict?: boolean }) {
    const ou = !c.externe ? 'de votre hôpital' : c.hopitalNom ? `de ${c.hopitalNom}` : c.horsDistrict ? 'des hôpitaux hors de votre district' : 'des hôpitaux de votre district';
    return `${quoi} envoyée à tous les médecins du service ${c.serviceNom ?? ''} ${ou} : le premier qui la prend en charge la reçoit.`.replace(/\s+/g, ' ');
  }

  /** Issues qui autorisent des documents joints */
  static readonly ISSUES_REFERENCE = ['refere-interne', 'refere-externe'];

  private presenterReference(x: DocumentPrive) {
    return { id: x.id, libelle: x.libelle, nom: x.nom, type: x.type, taille: x.taille, ajouteLe: x.ajouteLe };
  }

  /** Consultation du médecin, terminée et référée (interne ou externe) */
  private async consultationReferee(userId: number, consultationId: number, role: 'doctor' | 'infirmier') {
    const d = await this.acteur(userId, role);
    const [c] = await this.db.query(
      `SELECT c.id, c.doctor_id, c.infirmier_id, c.status, r.issue_consultation
         FROM consultations c
         LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
        WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [consultationId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable.');
    if (!this.attribuee(c, d)) throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");
    const issue = String(c.issue_consultation ?? '').toLowerCase();
    if (!DoctorConsultationsService.ISSUES_REFERENCE.includes(issue)) {
      throw new BadRequestException('Les documents ne peuvent être joints qu’à une consultation référée (en interne ou en externe).');
    }
    return { d, c };
  }

  /** Documents joints à la référence d'une consultation */
  async references(userId: number, consultationId: number, role: 'doctor' | 'infirmier' = 'doctor') {
    await this.consultationReferee(userId, consultationId, role);
    return (await listerDocuments(this.db, consultationId)).map((x) => this.presenterReference(x));
  }

  /** Ajout de documents (libellé obligatoire pour chacun) */
  async ajouterReferences(userId: number, consultationId: number, fichiers: Express.Multer.File[], libelles: string[], role: 'doctor' | 'infirmier' = 'doctor') {
    await this.consultationReferee(userId, consultationId, role);
    const ajoutes = await ajouterDocuments(this.db, consultationId, fichiers, libelles, userId);
    return {
      success: true,
      message: ajoutes > 1 ? `${ajoutes} documents joints à la référence.` : 'Document joint à la référence.',
      documents: (await listerDocuments(this.db, consultationId)).map((x) => this.presenterReference(x)),
    };
  }

  async fichierReference(userId: number, consultationId: number, docId: string, role: 'doctor' | 'infirmier' = 'doctor') {
    await this.consultationReferee(userId, consultationId, role);
    const r = await lireDocument(this.db, consultationId, docId, 'demande');
    if (!r) throw new NotFoundException('Document introuvable.');
    return r;
  }

  async supprimerReference(userId: number, consultationId: number, docId: string, role: 'doctor' | 'infirmier' = 'doctor') {
    await this.consultationReferee(userId, consultationId, role);
    if (!(await supprimerDocument(this.db, consultationId, docId))) throw new NotFoundException('Document introuvable.');
    return { success: true, message: 'Document retiré de la référence.' };
  }

  /* =========================================================
     RÉSULTATS D'EXPERTISE (côté demandeur : médecin ou infirmier·ère)
     Télé-expertises envoyées depuis mes consultations, avec l'échéance et le résultat joint par l'expert.
     ========================================================= */

  /** Filtre SQL « télé-expertise demandée par moi » (consultation d'origine « o ») */
  private async demandeur(userId: number, role: 'doctor' | 'infirmier') {
    const d = await this.acteur(userId, role);
    return {
      d,
      filtre: role === 'infirmier' ? 'o.infirmier_id = ? AND o.doctor_id IS NULL' : 'o.doctor_id = ?',
      id: Number(d.id),
    };
  }

  private static readonly SELECT_RESULTAT = `
    SELECT fr.id AS reference_id, fr.type, fr.consultation_origine_id, fr.urgence, fr.motif,
           DATE_FORMAT(fr.created_at, '%Y-%m-%dT%H:%i:%sZ') AS demande_le,
           DATE_FORMAT(fr.echeance, '%Y-%m-%dT%H:%i:%sZ') AS echeance,
           DATE_FORMAT(fr.resultat_le, '%Y-%m-%dT%H:%i:%sZ') AS resultat_le,
           DATE_FORMAT(fr.resultat_lu_le, '%Y-%m-%dT%H:%i:%sZ') AS resultat_lu_le,
           fr.resultat_avis, fr.resultat_conduite, (fr.resultat_le IS NOT NULL AND fr.resultat_le <= fr.echeance) AS dans_delai,
           (fr.echeance IS NOT NULL AND fr.echeance < UTC_TIMESTAMP()) AS echeance_depassee,
           dest.status AS destination_status,
           o.code_consultation, p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.img_url, pu.name AS patient_nom, pu.prenom AS patient_prenom,
           COALESCE(rs.libelle, ds.libelle) AS service, du.name AS expert_nom, du.prenom AS expert_prenom, COALESCE(dh.label, th.label) AS expert_hopital,
           (SELECT COUNT(*) FROM fm_documents_references dr WHERE dr.consultation_id = fr.consultation_origine_id AND dr.nature = 'resultat') AS nb_documents
      FROM fm_references fr
      JOIN consultations o ON o.id = fr.consultation_origine_id AND o.deleted_at IS NULL
      JOIN patients p ON p.id = o.patient_id
      JOIN users pu ON pu.id = p.user_id
      LEFT JOIN services rs ON rs.id = fr.service_id
      LEFT JOIN hospitals th ON th.id = fr.hospital_destination_id
      LEFT JOIN consultations dest ON dest.id = fr.consultation_destination_id
      LEFT JOIN doctors dd ON dd.id = COALESCE(fr.resultat_par, fr.doctor_destination_id)
      LEFT JOIN users du ON du.id = dd.user_id
      LEFT JOIN hospitals dh ON dh.id = dd.hospital_id
      LEFT JOIN service_hospitals dsh ON dsh.id = dd.service_hospital_id
      LEFT JOIN services ds ON ds.id = dsh.service_id`;

  private presenterResultat(r: Ligne) {
    const recu = !!r.resultat_le;
    return {
      origineId: Number(r.consultation_origine_id),
      code: texte(r.code_consultation) ?? `CONS-${r.consultation_origine_id}`,
      externe: r.type === 'externe',
      urgente: Number(r.urgence) === 1,
      demandeLe: texte(r.demande_le),
      echeance: texte(r.echeance),
      service: texte(r.service),
      expert: r.expert_nom ? `Dr ${String(nom(r.expert_nom, r.expert_prenom)).replace(/^dr\.?\s*/i, '')}` : null,
      hopital: texte(r.expert_hopital),
      /** recu | termine (consultation de l'expert terminée sans résultat) | retard (échéance dépassée) | attente */
      etat: recu
        ? ('recu' as const)
        : Number(r.destination_status) === 1
          ? ('termine' as const)
          : Number(r.echeance_depassee) === 1
            ? ('retard' as const)
            : ('attente' as const),
      resultatLe: texte(r.resultat_le),
      dansDelai: recu ? Number(r.dans_delai) === 1 : null,
      lu: !!r.resultat_lu_le,
      documents: Number(r.nb_documents ?? 0),
      patient: {
        id: Number(r.patient_id),
        code: texte(r.code_patient) ?? '—',
        nom: nom(r.patient_nom, r.patient_prenom) ?? '—',
        genre: texte(r.gender),
        dateNaissance: texte(r.birth_date),
        imgUrl: texte(r.img_url),
      },
    };
  }

  /** Liste : résultats non lus d'abord, puis en retard, en attente (urgentes d'abord), puis lus */
  async resultatsExpertise(userId: number, role: 'doctor' | 'infirmier' = 'doctor') {
    const { filtre, id } = await this.demandeur(userId, role);
    const rows: Ligne[] = await this.db.query(
      `${DoctorConsultationsService.SELECT_RESULTAT}
        WHERE ${filtre}
        ORDER BY (fr.resultat_le IS NOT NULL AND fr.resultat_lu_le IS NULL) DESC, (fr.resultat_le IS NULL) DESC, fr.urgence DESC,
                 fr.echeance ASC, fr.created_at DESC
        LIMIT 500`,
      [id],
    );
    return rows.map((r) => this.presenterResultat(r));
  }

  /** Badge du menu : résultats reçus non lus */
  async resultatsNonLus(userId: number, role: 'doctor' | 'infirmier' = 'doctor') {
    const { filtre, id } = await this.demandeur(userId, role);
    const [r] = await this.db.query(
      `SELECT COUNT(*) AS n FROM fm_references fr JOIN consultations o ON o.id = fr.consultation_origine_id AND o.deleted_at IS NULL
        WHERE ${filtre} AND fr.resultat_le IS NOT NULL AND fr.resultat_lu_le IS NULL`,
      [id],
    );
    return { nonLus: Number(r?.n ?? 0) };
  }

  /** Fiche du résultat (avis, conduite à tenir, documents de l'expert) ; marque le résultat comme lu */
  async resultatExpertise(userId: number, origineId: number, role: 'doctor' | 'infirmier' = 'doctor') {
    const { filtre, id } = await this.demandeur(userId, role);
    const [r] = await this.db.query(`${DoctorConsultationsService.SELECT_RESULTAT} WHERE fr.consultation_origine_id = ? AND ${filtre} LIMIT 1`, [origineId, id]);
    if (!r) throw new NotFoundException('Télé-expertise introuvable.');
    if (r.resultat_le && !r.resultat_lu_le) {
      await this.db.query('UPDATE fm_references SET resultat_lu_le = UTC_TIMESTAMP() WHERE id = ? AND resultat_lu_le IS NULL', [r.reference_id]);
    }
    return {
      ...this.presenterResultat(r),
      motif: texte(r.motif),
      avis: texte(r.resultat_avis),
      conduite: texte(r.resultat_conduite),
      documentsResultat: (await listerDocuments(this.db, origineId, 'resultat')).map((x) => this.presenterReference(x)),
    };
  }

  /** Téléchargement d'un document joint par l'expert */
  async fichierResultat(userId: number, origineId: number, docId: string, role: 'doctor' | 'infirmier' = 'doctor') {
    const { filtre, id } = await this.demandeur(userId, role);
    const [r] = await this.db.query(
      `SELECT fr.id FROM fm_references fr JOIN consultations o ON o.id = fr.consultation_origine_id WHERE fr.consultation_origine_id = ? AND ${filtre} LIMIT 1`,
      [origineId, id],
    );
    if (!r) throw new NotFoundException('Télé-expertise introuvable.');
    const doc = await lireDocument(this.db, origineId, docId, 'resultat');
    if (!doc) throw new NotFoundException('Document introuvable.');
    return doc;
  }

  /**
   * Médicament saisi librement : retrouvé par son nom dans le catalogue « drugs » (sans tenir compte de la casse),
   * sinon ajouté au catalogue (code SAISIE-…) — les tables prescriptions / protocoles n'acceptent qu'un id de médicament.
   */
  private async medicamentSaisi(nom: string, unite?: string): Promise<number> {
    const libelle = nom.trim().replace(/\s+/g, ' ');
    const [existant] = await this.db.query('SELECT id FROM drugs WHERE LOWER(TRIM(name)) = LOWER(?) ORDER BY id LIMIT 1', [libelle]);
    if (existant) return Number(existant.id);
    const now = laravelNow();
    const code = `SAISIE-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`;
    const res = await this.db.query('INSERT INTO drugs (code, name, unite, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [code, libelle, (unite || 'UNITE').toUpperCase(), now, now]);
    return Number(res.insertId);
  }

  /** Recherche de médicaments (table drugs, ordonnance externe) */
  async medicaments(q: string) {
    const terme = (q ?? '').trim();
    const rows: Ligne[] = await this.db.query(
      `SELECT id, name, unite FROM drugs
        WHERE ? = '' OR name LIKE ? OR code LIKE ?
        ORDER BY (name LIKE ?) DESC, name ASC
        LIMIT 30`,
      [terme, `%${terme}%`, `%${terme}%`, `${terme}%`],
    );
    return rows.map((r) => ({ id: Number(r.id), nom: String(r.name), unite: texte(r.unite) }));
  }

  /**
   * Enregistrement complet de la consultation curative.
   * Tables MyISAM (pas de rollback) : toutes les vérifications sont faites AVANT la première écriture.
   */
  /** Registre de maternité (updateOrCreate) + rendez-vous de la prochaine visite (comme Laravel storePreNatales / storePostNatales) */
  private async enregistrerMaternite(type: TypeMaternite, registreId: number, valeurs: Record<string, string | null>, c: Ligne, now: string) {
    const conf = MATERNITE[type];
    // CPN : TA et pouls repris des constantes si le formulaire ne les a pas
    const ligne: Record<string, string | null> =
      type === 'prenatale' ? { ...valeurs, ta: valeurs.ta ?? texte(c.tension_arterielle), pouls: valeurs.pouls ?? texte(c.pouls) } : { ...valeurs };
    const cols = Object.keys(ligne);
    const [existant] = await this.db.query(`SELECT id FROM ${conf.table} WHERE registre_id = ? ORDER BY id DESC LIMIT 1`, [registreId]);
    if (existant) {
      await this.db.query(`UPDATE ${conf.table} SET ${cols.map((k) => `\`${k}\` = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((k) => ligne[k]), now, existant.id]);
    } else {
      await this.db.query(
        `INSERT INTO ${conf.table} (registre_id, ${cols.map((k) => `\`${k}\``).join(', ')}, created_at, updated_at)
         VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`,
        [registreId, ...cols.map((k) => ligne[k]), now, now],
      );
    }
    // Prochain rendez-vous : remplace celui de cette consultation
    await this.db.query('DELETE FROM rendez_vouses WHERE consultation_id = ?', [c.id]);
    // rendez_vouses.doctor_id est obligatoire : consultation d'un·e infirmier·ère (sans médecin) → date gardée dans le registre seulement
    if (valeurs.date_prochain_rdv && c.doctor_id) {
      const image = `assets/uploads/notif/notif${1 + Math.floor(Math.random() * 7)}.png`;
      await this.db.query(
        `INSERT INTO rendez_vouses (image, title, date, motif, consultation_id, doctor_id, patient_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [image, `Prochaine consultation prévue pour le ${valeurs.date_prochain_rdv}`, valeurs.date_prochain_rdv, type === 'accouchement' ? 'Consultation postnatale' : conf.motif, c.id, c.doctor_id, c.patient_id, now, now],
      );
    }
  }

  /**
   * Déclaration de naissance (comme Laravel Doctor\DeclarationRepository::storeNaissance, en corrigeant ses défauts) :
   *   - un dossier patient par nouveau-né (« NOUVEAU-NÉ DE <MÈRE> », rattaché à la mère, né à l'hôpital) ;
   *   - la déclaration (CMN…) et son détail (DN…) : date complète, heures / sexes / états de chaque enfant ;
   *   - le nombre d'enfants de la mère est mis à jour.
   */
  private async declarerNaissance(n: NaissanceDto, mere: Ligne, consultationId: number, d: Ligne, now: string) {
    const [a, m, j] = n.date.split('-');
    const naissanceFr = `${j}/${m}/${a}`;
    const motDePasse = await laravelHash('1234');
    const nomMere = `${mere.name ?? ''}`.trim().toUpperCase();
    const codeMere = String(mere.code_patient ?? `P${mere.id}`);
    let rang = Number(mere.nbre_enfant ?? 0);
    const enfants: number[] = [];
    for (const e of n.enfants) {
      rang += 1;
      let email = `${codeMere}${rang}@patient.com`.toLowerCase();
      const [pris] = await this.db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      if (pris) email = `${codeMere}${rang}_${Date.now().toString(36)}@patient.com`.toLowerCase();
      const u = await this.db.query(
        "INSERT INTO users (name, prenom, email, role_as, password, created_at, updated_at) VALUES (?, ?, ?, 'patient', ?, ?, ?)",
        [`NOUVEAU-NÉ DE ${nomMere}`, e.prenom?.trim() || (texte(mere.prenom) ?? ''), email, motDePasse, now, now],
      );
      const [{ nb }] = await this.db.query('SELECT COUNT(*) AS nb FROM patients WHERE birth_date = ?', [naissanceFr]);
      const code = `DM${j}${m}${a.slice(2)}${Number(nb) + 1}225`;
      const p = await this.db.query(
        `INSERT INTO patients (user_id, mere_id, doctor_id, hospital_id, gender, code_patient, birth_date, lieu_de_naissance_id, telephone, nbre_enfant,
                               nom_personne_cas_urgence, telephone_personne_cas_urgence, lien_personne_cas_urgence, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'Mère', 1, ?, ?)`,
        [u.insertId, mere.id, d.id, d.hospital_id, e.genre, code, naissanceFr, mere.localite ?? null, texte(mere.telephone), `${mere.name ?? ''} ${mere.prenom ?? ''}`.trim(), texte(mere.telephone), now, now],
      );
      enfants.push(Number(p.insertId));
    }
    await this.db.query('UPDATE patients SET nbre_enfant = ?, updated_at = ? WHERE id = ?', [rang, now, mere.id]);

    const [{ nb: compteur }] = await this.db.query("SELECT COUNT(*) AS nb FROM declarations WHERE hospital_id = ? AND type = 'birth'", [d.hospital_id]);
    const numero = Number(compteur) + 1;
    const suffixe = `${codeMere.slice(2)}${d.hospital_id}${numero}`;
    const decl = await this.db.query(
      "INSERT INTO declarations (reference, type, patient_id, consultation_id, hospital_id, doctor_id, created_at, updated_at) VALUES (?, 'birth', ?, ?, ?, ?, ?, ?)",
      [`CMN${suffixe}`, mere.id, consultationId, d.hospital_id, d.id, now, now],
    );
    await this.db.query(
      `INSERT INTO declaration_naissances (reference, numero_declaration, declaration_id, enfant_id, date, heure, nombre, nee, lieu, genre, observations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `DN${suffixe}`,
        numero,
        decl.insertId,
        enfants[0],
        n.date,
        n.enfants.map((e) => e.heure).join(', '),
        n.enfants.length,
        n.enfants.map((e) => e.etat.trim()).join(', '),
        n.lieu.trim(),
        n.enfants.map((e) => e.genre).join(', '),
        texte(n.observations?.trim()),
        now,
        now,
      ],
    );
    return { id: Number(decl.insertId), reference: `CMN${suffixe}`, enfants };
  }

  async enregistrer(userId: number, consultationId: number, dto: ConsultationCurativeDto, role: 'doctor' | 'infirmier' = 'doctor') {
    const d = await this.acteur(userId, role);
    const infirmier = role === 'infirmier';
    const [c] = await this.db.query(
      `SELECT c.id, c.status, c.doctor_id, c.patient_id, c.poids, c.taille, c.imc, c.temperature, c.tension_arterielle, c.pouls,
              c.hospital_id, c.infirmier_id, c.prestation_hospital_id, c.saturation_oxygene,
              p.code_patient
         FROM consultations c JOIN patients p ON p.id = c.patient_id
        WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [consultationId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable.');
    if (!this.attribuee(c, d)) throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");
    if (Number(c.status) === 1) throw new BadRequestException('Cette consultation est déjà terminée.');
    // Infirmier·ère : l'hospitalisation et la déclaration de naissance exigent un médecin (doctor_id obligatoire dans la base)
    if (infirmier && dto.modeSortie === 'hospitalisation') {
      throw new BadRequestException('L’hospitalisation est décidée par un médecin : référez le patient en interne au médecin.');
    }
    if (infirmier && dto.naissance) throw new BadRequestException('La déclaration de naissance doit être faite par un médecin ou une sage-femme.');

    // Consultation prénatale / postnatale : champs du registre de maternité (seulement pour la prestation correspondante)
    let maternite: { type: TypeMaternite; valeurs: Record<string, string | null> } | null = null;
    if (dto.maternite) {
      const [ps] = await this.db.query(
        `SELECT ps.libelle FROM prestation_hospitals ph JOIN prestation_services ps ON ps.id = ph.prestation_service_id WHERE ph.id = ? LIMIT 1`,
        [c.prestation_hospital_id],
      );
      const type = typeMaternite(ps?.libelle);
      if (!type) throw new BadRequestException('Cette consultation n’est ni prénatale ni postnatale.');
      const valeurs = nettoyerMaternite(type, dto.maternite);
      if (valeurs.date_prochain_rdv && !/^\d{2}\/\d{2}\/\d{4}$/.test(valeurs.date_prochain_rdv)) throw new BadRequestException('Date du prochain rendez-vous invalide.');
      maternite = { type, valeurs };
    }

    // Accouchement : déclaration de naissance (vérifiée AVANT toute écriture : tables MyISAM)
    let mere: Ligne | null = null;
    if (dto.naissance) {
      if (maternite?.type !== 'accouchement') throw new BadRequestException('La déclaration de naissance se fait avec le formulaire d’accouchement.');
      [mere] = await this.db.query(
        `SELECT p.id, p.code_patient, p.gender, p.telephone, p.nbre_enfant, u.name, u.prenom, h.localite, h.id AS hopital_id
           FROM patients p JOIN users u ON u.id = p.user_id JOIN hospitals h ON h.id = ?
          WHERE p.id = ? LIMIT 1`,
        [d.hospital_id, c.patient_id],
      );
      if (!mere) throw new NotFoundException('Patiente introuvable.');
      if (String(mere.gender ?? '').toLowerCase() === 'masculin') throw new BadRequestException('Un homme ne peut pas accoucher : vérifiez le dossier de la patiente.');
      const naissance = new Date(`${dto.naissance.date}T12:00:00`);
      if (isNaN(naissance.getTime()) || naissance.getTime() > Date.now() + 86400000) throw new BadRequestException('La date de naissance ne peut pas être dans le futur.');
      if (dto.naissance.enfants.some((e) => /mort/i.test(e.etat))) throw new BadRequestException('Un mort-né ne fait pas l’objet d’une déclaration de naissance.');
      const [deja] = await this.db.query("SELECT id FROM declarations WHERE consultation_id = ? AND type = 'birth' LIMIT 1", [consultationId]);
      if (deja) throw new BadRequestException('La naissance de cet accouchement a déjà été déclarée.');
    }

    // Ordonnance : médicament de la liste (drugId) ou saisi librement (nom)
    const medicaments = (dto.medicaments ?? []).filter((m) => m.drugId || m.nom);
    const ids = [...new Set(medicaments.filter((m) => m.drugId).map((m) => Number(m.drugId)))];
    if (ids.length) {
      const trouves: Ligne[] = await this.db.query('SELECT id FROM drugs WHERE id IN (?)', [ids]);
      if (trouves.length !== ids.length) throw new BadRequestException("Un des médicaments de l'ordonnance est introuvable.");
    }
    const examens = (dto.examens ?? []).map((e) => e.trim()).filter(Boolean);
    if (dto.arret && dto.arret.dateFin < dto.arret.dateDebut) {
      throw new BadRequestException("La date de fin de l'arrêt de travail doit être après la date de début.");
    }
    if (dto.modeSortie !== 'sortie' && !dto.justification && dto.modeSortie !== 'hospitalisation') {
      throw new BadRequestException("Veuillez justifier l'issue de la consultation.");
    }

    // Télé-expertise urgente (synchrone) : prise en charge immédiate → date et heure = maintenant
    if ((dto.modeSortie === 'refere-interne' || dto.modeSortie === 'refere-externe') && dto.referenceUrgente) {
      const maintenant = DoctorConsultationsService.maintenantLocal();
      dto.referenceDate = maintenant.date;
      dto.referenceHeure = maintenant.heure;
    }

    /*
     * Télé-expertise : SERVICE obligatoire, médecin facultatif.
     *   - interne : service de l'hôpital ; avec un médecin → adressée à lui ; sans → à tous les médecins du service de l'hôpital ;
     *   - externe : service de la DMHP, hôpital facultatif, médecin facultatif (seulement avec un hôpital) ;
     *               sans médecin → tous les médecins du service de l'hôpital choisi, ou de tous les hôpitaux de la DMHP.
     *   Envoyée au service (diffusee) : le premier médecin qui la prend en charge l'obtient, elle disparaît chez les autres.
     */
    let destinataire: Ligne | null = null;
    let serviceReference: number | null = null;
    let serviceReferenceNom: string | null = null;
    let hopitalReference: number | null = null;
    let hopitalReferenceNom: string | null = null;
    let referenceDistrict: string | null = null;
    let referenceHorsDistrict = false;
    const expertise = dto.modeSortie === 'refere-interne' || dto.modeSortie === 'refere-externe';
    if (expertise) {
      // Date et heure de la prise en charge : à venir, dans le délai du type de demande
      const moment = this.tele.momentValide(dto.referenceDate, dto.referenceHeure);
      if (!moment?.heure) throw new BadRequestException('Renseignez la date et l’heure de la prise en charge.');
      this.verifierDelaiExpertise(moment.date, moment.heure, !!dto.referenceUrgente);
      const cible = await this.resoudreCible(userId, role, d, infirmier, {
        externe: dto.modeSortie === 'refere-externe',
        serviceHospitalId: dto.referenceServiceHospitalId,
        serviceId: dto.referenceServiceId,
        hopitalId: dto.referenceHopitalId,
        medecinId: dto.medecinReferenceId,
        date: moment.date,
        heure: moment.heure,
        quoi: 'télé-expertise',
        horsDistrict: dto.externeHorsDistrict,
      });
      destinataire = cible.medecin;
      referenceDistrict = cible.district;
      referenceHorsDistrict = cible.horsDistrict;
      serviceReference = cible.serviceId;
      serviceReferenceNom = cible.serviceNom;
      hopitalReference = cible.hopitalId;
      hopitalReferenceNom = cible.hopitalNom;
    }

    /*
     * Téléconsultation : même système que la télé-expertise — en interne (service de l'hôpital) ou en externe
     * (service de la DMHP, hôpital facultatif) ; médecin facultatif : sans médecin, tous les médecins visés la reçoivent
     * et le premier qui la prend en charge l'obtient. Date et heure à venir.
     */
    let teleMedecin: { id: number; nom: string } | null = null;
    let teleCible: Awaited<ReturnType<DoctorConsultationsService['resoudreCible']>> | null = null;
    if (dto.modeSortie === 'teleconsultation') {
      const moment = this.tele.momentValide(dto.teleDate, dto.teleHeure);
      if (!moment?.heure) throw new BadRequestException('Renseignez la date et l’heure de la téléconsultation.');
      const n = new Date();
      const p2 = (x: number) => String(x).padStart(2, '0');
      const jour = `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}`;
      if (moment.date < jour || (moment.date === jour && moment.heure < `${p2(n.getHours())}:${p2(n.getMinutes())}`)) {
        throw new BadRequestException('La date et l’heure de la téléconsultation ne peuvent pas être dans le passé.');
      }
      if (!dto.telePortee) throw new BadRequestException('Précisez si la téléconsultation est en interne ou en externe.');
      teleCible = await this.resoudreCible(userId, role, d, infirmier, {
        externe: dto.telePortee === 'externe',
        serviceHospitalId: dto.teleServiceHospitalId,
        serviceId: dto.teleServiceId,
        hopitalId: dto.teleHopitalId,
        medecinId: dto.teleMedecinId,
        date: moment.date,
        heure: moment.heure,
        quoi: 'téléconsultation',
        horsDistrict: dto.externeHorsDistrict,
      });
      if (teleCible.medecin) teleMedecin = { id: Number(teleCible.medecin.id), nom: nom(teleCible.medecin.name, teleCible.medecin.prenom) ?? 'Médecin' };
    }

    /*
     * RÉFÉRENCE du patient (infirmier·ère ou médecin) : en interne ou en externe, comme la télé-expertise.
     * Service obligatoire ; médecin facultatif (disponible maintenant) : sans médecin, tous les médecins du service visé.
     * Le patient se rend chez le médecin / dans l'hôpital avec sa fiche de référence.
     */
    let referenceCible: Awaited<ReturnType<DoctorConsultationsService['resoudreCible']>> | null = null;
    if (dto.modeSortie === 'reference') {
      if (!dto.referencePortee) throw new BadRequestException('Précisez si la référence est en interne ou en externe.');
      const maintenant = DoctorConsultationsService.maintenantLocal();
      referenceCible = await this.resoudreCible(userId, role, d, infirmier, {
        externe: dto.referencePortee === 'externe',
        serviceHospitalId: dto.referenceServiceHospitalId,
        serviceId: dto.referenceServiceId,
        hopitalId: dto.referenceHopitalId,
        medecinId: dto.medecinReferenceId,
        date: maintenant.date,
        heure: maintenant.heure,
        quoi: 'référence',
        horsDistrict: dto.externeHorsDistrict,
      });
    }

    // Appel d'urgence, 5 constantes obligatoires :
    //   infirmier·ère → médecins de garde (service du patient + généralistes de la DMHP) ;
    //   médecin → tous les médecins de SON service dans les hôpitaux de la DMHP (lui exclu)
    if (dto.modeSortie === 'urgence') {
      // Appel vidéo configuré ? Vérifié avant toute écriture (tables MyISAM : pas d'annulation possible)
      configLiveKit();
      const manque = (
        [
          ['poids', dto.poids, c.poids],
          ['taille', dto.taille, c.taille],
          ['température', dto.temperature, c.temperature],
          ['tension artérielle', dto.tension, c.tension_arterielle],
          ['pouls', dto.pouls, c.pouls],
        ] as [string, string | undefined, unknown][]
      )
        .filter(([, saisi, actuel]) => !texte(saisi) && !texte(actuel))
        .map(([libelle]) => libelle);
      if (manque.length) throw new BadRequestException(`Renseignez toutes les constantes avant l’appel d’urgence (manque : ${manque.join(', ')}).`);
    }

    // Issue « hospitalisation » : protocole obligatoire (comme Laravel), produits et lit de l'hôpital du médecin
    const hosp = dto.modeSortie === 'hospitalisation' ? dto.hospitalisation : undefined;
    let litChoisi: Ligne | null = null;
    if (dto.modeSortie === 'hospitalisation') {
      if (!hosp || !hosp.protocole?.length) {
        throw new BadRequestException("Veuillez ajouter au moins un médicament au protocole thérapeutique avant d'hospitaliser le patient.");
      }
      if (hosp.bedId) {
        const [lit] = await this.db.query(
          `SELECT b.id, b.price,
                  (b.status_occupied = 'occupied' OR EXISTS(SELECT 1 FROM occupied_beds ob WHERE ob.bed_id = b.id AND ob.status = 'active' AND ob.\`delete\` = 0)) AS occupe
             FROM beds b JOIN bedrooms r ON r.id = b.bedroom_id
            WHERE b.id = ? AND r.hospital_id = ? AND b.\`delete\` = 0 AND r.\`delete\` = 0 AND b.status = 0 AND r.status = 0 LIMIT 1`,
          [hosp.bedId, d.hospital_id],
        );
        if (!lit) throw new BadRequestException('Lit introuvable dans votre établissement.');
        if (Number(lit.occupe) === 1) throw new BadRequestException('Ce lit est déjà occupé, choisissez-en un autre.');
        litChoisi = lit;
      }
      if (hosp.infirmierId) {
        const [inf] = await this.db.query('SELECT id FROM infirmiers WHERE id = ? AND hospital_id = ? AND `delete` = 0 LIMIT 1', [hosp.infirmierId, d.hospital_id]);
        if (!inf) throw new BadRequestException('Infirmier(ère) introuvable dans votre établissement.');
      }
    }

    // ---------- Écritures ----------
    const now = laravelNow();
    const aujourdhui = now.slice(0, 10);
    const [[{ n: nbConsultations }]] = await Promise.all([this.db.query('SELECT COUNT(*) AS n FROM consultations WHERE patient_id = ?', [c.patient_id])]);
    // Codes Laravel : préfixe + code patient sans "DM" + hôpital du médecin + (consultations du patient + 1)
    const suffixe = `${String(c.code_patient ?? '').slice(2)}${d.hospital_id}${Number(nbConsultations) + 1}`;

    // 1. Consultation : constantes manquantes complétées, consultation terminée
    const complete = (col: string, val?: string) => (val && !texte(c[col]) ? val : texte(c[col]));
    await this.db.query(
      `UPDATE consultations SET poids = ?, taille = ?, imc = ?, temperature = ?, tension_arterielle = ?, pouls = ?,
              motif_consultation = COALESCE(NULLIF(motif_consultation, ''), ?), status = 1, updated_at = ?
        WHERE id = ?`,
      [
        complete('poids', dto.poids),
        complete('taille', dto.taille),
        complete('imc', dto.imc),
        complete('temperature', dto.temperature),
        complete('tension_arterielle', dto.tension),
        complete('pouls', dto.pouls),
        dto.motif,
        now,
        consultationId,
      ],
    );

    // 2. Registre (issue + justification)
    const issue = dto.modeSortie === 'hospitalisation' ? 'Hospitalisation' : dto.modeSortie;
    let [registre] = await this.db.query('SELECT id FROM registres WHERE consultation_id = ? ORDER BY id DESC LIMIT 1', [consultationId]);
    if (registre) {
      await this.db.query('UPDATE registres SET issue_consultation = ?, issue_consultation_justification = ?, updated_at = ? WHERE id = ?', [
        issue,
        dto.justification ?? null,
        now,
        registre.id,
      ]);
    } else {
      const res = await this.db.query(
        `INSERT INTO registres (code, type_consultation, consultation_id, issue_consultation, issue_consultation_justification, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [`RE${suffixe}`, maternite ? MATERNITE[maternite.type].typeRegistre : 'consultation curative', consultationId, issue, dto.justification ?? null, now, now],
      );
      registre = { id: res.insertId };
    }

    // 3. Registre de la consultation (updateOrCreate) : maternité (CPN / postnatale) ou curatif
    if (maternite) {
      await this.enregistrerMaternite(maternite.type, registre.id, maternite.valeurs, c, now);
    } else {
    const curative: Record<string, string | null> = {
      motif_consultation: dto.motif,
      hta: dto.hta ?? null,
      alcool: dto.alcool ?? null,
      tabac: dto.tabac ?? null,
      drepanocytaire: dto.drepanocytaire ?? null,
      traitement_medicamenteux: dto.traitementMedicamenteux ?? null,
      traitement_medicamenteux_anterieur: dto.traitementAnterieur ?? null,
      antecedent_medical: dto.antecedentMedical ?? null,
      autre_antecedent_medical: dto.autreAntecedentMedical ?? null,
      antecedent_chirurgical: dto.antecedentChirurgical ?? null,
      nom_operation: dto.nomOperation ?? null,
      autre_antecedent_chirurgical: dto.autreAntecedentChirurgical ?? null,
      en_cours_de_grossesse: dto.grossesse ?? null,
      ddr: dto.ddr ?? null,
      description_grossesse: dto.descriptionGrossesse ?? null,
      poids: dto.poids ?? null,
      taille: dto.taille ?? null,
      imc: dto.imc ?? null,
      temperature: dto.temperature ?? null,
      ta: dto.tension ?? null,
      pouls: dto.pouls ?? null,
      saturation_oxygene: dto.saturation ?? null,
      glycemie_a_jeun: dto.glycemieAJeun ?? null,
      glycemie_non_a_jeun: dto.glycemieNonAJeun ?? null,
      frequence_respiratoire: dto.frequenceRespiratoire ?? null,
      perimetre_brachial: dto.perimetreBrachial ?? null,
      perimetre_cranien: dto.perimetreCranien ?? null,
      zcore: dto.zscore ?? null,
      tuberculose: dto.tuberculose ?? null,
      examen_physique: dto.examenPhysique ?? null,
      diagnostic_retenu: dto.diagnostic ?? null,
      autre_pathologie_associee: dto.autresPathologies ?? null,
      tdr_paludisme: dto.tdrPaludisme ?? null,
      goutte_epaise: dto.goutteEpaisse ?? null,
      milda_enfant_eligible: dto.mildaEligible ?? null,
      remise_milda_enfant: dto.mildaRemise ?? null,
      cdip_propose: dto.cdipPropose ?? null,
      cdip_realise: dto.cdipRealise ?? null,
      code_depistage_client: dto.codeDepistage ?? null,
    };
    const cols = Object.keys(curative);
    const [existant] = await this.db.query('SELECT id FROM registre_consultation_curatives WHERE registre_id = ? ORDER BY id DESC LIMIT 1', [registre.id]);
    if (existant) {
      await this.db.query(`UPDATE registre_consultation_curatives SET ${cols.map((k) => `\`${k}\` = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [
        ...cols.map((k) => curative[k]),
        now,
        existant.id,
      ]);
    } else {
      await this.db.query(
        `INSERT INTO registre_consultation_curatives (registre_id, ${cols.map((k) => `\`${k}\``).join(', ')}, created_at, updated_at)
         VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`,
        [registre.id, ...cols.map((k) => curative[k]), now, now],
      );
    }
    }

    // 4. Ordonnance externe (remplace l'éventuelle précédente)
    let ordonnanceId: number | null = null;
    if (medicaments.length) {
      const anciennes: Ligne[] = await this.db.query("SELECT id FROM ordonnances WHERE consultation_id = ? AND type = 'externe'", [consultationId]);
      if (anciennes.length) {
        const ids = anciennes.map((o) => o.id);
        await this.db.query('DELETE FROM prescriptions WHERE ordonnance_id IN (?)', [ids]);
        await this.db.query('DELETE FROM ordonnances WHERE id IN (?)', [ids]);
      }
      const res = await this.db.query(
        `INSERT INTO ordonnances (reference, type, consultation_id, status, date, created_at, updated_at) VALUES (?, 'externe', ?, 1, ?, ?, ?)`,
        [`ORD${suffixe}`, consultationId, aujourdhui, now, now],
      );
      ordonnanceId = Number(res.insertId);
      for (const m of medicaments) {
        const drugId = m.drugId ? Number(m.drugId) : await this.medicamentSaisi(m.nom!, m.unite);
        await this.db.query(
          `INSERT INTO prescriptions (ordonnance_id, drug_id, quantity, dosage, route_administration, duration, health_dietetic_advice, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ordonnanceId, drugId, m.quantite ?? 1, m.posologie ?? null, m.voie ?? null, m.duree ?? null, m.conseil ?? null, now, now],
        );
      }
    }

    // 5. Bulletin d'examen (remplace l'éventuel précédent)
    if (examens.length) {
      const anciens: Ligne[] = await this.db.query('SELECT id FROM bulletin_examens WHERE consultation_id = ?', [consultationId]);
      if (anciens.length) {
        const ids = anciens.map((b) => b.id);
        await this.db.query('DELETE FROM examens WHERE bulletin_examen_id IN (?)', [ids]);
        await this.db.query('DELETE FROM bulletin_examens WHERE id IN (?)', [ids]);
      }
      const res = await this.db.query('INSERT INTO bulletin_examens (code_bulletin, consultation_id, created_at, updated_at) VALUES (?, ?, ?, ?)', [
        `BE${suffixe}`,
        consultationId,
        now,
        now,
      ]);
      for (const nature of examens) {
        await this.db.query('INSERT INTO examens (code_examen, bulletin_examen_id, nature_examen, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
          `EX${suffixe}`,
          res.insertId,
          nature,
          now,
          now,
        ]);
      }
    }

    // 6. Arrêt de travail
    if (dto.arret) {
      await this.db.query('DELETE FROM arret_travails WHERE consultation_id = ?', [consultationId]);
      await this.db.query(
        'INSERT INTO arret_travails (code, consultation_id, date_debut, date_fin, nb_jour, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`ART${suffixe}`, consultationId, dto.arret.dateDebut, dto.arret.dateFin, dto.arret.nbJour, now, now],
      );
    }

    // 7. Hospitalisation (Laravel : IssueController@storeIssueHospitalisation)
    //    dossier + opération éventuelle + journée (lit facultatif) + protocole thérapeutique saisi par le médecin (médicaments, heures)
    let hospitalisation: string | null = null;
    if (dto.modeSortie === 'hospitalisation' && hosp) {
      const champs = [
        hosp.diagnostic ?? dto.diagnostic ?? null,
        hosp.sonde ?? null,
        hosp.analyseMedical ?? null,
        hosp.oxygenotherapie ?? null,
        dto.justification ?? null,
        hosp.volume ?? null,
        hosp.regime ?? null,
      ];
      let hospId: number;
      const [existante] = await this.db.query('SELECT id, code FROM hospitalisations WHERE consultation_id = ? AND deleted_at IS NULL LIMIT 1', [consultationId]);
      if (existante) {
        hospId = Number(existante.id);
        hospitalisation = String(existante.code);
        await this.db.query(
          'UPDATE hospitalisations SET diagnostic = ?, sonde = ?, analyse_medical = ?, oxygenotherapie = ?, remark = ?, volume = ?, regime = ?, updated_at = ? WHERE id = ?',
          [...champs, now, hospId],
        );
      } else {
        const [[{ n }]] = await Promise.all([this.db.query('SELECT COUNT(*) AS n FROM hospitalisations WHERE DATE(created_at) = ?', [aujourdhui])]);
        hospitalisation = `HOSP${aujourdhui.slice(0, 4)}${Number(n) + 1}`;
        const res = await this.db.query(
          `INSERT INTO hospitalisations (code, consultation_id, doctor_id, type, date, diagnostic, sonde, analyse_medical, oxygenotherapie, remark, volume, regime, created_at, updated_at)
           VALUES (?, ?, ?, 'hospitalisation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [hospitalisation, consultationId, d.id, aujourdhui, ...champs, now, now],
        );
        hospId = Number(res.insertId);
      }

      if (hosp.dateOperation) {
        await this.db.query('INSERT INTO operations (hospitalisation_id, date, created_at, updated_at) VALUES (?, ?, ?, ?)', [hospId, hosp.dateOperation, now, now]);
      }

      // Journée d'hospitalisation (lit facultatif : sans lit → « en attente de chambre »)
      const [jour] = await this.db.query('SELECT id FROM day_hospitalisations WHERE hospitalisation_id = ? AND day = ? LIMIT 1', [hospId, aujourdhui]);
      let jourId: number;
      if (jour) {
        jourId = Number(jour.id);
        await this.db.query('UPDATE day_hospitalisations SET infirmier_id = COALESCE(?, infirmier_id), bed_id = COALESCE(?, bed_id), price = IF(?, ?, price), updated_at = ? WHERE id = ?', [
          hosp.infirmierId ? String(hosp.infirmierId) : null,
          litChoisi ? String(litChoisi.id) : null,
          litChoisi ? 1 : 0,
          litChoisi ? Number(litChoisi.price ?? 0) : 0,
          now,
          jourId,
        ]);
      } else {
        const res = await this.db.query(
          'INSERT INTO day_hospitalisations (hospitalisation_id, doctor_id, infirmier_id, day, bed_id, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [hospId, String(d.id), hosp.infirmierId ? String(hosp.infirmierId) : null, aujourdhui, litChoisi ? String(litChoisi.id) : null, litChoisi ? Number(litChoisi.price ?? 0) : 0, now, now],
        );
        jourId = Number(res.insertId);
      }
      if (litChoisi) await this.db.query("UPDATE beds SET status_occupied = 'occupied', updated_at = ? WHERE id = ?", [now, litChoisi.id]);

      // Protocole thérapeutique : médicaments saisis par le médecin → protocole « externe » de Laravel
      // (drug_hospital_id reçoit l'id du catalogue drugs, sans prix ni demande à la pharmacie)
      const demande = await this.db.query('INSERT INTO hospitalisation_drug_requesteds (hospitalisation_id, created_at, updated_at) VALUES (?, ?, ?)', [hospId, now, now]);
      for (const ligne of hosp.protocole) {
        const drugId = await this.medicamentSaisi(ligne.nom, ligne.unite);
        const res = await this.db.query(
          `INSERT INTO therapeutique_protocols (protocol_type, day_hospitalisation_id, hospitalisation_drug_requested_id, drug_hospital_id, quantity, dosage, voie_admission, created_at, updated_at)
           VALUES ('external', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [jourId, demande.insertId, drugId, ligne.quantite, ligne.posologie ?? null, ligne.voie ?? null, now, now],
        );
        for (const heure of [...new Set(ligne.heures ?? [])]) {
          await this.db.query('INSERT INTO protocol_hour_applications (therapeutique_protocol_id, hour, created_at, updated_at) VALUES (?, ?, ?, ?)', [res.insertId, `${heure}:00`, now, now]);
        }
      }
    }

    // 8. Télé-expertise en interne (référé interne) : nouvelle consultation du jour pour le médecin choisi (pas de caisse dans ce projet).
    //    Les constantes déjà prises sont reprises : le patient arrive directement dans « Patients du jour » du destinataire.
    let messageReference: string | null = null;
    let destinationId: number | null = null;
    if (destinataire) {
      const [[{ n: nb }]] = await Promise.all([this.db.query('SELECT COUNT(*) AS n FROM consultations WHERE patient_id = ?', [c.patient_id])]);
      const code = `CONSULT${String(c.code_patient ?? '').slice(2)}${Number(nb) + 1}`;
      const prestationId = destinataire.prestation_id ?? c.prestation_hospital_id;
      const [presta] = prestationId ? await this.db.query('SELECT prix FROM prestation_hospitals WHERE id = ?', [prestationId]) : [undefined];
      const nomDestinataire = nom(destinataire.name, destinataire.prenom) ?? 'médecin';
      const auteur = infirmier ? `l’infirmier·ère ${nom(d.name, d.prenom) ?? ''}`.trim() : `Dr ${String(nom(d.name, d.prenom) ?? '').replace(/^dr\.?\s*/i, '')}`;
      const [ra, rm, rj] = dto.referenceDate!.split('-');
      const prevu = `${rj}/${rm}/${ra} à ${dto.referenceHeure}`;
      const delai = dto.referenceUrgente ? 'télé-expertise urgente, réponse en moins de 30 min' : `prévu le ${prevu}`;
      const externeDirect = dto.modeSortie === 'refere-externe';
      const [hd] = externeDirect ? await this.db.query('SELECT label FROM hospitals WHERE id = ? LIMIT 1', [c.hospital_id ?? d.hospital_id]) : [undefined];
      const hopitalAuteur = texte(hd?.label);
      const motifReference = `${externeDirect ? 'Référé (externe)' : 'Référé'} par ${auteur}${externeDirect && hopitalAuteur ? ` — ${hopitalAuteur}` : ''} (${delai}) : ${dto.justification ?? dto.motif}`.slice(0, 1000);
      // Hôpital du médecin destinataire (externe : un autre hôpital de la DMHP)
      const hopitalDestination = Number(destinataire.hospital_id ?? c.hospital_id ?? d.hospital_id);
      // La consultation du destinataire est datée du jour prévu : elle apparaît ce jour-là dans ses patients du jour
      const resDestination = await this.db.query(
        `INSERT INTO consultations (code_consultation, date_consultation, hospital_id, patient_id, infirmier_id, doctor_id, prestation_hospital_id,
                                    motif_consultation, montant, poids, taille, imc, temperature, tension_arterielle, pouls, saturation_oxygene,
                                    status, status_inf, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [
          code,
          dto.referenceDate,
          hopitalDestination,
          c.patient_id,
          // Infirmier·ère de l'hôpital du demandeur : seulement si le destinataire est dans le même hôpital
          hopitalDestination === Number(c.hospital_id ?? d.hospital_id) ? (c.infirmier_id ?? null) : null,
          destinataire.id,
          prestationId ?? null,
          motifReference,
          Number(presta?.prix ?? 0),
          complete('poids', dto.poids),
          complete('taille', dto.taille),
          complete('imc', dto.imc),
          complete('temperature', dto.temperature),
          complete('tension_arterielle', dto.tension),
          complete('pouls', dto.pouls),
          texte(c.saturation_oxygene) ?? dto.saturation ?? null,
          now,
          now,
        ],
      );
      await this.db.query('INSERT INTO passage_patients (libelle, hospital_id, date, patient_id, created_at, updated_at) VALUES (?, ?, CURDATE(), ?, ?, ?)', [
        externeDirect ? 'Référence externe' : 'Référence interne',
        hopitalDestination,
        c.patient_id,
        now,
        now,
      ]);
      destinationId = Number(resDestination.insertId);
      messageReference = `Télé-expertise demandée au Dr ${nomDestinataire.replace(/^dr\.?\s*/i, '')} pour le ${prevu} : elle apparaît dans sa Télémédecine.`;
    } else if (expertise) {
      // Envoyée au service : visible par tous ses médecins (de l'hôpital choisi, ou de la DMHP) jusqu'à la prise en charge
      const cible =
        dto.modeSortie === 'refere-interne'
          ? 'de votre hôpital'
          : hopitalReferenceNom
            ? `de ${hopitalReferenceNom}`
            : referenceHorsDistrict
              ? 'des hôpitaux hors de votre district'
              : 'des hôpitaux de votre district';
      messageReference = `Télé-expertise envoyée à tous les médecins du service ${serviceReferenceNom ?? ''} ${cible} : le premier qui la prend en charge la reçoit.`.replace(/\s+/g, ' ');
    }

    // 8 bis. Téléconsultation / appel d'urgence : nouvelle consultation du jour (comme le référé interne), constantes reprises
    let messageTele: string | null = null;
    let appelUrgence: Awaited<ReturnType<typeof lancerUrgence>> | null = null;
    let consultationSuivante: number | null = null;
    if (dto.modeSortie === 'teleconsultation' || dto.modeSortie === 'urgence') {
      const urgence = dto.modeSortie === 'urgence';
      // Téléconsultation envoyée au service (aucun médecin choisi) : sans médecin ni infirmier tant qu'elle n'est pas prise
      // (l'infirmier·ère demandeur est gardé dans fm_teleconsultations_diffusees et remis à la prise en charge)
      const diffusee = !urgence && !teleMedecin;
      const infirmierDemandeur = infirmier ? Number(d.id) : c.infirmier_id ? Number(c.infirmier_id) : null;
      const [[{ n: nb }]] = await Promise.all([this.db.query('SELECT COUNT(*) AS n FROM consultations WHERE patient_id = ?', [c.patient_id])]);
      const code = `CONSULT${String(c.code_patient ?? '').slice(2)}${Number(nb) + 1}`;
      const [presta] = c.prestation_hospital_id ? await this.db.query('SELECT prix FROM prestation_hospitals WHERE id = ?', [c.prestation_hospital_id]) : [undefined];
      const auteur = infirmier ? `l’infirmier·ère ${nom(d.name, d.prenom) ?? ''}`.trim() : `Dr ${String(nom(d.name, d.prenom) ?? '').replace(/^dr\.?\s*/i, '')}`;
      const motif = `${urgence ? 'Appel d’urgence demandé' : 'Téléconsultation demandée'} par ${auteur} : ${dto.justification ?? dto.motif}`.slice(0, 1000);
      const res = await this.db.query(
        `INSERT INTO consultations (code_consultation, date_consultation, hospital_id, patient_id, infirmier_id, doctor_id, prestation_hospital_id,
                                    motif_consultation, montant, poids, taille, imc, temperature, tension_arterielle, pouls, saturation_oxygene,
                                    orientation_infirmier, call_status, call_channel, desired_date, desired_time, observation_infirmiere,
                                    status, status_inf, created_at, updated_at)
         VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          code,
          c.hospital_id ?? d.hospital_id,
          c.patient_id,
          diffusee ? null : infirmierDemandeur,
          urgence || diffusee ? null : teleMedecin!.id,
          c.prestation_hospital_id ?? null,
          motif,
          Number(presta?.prix ?? 0),
          complete('poids', dto.poids),
          complete('taille', dto.taille),
          complete('imc', dto.imc),
          complete('temperature', dto.temperature),
          complete('tension_arterielle', dto.tension),
          complete('pouls', dto.pouls),
          texte(c.saturation_oxygene) ?? dto.saturation ?? null,
          // Urgence : lancerUrgence() pose juste après l'orientation, l'appel et status_inf
          urgence ? null : 'teleconsultation',
          urgence ? null : 'pending',
          urgence ? null : `consultation_${c.id}_${Math.random().toString(36).substring(2, 10)}`,
          urgence ? null : dto.teleDate,
          urgence ? null : dto.teleHeure,
          texte(dto.justification),
          urgence ? 0 : 1,
          now,
          now,
        ],
      );
      consultationSuivante = Number(res.insertId);
      await this.db.query(
        'INSERT INTO passage_patients (libelle, hospital_id, date, patient_id, created_at, updated_at) VALUES (?, ?, CURDATE(), ?, ?, ?)',
        [urgence ? 'Appel d’urgence' : 'Téléconsultation', c.hospital_id ?? d.hospital_id, c.patient_id, now, now],
      );
      if (urgence) {
        appelUrgence = await lancerUrgence(this.db, userId, consultationSuivante, { observation: dto.justification });
        messageTele = infirmier
          ? `Appel d’urgence lancé : ${appelUrgence.medecinsAlertes} médecin(s) alerté(s), le premier qui décroche prend le patient.`
          : `Appel d’urgence lancé vers les médecins de votre service dans le réseau des hôpitaux utilisant GEMMA : ${appelUrgence.medecinsAlertes} médecin(s) alerté(s), le premier qui décroche prend le patient.`;
      } else if (diffusee && teleCible) {
        await this.db.query(
          `INSERT INTO fm_teleconsultations_diffusees (consultation_id, type, service_id, hospital_destination_id, district_origine, hors_district, doctor_origine_id, infirmier_origine_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
          [
            consultationSuivante,
            teleCible.externe ? 'externe' : 'interne',
            teleCible.serviceId,
            teleCible.hopitalId,
            teleCible.district,
            teleCible.horsDistrict ? 1 : 0,
            infirmier ? null : d.id,
            infirmierDemandeur,
          ],
        );
        const [a, mo, j] = dto.teleDate!.split('-');
        messageTele = `${DoctorConsultationsService.messageDiffusion('Téléconsultation', teleCible)} Prévue le ${j}/${mo}/${a} à ${dto.teleHeure}.`;
      } else {
        const [a, mo, j] = dto.teleDate!.split('-');
        messageTele = `Téléconsultation programmée avec ${/^dr\.?\s/i.test(teleMedecin!.nom) ? teleMedecin!.nom : `Dr ${teleMedecin!.nom}`} le ${j}/${mo}/${a} à ${dto.teleHeure}.`;
      }
    }

    // 8 ter. RÉFÉRENCE du patient (infirmier·ère) : consultation créée pour le médecin choisi, ou pour le service visé
    //        (sans médecin : le premier médecin du service qui le prend en charge l'obtient) + fiche de référence imprimable
    let referencePatient: { id: number; code: string } | null = null;
    let messageReferencePatient: string | null = null;
    if (dto.modeSortie === 'reference' && referenceCible) {
      const m = referenceCible.medecin;
      const hopitalOrigine = Number(c.hospital_id ?? d.hospital_id);
      // Hôpital de la consultation créée : celui du médecin, sinon l'hôpital visé (externe sans hôpital : rattachée à la prise en charge)
      const hopitalDestination = m ? Number(m.hospital_id) : (referenceCible.hopitalId ?? hopitalOrigine);
      // Acte « consultation » du service visé dans cet hôpital (sinon le premier acte actif)
      const [presta] = await this.db.query(
        `SELECT ph.id, ph.prix FROM prestation_hospitals ph
           JOIN prestation_services ps ON ps.id = ph.prestation_service_id
           JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
          WHERE sh.hospital_id = ? AND sh.service_id = ? AND ph.status = 0
          ORDER BY (ps.libelle LIKE 'Consultation%') DESC, ph.id LIMIT 1`,
        [hopitalDestination, referenceCible.serviceId],
      );
      const [hOrigine] = await this.db.query('SELECT label FROM hospitals WHERE id = ? LIMIT 1', [hopitalOrigine]);
      const auteur = infirmier ? `l’infirmier·ère ${nom(d.name, d.prenom) ?? ''}`.trim() : `Dr ${String(nom(d.name, d.prenom) ?? '').replace(/^dr\.?\s*/i, '')}`;
      const motifReference = `Référé par ${auteur}${referenceCible.externe && hOrigine?.label ? ` — ${hOrigine.label}` : ''} : ${dto.justification ?? dto.motif}`.slice(0, 1000);
      const [[{ n: nb }]] = await Promise.all([this.db.query('SELECT COUNT(*) AS n FROM consultations WHERE patient_id = ?', [c.patient_id])]);
      const code = `CONSULT${String(c.code_patient ?? '').slice(2)}${Number(nb) + 1}`;
      // Sans infirmier·ère : la consultation est celle du médecin (l'infirmier·ère est gardé·e comme demandeur)
      const res = await this.db.query(
        `INSERT INTO consultations (code_consultation, date_consultation, hospital_id, patient_id, infirmier_id, doctor_id, prestation_hospital_id,
                                    motif_consultation, montant, poids, taille, imc, temperature, tension_arterielle, pouls, saturation_oxygene,
                                    status, status_inf, created_at, updated_at)
         VALUES (?, CURDATE(), ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [
          code,
          hopitalDestination,
          c.patient_id,
          m ? Number(m.id) : null,
          m?.prestation_id ?? presta?.id ?? null,
          motifReference,
          Number(presta?.prix ?? 0),
          complete('poids', dto.poids),
          complete('taille', dto.taille),
          complete('imc', dto.imc),
          complete('temperature', dto.temperature),
          complete('tension_arterielle', dto.tension),
          complete('pouls', dto.pouls),
          texte(c.saturation_oxygene) ?? dto.saturation ?? null,
          now,
          now,
        ],
      );
      const destinationId = Number(res.insertId);
      await this.db.query("INSERT INTO passage_patients (libelle, hospital_id, date, patient_id, created_at, updated_at) VALUES ('Référence', ?, CURDATE(), ?, ?, ?)", [
        hopitalDestination,
        c.patient_id,
        now,
        now,
      ]);
      const ref = await this.db.query(
        `INSERT INTO fm_references_patient (type, consultation_origine_id, consultation_destination_id, service_id, hospital_origine_id, hospital_destination_id,
                                            district_origine, hors_district, doctor_destination_id, infirmier_origine_id, doctor_origine_id, diffusee, motif, pris_le, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE consultation_destination_id = VALUES(consultation_destination_id)`,
        [
          referenceCible.externe ? 'externe' : 'interne',
          consultationId,
          destinationId,
          referenceCible.serviceId,
          hopitalOrigine,
          m ? Number(m.hospital_id) : referenceCible.hopitalId,
          m ? null : referenceCible.district,
          !m && referenceCible.horsDistrict ? 1 : 0,
          m ? Number(m.id) : null,
          infirmier ? Number(d.id) : null,
          infirmier ? null : Number(d.id),
          m ? 0 : 1,
          texte(dto.justification) ?? texte(dto.motif),
          m ? new Date() : null,
        ],
      );
      const refId = Number(ref.insertId);
      // N° de la fiche : REF-AAAAMMJJ-<id>
      const jour = DoctorConsultationsService.maintenantLocal().date.replace(/-/g, '');
      const codeRef = `REF-${jour}-${String(refId).padStart(5, '0')}`;
      await this.db.query('UPDATE fm_references_patient SET code = ? WHERE id = ?', [codeRef, refId]);
      referencePatient = { id: refId, code: codeRef };
      messageReferencePatient = m
        ? `Patient référé au Dr ${String(nom(m.name, m.prenom) ?? '').replace(/^dr\.?\s*/i, '')} : remettez-lui la fiche de référence.`
        : `${DoctorConsultationsService.messageDiffusion('Référence', referenceCible)} Remettez la fiche de référence au patient.`;
    }

    // 9. Référence (interne / externe) : suivie dans la table Gemma FM « fm_references »
    if (dto.modeSortie === 'refere-interne' || dto.modeSortie === 'refere-externe') {
      await this.db.query(
        `INSERT INTO fm_references (type, service_id, diffusee, hospital_destination_id, district_origine, hors_district, date_prevue, heure_prevue, urgence, echeance, consultation_origine_id, consultation_destination_id, doctor_origine_id, doctor_destination_id, hospital_id, motif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE type = VALUES(type), service_id = VALUES(service_id), diffusee = VALUES(diffusee), hospital_destination_id = VALUES(hospital_destination_id),
                                 district_origine = VALUES(district_origine), hors_district = VALUES(hors_district),
                                 date_prevue = VALUES(date_prevue), heure_prevue = VALUES(heure_prevue),
                                 urgence = VALUES(urgence), echeance = VALUES(echeance),
                                 consultation_destination_id = VALUES(consultation_destination_id),
                                 doctor_destination_id = VALUES(doctor_destination_id), motif = VALUES(motif), updated_at = UTC_TIMESTAMP()`,
        [
          dto.modeSortie === 'refere-externe' ? 'externe' : 'interne',
          serviceReference,
          // Sans médecin choisi : envoyée à tous les médecins du service (hôpital visé, ou toute la DMHP si NULL)
          destinataire ? 0 : 1,
          destinataire ? Number(destinataire.hospital_id) : hopitalReference,
          // Externe sans hôpital : district du demandeur, et dans / hors du district
          destinataire ? null : referenceDistrict,
          destinataire ? 0 : referenceHorsDistrict ? 1 : 0,
          // Date / heure de prise en charge demandées (télé-expertise interne et externe)
          dto.referenceDate ?? null,
          dto.referenceHeure ?? null,
          // Délai de réponse : urgente 30 min, programmée 48 h
          dto.referenceUrgente ? 1 : 0,
          dto.referenceUrgente ? DoctorConsultationsService.DELAI_URGENTE_MIN : DoctorConsultationsService.DELAI_PROGRAMMEE_H * 60,
          consultationId,
          destinationId,
          infirmier ? null : d.id,
          destinataire ? destinataire.id : null,
          c.hospital_id ?? d.hospital_id,
          dto.justification ?? null,
        ],
      );
    }

    // 10. Déclaration de naissance (accouchement) : dossiers des nouveau-nés + déclaration → certificat de naissance
    const declarationNaissance = dto.naissance && mere ? await this.declarerNaissance(dto.naissance, mere, consultationId, d, now) : null;

    return {
      success: true,
      declarationNaissance,
      message: declarationNaissance
        ? `Accouchement enregistré. Naissance déclarée (${declarationNaissance.reference}) : le certificat de naissance est prêt.`
        : messageReference
        ? `Consultation effectuée. ${messageReference}`
        : messageReferencePatient
        ? `Consultation effectuée. ${messageReferencePatient}`
        : messageTele
        ? `Consultation effectuée. ${messageTele}`
        : dto.modeSortie === 'hospitalisation'
          ? dto.hospitalisation?.bedId
            ? `Consultation enregistrée. Patient hospitalisé en chambre (${hospitalisation}).`
            : `Consultation enregistrée. Patient mis en hospitalisation (${hospitalisation}), en attente d'attribution de chambre.`
          : 'Consultation effectuée avec succès.',
      ordonnanceId,
      hospitalisation,
      /** Télémédecine / urgence : consultation créée pour la suite */
      consultationSuivante,
      /** Urgence : accès à l'appel vidéo (à ouvrir tout de suite) */
      appel: appelUrgence,
      /** Référence du patient : fiche de référence à imprimer (id, n°) */
      referencePatient,
    };
  }
}
