import { BadRequestException, ForbiddenException, GoneException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { DataSource } from 'typeorm';
import { agentDuCompte } from './agent-sante';
import { laravelNow } from './laravel';
import { SQL_EN_PERMISSION } from './permission-en-cours';

/**
 * APPELS VIDÉO DE TÉLÉMÉDECINE (LiveKit, comme Laravel : App\Services\LiveKitTokenService)
 *   - la salle = consultations.call_channel ;
 *   - démarrer / rejoindre : is_call_active = 1, call_status « calling » puis « in_call » quand l'autre rejoint ;
 *   - raccrocher : is_call_active = 0, call_status « ended ».
 * Participants : le médecin de la consultation et l'infirmier·ère de la consultation.
 * Configuration : LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET dans backend/.env (mêmes valeurs que Laravel).
 */
export function configLiveKit() {
  const url = process.env.LIVEKIT_URL;
  const cle = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !cle || !secret) {
    throw new ServiceUnavailableException('Appel vidéo non configuré : ajoutez LIVEKIT_URL, LIVEKIT_API_KEY et LIVEKIT_API_SECRET dans backend/.env (mêmes valeurs que Laravel).');
  }
  return { url, cle, secret };
}

/** Jeton d'accès à une salle (HS256, 24 h), identique à celui de Laravel */
function jetonLiveKit(salle: string, identite: string, nom: string) {
  const { cle, secret } = configLiveKit();
  const maintenant = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: cle,
      sub: identite,
      name: nom,
      nbf: maintenant - 60,
      exp: maintenant + 3600 * 24,
      video: { room: salle, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    },
    secret,
    { algorithm: 'HS256', noTimestamp: true },
  );
}

const nom = (n: unknown, p: unknown) => `${(n as string) ?? ''} ${(p as string) ?? ''}`.trim();

/**
 * URGENCE : médecins alertés — dans TOUS les hôpitaux de la DMHP (is_ucp_fm = 1), actifs, et :
 *   - médecins du même SERVICE que le patient (même type de service : services.id, quel que soit l'hôpital),
 *     ou qui pratiquent l'acte de la consultation ;
 *   - médecins GÉNÉRALISTES (doctors.type_name = 'generaliste').
 * Requête à compléter : c = consultations, d = doctors.
 */
const ELIGIBLE_URGENCE = `
  d.status = 0 AND d.\`delete\` = 0 AND d.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM hospitals hd WHERE hd.id = d.hospital_id AND hd.is_ucp_fm = 1 AND hd.deleted_at IS NULL)
  -- En permission accordée : hors service, pas appelé
  AND NOT ${SQL_EN_PERMISSION('d.user_id')}
  AND (
       LOWER(COALESCE(d.type_name, '')) IN ('generaliste', 'généraliste')
    OR EXISTS (SELECT 1 FROM prestation_hospitals phu
                 JOIN service_hospitals shp ON shp.id = phu.service_hospital_id
                 JOIN service_hospitals shd ON shd.id = d.service_hospital_id
                WHERE phu.id = c.prestation_hospital_id AND shd.service_id = shp.service_id)
    OR EXISTS (SELECT 1 FROM prestation_doctors pd WHERE pd.doctor_id = d.id AND pd.prestation_hospital_id = c.prestation_hospital_id)
  )`;

/** Urgence lancée et pas encore décrochée par un médecin */
const URGENCE_LIBRE = `c.doctor_id IS NULL AND c.is_urgence = 1 AND c.is_call_active = 1 AND c.status = 0`;

async function eligibleUrgence(db: DataSource, doctorId: number, consultationId: number) {
  const [r] = await db.query(`SELECT 1 AS ok FROM consultations c JOIN doctors d ON d.id = ? WHERE c.id = ? AND ${URGENCE_LIBRE} AND ${ELIGIBLE_URGENCE} LIMIT 1`, [doctorId, consultationId]);
  return !!r;
}

