import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ajouterDocuments, compterDocuments, listerDocuments, lireDocument, verifierDocuments, type DocumentPrive } from '../../../common/documents-prives';
import { laravelNow } from '../../../common/laravel';
import { DoctorConsultationsService } from '../consultations/consultations.service';

type Ligne = Record<string, unknown>;
const texte = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const nom = (n: unknown, p: unknown) => `${(n as string) ?? ''} ${(p as string) ?? ''}`.trim() || null;

/** Requérant affiché : « Dr Nom » pour un médecin, « Nom (infirmier·ère) » pour un infirmier·ère */
const requerant = (r: Ligne) => {
  const medecin = nom(r.origine_nom, r.origine_prenom);
  if (medecin) return `Dr ${medecin.replace(/^dr\.?\s*/i, '')}`;
  const inf = nom(r.origine_inf_nom, r.origine_inf_prenom);
  return inf ? `${inf} (infirmier·ère)` : null;
};

/** Colonnes communes : référence (fm_references), consultation d'origine, patient, médecin et hôpital d'origine */
const SELECT_REFERENCE = `
  SELECT fr.id AS reference_id, fr.type, fr.service_id AS service_reference_id, rs.libelle AS service_reference,
         fr.diffusee, fr.hospital_destination_id, th.label AS hopital_cible,
         DATE_FORMAT(fr.date_prevue, '%Y-%m-%d') AS date_prevue, TIME_FORMAT(fr.heure_prevue, '%H:%i') AS heure_prevue, fr.consultation_origine_id, fr.consultation_destination_id,
         fr.doctor_origine_id, fr.doctor_destination_id, fr.motif AS justification, fr.created_at,
         fr.urgence, fr.programmation_directe, DATE_FORMAT(fr.echeance, '%Y-%m-%dT%H:%i:%sZ') AS echeance,
         fr.resultat_avis, fr.resultat_conduite, DATE_FORMAT(fr.resultat_le, '%Y-%m-%dT%H:%i:%sZ') AS resultat_le,
         (fr.resultat_le IS NOT NULL AND fr.resultat_le <= fr.echeance) AS resultat_dans_delai,
         o.code_consultation, o.motif_consultation, o.tension_arterielle, o.temperature, o.pouls, o.poids, o.taille, o.saturation_oxygene,
         p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.img_url, p.telephone, p.group_sanguin, p.type_allergie_medicamenteuse,
         pu.name AS patient_nom, pu.prenom AS patient_prenom,
         ou.name AS origine_nom, ou.prenom AS origine_prenom, os.libelle AS origine_service,
         oiu.name AS origine_inf_nom, oiu.prenom AS origine_inf_prenom,
         h.label AS hopital, h.contact AS hopital_contact,
         rco.diagnostic_retenu, rco.examen_physique,
         o.imc, o.patient_id AS origine_patient_id,
         dest.status AS destination_status, dest.is_urgence AS destination_urgence,
         du.name AS destination_nom, du.prenom AS destination_prenom, fr.updated_at AS pris_le
    FROM fm_references fr
    JOIN consultations o ON o.id = fr.consultation_origine_id
    JOIN patients p ON p.id = o.patient_id
    JOIN users pu ON pu.id = p.user_id
    LEFT JOIN doctors od ON od.id = fr.doctor_origine_id
    LEFT JOIN users ou ON ou.id = od.user_id
    -- Requérant infirmier·ère (consultation d'origine faite sans médecin)
    LEFT JOIN infirmiers oi ON oi.id = o.infirmier_id AND fr.doctor_origine_id IS NULL AND o.doctor_id IS NULL
    LEFT JOIN users oiu ON oiu.id = oi.user_id
    LEFT JOIN service_hospitals osh ON osh.id = COALESCE(od.service_hospital_id, oi.service_hospital_id)
    LEFT JOIN services os ON os.id = osh.service_id
    LEFT JOIN hospitals h ON h.id = COALESCE(fr.hospital_id, o.hospital_id)
    LEFT JOIN registres ro ON ro.id = (SELECT MAX(id) FROM registres WHERE consultation_id = o.id)
    LEFT JOIN registre_consultation_curatives rco ON rco.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = ro.id)
    LEFT JOIN consultations dest ON dest.id = fr.consultation_destination_id
    LEFT JOIN doctors dd ON dd.id = fr.doctor_destination_id
    LEFT JOIN users du ON du.id = dd.user_id
    LEFT JOIN services rs ON rs.id = fr.service_id
    LEFT JOIN hospitals th ON th.id = fr.hospital_destination_id`;

