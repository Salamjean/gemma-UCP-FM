import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService, type ContexteAudit } from '../../../common/audit/audit.service';
import { laravelHash, laravelNow } from '../../../common/laravel';
import { AffectationDto, InscriptionPatientDto, MiseAJourPatientDto } from './dto/accueil.dto';
import { agentDuCompte } from '../../../common/agent-sante';
import { smsAffectationPatient, smsBienvenuePatient } from '../../../common/sms';
import { SQL_EN_PERMISSION } from '../../../common/permission-en-cours';

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const minutes = (h: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(h);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const lireJson = (v: unknown): unknown[] => {
  if (typeof v !== 'string') return [];
  try {
    const r = JSON.parse(v);
    return Array.isArray(r) ? r : [r];
  } catch {
    return [v];
  }
};

/**
 * Le médecin est-il disponible maintenant ? Même règle que Laravel (Doctor\ConsultationController::isDoctorAvailable) :
 *  - aujourd'hui doit faire partie de ses jours (availabilities.days, 0 = lundi … 6 = dimanche) ;
 *  - l'heure actuelle doit être dans son créneau : début (hour_start du jour) − 30 min → fin (hour_end, 23:59 par défaut) ;
 *  - un début à "00:00" ou vide = disponible toute la journée.
 * Renvoie le créneau du jour (pour l'affichage) ou null s'il n'est pas disponible.
 */
export function creneauDuJour(days: unknown, hourStart: unknown, hourEnd: unknown, maintenant = new Date()): { debut: string; fin: string } | null {
  const jour = (maintenant.getDay() + 6) % 7; // JS : 0 = dimanche → 0 = lundi
  const jours = lireJson(days).map((d) => Number(d));
  const position = jours.indexOf(jour);
  if (position === -1) return null;

  // hour_start : 7 heures indexées par jour (formulaire de planning) ou une heure par jour listé (anciennes données)
  const debuts = lireJson(hourStart).map(String);
  const fins = lireJson(hourEnd).map(String);
  const prendre = (l: string[], defaut: string) => (l.length === 7 ? l[jour] : l[position] ?? l[0]) || defaut;
  let debut = prendre(debuts, '00:00');
  let fin = prendre(fins, '23:59');
  if (fin === '00:00' || fin === 'null') fin = '23:59';
  if (debut === 'null') debut = '00:00';

  if (debut === '00:00') return { debut: '00:00', fin };
  const d = minutes(debut);
  const f = minutes(fin) ?? 23 * 60 + 59;
  const now = maintenant.getHours() * 60 + maintenant.getMinutes();
  if (d === null || now < d - 30 || now > f) return null;
  return { debut, fin };
}

export const nomJour = (date = new Date()) => JOURS[(date.getDay() + 6) % 7];

/** Mot de passe initial des comptes patients, comme Laravel (PatientController@addPatient) */
const MOT_DE_PASSE_PATIENT = '1234';

/**
 * INFIRMIER > ACCUEIL DES PATIENTS (boutons du tableau de bord)
 *   - inscrire un nouveau patient (users + patients + passage_patients), avec affectation facultative ;
 *   - affecter un patient existant.
 * Repris de Laravel Secretariat\PatientController@addPatient / AdmissionController, MAIS sans caisse
 * (ce projet n'a pas de caisse) : l'affectation crée directement la consultation du jour, prise en charge
 * par l'infirmier connecté → elle apparaît dans "Consultations > Nouvelles" et l'infirmier prend les constantes.
 */
@Injectable()
export class InfirmierAccueilService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}

  /**
   * Patient consultable et modifiable depuis n'importe quel hôpital : un patient peut être pris en charge
   * ailleurs que dans son hôpital d'origine. patients.hospital_id n'est jamais modifié ici :
   * il reste compté dans son hôpital d'origine (la modification est tracée au nom de l'hôpital de l'agent).
   */
  private async patientModifiable(userId: number, patientId: number) {
    const { hospitalId } = await this.getInfirmier(userId);
    const [p] = await this.db.query(
      `SELECT p.*, u.name, u.prenom, mu.name AS mere_nom, mu.prenom AS mere_prenom, m.code_patient AS mere_code,
              -- Lieu de naissance : celui de l'inscription ; nouveau-né sans lieu (ancien dossier) → localité de l'hôpital de naissance
              COALESCE((SELECT sp.name FROM sub_prefectures sp WHERE sp.id = p.lieu_de_naissance_id),
                       IF(p.mere_id IS NULL, NULL, (SELECT sp2.name FROM hospitals hn JOIN sub_prefectures sp2 ON sp2.id = hn.localite WHERE hn.id = p.hospital_id))) AS lieu_naissance_nom
         FROM patients p JOIN users u ON u.id = p.user_id
         LEFT JOIN patients m ON m.id = p.mere_id LEFT JOIN users mu ON mu.id = m.user_id
        WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1`,
      [patientId],
    );
    if (!p) throw new NotFoundException('Patient introuvable.');
    return { p, hospitalId };
  }

  /** Informations modifiables d'un patient (formulaire « Mettre à jour ») */
  async identite(userId: number, patientId: number) {
    const { p } = await this.patientModifiable(userId, patientId);
    const t = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v));
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(p.birth_date ?? ''));
    return {
      id: Number(p.id),
      code: t(p.code_patient),
      nom: t(p.name) ?? '',
      // Nouveau-né : le prénom provisoire copié de la mère (comme Laravel) est vidé ; un prénom donné à la déclaration est gardé
      prenom: /^nouveau-n/i.test(String(p.name ?? '')) && t(p.prenom) === t(p.mere_prenom) ? '' : (t(p.prenom) ?? ''),
      genre: t(p.gender),
      dateNaissance: m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}/.test(String(p.birth_date ?? '')) ? String(p.birth_date).slice(0, 10) : null,
      telephone: t(p.telephone),
      contact2: t(p.contact2),
      situationMatrimoniale: t(p.situation_matrimoniale),
      numCmu: t(p.num_cmu),
      profession: t(p.profession),
      adresse: t(p.address),
      residence: p.residence_actuelle_id ? Number(p.residence_actuelle_id) : null,
      lieuNaissance: p.lieu_de_naissance_id ? Number(p.lieu_de_naissance_id) : null,
      lieuNaissanceNom: t(p.lieu_naissance_nom),
      urgenceNom: t(p.nom_personne_cas_urgence),
      urgenceTelephone: t(p.telephone_personne_cas_urgence),
      urgenceLien: t(p.lien_personne_cas_urgence),
      /** Nouveau-né déclaré à la naissance (« NOUVEAU-NÉ DE … ») : nom et prénoms à compléter */
      nouveauNe: /^nouveau-n/i.test(String(p.name ?? '')),
      mere: p.mere_id ? { nom: `${p.mere_nom ?? ''} ${p.mere_prenom ?? ''}`.trim(), code: t(p.mere_code) } : null,
    };
  }

  /** Mise à jour des informations du patient (le n° de dossier DM, la date et le lieu de naissance ne changent pas) */
  async modifier(userId: number, patientId: number, dto: MiseAJourPatientDto, ctx: ContexteAudit) {
    const { role } = await this.getInfirmier(userId);
    const { p, hospitalId } = await this.patientModifiable(userId, patientId);

    // ---- Vérifications (MyISAM : aucune écriture avant) ; la date de naissance n'est jamais modifiée ----
    // Téléphone : un nouveau-né partage celui de sa mère → la famille (mère, frères et sœurs, enfants) n'est pas un doublon
    for (const [tel, libelle] of [
      [dto.telephone, 'Ce numéro de téléphone'],
      [dto.contact2, 'Le 2e contact'],
    ] as const) {
      if (!tel || tel === p.telephone || tel === p.contact2) continue;
      const [pris] = await this.db.query(
        `SELECT id FROM patients
          WHERE (telephone = ? OR contact2 = ?) AND id <> ? AND id <> ? AND COALESCE(mere_id, 0) <> ? AND (? = 0 OR COALESCE(mere_id, 0) <> ?)
          LIMIT 1`,
        [tel, tel, p.id, Number(p.mere_id ?? 0), p.id, Number(p.mere_id ?? 0), Number(p.mere_id ?? 0)],
      );
      if (pris) throw new ConflictException(`${libelle} est déjà utilisé par un autre patient.`);
    }
    // Le lieu de naissance (pour un nouveau-né : localité de l'hôpital de naissance) et la date de naissance ne changent jamais
    const ids = [...new Set([dto.residence].filter((v): v is number => v != null))];
    if (ids.length) {
      const [lieux] = await this.db.query('SELECT COUNT(*) AS n FROM sub_prefectures WHERE id IN (?)', [ids]);
      if (Number(lieux.n) < ids.length) throw new BadRequestException('Localité inconnue.');
    }

    // ---- Écritures ----
    const now = laravelNow();
    const ancien = `${p.name ?? ''} ${p.prenom ?? ''}`.trim();
    await this.db.query('UPDATE users SET name = ?, prenom = ?, updated_at = ? WHERE id = ?', [dto.nom, dto.prenom, now, p.user_id]);
    await this.db.query(
      `UPDATE patients SET gender = ?, telephone = ?, contact2 = ?, situation_matrimoniale = COALESCE(?, situation_matrimoniale),
              num_cmu = ?, profession = ?, address = ?, residence_actuelle_id = ?,
              nom_personne_cas_urgence = ?, telephone_personne_cas_urgence = ?, lien_personne_cas_urgence = ?, updated_at = ?
        WHERE id = ?`,
      [
        dto.genre,
        dto.telephone ?? null,
        dto.contact2 ?? null,
        dto.situationMatrimoniale ?? null,
        dto.numCmu ?? null,
        dto.profession ?? null,
        dto.adresse ?? null,
        dto.residence ?? null,
        dto.urgenceNom ?? null,
        dto.urgenceTelephone ?? null,
        dto.urgenceLien ?? null,
        now,
        p.id,
      ],
    );
    const nouveau = `${dto.nom} ${dto.prenom}`.trim();
    await this.audit.log(
      ctx,
      'MODIFICATION',
      'PATIENT',
      `Mise à jour du patient [${p.code_patient}] ${ancien}${ancien !== nouveau ? ` → ${nouveau}` : ''} par ${role === 'doctor' ? 'le médecin' : "l'infirmier"}`,
      { patient_id: Number(p.id) },
      hospitalId,
    );
    return { success: true, message: `Informations de ${nouveau} mises à jour.`, nomComplet: nouveau };
  }

  /** Infirmier·ère OU médecin connecté (services partagés par les deux espaces) */
  private async getInfirmier(userId: number) {
    const a = await agentDuCompte(this.db, userId);
    return { infirmierId: a.infirmierId, hospitalId: a.hospitalId, hospitalNom: a.hospitalNom, typePermission: a.typePermission, role: a.role };
  }

  /** Listes du formulaire : localités, prestations de l'hôpital (par service), médecins actifs */
  async options(userId: number) {
    const agent = await agentDuCompte(this.db, userId);
    const { hospitalId } = agent;
    const [localites, prestations, medecins, infirmiers] = await Promise.all([
      this.db.query('SELECT id, name FROM sub_prefectures ORDER BY name ASC'),
      this.db.query(
        `SELECT ph.id, ps.libelle, ph.prix, s.libelle AS service, sh.id AS service_hospital_id
           FROM prestation_hospitals ph
           JOIN prestation_services ps ON ps.id = ph.prestation_service_id
           JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
           JOIN services s ON s.id = sh.service_id
          WHERE sh.hospital_id = ? AND sh.status = 0 AND ph.status = 0
          ORDER BY s.libelle, ps.libelle`,
        [hospitalId],
      ),
      this.db.query(
        `SELECT d.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.prenom, ''))) AS nom, s.libelle AS service, d.service_hospital_id,
                av.days, av.hour_start, av.hour_end, ${SQL_EN_PERMISSION('d.user_id')} AS en_permission
           FROM doctors d
           JOIN users u ON u.id = d.user_id
           LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
           LEFT JOIN services s ON s.id = sh.service_id
           LEFT JOIN availabilities av ON av.id = (SELECT MAX(id) FROM availabilities WHERE user_id = d.user_id)
          WHERE d.hospital_id = ? AND d.status = 0 AND d.\`delete\` = 0 AND d.deleted_at IS NULL
          ORDER BY u.name`,
        [hospitalId],
      ),
      // Affectation par un médecin : il choisit aussi l'infirmier·ère qui prendra les constantes
      agent.role === 'doctor'
        ? this.db.query(
            `SELECT i.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.prenom, ''))) AS nom, s.libelle AS service
               FROM infirmiers i
               JOIN users u ON u.id = i.user_id
               LEFT JOIN service_hospitals sh ON sh.id = i.service_hospital_id
               LEFT JOIN services s ON s.id = sh.service_id
              WHERE i.hospital_id = ? AND i.status = 0 AND i.\`delete\` = 0
                AND NOT ${SQL_EN_PERMISSION('i.user_id')}
              ORDER BY u.name`,
            [hospitalId],
          )
        : Promise.resolve([]),
    ]);
    return {
      localites: localites.map((l: { id: unknown; name: string }) => ({ id: Number(l.id), nom: l.name })),
      prestations: prestations.map((p: Record<string, unknown>) => ({
        id: Number(p.id),
        libelle: p.libelle,
        service: p.service,
        serviceId: Number(p.service_hospital_id),
        prix: Number(p.prix),
      })),
      // Seuls les médecins dans leur jour ET leur créneau horaire (comme Laravel)
      infirmiers: infirmiers.map((i: Record<string, unknown>) => ({ id: Number(i.id), nom: String(i.nom), service: (i.service as string) ?? null })),
      // Un médecin ne s'affecte pas un patient à lui-même
      medecins: medecins.filter((m: Record<string, unknown>) => Number(m.id) !== agent.doctorId).flatMap((m: Record<string, unknown>) => {
        // Hors service : hors de son créneau OU en permission accordée
        const c = Number(m.en_permission) === 1 ? null : creneauDuJour(m.days, m.hour_start, m.hour_end);
        return c ? [{ id: Number(m.id), nom: m.nom, service: m.service ?? null, serviceId: Number(m.service_hospital_id), creneau: c.debut === '00:00' ? 'toute la journée' : `${c.debut} – ${c.fin}` }] : [];
      }),
      jour: nomJour(),
    };
  }

  /** Inscription d'un nouveau patient (+ affectation facultative) */
  async inscrire(userId: number, dto: InscriptionPatientDto, ctx: ContexteAudit) {
    const { infirmierId, hospitalId, role } = await this.getInfirmier(userId);
    const auteur = role === 'doctor' ? 'le médecin' : "l'infirmier";
    // Inscription d'urgence : plus d'affectation obligatoire — la consultation est ouverte ensuite par « Consulter »

    // Unicités de Laravel : téléphone, 2e contact, n° de pièce (patients), email (users)
    const [telPris] = await this.db.query('SELECT id FROM patients WHERE telephone = ? OR contact2 = ? LIMIT 1', [dto.telephone, dto.telephone]);
    if (telPris) throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre patient.');
    if (dto.contact2) {
      const [c2] = await this.db.query('SELECT id FROM patients WHERE contact2 = ? OR telephone = ? LIMIT 1', [dto.contact2, dto.contact2]);
      if (c2) throw new ConflictException('Le 2e contact est déjà utilisé par un autre patient.');
    }
    if (dto.numeroIdentite) {
      const [piece] = await this.db.query('SELECT id FROM patients WHERE numero_identite = ? LIMIT 1', [dto.numeroIdentite]);
      if (piece) throw new ConflictException("Ce numéro de pièce d'identité est déjà enregistré.");
    }
    if (dto.email) {
      const [mail] = await this.db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [dto.email]);
      if (mail) throw new ConflictException('Cette adresse email est déjà utilisée.');
    }
    const ids = [...new Set([dto.residence, dto.lieuNaissance].filter((v): v is number => v != null))];
    if (ids.length) {
      const [lieux] = await this.db.query('SELECT COUNT(*) AS n FROM sub_prefectures WHERE id IN (?)', [ids]);
      if (Number(lieux.n) < ids.length) throw new BadRequestException('Localité inconnue.');
    }

    // Affectation contrôlée avant la moindre écriture (MyISAM : pas d'annulation possible)
    const agentAff = { role, doctorId: (await agentDuCompte(this.db, userId)).doctorId };
    const verif = dto.affectation ? await this.verifierAffectation(dto.affectation, hospitalId, agentAff) : null;

    const now = laravelNow();
    const password = await laravelHash(MOT_DE_PASSE_PATIENT);
    // Date stockée "JJ/MM/AAAA" comme Laravel ; code patient "DM" + JJMMAA + rang du jour de naissance + 225 (Côte d'Ivoire) ou 100
    const [a, m, j] = dto.dateNaissance.split('-');
    const dateNaissance = `${j}/${m}/${a}`;
    const ivoirien = /c[oô]te d.?ivoire/i.test(dto.pays);

    const resultat = await this.db.transaction(async (t) => {
      const [{ n }] = await t.query('SELECT COUNT(*) AS n FROM patients WHERE birth_date = ?', [dateNaissance]);
      const codePatient = `DM${j}${m}${a.slice(2)}${Number(n) + 1}${ivoirien ? 225 : 100}`;

      const u = await t.query(
        "INSERT INTO users (name, prenom, email, role_as, password, created_at, updated_at) VALUES (?, ?, ?, 'patient', ?, ?, ?)",
        [dto.nom, dto.prenom, dto.email ?? null, password, now, now],
      );
      const p = await t.query(
        `INSERT INTO patients (user_id, hospital_id, gender, num_cmu, profession, lieu_de_naissance_id, birth_date,
                               residence_actuelle_id, residence_habituelle_id, contact2, type_piece, numero_identite,
                               situation_matrimoniale, telephone, country, code_patient, address, nbre_enfant,
                               nom_personne_cas_urgence, telephone_personne_cas_urgence, lien_personne_cas_urgence,
                               status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          Number(u.insertId),
          hospitalId,
          dto.genre,
          dto.numCmu ?? null,
          dto.profession ?? null,
          dto.lieuNaissance ?? null,
          dateNaissance,
          dto.residence ?? null,
          dto.residence ?? null,
          dto.contact2 ?? null,
          dto.typePiece,
          dto.numeroIdentite ?? null,
          dto.situationMatrimoniale,
          dto.telephone,
          dto.pays,
          codePatient,
          dto.adresse ?? null,
          String(dto.nbEnfants ?? 0),
          dto.urgenceNom ?? null,
          dto.urgenceTelephone ?? null,
          dto.urgenceLien ?? null,
          now,
          now,
        ],
      );
      const patientId = Number(p.insertId);
      await t.query(
        "INSERT INTO passage_patients (libelle, hospital_id, date, patient_id, created_at, updated_at) VALUES ('Création du compte', ?, CURDATE(), ?, ?, ?)",
        [hospitalId, patientId, now, now],
      );

      const consultationId = dto.affectation
        ? await this.creerConsultation(t, { patientId, codePatient, hospitalId, infirmierId }, dto.affectation, now, verif!.prix)
        : null;
      return { patientId, codePatient, consultationId };
    });

    await this.audit.log(
      ctx,
      'ENREGISTREMENT',
      'PATIENT',
      `${dto.urgence ? "Inscription d'urgence" : 'Inscription'} du patient ${dto.nom} ${dto.prenom} [${resultat.codePatient}] par ${auteur}${resultat.consultationId ? ' avec affectation directe' : ''}`,
      { patient_id: resultat.patientId, consultation_id: resultat.consultationId },
      hospitalId,
    );

    // SMS de bienvenue au patient (numéro de dossier + lien de l'application), comme Laravel
    smsBienvenuePatient({ telephone: dto.telephone, nom: dto.nom, prenom: dto.prenom, codePatient: resultat.codePatient });
    // + SMS d'affectation si le patient est affecté dans la foulée (sans attendre)
    if (resultat.consultationId) void smsAffectationPatient(this.db, resultat.consultationId);

    return {
      ...resultat,
      message: resultat.consultationId
        ? `Patient inscrit (dossier ${resultat.codePatient}) et affecté : ${role === 'doctor' ? 'l’infirmier·ère choisi·e prend ses constantes puis décide de son orientation (consultation, télémédecine…).' : 'vous pouvez prendre ses constantes.'}`
        : `Patient inscrit avec succès. Numéro de dossier : ${resultat.codePatient}.`,
    };
  }

  /** Affectation d'un patient existant : consultation du jour créée directement (pas de caisse) */
  async affecter(userId: number, patientId: number, dto: AffectationDto, ctx: ContexteAudit) {
    const { infirmierId, hospitalId, role } = await this.getInfirmier(userId);
    const auteur = role === 'doctor' ? 'le médecin' : "l'infirmier";
    const [patient] = await this.db.query(
      `SELECT p.id, p.code_patient, TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, ''))) AS nom
         FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = ? LIMIT 1`,
      [patientId],
    );
    if (!patient) throw new NotFoundException('Patient introuvable.');

    // Pas deux consultations ouvertes le même jour pour le même patient dans l'hôpital
    const [ouverte] = await this.db.query(
      `SELECT id FROM consultations
        WHERE patient_id = ? AND hospital_id = ? AND date_consultation = CURDATE() AND status = 0 AND deleted_at IS NULL LIMIT 1`,
      [patientId, hospitalId],
    );
    if (ouverte) throw new ConflictException(`${patient.nom} a déjà une consultation en cours aujourd'hui.`);

    const { prix } = await this.verifierAffectation(dto, hospitalId, { role, doctorId: (await agentDuCompte(this.db, userId)).doctorId });
    const now = laravelNow();
    const consultationId = await this.db.transaction((t) =>
      this.creerConsultation(t, { patientId, codePatient: patient.code_patient, hospitalId, infirmierId }, dto, now, prix),
    );

    await this.audit.log(
      ctx,
      'AFFECTATION_PATIENT',
      'PATIENT',
      `Affectation directe du patient ${patient.nom} [${patient.code_patient}] par ${auteur}`,
      { patient_id: patientId, consultation_id: consultationId },
      hospitalId,
    );
    // SMS au patient (sans attendre : la réponse au soignant ne dépend pas du fournisseur SMS)
    void smsAffectationPatient(this.db, consultationId);
    return { consultationId, message: `${patient.nom} est affecté(e) : ${role === 'doctor' ? 'l’infirmier·ère choisi·e prend ses constantes puis décide de son orientation (consultation, télémédecine…).' : 'vous pouvez prendre ses constantes.'}` };
  }

  /**
   * « Consulter » (page Vérifier / Rechercher) : l'agent connecté prend lui-même le patient en charge.
   * Pas de choix de service / prestation / médecin / motif :
   *   - service = celui auquel l'agent est rattaché (infirmiers / doctors.service_hospital_id) ;
   *   - prestation = l'acte « consultation » de ce service (sinon le premier acte actif, sinon aucune) ;
   *   - infirmier·ère → consultation à son nom, sans médecin : il/elle remplit le même formulaire de consultation que le médecin ;
   *   - médecin → consultation à son nom.
   * Les constantes se prennent dans le formulaire de consultation : status_inf 1 dans les deux cas.
   * Si le patient a déjà une consultation ouverte aujourd'hui confiée à cet agent, on la reprend.
   */
  async consulter(userId: number, patientId: number, ctx: ContexteAudit) {
    const agent = await agentDuCompte(this.db, userId);
    const { hospitalId, role } = agent;
    const medecin = role === 'doctor';
    const [patient] = await this.db.query(
      `SELECT p.id, p.code_patient, TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, ''))) AS nom
         FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1`,
      [patientId],
    );
    if (!patient) throw new NotFoundException('Patient introuvable.');

    const [ouverte] = await this.db.query(
      `SELECT id, doctor_id, infirmier_id FROM consultations
        WHERE patient_id = ? AND hospital_id = ? AND date_consultation = CURDATE() AND status = 0 AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 1`,
      [patientId, hospitalId],
    );
    if (ouverte) {
      // Même règle que le formulaire : médecin → doctor_id ; infirmier·ère → à son nom et sans médecin
      const aMoi = medecin ? Number(ouverte.doctor_id) === agent.doctorId : Number(ouverte.infirmier_id) === agent.infirmierId && !ouverte.doctor_id;
      if (aMoi) return { consultationId: Number(ouverte.id), nouvelle: false, message: `Reprise de la consultation en cours de ${patient.nom}.` };
      throw new ConflictException(`${patient.nom} a déjà une consultation en cours aujourd'hui.`);
    }

    // Service de rattachement de l'agent connecté
    const [svc] = await this.db.query(
      medecin
        ? 'SELECT service_hospital_id AS sh FROM doctors WHERE id = ? LIMIT 1'
        : 'SELECT service_hospital_id AS sh FROM infirmiers WHERE id = ? LIMIT 1',
      [medecin ? agent.doctorId : agent.infirmierId],
    );
    const serviceHospitalId = svc?.sh ? Number(svc.sh) : null;
    if (!serviceHospitalId) throw new BadRequestException("Vous n'êtes rattaché·e à aucun service : contactez l'administrateur de l'hôpital.");

    // Acte du service : « consultation » de préférence, sinon le premier acte actif
    const [prestation] = await this.db.query(
      `SELECT ph.id, ph.prix FROM prestation_hospitals ph
         JOIN prestation_services ps ON ps.id = ph.prestation_service_id
        WHERE ph.service_hospital_id = ? AND ph.status = 0
        ORDER BY (ps.libelle LIKE '%consult%') DESC, ph.id ASC LIMIT 1`,
      [serviceHospitalId],
    );

    const now = laravelNow();
    const consultationId = await this.db.transaction(async (t) => {
      const [{ n }] = await t.query('SELECT COUNT(*) AS n FROM consultations WHERE patient_id = ?', [patientId]);
      const code = `CONSULT${String(patient.code_patient).slice(2)}${Number(n) + 1}`;
      const r = await t.query(
        `INSERT INTO consultations (code_consultation, date_consultation, hospital_id, patient_id, infirmier_id, doctor_id,
                                    prestation_hospital_id, motif_consultation, montant, status, status_inf, created_at, updated_at)
         VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [
          code,
          hospitalId,
          patientId,
          agent.infirmierId,
          agent.doctorId,
          prestation ? Number(prestation.id) : null,
          '',
          prestation ? Number(prestation.prix) || 0 : 0,
          now,
          now,
        ],
      );
      await t.query(
        'INSERT INTO passage_patients (libelle, hospital_id, date, patient_id, created_at, updated_at) VALUES (?, ?, CURDATE(), ?, ?, ?)',
        [medecin ? 'Consultation (médecin)' : 'Consultation (infirmier)', hospitalId, patientId, now, now],
      );
      return Number(r.insertId);
    });

    await this.audit.log(
      ctx,
      'AFFECTATION_PATIENT',
      'PATIENT',
      `Consultation directe du patient ${patient.nom} [${patient.code_patient}] par ${medecin ? 'le médecin' : "l'infirmier"}`,
      { patient_id: patientId, consultation_id: consultationId },
      hospitalId,
    );
    // nouvelle : quitter le formulaire sans issue proposera d'annuler cette consultation (comme si de rien n'était)
    return { consultationId, nouvelle: true, message: `Consultation de ${patient.nom} ouverte.` };
  }

  // ---------------------------------------------------------------------------

  /**
   * Contrôles de l'affectation, faits AVANT toute écriture : les tables Laravel sont en MyISAM
   * (pas de transaction possible), une erreur après coup laisserait des lignes à moitié créées.
   */
  private async verifierAffectation(dto: AffectationDto, hospitalId: number, agent?: { role: string; doctorId: number | null }) {
    if (agent?.role === 'doctor') {
      if (Number(dto.doctorId) === Number(agent.doctorId)) throw new BadRequestException('Vous ne pouvez pas vous affecter le patient à vous-même : choisissez un autre médecin.');
      if (!dto.infirmierId) throw new BadRequestException('Veuillez choisir l’infirmier·ère qui accompagnera le patient.');
      const [inf] = await this.db.query(`SELECT id, ${SQL_EN_PERMISSION('user_id')} AS en_permission FROM infirmiers WHERE id = ? AND hospital_id = ? AND status = 0 AND \`delete\` = 0 LIMIT 1`, [dto.infirmierId, hospitalId]);
      if (!inf) throw new BadRequestException('Infirmier·ère introuvable ou inactif·ve dans votre hôpital.');
      if (Number(inf.en_permission) === 1) throw new BadRequestException('Cet·te infirmier·ère est en permission : choisissez quelqu’un d’autre.');
    }
    const [prestation] = await this.db.query(
      `SELECT ph.id, ph.prix, ph.service_hospital_id FROM prestation_hospitals ph
         JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
        WHERE ph.id = ? AND sh.hospital_id = ? LIMIT 1`,
      [dto.prestationId, hospitalId],
    );
    if (!prestation) throw new BadRequestException("Cette prestation n'existe pas dans votre hôpital.");
    // Médecin obligatoire, actif et dans son jour / créneau
    const [d] = await this.db.query(
      `SELECT d.id, d.service_hospital_id, av.days, av.hour_start, av.hour_end, ${SQL_EN_PERMISSION('d.user_id')} AS en_permission
         FROM doctors d
         LEFT JOIN availabilities av ON av.id = (SELECT MAX(id) FROM availabilities WHERE user_id = d.user_id)
        WHERE d.id = ? AND d.hospital_id = ? AND d.status = 0 AND d.\`delete\` = 0 AND d.deleted_at IS NULL`,
      [dto.doctorId, hospitalId],
    );
    if (!d) throw new BadRequestException('Médecin inconnu ou inactif.');
    // Le médecin doit appartenir au service de la prestation
    if (Number(d.service_hospital_id) !== Number(prestation.service_hospital_id)) {
      throw new BadRequestException("Ce médecin n'appartient pas au service choisi.");
    }
    if (Number(d.en_permission) === 1) throw new BadRequestException('Ce médecin est en permission : choisissez un autre médecin.');
    if (!creneauDuJour(d.days, d.hour_start, d.hour_end)) {
      throw new BadRequestException("Ce médecin n'est pas disponible maintenant (hors de ses jours ou de son créneau).");
    }

    return { prix: Number(prestation.prix) || 0 };
  }

  /**
   * Crée la consultation du jour (comme la branche "gratuité" de Laravel, sans admission ni paiement) :
   * code "CONSULT" + dossier sans "DM" + rang, prise en charge par l'infirmier (status 0, status_inf 0).
   */
  private async creerConsultation(
    t: EntityManager,
    p: { patientId: number; codePatient: string; hospitalId: number; infirmierId: number | null },
    dto: AffectationDto,
    now: string,
    prix: number,
  ) {
    const [{ n }] = await t.query('SELECT COUNT(*) AS n FROM consultations WHERE patient_id = ?', [p.patientId]);
    const code = `CONSULT${String(p.codePatient).slice(2)}${Number(n) + 1}`;
    // Affectation par un médecin : consultation confiée à l'infirmier·ère choisi·e.
    // C'est l'infirmier·ère qui décide ensuite de l'orientation (consultation, télémédecine, sortie…) après les constantes.
    const r = await t.query(
      `INSERT INTO consultations (code_consultation, date_consultation, hospital_id, patient_id, infirmier_id, doctor_id,
                                  prestation_hospital_id, motif_consultation, montant, status, status_inf, created_at, updated_at)
       VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [
        code,
        p.hospitalId,
        p.patientId,
        p.infirmierId ?? dto.infirmierId ?? null,
        dto.doctorId,
        dto.prestationId,
        dto.motif,
        prix,
        now,
        now,
      ],
    );
    await t.query(
      'INSERT INTO passage_patients (libelle, hospital_id, date, patient_id, created_at, updated_at) VALUES (?, ?, CURDATE(), ?, ?, ?)',
      [p.infirmierId ? 'Affectation (infirmier)' : 'Affectation (médecin)', p.hospitalId, p.patientId, now, now],
    );
    return Number(r.insertId);
  }

}
