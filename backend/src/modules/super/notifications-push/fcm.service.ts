import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createSign } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { DataSource } from 'typeorm';
import { firebaseCredentialsFile } from '../../../common/laravel-paths';

interface CompteService {
  project_id: string;
  client_email: string;
  private_key: string;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/**
 * ENVOI DES NOTIFICATIONS PUSH — Firebase Cloud Messaging (FCM HTTP v1)
 * Reprend Laravel : app/Services/NotificationService.php → sendFcmPush / getGoogleAccessToken
 * Compte de service : FIREBASE_CREDENTIALS (backend/.env) sinon celui de Laravel.
 * Sans compte de service valide : aucun push n'est envoyé (la notification In-App reste enregistrée).
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private jeton: { valeur: string; expire: number } | null = null;

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Push configuré ? (fichier de compte de service présent et complet) */
  estConfigure(): boolean {
    return this.compte() !== null;
  }

  private compte(): CompteService | null {
    const fichier = firebaseCredentialsFile();
    if (!fichier || !existsSync(fichier)) return null;
    try {
      const c = JSON.parse(readFileSync(fichier, 'utf8'));
      return c?.project_id && c?.client_email && c?.private_key ? c : null;
    } catch {
      return null;
    }
  }

  /** Jeton d'accès Google OAuth2 (JWT signé RS256), gardé ~50 min comme le cache Laravel */
  private async jetonAcces(c: CompteService): Promise<string | null> {
    if (this.jeton && this.jeton.expire > Date.now()) return this.jeton.valeur;
    const maintenant = Math.floor(Date.now() / 1000);
    const entete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const corps = b64url(
      JSON.stringify({
        iss: c.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: maintenant,
        exp: maintenant + 3600,
      }),
    );
    const signature = b64url(createSign('RSA-SHA256').update(`${entete}.${corps}`).sign(c.private_key));
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${entete}.${corps}.${signature}`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      this.logger.warn(`Jeton Google refusé (${res.status})`);
      return null;
    }
    const { access_token } = (await res.json()) as { access_token: string };
    this.jeton = { valeur: access_token, expire: Date.now() + 3000 * 1000 };
    return access_token;
  }

  /** Envoie un push à un appareil. Renvoie true si Firebase l'a accepté. */
  async envoyer(token: string, titre: string, message: string, donnees: Record<string, unknown>): Promise<boolean> {
    const c = this.compte();
    if (!c) return false;
    try {
      const acces = await this.jetonAcces(c);
      if (!acces) return false;

      // FCM v1 : les données doivent être des chaînes
      const data = Object.fromEntries(
        Object.entries(donnees).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]),
      );
      const appareil = String(donnees.device_type ?? '').toLowerCase();
      const ios = ['ios', 'iphone', 'ipad', 'apple'].some((m) => appareil.includes(m));

      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: titre, body: message },
            data,
            android: { priority: 'high', notification: { sound: 'default', click_action: 'FLUTTER_NOTIFICATION_CLICK' } },
            ...(ios ? { apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', badge: 1 } } } } : {}),
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return true;

      const corps = await res.text();
      if (corps.includes('UNREGISTERED') || corps.includes('NotRegistered')) {
        // Application désinstallée / jeton expiré : on le retire de la base (comme Laravel)
        await this.db.query('UPDATE patients SET fcm_token = NULL WHERE fcm_token = ?', [token]).catch(() => undefined);
        await this.db.query('UPDATE users SET fcm_token = NULL WHERE fcm_token = ?', [token]).catch(() => undefined);
      } else {
        this.logger.warn(`Réponse FCM : ${corps.slice(0, 300)}`);
      }
      return false;
    } catch (e) {
      this.logger.warn(`Erreur envoi push FCM : ${(e as Error).message}`);
      return false;
    }
  }
}
