import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { laravelNow } from '../laravel';

/** Informations sur la requête (qui, d'où, avec quel appareil) */
export interface ContexteAudit {
  userId: number | null;
  ip: string;
  userAgent: string;
  /** UUID d'appareil envoyé par le client (en-tête X-Client-Device-UUID), comme Laravel */
  deviceUuid?: string;
}

/** Construit le contexte d'audit à partir de la requête HTTP (utilisateur du jeton JWT si connecté) */
export function contexteAudit(req: Request & { user?: { sub?: number } }, userId?: number | null): ContexteAudit {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  let ip = forwarded || req.ip || req.socket?.remoteAddress || '127.0.0.1';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return {
    userId: userId ?? req.user?.sub ?? null,
    ip,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? '',
    deviceUuid: (req.headers['x-client-device-uuid'] as string | undefined) ?? (req.headers['x-client-mac'] as string | undefined),
  };
}

/**
 * JOURNAL D'AUDIT (table audit_logs, partagée avec Laravel)
 * Reprend app/Services/AuditLogService.php → log() : mêmes colonnes, mêmes formats,
 * pour que les actions faites ici apparaissent dans "Logs & Audit" (ici et dans Laravel).
 * Ne fait jamais échouer l'action principale : en cas d'erreur, on journalise seulement dans la console.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async log(
    ctx: ContexteAudit,
    actionType: string,
    module: string,
    description: string,
    details: Record<string, unknown> = {},
    hospitalId: number | null = null,
  ): Promise<void> {
    try {
      let userName = 'Système';
      let userRole = 'system';
      if (ctx.userId) {
        const [u] = await this.db.query('SELECT name, prenom, role_as FROM users WHERE id = ? LIMIT 1', [ctx.userId]);
        if (u) {
          // Laravel : trim(nom . ' ' . (prenom ?? name)) — la table users n'a pas de colonne "nom"
          userName = String(u.prenom ?? u.name ?? '').trim();
          userRole = u.role_as ?? 'visiteur';
        }
      }
      const now = laravelNow();
      await this.db.query(
        `INSERT INTO audit_logs
           (user_id, hospital_id, user_name, user_role, action_type, module, description, details_json,
            ip_address, mac_address, device_info, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ctx.userId,
          hospitalId,
          userName,
          userRole,
          actionType.toUpperCase(),
          module.toUpperCase(),
          description.slice(0, 191), // colonne varchar(191)
          JSON.stringify(details),
          ctx.ip.slice(0, 45),
          this.adresseAppareil(ctx).slice(0, 50),
          this.infoAppareil(ctx.userAgent),
          now,
          now,
        ],
      );
    } catch (e) {
      this.logger.error(`Erreur enregistrement audit : ${(e as Error).message}`);
    }
  }

  /** Comme getClientMacAddress (sans exécuter de commande système) : UUID client, sinon empreinte IP + navigateur */
  private adresseAppareil({ ip, userAgent, deviceUuid }: ContexteAudit): string {
    const uuid = deviceUuid?.trim();
    if (uuid && (/^DEV-/i.test(uuid) || /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(uuid))) return uuid.toUpperCase();
    if (ip === '127.0.0.1' || ip === '::1') return 'DEV-LOCAL-SERVER';
    const ua = userAgent || 'GEMMA';
    const prefixe = /mac/i.test(ua) ? 'MAC' : /android/i.test(ua) ? 'AND' : /iphone|ipad/i.test(ua) ? 'IOS' : /linux/i.test(ua) ? 'LNX' : 'WIN';
    const h = createHash('md5').update(ip + ua).digest('hex').slice(0, 8).toUpperCase();
    return `DEV-${prefixe}-${h.slice(0, 4)}-${h.slice(4, 8)}`;
  }

  /** Comme getDeviceInfo : "OS | Navigateur (user-agent tronqué)" */
  private infoAppareil(userAgent: string): string {
    const ua = userAgent || 'Inconnu';
    const os = /windows|win32/i.test(ua) ? 'Windows' : /macintosh|mac os x/i.test(ua) ? 'Mac OS' : /linux/i.test(ua) ? 'Linux / Android' : /iphone|ipad|ipod/i.test(ua) ? 'iOS' : 'Inconnu';
    const nav = /edg/i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : /opera|opr/i.test(ua) ? 'Opera' : 'Inconnu';
    return `${os} | ${nav} (${ua.slice(0, 80)})`;
  }
}
