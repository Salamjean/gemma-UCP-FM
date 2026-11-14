import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ajouterDocuments, listerDocuments, lireDocument, supprimerDocument, type DocumentPrive } from '../../../common/documents-prives';
import { laravelHash, laravelNow } from '../../../common/laravel';
import { creneauDuJour } from '../../infirmier/gestion-patients/accueil.service';
import { ConsultationCurativeDto, NaissanceDto } from './dto/consultation.dto';
import { MATERNITE, nettoyerMaternite, typeMaternite, type TypeMaternite } from './dto/maternite';

type Ligne = Record<string, unknown>;
const texte = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const nom = (n: unknown, p: unknown) => `${(n as string) ?? ''} ${(p as string) ?? ''}`.trim() || null;

/** Libellés des issues (valeurs mode_sortie de Laravel) */
export const LIBELLES_ISSUE: Record<string, string> = {
  sortie: 'Sortie',
  hospitalisation: 'Hospitalisation',
  observation: 'Mise en observation',
  'refere-interne': 'Référé en interne',
  'refere-externe': 'Référé en externe',
  'cas-presume-tb-resume': 'Cas présumé de TB référé',
  'a-revoir': 'À revoir',
  'declaration-deces-patient': 'Décédé(e)',
};

/** Consultations « en attente du médecin » (Laravel : ConsultationRepository@today / allPatients) */
const EN_ATTENTE = `c.status_inf = 1 AND c.status = 0 AND c.call_channel IS NULL
  AND (c.orientation_infirmier IS NULL OR c.orientation_infirmier = '')`;

/** Télémédecine programmée par l'infirmier (orientation « teleconsultation ») ou demande en ligne du patient */
const TELEMEDECINE = `(c.orientation_infirmier = 'teleconsultation' OR c.call_channel IS NOT NULL)`;
const TELE_EN_ATTENTE = `${TELEMEDECINE} AND c.status = 0 AND COALESCE(c.call_status, '') NOT IN ('completed', 'ended', 'complete', 'cancelled')`;
const dateSql = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : texte(x)?.slice(0, 10) ?? null);