async function consultationDeLAppel(db: DataSource, userId: number, consultationId: number) {
  const agent = await agentDuCompte(db, userId);
  const [c] = await db.query(
    `SELECT c.id, c.doctor_id, c.infirmier_id, c.hospital_id, c.status, c.call_channel, c.call_status, c.is_call_active, c.code_consultation, c.is_urgence,
            pu.name AS patient_nom, pu.prenom AS patient_prenom,
            du.name AS medecin_nom, du.prenom AS medecin_prenom, iu.name AS inf_nom, iu.prenom AS inf_prenom,
            me.name AS moi_nom, me.prenom AS moi_prenom
       FROM consultations c
       JOIN patients p ON p.id = c.patient_id
       JOIN users pu ON pu.id = p.user_id
       LEFT JOIN doctors d ON d.id = c.doctor_id LEFT JOIN users du ON du.id = d.user_id
       LEFT JOIN infirmiers i ON i.id = c.infirmier_id LEFT JOIN users iu ON iu.id = i.user_id
       JOIN users me ON me.id = ?
      WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
    [userId, consultationId],
  );
  if (!c) throw new NotFoundException('Consultation introuvable.');
  // Urgence pas encore décrochée : tout médecin alerté peut la prendre (le premier qui décroche)
  const urgenceLibre = agent.role === 'doctor' && !c.doctor_id && (await eligibleUrgence(db, agent.doctorId!, Number(c.id)));
  const participant =
    agent.role === 'doctor'
      ? Number(c.doctor_id) === agent.doctorId || urgenceLibre
      : Number(c.infirmier_id) === agent.infirmierId || (!c.infirmier_id && Number(c.hospital_id) === agent.hospitalId);
  if (!participant) {
    if (agent.role === 'doctor' && Number(c.is_urgence) === 1 && c.doctor_id) throw new ForbiddenException('Un autre médecin a déjà décroché cet appel d’urgence.');
    throw new ForbiddenException('Vous ne participez pas à cette télémédecine.');
  }
  return { agent, c, urgenceLibre };
}

/** Démarrer l'appel, ou rejoindre celui que l'autre participant a lancé */
export async function rejoindreAppel(db: DataSource, userId: number, consultationId: number) {
  configLiveKit();
  const { agent, c, urgenceLibre } = await consultationDeLAppel(db, userId, consultationId);
  if (Number(c.status) === 1) throw new BadRequestException('Cette consultation est terminée : plus d’appel possible.');
  if (urgenceLibre) {
    // Le premier médecin qui décroche prend le patient (mise à jour atomique, comme Laravel)
    const r = await db.query('UPDATE consultations SET doctor_id = ?, updated_at = ? WHERE id = ? AND doctor_id IS NULL', [agent.doctorId, laravelNow(), c.id]);
    if (!(r?.affectedRows ?? 0)) throw new ForbiddenException('Un autre médecin a déjà décroché cet appel d’urgence.');
    const [inf] = await db.query('SELECT iu.name, iu.prenom FROM infirmiers i JOIN users iu ON iu.id = i.user_id WHERE i.id = ?', [c.infirmier_id]);
    c.inf_nom = inf?.name;
    c.inf_prenom = inf?.prenom;
  }
  const salle = c.call_channel || `teleconsult_${c.code_consultation ?? c.id}_${Math.random().toString(36).slice(2, 10)}`;
  // L'appel est « en cours » quand l'autre participant est déjà là ; une urgence pas encore décrochée sonne toujours
  const enCours = Number(c.is_call_active) === 1 && !(agent.role === 'infirmier' && !c.doctor_id && Number(c.is_urgence) === 1);
  const now = laravelNow();
  await db.query(
    `UPDATE consultations SET call_channel = ?, is_call_active = 1, call_status = ?,
            call_started_at = COALESCE(call_started_at, ?), call_ended_at = NULL, updated_at = ? WHERE id = ?`,
    [salle, enCours ? 'in_call' : 'calling', now, now, c.id],
  );
  const moi = nom(c.moi_nom, c.moi_prenom) || (agent.role === 'doctor' ? 'Médecin' : 'Infirmier·ère');
  const affiche = agent.role === 'doctor' ? `Dr ${moi.replace(/^dr\.?\s*/i, '')}` : `Inf. ${moi}`;
  return {
    url: configLiveKit().url,
    jeton: jetonLiveKit(salle, `${agent.role}_${userId}`, affiche),
    salle,
    consultationId: Number(c.id),
    patient: nom(c.patient_nom, c.patient_prenom),
    interlocuteur:
      agent.role === 'doctor'
        ? nom(c.inf_nom, c.inf_prenom)
          ? `Inf. ${nom(c.inf_nom, c.inf_prenom)}`
          : 'Infirmier·ère'
        : c.doctor_id && nom(c.medecin_nom, c.medecin_prenom)
          ? `Dr ${nom(c.medecin_nom, c.medecin_prenom).replace(/^dr\.?\s*/i, '')}`
          : 'Médecins de garde',
    rejoint: enCours,
    attente: agent.role === 'infirmier' && !c.doctor_id ? 'Appel d’urgence : en attente qu’un médecin décroche…' : undefined,
  };
}

/** Raccrocher : l'appel est terminé pour les deux */
export async function terminerAppel(db: DataSource, userId: number, consultationId: number) {
  const { c } = await consultationDeLAppel(db, userId, consultationId);
  const now = laravelNow();
  await db.query("UPDATE consultations SET is_call_active = 0, call_status = 'ended', call_ended_at = ?, updated_at = ? WHERE id = ?", [now, now, c.id]);
  return { success: true, message: 'Appel terminé.' };
}

/** Appels en cours où je suis attendu·e (l'autre participant a lancé l'appel) */
export async function appelsEntrants(db: DataSource, userId: number) {
  const agent = await agentDuCompte(db, userId);
  const filtre =
    agent.role === 'doctor' ? 'c.doctor_id = ?' : '(c.infirmier_id = ? OR (c.infirmier_id IS NULL AND c.hospital_id = ?))';
  const params = agent.role === 'doctor' ? [agent.doctorId] : [agent.infirmierId, agent.hospitalId];
  const rows: Record<string, unknown>[] = await db.query(
    `SELECT c.id, c.call_status, c.call_started_at, c.is_urgence, pu.name AS patient_nom, pu.prenom AS patient_prenom,
            du.name AS medecin_nom, du.prenom AS medecin_prenom, iu.name AS inf_nom, iu.prenom AS inf_prenom
       FROM consultations c
       JOIN patients p ON p.id = c.patient_id JOIN users pu ON pu.id = p.user_id
       LEFT JOIN doctors d ON d.id = c.doctor_id LEFT JOIN users du ON du.id = d.user_id
       LEFT JOIN infirmiers i ON i.id = c.infirmier_id LEFT JOIN users iu ON iu.id = i.user_id
      WHERE ${filtre} AND c.is_call_active = 1 AND c.status = 0 AND c.deleted_at IS NULL
      ORDER BY c.call_started_at DESC`,
    params,
  );
  // Médecin : appels d'urgence pas encore décrochés, envoyés à tous les médecins alertés
  const urgences: Record<string, unknown>[] =
    agent.role === 'doctor'
      ? await db.query(
          `SELECT c.id, c.call_status, c.call_started_at, pu.name AS patient_nom, pu.prenom AS patient_prenom, iu.name AS inf_nom, iu.prenom AS inf_prenom,
                  IF(c.hospital_id <> d.hospital_id, hc.label, NULL) AS autre_hopital
             FROM consultations c
             LEFT JOIN hospitals hc ON hc.id = c.hospital_id
             JOIN doctors d ON d.id = ?
             JOIN patients p ON p.id = c.patient_id JOIN users pu ON pu.id = p.user_id
             LEFT JOIN infirmiers i ON i.id = c.infirmier_id LEFT JOIN users iu ON iu.id = i.user_id
            WHERE ${URGENCE_LIBRE} AND c.deleted_at IS NULL AND ${ELIGIBLE_URGENCE}
            ORDER BY c.call_started_at DESC`,
          [agent.doctorId],
        )
      : [];
  const urgenceIds = new Set(urgences.map((r) => Number(r.id)));
  return [
    ...urgences.map((r) => ({
      consultationId: Number(r.id),
      statut: 'calling',
      depuis: r.call_started_at,
      patient: nom(r.patient_nom, r.patient_prenom),
      // Urgence d'un autre hôpital DMHP : son nom est ajouté
      appelant: `Inf. ${nom(r.inf_nom, r.inf_prenom) || '—'}${r.autre_hopital ? ` · ${r.autre_hopital}` : ''}`,
      urgence: true,
    })),
    ...rows
      .filter((r) => !urgenceIds.has(Number(r.id)))
      .map((r) => ({
        consultationId: Number(r.id),
        statut: String(r.call_status ?? 'calling'),
        depuis: r.call_started_at,
        patient: nom(r.patient_nom, r.patient_prenom),
        appelant: agent.role === 'doctor' ? `Inf. ${nom(r.inf_nom, r.inf_prenom) || '—'}` : r.medecin_nom ? `Dr ${nom(r.medecin_nom, r.medecin_prenom).replace(/^dr\.?\s*/i, '')}` : 'Médecins de garde',
        urgence: Number(r.is_urgence) === 1,
      })),
  ];
}

/* =========================================================
   INVITER UN CONFRÈRE (comme Laravel : lien sécurisé « Avis d'expert »)
   Lien = /teleconsultation/expert/<id>/<code> ; code = HMAC-SHA256(« teleconsult_expert_<id>_<salle> ») sur 16 caractères.
   Le code dépend de la salle : il n'ouvre que l'appel de cette consultation.
   ========================================================= */
function codeInvitation(consultationId: number, salle: string) {
  const secret = process.env.JWT_SECRET ?? 'gemma-fm';
  return createHmac('sha256', secret).update(`teleconsult_expert_${consultationId}_${salle}`).digest('hex').slice(0, 16);
}

const sansDr = (n: string) => n.replace(/^dr\.?\s*/i, '');

/** Médecin de la consultation : lien d'invitation (la salle est créée si besoin) */
export async function lienInvitation(db: DataSource, userId: number, consultationId: number) {
  const { agent, c } = await consultationDeLAppel(db, userId, consultationId);
  if (agent.role !== 'doctor') throw new ForbiddenException('Seul le médecin peut inviter un confrère.');
  if (Number(c.status) === 1) throw new BadRequestException('Cette consultation est terminée.');
  let salle = c.call_channel as string | null;
  if (!salle) {
    salle = `teleconsult_${c.code_consultation ?? c.id}_${Math.random().toString(36).slice(2, 10)}`;
    await db.query('UPDATE consultations SET call_channel = ?, updated_at = ? WHERE id = ?', [salle, laravelNow(), c.id]);
  }
  return { chemin: `/teleconsultation/expert/${c.id}/${codeInvitation(Number(c.id), salle)}`, patient: nom(c.patient_nom, c.patient_prenom) };
}

const texteOuNull = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v));

async function consultationInvitee(db: DataSource, consultationId: number, code: string) {
  const [c] = await db.query(
    `SELECT c.id, c.status, c.call_channel, c.is_call_active, c.tension_arterielle, c.temperature, c.pouls, c.poids, c.taille, c.saturation_oxygene,
            COALESCE(NULLIF(c.motif_consultation, ''), a.motif_consultation) AS motif, c.observation_infirmiere,
            p.code_patient, p.gender, p.birth_date, pu.name AS patient_nom, pu.prenom AS patient_prenom,
            du.name AS medecin_nom, du.prenom AS medecin_prenom, iu.name AS inf_nom, iu.prenom AS inf_prenom, h.label AS hopital
       FROM consultations c
       JOIN patients p ON p.id = c.patient_id JOIN users pu ON pu.id = p.user_id
       LEFT JOIN admissions a ON a.id = c.admission_id
       LEFT JOIN doctors d ON d.id = c.doctor_id LEFT JOIN users du ON du.id = d.user_id
       LEFT JOIN infirmiers i ON i.id = c.infirmier_id LEFT JOIN users iu ON iu.id = i.user_id
       LEFT JOIN hospitals h ON h.id = c.hospital_id
      WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
    [consultationId],
  );
  const attendu = c?.call_channel ? codeInvitation(Number(c.id), String(c.call_channel)) : null;
  if (!c || !attendu || attendu !== code) throw new ForbiddenException('Lien d’invitation invalide ou expiré.');
  return c;
}

