import { Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import * as nodemailer from 'nodemailer';
import { join } from 'path';

/**
 * ENVOI D'EMAILS — même compte SMTP que Laravel (MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD,
 * MAIL_ENCRYPTION, MAIL_FROM_ADDRESS, MAIL_FROM_NAME dans backend/.env).
 * MAIL_ACTIF=false : aucun email n'est envoyé (tests) — le contenu est seulement écrit dans les logs.
 */
const logger = new Logger('Email');

let transport: nodemailer.Transporter | null = null;
function transporteur() {
  if (transport) return transport;
  const host = process.env.MAIL_HOST;
  if (!host || !process.env.MAIL_USERNAME) return null;
  const port = Number(process.env.MAIL_PORT ?? 465);
  transport = nodemailer.createTransport({
    host,
    port,
    secure: (process.env.MAIL_ENCRYPTION ?? '').toLowerCase() === 'ssl' || port === 465,
    auth: { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD },
  });
  return transport;
}

/** Logo GEMMA intégré à l'email (pièce jointe « cid », affichée même sans charger d'images externes) */
const LOGO_CID = 'logo-gemma';
function cheminLogo(): string | null {
  const candidats = [join(process.cwd(), 'assets', 'logo-gemma.jpg'), join(__dirname, '..', '..', '..', 'assets', 'logo-gemma.jpg')];
  return candidats.find((c) => existsSync(c)) ?? null;
}

/** Mise en page commune : logo GEMMA en haut, contenu, pied de page */
function miseEnPage(contenu: string, avecLogo: boolean) {
  return `<div style="background:#f3f5fb;padding:24px 12px;font-family:Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
    ${avecLogo ? `<div style="text-align:center;margin-bottom:16px"><img src="cid:${LOGO_CID}" alt="GEMMA" width="150" style="display:inline-block;max-width:150px;height:auto" /></div>` : ''}
    ${contenu}
  </div>
  <p style="max-width:520px;margin:12px auto 0;text-align:center;font-size:12px;color:#94a3b8">GEMMA — message automatique, merci de ne pas y répondre.</p>
</div>`;
}

/** Envoie un email ; renvoie true si le serveur SMTP l'a accepté. Ne lève jamais d'erreur. */
export async function envoyerEmail(destinataire: string, sujet: string, texte: string, html: string): Promise<boolean> {
  if (process.env.MAIL_ACTIF === 'false') {
    logger.warn(`MAIL_ACTIF=false — email non envoyé à ${destinataire} : « ${sujet} »\n${texte}`);
    return false;
  }
  const t = transporteur();
  if (!t) {
    logger.error('Envoi d’email non configuré : ajoutez MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD… dans backend/.env.');
    return false;
  }
  const nom = process.env.MAIL_FROM_NAME ?? 'GEMMA';
  const adresse = process.env.MAIL_FROM_ADDRESS ?? process.env.MAIL_USERNAME;
  try {
    const logo = cheminLogo();
    await t.sendMail({
      from: `"${nom}" <${adresse}>`,
      to: destinataire,
      subject: sujet,
      text: texte,
      html: miseEnPage(html, !!logo),
      attachments: logo ? [{ filename: 'logo-gemma.jpg', path: logo, cid: LOGO_CID }] : [],
    });
    logger.log(`Email « ${sujet} » envoyé à ${destinataire}.`);
    return true;
  } catch (e) {
    logger.error(`Envoi de l’email à ${destinataire} impossible : ${e instanceof Error ? e.message : e}`);
    return false;
  }
}