const SELECT_LISTE = `
  SELECT c.id, c.code_consultation, c.date_consultation, c.created_at, c.status, c.status_inf, c.is_urgence,
         c.call_channel, c.tension_arterielle, c.temperature, c.poids, c.pouls,
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
  constructor(@InjectDataSource() private readonly db: DataSource) {}

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
          AND (c.status_inf = 1 OR c.call_channel IS NOT NULL)
          -- Sortie décidée par l'infirmier (soins sur place) : le médecin n'a pas vu le patient
          AND (c.orientation_infirmier IS NULL OR c.orientation_infirmier <> 'sortie')
          AND (c.status = 1 OR c.date_consultation < CURDATE() OR c.call_channel IS NOT NULL
               OR EXISTS (SELECT 1 FROM registres rr WHERE rr.consultation_id = c.id)
               OR EXISTS (SELECT 1 FROM ordonnances oo WHERE oo.consultation_id = c.id AND oo.deleted_at IS NULL)
               OR EXISTS (SELECT 1 FROM bulletin_examens bb WHERE bb.consultation_id = c.id))
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
    const c = creneauDuJour(d.days, d.hour_start, d.hour_end);
    return {
      medecin: {
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
              SUM(${TELE_EN_ATTENTE} AND c.desired_date = CURDATE()) AS aujourdhui,
              SUM(c.status = 1) AS terminees,
              COUNT(*) AS toutes
         FROM consultations c
        WHERE c.doctor_id = ? AND c.deleted_at IS NULL AND ${TELEMEDECINE}`,
      [d.id],
    );
    const filtres: Record<string, string> = {
      'en-attente': `AND ${TELE_EN_ATTENTE}`,
      aujourdhui: `AND ${TELE_EN_ATTENTE} AND c.desired_date = CURDATE()`,
      terminees: 'AND c.status = 1',
      toutes: '',
    };
    const rows: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.created_at, c.status, c.call_status, c.is_call_active, c.desired_date, c.desired_time,
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
        WHERE c.doctor_id = ? AND c.deleted_at IS NULL AND ${TELEMEDECINE} ${filtres[filtre] ?? filtres['en-attente']}
        ORDER BY c.status ASC, (c.desired_date IS NULL) ASC, c.desired_date ${filtre === 'terminees' ? 'DESC' : 'ASC'},
                 c.desired_time ASC, c.id DESC`,
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
        terminee: Number(r.status) === 1,
        appelEnCours: Number(r.is_call_active) === 1 || ['calling', 'in_call', 'accepted'].includes(String(r.call_status)),
        issue: issueLib(r.issue_consultation),
        infirmier: nom(r.infirmier_nom, r.infirmier_prenom),
        hopitalDemandeur: texte(r.hopital_demandeur),
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

  async formulaire(userId: number, consultationId: number) {
    const d = await this.medecin(userId);
    const [c] = await this.db.query(
      `SELECT c.*, COALESCE(NULLIF(c.motif_consultation, ''), a.motif_consultation) AS motif,
              p.code_patient, p.gender, p.birth_date, p.img_url, p.telephone, p.profession, p.num_cmu,
              (SELECT CONCAT(dl.id, '|', dl.reference) FROM declarations dl WHERE dl.consultation_id = c.id AND dl.type = 'birth' ORDER BY dl.id DESC LIMIT 1) AS declaration_naissance,
              p.group_sanguin, p.type_allergie_medicamenteuse,
              pu.name AS patient_nom, pu.prenom AS patient_prenom, sr.name AS residence,
              COALESCE(ps.libelle, s.libelle) AS prestation, ps.libelle AS prestation_service,
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
    if (Number(c.doctor_id) !== Number(d.id)) throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");

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
    return {
      lecture: Number(c.status) === 1,
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
      },
    };
  }

  /**
   * Documents imprimables d'une consultation (Laravel : PostConsultationController@Impression,
   * vues pdf/ordonnance, pdf/examen, pdf/arret) : en-tête de l'hôpital, médecin, patient et contenu.
   */
  async documents(userId: number, consultationId: number) {
    const d = await this.medecin(userId);
    const [c] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.created_at, c.doctor_id, c.status,
              COALESCE(NULLIF(c.motif_consultation, ''), a.motif_consultation) AS motif,
              p.code_patient, p.gender, p.birth_date, p.telephone, pu.name AS patient_nom, pu.prenom AS patient_prenom, sr.name AS residence,
              p.address AS patient_adresse, sn.name AS patient_lieu_naissance,
              h.label AS hopital, h.img_url AS hopital_logo, h.watermark_url AS hopital_filigrane, h.contact AS hopital_contact, h.localite,
              sh_loc.name AS hopital_localite, h.district_sanitaire,
              h.reference AS hopital_reference, h.nom_direction_generale,
              du.name AS medecin_nom, du.prenom AS medecin_prenom, dc.matricule, dc.contact AS medecin_contact, s.libelle AS medecin_service,
              rc.diagnostic_retenu
         FROM consultations c
         JOIN patients p ON p.id = c.patient_id
         JOIN users pu ON pu.id = p.user_id
         LEFT JOIN sub_prefectures sr ON sr.id = p.residence_actuelle_id
         LEFT JOIN sub_prefectures sn ON sn.id = p.lieu_de_naissance_id
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN doctors dc ON dc.id = c.doctor_id
         LEFT JOIN users du ON du.id = dc.user_id
         LEFT JOIN service_hospitals sh ON sh.id = dc.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN hospitals h ON h.id = COALESCE(dc.hospital_id, c.hospital_id)
         LEFT JOIN sub_prefectures sh_loc ON sh_loc.id = h.localite
         LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
         LEFT JOIN registre_consultation_curatives rc ON rc.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = r.id)
        WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [consultationId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable.');
    if (Number(c.doctor_id) !== Number(d.id)) {
      // Patient référé : le médecin destinataire (interne) ou tout médecin (externe) voit les documents prescrits
      const [ref] = await this.db.query('SELECT type, doctor_destination_id FROM fm_references WHERE consultation_origine_id = ? LIMIT 1', [consultationId]);
      const autorise = ref && (ref.type === 'externe' || Number(ref.doctor_destination_id) === Number(d.id));
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
  async medecinsReference(userId: number) {
    const d = await this.medecin(userId);
    const rows: Ligne[] = await this.db.query(
      `SELECT dc.id, u.name, u.prenom, s.libelle AS service, dc.type_agent_id, av.days, av.hour_start, av.hour_end
         FROM doctors dc
         JOIN users u ON u.id = dc.user_id
         LEFT JOIN service_hospitals sh ON sh.id = dc.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN availabilities av ON av.id = (SELECT MAX(id) FROM availabilities WHERE user_id = dc.user_id)
        WHERE dc.hospital_id = ? AND dc.id <> ? AND dc.status = 0 AND dc.\`delete\` = 0 AND dc.deleted_at IS NULL
        ORDER BY s.libelle, u.name`,
      [d.hospital_id, d.id],
    );
    return rows.map((r) => {
      const c = creneauDuJour(r.days, r.hour_start, r.hour_end);
      return {
        id: Number(r.id),
        nom: nom(r.name, r.prenom) ?? '—',
        service: texte(r.service) ?? 'Service non précisé',
        sageFemme: Number(r.type_agent_id) === 2,
        enService: !!c,
        creneau: c ? (c.debut === '00:00' ? 'Toute la journée' : `${c.debut} – ${c.fin}`) : null,
      };
    });
  }

  /** Issues qui autorisent des documents joints */
  static readonly ISSUES_REFERENCE = ['refere-interne', 'refere-externe'];

  private presenterReference(x: DocumentPrive) {
    return { id: x.id, libelle: x.libelle, nom: x.nom, type: x.type, taille: x.taille, ajouteLe: x.ajouteLe };
  }

  /** Consultation du médecin, terminée et référée (interne ou externe) */
  private async consultationReferee(userId: number, consultationId: number) {
    const d = await this.medecin(userId);
    const [c] = await this.db.query(
      `SELECT c.id, c.doctor_id, c.status, r.issue_consultation
         FROM consultations c
         LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
        WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [consultationId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable.');
    if (Number(c.doctor_id) !== Number(d.id)) throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");
    const issue = String(c.issue_consultation ?? '').toLowerCase();
    if (!DoctorConsultationsService.ISSUES_REFERENCE.includes(issue)) {
      throw new BadRequestException('Les documents ne peuvent être joints qu’à une consultation référée (en interne ou en externe).');
    }
    return { d, c };
  }

  /** Documents joints à la référence d'une consultation */
  async references(userId: number, consultationId: number) {
    await this.consultationReferee(userId, consultationId);
    return (await listerDocuments(this.db, consultationId)).map((x) => this.presenterReference(x));
  }

  /** Ajout de documents (libellé obligatoire pour chacun) */
  async ajouterReferences(userId: number, consultationId: number, fichiers: Express.Multer.File[], libelles: string[]) {
    await this.consultationReferee(userId, consultationId);
    const ajoutes = await ajouterDocuments(this.db, consultationId, fichiers, libelles, userId);
    return {
      success: true,
      message: ajoutes > 1 ? `${ajoutes} documents joints à la référence.` : 'Document joint à la référence.',
      documents: (await listerDocuments(this.db, consultationId)).map((x) => this.presenterReference(x)),
    };
  }

  async fichierReference(userId: number, consultationId: number, docId: string) {
    await this.consultationReferee(userId, consultationId);
    const r = await lireDocument(this.db, consultationId, docId);
    if (!r) throw new NotFoundException('Document introuvable.');
    return r;
  }

  async supprimerReference(userId: number, consultationId: number, docId: string) {
    await this.consultationReferee(userId, consultationId);
    if (!(await supprimerDocument(this.db, consultationId, docId))) throw new NotFoundException('Document introuvable.');
    return { success: true, message: 'Document retiré de la référence.' };
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
    if (valeurs.date_prochain_rdv) {
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

  async enregistrer(userId: number, consultationId: number, dto: ConsultationCurativeDto) {
    const d = await this.medecin(userId);
    const [c] = await this.db.query(
      `SELECT c.id, c.status, c.doctor_id, c.patient_id, c.poids, c.taille, c.imc, c.temperature, c.tension_arterielle, c.pouls,
              c.hospital_id, c.infirmier_id, c.prestation_hospital_id, c.saturation_oxygene,
              p.code_patient
         FROM consultations c JOIN patients p ON p.id = c.patient_id
        WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [consultationId],
    );
    if (!c) throw new NotFoundException('Consultation introuvable.');
    if (Number(c.doctor_id) !== Number(d.id)) throw new ForbiddenException("Cette consultation n'est pas attribuée à votre compte.");
    if (Number(c.status) === 1) throw new BadRequestException('Cette consultation est déjà terminée.');

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

    // Référé en interne : le médecin destinataire est obligatoire (même hôpital, actif, pas soi-même)
    let destinataire: Ligne | null = null;
    if (dto.modeSortie === 'refere-interne') {
      if (!dto.medecinReferenceId) throw new BadRequestException('Veuillez choisir le médecin à qui vous référez le patient.');
      const [m] = await this.db.query(
        `SELECT dc.id, dc.service_hospital_id, u.name, u.prenom,
                (SELECT ph.id FROM prestation_hospitals ph JOIN prestation_services ps ON ps.id = ph.prestation_service_id
                  WHERE ph.service_hospital_id = dc.service_hospital_id AND ph.status = 0
                  ORDER BY (ps.libelle LIKE 'Consultation%') DESC, ph.id LIMIT 1) AS prestation_id
           FROM doctors dc JOIN users u ON u.id = dc.user_id
          WHERE dc.id = ? AND dc.hospital_id = ? AND dc.status = 0 AND dc.\`delete\` = 0 AND dc.deleted_at IS NULL LIMIT 1`,
        [dto.medecinReferenceId, d.hospital_id],
      );
      if (!m) throw new BadRequestException('Médecin introuvable ou inactif dans votre hôpital.');
      if (Number(m.id) === Number(d.id)) throw new BadRequestException('Vous ne pouvez pas vous référer le patient à vous-même.');
      destinataire = m;
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

    // 8. Référé en interne : nouvelle consultation du jour pour le médecin choisi (pas de caisse dans ce projet).
    //    Les constantes déjà prises sont reprises : le patient arrive directement dans « Patients du jour » du destinataire.
    let messageReference: string | null = null;
    let destinationId: number | null = null;
    if (destinataire) {
      const [[{ n: nb }]] = await Promise.all([this.db.query('SELECT COUNT(*) AS n FROM consultations WHERE patient_id = ?', [c.patient_id])]);
      const code = `CONSULT${String(c.code_patient ?? '').slice(2)}${Number(nb) + 1}`;
      const prestationId = destinataire.prestation_id ?? c.prestation_hospital_id;
      const [presta] = prestationId ? await this.db.query('SELECT prix FROM prestation_hospitals WHERE id = ?', [prestationId]) : [undefined];
      const nomDestinataire = nom(destinataire.name, destinataire.prenom) ?? 'médecin';
      const motifReference = `Référé par Dr ${String(nom(d.name, d.prenom) ?? '').replace(/^dr\.?\s*/i, '')} : ${dto.justification ?? dto.motif}`.slice(0, 1000);
      const resDestination = await this.db.query(
        `INSERT INTO consultations (code_consultation, date_consultation, hospital_id, patient_id, infirmier_id, doctor_id, prestation_hospital_id,
                                    motif_consultation, montant, poids, taille, imc, temperature, tension_arterielle, pouls, saturation_oxygene,
                                    status, status_inf, created_at, updated_at)
         VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [
          code,
          c.hospital_id ?? d.hospital_id,
          c.patient_id,
          c.infirmier_id ?? null,
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
      await this.db.query(
        "INSERT INTO passage_patients (libelle, hospital_id, date, patient_id, created_at, updated_at) VALUES ('Référence interne', ?, CURDATE(), ?, ?, ?)",
        [c.hospital_id ?? d.hospital_id, c.patient_id, now, now],
      );
      destinationId = Number(resDestination.insertId);
      messageReference = `Patient référé au Dr ${nomDestinataire.replace(/^dr\.?\s*/i, '')} : il apparaît dans ses patients du jour.`;
    }

    // 9. Référence (interne / externe) : suivie dans la table Gemma FM « fm_references »
    if (dto.modeSortie === 'refere-interne' || dto.modeSortie === 'refere-externe') {
      await this.db.query(
        `INSERT INTO fm_references (type, consultation_origine_id, consultation_destination_id, doctor_origine_id, doctor_destination_id, hospital_id, motif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE type = VALUES(type), consultation_destination_id = VALUES(consultation_destination_id),
                                 doctor_destination_id = VALUES(doctor_destination_id), motif = VALUES(motif), updated_at = UTC_TIMESTAMP()`,
        [
          dto.modeSortie === 'refere-externe' ? 'externe' : 'interne',
          consultationId,
          destinationId,
          d.id,
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
        : dto.modeSortie === 'hospitalisation'
          ? dto.hospitalisation?.bedId
            ? `Consultation enregistrée. Patient hospitalisé en chambre (${hospitalisation}).`
            : `Consultation enregistrée. Patient mis en hospitalisation (${hospitalisation}), en attente d'attribution de chambre.`
          : 'Consultation effectuée avec succès.',
      ordonnanceId,
      hospitalisation,
    };
  }
}