/** Page publique du confrère : dossier résumé + constantes */
export async function infosInvitation(db: DataSource, consultationId: number, code: string) {
  const c = await consultationInvitee(db, consultationId, code);
  const naissance = c.birth_date ? new Date(c.birth_date) : null;
  const medecin = nom(c.medecin_nom, c.medecin_prenom);
  const infirmier = nom(c.inf_nom, c.inf_prenom);
  return {
    consultationId: Number(c.id),
    terminee: Number(c.status) === 1,
    appelActif: Number(c.is_call_active) === 1,
    hopital: texteOuNull(c.hopital),
    patient: {
      nom: nom(c.patient_nom, c.patient_prenom),
      code: texteOuNull(c.code_patient),
      genre: texteOuNull(c.gender),
      dateNaissance: naissance && !isNaN(naissance.getTime()) ? naissance.toISOString().slice(0, 10) : null,
    },
    motif: texteOuNull(c.motif),
    observation: texteOuNull(c.observation_infirmiere),
    constantes: {
      tension: texteOuNull(c.tension_arterielle),
      temperature: texteOuNull(c.temperature),
      pouls: texteOuNull(c.pouls),
      saturation: texteOuNull(c.saturation_oxygene),
      poids: texteOuNull(c.poids),
      taille: texteOuNull(c.taille),
    },
    medecin: medecin ? `Dr ${sansDr(medecin)}` : null,
    infirmier: infirmier ? `Inf. ${infirmier}` : null,
  };
}

