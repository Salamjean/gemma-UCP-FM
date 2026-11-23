import { Logger } from '@nestjs/common';

/**
 * ENVOI DE SMS — reprend Laravel : app/Repositories/SmsRepository.php (fournisseur 1smsafrica, API v3).
 * Configuration (.env) : SMS_ACTIF, YELLIKA_API_URL, YELLIKA_API_KEY, YELLIKA_SENDER_ID (mêmes noms que Laravel).
 * L'envoi ne bloque jamais l'action en cours : une erreur est seulement écrite dans les logs.
 */
const logger = new Logger('SMS');

/** Numéro au format attendu par 1smsafrica : chiffres seuls, préfixe 225 (comme Laravel) */
export function numeroSms(telephone: string): string {
  let n = telephone.replace(/\D/g, '');
  if (n.startsWith('00225')) n = n.slice(2);
  else if (!n.startsWith('225')) n = `225${n}`;
  return n;
}

/** Accents retirés pour rester en GSM 7 bits (comme Laravel) */
const sansAccents = (texte: string) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Envoie un SMS ; renvoie true si le fournisseur l'a accepté. Ne lève jamais d'erreur. */
export async function envoyerSms(telephone: string | null | undefined, message: string): Promise<boolean> {
  if (!telephone?.trim()) {
    logger.warn('Pas de numéro de téléphone : SMS non envoyé.');
    return false;
  }
  if (process.env.SMS_ACTIF === 'false') {
    logger.log(`SMS désactivé (SMS_ACTIF=false) — non envoyé à ${telephone}.`);
    return false;
  }
  const url = (process.env.YELLIKA_API_URL ?? 'https://app.1smsafrica.com/api/v3').replace(/\/+$/, '');
  const cle = process.env.YELLIKA_API_KEY?.trim();
  if (!cle) {
    logger.error('YELLIKA_API_KEY absent du .env : SMS non envoyé.');
    return false;
  }
  try {
    const rep = await fetch(`${url}/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        recipient: numeroSms(telephone),
        sender_id: process.env.YELLIKA_SENDER_ID ?? 'GestPatient',
        message: sansAccents(message),
        type: 'plain',
      }),
      signal: AbortSignal.timeout(15000),
    });
    const corps = await rep.text();
    if (!rep.ok) {
      logger.warn(`1smsafrica a refusé le SMS (${rep.status}) : ${corps.slice(0, 300)}`);
      return false;
    }
    logger.log(`SMS envoyé à ${numeroSms(telephone)}.`);
    return true;
  } catch (e) {
    logger.error(`Envoi du SMS impossible : ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

/**
 * SMS d'affectation (pas d'équivalent dans Laravel : demandé pour ce projet).
 * Les infos sont relues dans la base à partir de la consultation créée.
 */
export async function smsAffectationPatient(db: { query: (sql: string, params?: unknown[]) => Promise<any[]> }, consultationId: number) {
  try {
    const [c] = await db.query(
      `SELECT p.telephone, u.name AS nom, u.prenom, h.label AS hopital, ps.libelle AS prestation, c.code_consultation,
              TRIM(CONCAT(COALESCE(du.name, ''), ' ', COALESCE(du.prenom, ''))) AS medecin
         FROM consultations c
         JOIN patients p ON p.id = c.patient_id
         JOIN users u ON u.id = p.user_id
         LEFT JOIN hospitals h ON h.id = c.hospital_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
        WHERE c.id = ? LIMIT 1`,
      [consultationId],
    );
    if (!c) return;
    const medecin = String(c.medecin ?? '').replace(/^dr\.?\s+/i, ''); // certains noms contiennent déjà « Dr »
    const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Abidjan' });
    const message =
      `GEMMA : M/Mme ${[c.nom, c.prenom].filter(Boolean).join(' ')}, vous etes pris(e) en charge le ${date}` +
      `${c.hopital ? ` a ${c.hopital}` : ''}${c.prestation ? ` pour : ${c.prestation}` : ''}` +
      `${medecin ? `, avec le Dr ${medecin}` : ''}. No de consultation : ${c.code_consultation}.`;
    await envoyerSms(c.telephone, message);
  } catch (e) {
    logger.error(`SMS d'affectation non envoyé : ${e instanceof Error ? e.message : e}`);
  }
}

/** SMS de bienvenue après l'inscription d'un patient (texte de Laravel, Secretariat\PatientController::addPatient) */
export function smsBienvenuePatient(p: { telephone: string; nom: string; prenom: string; codePatient: string }) {
  const lien = process.env.PATIENT_APP_URL ?? 'https://patient.gemma-ci.com';
  const identite = p.nom === p.codePatient && !p.prenom ? '' : ` M/Mme ${[p.nom, p.prenom].filter(Boolean).join(' ')}`;
  const message = `Bienvenue sur GEMMA${identite}. Votre DM: ${p.codePatient}. L'application est disponible sur App Store et Play Store ou connectez-vous sur : ${lien}`;
  // Sans attendre : la réponse au soignant ne dépend pas du fournisseur SMS
  void envoyerSms(p.telephone, message);
}