/**
 * Télé-expertise ENVOYÉE AU SERVICE (diffusee = 1) visible par un médecin : du service visé
 * (anciennes externes sans service : tous) et de l'hôpital visé (NULL : tous les hôpitaux de la DMHP).
 * Paramètres : services.id du médecin, son hôpital.
 */
const POUR_MON_SERVICE = `(fr.diffusee = 1 AND (fr.service_id IS NULL OR fr.service_id = ?) AND (fr.hospital_destination_id IS NULL OR fr.hospital_destination_id = ?))`;

/**
 * MÉDECIN > RÉFÉRÉS (table Gemma FM « fm_references »)
 *   - internes : patients qu'un collègue de l'hôpital m'a référés ;
 *   - externes : patients référés vers un autre établissement, visibles par tous les médecins.
 * Lecture seule ; les documents joints à la référence sont téléchargeables.
 */
@Injectable()
export class DoctorReferesService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly consultations: DoctorConsultationsService,
  ) {}

  private patient(r: Ligne) {
    return {
      id: Number(r.patient_id),
      code: texte(r.code_patient) ?? '—',
      nom: nom(r.patient_nom, r.patient_prenom) ?? '—',
      genre: texte(r.gender),
      dateNaissance: texte(r.birth_date),
      imgUrl: texte(r.img_url),
    };
  }

  /** services.id du service du médecin (via son service à l'hôpital) */
  private async monService(doctorId: unknown): Promise<number | null> {
    const [r] = await this.db.query('SELECT sh.service_id FROM doctors dc LEFT JOIN service_hospitals sh ON sh.id = dc.service_hospital_id WHERE dc.id = ? LIMIT 1', [doctorId]);
    return r?.service_id ? Number(r.service_id) : null;
  }

  async liste(userId: number) {
    const d = await this.consultations.medecin(userId);
    const service = await this.monService(d.id);
    const [internes, externes]: Ligne[][] = await Promise.all([
      this.db.query(
        `${SELECT_REFERENCE}
          WHERE fr.doctor_destination_id = ? AND o.deleted_at IS NULL
          ORDER BY (dest.status = 1) ASC, fr.created_at DESC`,
        [d.id],
      ),
      // Télé-expertise externe : visible par les médecins du service (et de l'hôpital) visés, par son auteur et par son destinataire
      this.db.query(
        `${SELECT_REFERENCE} WHERE fr.type = 'externe' AND o.deleted_at IS NULL
            AND (${POUR_MON_SERVICE} OR fr.doctor_origine_id = ? OR fr.doctor_destination_id = ?)
          ORDER BY fr.created_at DESC LIMIT 300`,
        [service ?? 0, d.hospital_id, d.id, d.id],
      ),
    ]);
    const docs = await compterDocuments(this.db, [...internes, ...externes].map((r) => Number(r.consultation_origine_id)));
    const commun = (r: Ligne) => ({
      origineId: Number(r.consultation_origine_id),
      date: r.created_at,
      motif: texte(r.motif_consultation),
      justification: texte(r.justification),
      diagnostic: texte(r.diagnostic_retenu),
      referePar: requerant(r),
      service: texte(r.origine_service),
      documents: docs.get(Number(r.consultation_origine_id)) ?? 0,
      patient: this.patient(r),
    });
    return {
      internes: internes.map((r) => ({
        ...commun(r),
        consultationId: r.consultation_destination_id ? Number(r.consultation_destination_id) : null,
        terminee: Number(r.destination_status) === 1,
        urgence: Number(r.destination_urgence) === 1,
        externe: r.type === 'externe',
      })),
      externes: externes.map((r) => ({
        ...commun(r),
        hopital: texte(r.hopital),
        serviceReference: texte(r.service_reference),
        hopitalCible: texte(r.hopital_cible),
        datePrevue: texte(r.date_prevue),
        heurePrevue: texte(r.heure_prevue),
        priseEnChargePar: r.doctor_destination_id ? nom(r.destination_nom, r.destination_prenom) : null,
        parMoi: Number(r.doctor_destination_id) === Number(d.id),
      })),
    };
  }

  /**
   * Télé-expertises À PRENDRE EN CHARGE (affichées dans Télémédecine), internes comme externes :
   * envoyées à mon service (dans mon hôpital, ou dans toute la DMHP), pas encore prises, pas demandées par moi.
   * Dès qu'un médecin la prend, elle disparaît chez les autres.
   */
  async disponibles(userId: number) {
    const d = await this.consultations.medecin(userId);
    const service = await this.monService(d.id);
    const rows: Ligne[] = await this.db.query(
      `${SELECT_REFERENCE}
        WHERE ${POUR_MON_SERVICE} AND fr.doctor_destination_id IS NULL AND fr.resultat_le IS NULL AND o.deleted_at IS NULL
          AND COALESCE(fr.doctor_origine_id, 0) <> ?
        ORDER BY fr.urgence DESC, (fr.date_prevue IS NULL) ASC, fr.date_prevue ASC, fr.heure_prevue ASC, fr.created_at ASC
        LIMIT 100`,
      [service ?? 0, d.hospital_id, d.id],
    );
    const docs = await compterDocuments(this.db, rows.map((r) => Number(r.consultation_origine_id)));
    return rows.map((r) => ({
      origineId: Number(r.consultation_origine_id),
      /** Arrivée de la demande (UTC, comme created_at) */
      recueLe: r.created_at,
      datePrevue: texte(r.date_prevue),
      heurePrevue: texte(r.heure_prevue),
      /** Urgente (< 30 min) ou programmée (24 à 48 h), et heure limite de la réponse (ISO UTC) */
      urgente: Number(r.urgence) === 1,
      /** Interne (même hôpital) ou externe (autre hôpital de la DMHP) */
      externe: r.type === 'externe',
      echeance: texte(r.echeance),
      motif: texte(r.justification) ?? texte(r.motif_consultation),
      referePar: requerant(r),
      hopital: texte(r.hopital),
      serviceReference: texte(r.service_reference),
      documents: docs.get(Number(r.consultation_origine_id)) ?? 0,
      patient: this.patient(r),
    }));
  }

  /**
   * Accès : l'auteur et le destinataire ; une télé-expertise envoyée au service (interne ou externe) :
   * aussi les médecins de ce service dans l'hôpital visé (tous les hôpitaux de la DMHP si aucun).
   */
  private async referenceAccessible(userId: number, origineId: number) {
    const d = await this.consultations.medecin(userId);
    const [r] = await this.db.query(`${SELECT_REFERENCE} WHERE fr.consultation_origine_id = ? AND o.deleted_at IS NULL LIMIT 1`, [origineId]);
    if (!r) throw new NotFoundException('Référence introuvable.');
    const auteurOuDestinataire = [Number(r.doctor_origine_id), Number(r.doctor_destination_id)].includes(Number(d.id));
    if (!auteurOuDestinataire) {
      if (Number(r.diffusee) !== 1) throw new ForbiddenException('Cette référence ne vous est pas adressée.');
      if (r.service_reference_id && Number(r.service_reference_id) !== (await this.monService(d.id))) {
        throw new ForbiddenException(`Cette télé-expertise est adressée au service ${texte(r.service_reference) ?? 'choisi'}.`);
      }
      if (r.hospital_destination_id && Number(r.hospital_destination_id) !== Number(d.hospital_id)) {
        throw new ForbiddenException(`Cette télé-expertise est adressée à ${texte(r.hopital_cible) ?? 'un autre hôpital'}.`);
      }
    }
    return { ...(r as Ligne), pour_moi: Number(r.doctor_destination_id) === Number(d.id), moi_id: Number(d.id) } as Ligne;
  }

  private presenter(x: DocumentPrive) {
    return { id: x.id, libelle: x.libelle, nom: x.nom, type: x.type, taille: x.taille, ajouteLe: x.ajouteLe };
  }

  /** Fiche de la référence : patient, médecin d'origine, constantes, diagnostic, motif, prescriptions, documents */
  async detail(userId: number, origineId: number) {
    const o = await this.referenceAccessible(userId, origineId);
    const [prescriptions, examens, docsPrescrits] = await Promise.all([
      this.db.query(
        `SELECT dr.name, pr.quantity, pr.dosage, pr.duration FROM ordonnances ord
           JOIN prescriptions pr ON pr.ordonnance_id = ord.id LEFT JOIN drugs dr ON dr.id = pr.drug_id
          WHERE ord.consultation_id = ? AND ord.deleted_at IS NULL ORDER BY pr.id`,
        [origineId],
      ),
      this.db.query('SELECT e.nature_examen FROM bulletin_examens b JOIN examens e ON e.bulletin_examen_id = b.id WHERE b.consultation_id = ? ORDER BY e.id', [origineId]),
      // Documents prescrits par le médecin d'origine (imprimables par le nouveau médecin)
      this.db.query(
        `SELECT 'ordonnance' AS type, reference AS code, created_at FROM ordonnances WHERE consultation_id = ? AND deleted_at IS NULL AND id = (SELECT MAX(id) FROM ordonnances WHERE consultation_id = ? AND deleted_at IS NULL)
         UNION ALL
         SELECT 'examens', code_bulletin, created_at FROM bulletin_examens WHERE id = (SELECT MAX(id) FROM bulletin_examens WHERE consultation_id = ?)
         UNION ALL
         SELECT 'arret', code, created_at FROM arret_travails WHERE id = (SELECT MAX(id) FROM arret_travails WHERE consultation_id = ?)`,
        [origineId, origineId, origineId, origineId],
      ),
    ]);
    return {
      origineId,
      type: o.type === 'externe' ? 'externe' : 'interne',
      /** Télé-expertise externe : service destinataire */
      serviceReference: texte(o.service_reference),
      /** Télé-expertise externe : date / heure de prise en charge demandées */
      datePrevue: texte(o.date_prevue),
      heurePrevue: texte(o.heure_prevue),
      /** Délai de réponse : urgente (< 30 min) ou programmée (24 à 48 h), heure limite (ISO UTC) */
      urgente: Number(o.urgence) === 1,
      echeance: texte(o.echeance),
      /** Formulaire de consultation pour l'expert : urgente, ou issue d'une vraie consultation (pas une programmation directe) */
      avecConsultation: Number(o.urgence) === 1 || Number(o.programmation_directe) !== 1,
      /** Résultat joint par l'expert */
      resultat: o.resultat_le
        ? {
            le: texte(o.resultat_le),
            dansDelai: Number(o.resultat_dans_delai) === 1,
            avis: texte(o.resultat_avis),
            conduite: texte(o.resultat_conduite),
            documents: (await listerDocuments(this.db, origineId, 'resultat')).map((x) => this.presenter(x)),
          }
        : null,
      /** L'expert (destinataire) peut joindre son résultat tant qu'il ne l'a pas envoyé */
      peutRepondre: !!o.pour_moi && !o.resultat_le,
      /** Médecin sollicité (expert) : peut compléter les documents d'un résultat déjà envoyé */
      estExpert: !!o.pour_moi,
      // Référence interne qui m'est adressée : la consultation à faire (bouton « Consulter » sur la fiche)
      consultationDestinataire: o.pour_moi && o.consultation_destination_id ? { id: Number(o.consultation_destination_id), terminee: Number(o.destination_status) === 1 } : null,
      // Envoyée au service : prise en charge par un médecin (le premier qui se l'attribue)
      priseEnCharge: Number(o.diffusee) === 1 && o.doctor_destination_id ? { par: nom(o.destination_nom, o.destination_prenom), le: o.pris_le, parMoi: !!o.pour_moi } : null,
      peutPrendreEnCharge: Number(o.diffusee) === 1 && !o.doctor_destination_id && !o.resultat_le && Number(o.doctor_origine_id) !== Number(o.moi_id),
      /** Hôpital visé par la demande (envoyée au service) ; null = tous les hôpitaux de la DMHP */
      hopitalCible: texte(o.hopital_cible),
      date: o.created_at,
      code: texte(o.code_consultation) ?? `CONS-${origineId}`,
      motif: texte(o.motif_consultation),
      justification: texte(o.justification),
      diagnostic: texte(o.diagnostic_retenu),
      examenPhysique: texte(o.examen_physique),
      referePar: requerant(o),
      service: texte(o.origine_service),
      hopital: texte(o.hopital),
      hopitalContact: texte(o.hopital_contact),
      constantes: {
        tension: texte(o.tension_arterielle),
        temperature: texte(o.temperature),
        pouls: texte(o.pouls),
        poids: texte(o.poids),
        taille: texte(o.taille),
        saturation: texte(o.saturation_oxygene),
      },
      prescriptions: prescriptions.map((x: Ligne) => ({ nom: texte(x.name) ?? '—', quantite: Number(x.quantity ?? 1), posologie: texte(x.dosage), duree: texte(x.duration) })),
      examens: examens.map((x: Ligne) => String(x.nature_examen)),
      patient: {
        ...this.patient(o),
        telephone: texte(o.telephone),
        groupeSanguin: texte(o.group_sanguin),
        allergies: texte(o.type_allergie_medicamenteuse),
      },
      documents: (await listerDocuments(this.db, origineId)).map((x) => this.presenter(x)),
      documentsPrescrits: docsPrescrits.map((x: Ligne) => ({ type: String(x.type) as 'ordonnance' | 'examens' | 'arret', code: texte(x.code), date: x.created_at })),
    };
  }

  /**
   * Télé-expertise envoyée au service (interne ou externe) : un médecin du service s'attribue le patient.
   * Le premier qui la prend l'obtient (elle disparaît chez les autres) ; une consultation du jour est créée à son nom,
   * dans son hôpital, avec les constantes de la consultation d'origine.
   */
  async prendreEnCharge(userId: number, origineId: number) {
    const d = await this.consultations.medecin(userId);
    const o = await this.referenceAccessible(userId, origineId);
    if (Number(o.diffusee) !== 1) throw new BadRequestException('Cette télé-expertise est adressée à un médecin précis : elle ne peut pas être prise en charge.');
    if (o.resultat_le) throw new ConflictException('La réponse de cette télé-expertise a déjà été envoyée.');
    if (Number(o.doctor_origine_id) === Number(d.id)) throw new BadRequestException('Vous avez vous-même référé ce patient.');
    if (o.doctor_destination_id) {
      throw new ConflictException(`Ce patient a déjà été pris en charge par Dr ${String(nom(o.destination_nom, o.destination_prenom) ?? '').replace(/^dr\.?\s*/i, '')}.`);
    }
    const [moi] = await this.db.query(
      `SELECT dc.hospital_id,
              (SELECT ph.id FROM prestation_hospitals ph JOIN prestation_services ps ON ps.id = ph.prestation_service_id
                WHERE ph.service_hospital_id = dc.service_hospital_id AND ph.status = 0
                ORDER BY (ps.libelle LIKE 'Consultation%') DESC, ph.id LIMIT 1) AS prestation_id
         FROM doctors dc WHERE dc.id = ? LIMIT 1`,
      [d.id],
    );

    // Attribution atomique (InnoDB) : un seul médecin peut prendre la référence
    const pris = await this.db.query('UPDATE fm_references SET doctor_destination_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND doctor_destination_id IS NULL', [
      d.id,
      o.reference_id,
    ]);
    if (Number(pris.affectedRows) !== 1) throw new ConflictException('Ce patient vient d’être pris en charge par un autre médecin.');

    try {
      const now = laravelNow();
      const [{ n }] = await this.db.query('SELECT COUNT(*) AS n FROM consultations WHERE patient_id = ?', [o.origine_patient_id]);
      const code = `CONSULT${String(o.code_patient ?? '').slice(2)}${Number(n) + 1}`;
      const [presta] = moi?.prestation_id ? await this.db.query('SELECT prix FROM prestation_hospitals WHERE id = ?', [moi.prestation_id]) : [undefined];
      const prevu = o.date_prevue ? `${String(o.date_prevue).split('-').reverse().join('/')}${o.heure_prevue ? ` à ${o.heure_prevue}` : ''}` : null;
      const externe = o.type === 'externe';
      const motif = `${externe ? 'Référé (externe)' : 'Référé'} par ${requerant(o) ?? 'le requérant'}${externe && o.hopital ? ` — ${o.hopital}` : ''}${prevu ? ` (prévu le ${prevu})` : ''} : ${o.justification ?? o.motif_consultation ?? ''}`.slice(0, 1000);
      const res = await this.db.query(
        `INSERT INTO consultations (code_consultation, date_consultation, hospital_id, patient_id, doctor_id, prestation_hospital_id, motif_consultation, montant,
                                    poids, taille, imc, temperature, tension_arterielle, pouls, saturation_oxygene, status, status_inf, created_at, updated_at)
         VALUES (?, GREATEST(CURDATE(), COALESCE(?, CURDATE())), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [
          code,
          // Daté du jour prévu par l'auteur (jamais dans le passé)
          texte(o.date_prevue),
          moi?.hospital_id ?? d.hospital_id,
          o.origine_patient_id,
          d.id,
          moi?.prestation_id ?? null,
          motif,
          Number(presta?.prix ?? 0),
          texte(o.poids),
          texte(o.taille),
          texte(o.imc),
          texte(o.temperature),
          texte(o.tension_arterielle),
          texte(o.pouls),
          texte(o.saturation_oxygene),
          now,
          now,
        ],
      );
      await this.db.query(
        'INSERT INTO passage_patients (libelle, hospital_id, date, patient_id, created_at, updated_at) VALUES (?, ?, CURDATE(), ?, ?, ?)',
        [externe ? 'Prise en charge (référence externe)' : 'Prise en charge (référence interne)', moi?.hospital_id ?? d.hospital_id, o.origine_patient_id, now, now],
      );
      await this.db.query('UPDATE fm_references SET consultation_destination_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [res.insertId, o.reference_id]);
      return { success: true, message: 'Patient pris en charge : sa consultation est prête.', consultationId: Number(res.insertId) };
    } catch (e) {
      // Échec de la création : la référence redevient disponible
      await this.db.query('UPDATE fm_references SET doctor_destination_id = NULL, consultation_destination_id = NULL WHERE id = ? AND doctor_destination_id = ?', [o.reference_id, d.id]);
      throw e;
    }
  }

  /**
   * L'expert (médecin destinataire, ou qui a pris en charge l'externe) joint son résultat, une fois sa consultation terminée :
   * avis obligatoire, consignes au requérant et documents facultatifs. Envoyé une seule fois ; clôt la télé-expertise.
   * (colonne resultat_conduite : consignes au requérant)
   */
  async envoyerResultat(userId: number, origineId: number, avis: string, conduite: string | undefined, fichiers: Express.Multer.File[], libelles: string[]) {
    const o = await this.referenceAccessible(userId, origineId);
    if (!o.pour_moi) throw new ForbiddenException('Seul le médecin sollicité peut joindre la réponse de cette télé-expertise.');
    if (o.resultat_le) throw new ConflictException('La réponse de cette télé-expertise a déjà été envoyée.');
    const texteAvis = (avis ?? '').trim();
    if (!texteAvis) throw new BadRequestException('L’avis / la conclusion est obligatoire.');
    if (texteAvis.length > 10000 || (conduite ?? '').length > 10000) throw new BadRequestException('Texte trop long (10 000 caractères maximum).');
    if (fichiers.length) verifierDocuments(fichiers, libelles);

    // Envoi unique (InnoDB) : posé avant les fichiers, retiré si l'enregistrement des fichiers échoue
    const pose = await this.db.query(
      'UPDATE fm_references SET resultat_avis = ?, resultat_conduite = ?, resultat_le = UTC_TIMESTAMP(), resultat_par = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND resultat_le IS NULL',
      [texteAvis, (conduite ?? '').trim() || null, o.moi_id, o.reference_id],
    );
    if (Number(pose.affectedRows) !== 1) throw new ConflictException('La réponse de cette télé-expertise a déjà été envoyée.');
    try {
      if (fichiers.length) await ajouterDocuments(this.db, origineId, fichiers, libelles, userId, 'resultat');
    } catch (e) {
      await this.db.query('UPDATE fm_references SET resultat_avis = NULL, resultat_conduite = NULL, resultat_le = NULL, resultat_par = NULL WHERE id = ?', [o.reference_id]);
      throw e;
    }
    return { success: true, message: 'Réponse envoyée : le demandeur la retrouve dans « Réponses d’expertise ».' };
  }

  /** Résultat déjà envoyé : l'expert ajoute des documents (ex. oublié à l'envoi) — l'avis, lui, ne change plus */
  async ajouterDocumentsResultat(userId: number, origineId: number, fichiers: Express.Multer.File[], libelles: string[]) {
    const o = await this.referenceAccessible(userId, origineId);
    if (!o.pour_moi) throw new ForbiddenException('Seul le médecin sollicité peut compléter cette réponse.');
    if (!o.resultat_le) throw new BadRequestException('Envoyez d’abord la réponse (avis) de la télé-expertise.');
    const n = await ajouterDocuments(this.db, origineId, fichiers, libelles, userId, 'resultat');
    return {
      success: true,
      message: n > 1 ? `${n} documents ajoutés à la réponse.` : 'Document ajouté à la réponse.',
      documents: (await listerDocuments(this.db, origineId, 'resultat')).map((x) => this.presenter(x)),
    };
  }

  async fichier(userId: number, origineId: number, docId: string) {
    await this.referenceAccessible(userId, origineId);
    const r = await lireDocument(this.db, origineId, docId);
    if (!r) throw new NotFoundException('Document introuvable.');
    return r;
  }
}