/** Jeton LiveKit du confrère invité (nom + spécialité saisis sur la page) */
export async function jetonInvite(db: DataSource, consultationId: number, code: string, nomSaisi: string, specialite?: string) {
  configLiveKit();
  const c = await consultationInvitee(db, consultationId, code);
  if (Number(c.status) === 1) throw new GoneException('Cette téléconsultation est terminée.');
  const propre = sansDr(nomSaisi.trim()).slice(0, 80);
  if (!propre) throw new BadRequestException('Indiquez votre nom.');
  const affiche = `Dr ${propre}${specialite?.trim() ? ` (${specialite.trim().slice(0, 60)})` : ''}`;
  const salle = String(c.call_channel);
  const medecin = nom(c.medecin_nom, c.medecin_prenom);
  return {
    url: configLiveKit().url,
    jeton: jetonLiveKit(salle, `confrere_${randomBytes(6).toString('hex')}`, affiche),
    salle,
    consultationId: Number(c.id),
    patient: nom(c.patient_nom, c.patient_prenom),
    interlocuteur: medecin ? `Dr ${sansDr(medecin)}` : 'l’équipe soignante',
    rejoint: Number(c.is_call_active) === 1,
  };
}

/* =========================================================
   APPEL D'URGENCE (infirmier·ère, comme Laravel startEmergencyCall)
   Constantes enregistrées → appel vidéo lancé vers tous les médecins alertés (doctor_id remis à NULL) ;
   le premier médecin qui décroche prend le patient.
   ========================================================= */
export interface ConstantesUrgence {
  tension_arterielle?: string;
  temperature?: string;
  taille?: string;
  poids?: string;
  imc?: string;
  pouls?: string;
  observation?: string;
}

export async function lancerUrgence(db: DataSource, userId: number, consultationId: number, k: ConstantesUrgence) {
  configLiveKit();
  const agent = await agentDuCompte(db, userId);
  if (agent.role !== 'infirmier') throw new ForbiddenException('Réservé à l’infirmier·ère.');
  const [c] = await db.query(
    `SELECT id, status, status_inf, orientation_infirmier, is_call_active, doctor_id, call_channel, code_consultation,
            tension_arterielle, temperature, taille, poids, pouls
       FROM consultations WHERE id = ? AND hospital_id = ? AND deleted_at IS NULL LIMIT 1`,
    [consultationId, agent.hospitalId],
  );
  if (!c) throw new NotFoundException('Consultation introuvable.');
  if (Number(c.status) === 1) throw new BadRequestException('Cette consultation est terminée.');
  if (Number(c.status_inf) === 1 && c.orientation_infirmier !== 'urgence') throw new BadRequestException('Les constantes de cette consultation ont déjà été prises.');

  // Un médecin a déjà décroché et l'appel est en cours : on rejoint simplement l'appel
  if (c.doctor_id && Number(c.is_call_active) === 1 && c.orientation_infirmier === 'urgence') return { ...(await rejoindreAppel(db, userId, consultationId)), medecinsAlertes: 0 };

  const v = (x: string | undefined, actuel: unknown) => (x && String(x).trim() ? String(x).trim() : texteOuNull(actuel));
  const constantes = {
    tension: v(k.tension_arterielle, c.tension_arterielle),
    temperature: v(k.temperature, c.temperature),
    taille: v(k.taille, c.taille),
    poids: v(k.poids, c.poids),
    pouls: v(k.pouls, c.pouls),
  };
  const manquantes = [
    !constantes.poids && 'poids',
    !constantes.taille && 'taille',
    !constantes.temperature && 'température',
    !constantes.tension && 'tension artérielle',
    !constantes.pouls && 'pouls',
  ].filter(Boolean);
  if (manquantes.length) throw new BadRequestException(`Renseignez toutes les constantes avant l’appel d’urgence (manque : ${manquantes.join(', ')}).`);

  const salle = c.call_channel || `consultation_urgence_${c.id}_${Math.random().toString(36).slice(2, 12)}`;
  const now = laravelNow();
  await db.query(
    `UPDATE consultations
        SET orientation_infirmier = 'urgence', is_urgence = 1, is_call_active = 1, call_status = 'calling', call_channel = ?,
            call_started_at = ?, call_ended_at = NULL, infirmier_id = ?, doctor_id = NULL, status = 0, status_inf = 1,
            tension_arterielle = ?, temperature = ?, taille = ?, poids = ?, pouls = ?, imc = COALESCE(?, imc),
            observation_infirmiere = COALESCE(?, observation_infirmiere), updated_at = ?
      WHERE id = ?`,
    [salle, now, agent.infirmierId, constantes.tension, constantes.temperature, constantes.taille, constantes.poids, constantes.pouls, texteOuNull(k.imc), texteOuNull(k.observation), now, c.id],
  );
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM consultations c JOIN doctors d ON 1 = 1 WHERE c.id = ? AND ${ELIGIBLE_URGENCE}`, [c.id]);
  return { ...(await rejoindreAppel(db, userId, consultationId)), medecinsAlertes: Number(n) };
}
