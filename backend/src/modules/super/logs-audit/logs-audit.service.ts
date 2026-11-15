import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { existsSync } from 'fs';
import { open, stat, writeFile } from 'fs/promises';
import { DataSource } from 'typeorm';
import { IDS_HOPITAUX_UCP } from '../../../common/ucp-fm';
import { laravelLogFile } from '../../../common/laravel-paths';

export interface FiltresAudit {
  recherche?: string;
  hopital?: string;
  action?: string;
  role?: string;
  debut?: string;
  fin?: string;
  page?: number;
}

/** Types d'action proposés dans le filtre (repris de la vue Laravel logs/index.blade.php) */
const ACTIONS_LARAVEL = [
  'CONNEXION', 'ENREGISTREMENT', 'MODIFICATION', 'SUPPRESSION',
  'TELECHARGEMENT_PDF', 'EXPORT_EXCEL', 'EXPORT_SAGE',
];

const PAR_PAGE = 10; // comme tous les tableaux du projet
/** Lecture du fichier laravel.log : seulement la fin si le fichier est très gros */
const LOG_MAX_OCTETS = 20 * 1024 * 1024;

const dateJour = (d: Date) => d.toISOString().slice(0, 10);
const estDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * SUPER > LOGS & AUDIT
 * Reprend Laravel : app/Http/Controllers/Super/LogController.php + app/Services/AuditLogService.php
 *   - Journal d'audit (table audit_logs) : filtres, statistiques, export Excel
 *   - Logs système Laravel (storage/logs/laravel.log) : lecture, purge, téléchargement
 */
@Injectable()
export class LogsAuditService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ---------------------------------------------------------------- Journal d'audit

  /** Conditions SQL des filtres (période par défaut : 30 derniers jours, comme Laravel) */
  private where(f: FiltresAudit) {
    const debut = estDate(f.debut) ? f.debut! : dateJour(new Date(Date.now() - 30 * 86400000));
    const fin = estDate(f.fin) ? f.fin! : dateJour(new Date());
    // Espace UCP-FM : actions globales (sans hôpital) et actions des hôpitaux UCP-FM seulement
    const conds = ['DATE(a.created_at) >= ?', 'DATE(a.created_at) <= ?', `(a.hospital_id IS NULL OR a.hospital_id IN ${IDS_HOPITAUX_UCP})`];
    const params: unknown[] = [debut, fin];
    if (f.hopital && f.hopital !== 'ALL') {
      conds.push('a.hospital_id = ?');
      params.push(Number(f.hopital));
    }
    if (f.action && f.action !== 'ALL') {
      conds.push('a.action_type = ?');
      params.push(f.action);
    }
    if (f.role && f.role !== 'ALL') {
      conds.push('a.user_role = ?');
      params.push(f.role);
    }
    const q = f.recherche?.trim();
    if (q) {
      conds.push(
        '(a.description LIKE ? OR a.user_name LIKE ? OR a.ip_address LIKE ? OR a.mac_address LIKE ? OR a.module LIKE ? OR a.device_info LIKE ?)',
      );
      params.push(...Array(6).fill(`%${q}%`));
    }
    return { sql: conds.join(' AND '), params, debut, fin };
  }

  async journal(f: FiltresAudit) {
    const { sql, params, debut, fin } = this.where(f);
    const page = Math.max(1, Number(f.page) || 1);

    const [{ total }] = await this.db.query(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${sql}`, params);
    const lignes = await this.db.query(
      `SELECT a.id, a.created_at, a.user_name, a.user_role, a.action_type, a.module, a.description,
              a.ip_address, a.mac_address, a.device_info, h.label AS hopital
         FROM audit_logs a LEFT JOIN hospitals h ON h.id = a.hospital_id
        WHERE ${sql}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ${PAR_PAGE} OFFSET ${(page - 1) * PAR_PAGE}`,
      params,
    );

    // Statistiques globales (tout le journal du périmètre UCP-FM : actions globales + hôpitaux UCP-FM)
    const [s] = await this.db.query(`
      SELECT COUNT(*) AS total,
             SUM(action_type IN ('TELECHARGEMENT_PDF','EXPORT_EXCEL','EXPORT_SAGE')) AS telechargements,
             SUM(action_type = 'ENREGISTREMENT') AS creations,
             COUNT(DISTINCT mac_address) AS machines
        FROM audit_logs
       WHERE hospital_id IS NULL OR hospital_id IN ${IDS_HOPITAUX_UCP}`);

    // Valeurs des filtres
    const hopitaux = await this.db.query('SELECT id, label FROM hospitals WHERE deleted_at IS NULL AND is_ucp_fm = 1 ORDER BY label ASC');
    const actionsBase: { action_type: string }[] = await this.db.query('SELECT DISTINCT action_type FROM audit_logs ORDER BY action_type');
    const roles: { user_role: string }[] = await this.db.query(
      "SELECT DISTINCT user_role FROM audit_logs WHERE user_role IS NOT NULL AND user_role <> '' ORDER BY user_role",
    );

    return {
      periode: { debut, fin },
      total: Number(total),
      page,
      pages: Math.max(1, Math.ceil(Number(total) / PAR_PAGE)),
      lignes: lignes.map((l: Record<string, unknown>) => ({
        id: Number(l.id),
        date: l.created_at,
        utilisateur: l.user_name,
        role: l.user_role,
        hopital: l.hopital ?? null,
        action: l.action_type,
        module: l.module,
        description: l.description,
        ip: l.ip_address,
        appareil: l.mac_address,
        navigateur: l.device_info,
      })),
      statistiques: {
        total: Number(s.total),
        telechargements: Number(s.telechargements ?? 0),
        creations: Number(s.creations ?? 0),
        machines: Number(s.machines),
      },
      filtres: {
        hopitaux: hopitaux.map((h: { id: unknown; label: string }) => ({ id: Number(h.id), label: h.label })),
        actions: [...new Set([...ACTIONS_LARAVEL, ...actionsBase.map((a) => a.action_type)])],
        roles: roles.map((r) => r.user_role),
      },
    };
  }

  /** Export Excel (.xls) — même tableau HTML que Laravel (exportAuditExcel) */
  async exportExcel(f: FiltresAudit): Promise<{ html: string; lignes: number; nom: string }> {
    const { sql, params, debut, fin } = this.where(f);
    const logs = await this.db.query(
      `SELECT a.*, h.label AS hopital FROM audit_logs a LEFT JOIN hospitals h ON h.id = a.hospital_id
        WHERE ${sql} ORDER BY a.created_at DESC`,
      params,
    );
    const e = (v: unknown) =>
      String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const fr = (iso: string) => iso.split('-').reverse().join('/');
    const dateHeure = (d: Date | string) => {
      const x = new Date(d);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${p(x.getUTCDate())}/${p(x.getUTCMonth() + 1)}/${x.getUTCFullYear()} ${p(x.getUTCHours())}:${p(x.getUTCMinutes())}:${p(x.getUTCSeconds())}`;
    };

    let html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><style>' +
      'body { font-family: Calibri, Arial, sans-serif; } table { border-collapse: collapse; width: 100%; }' +
      'th { background-color: #0f172a; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 10px; text-align: center; }' +
      'td { border: 1px solid #e2e8f0; padding: 8px; font-size: 13px; } .text-center { text-align: center; } .fw-bold { font-weight: bold; }' +
      '</style></head><body>' +
      "<h2>JOURNAL D'AUDIT TRAIL & TRACABILITE DES OPERATIONS</h2>" +
      `<p><strong>Periode :</strong> Du ${fr(debut)} au ${fr(fin)} | <strong>Total enregistrements :</strong> ${logs.length}</p>` +
      '<table><thead><tr><th>Date & Heure</th><th>Utilisateur</th><th>Role</th><th>Hopital</th><th>Action</th><th>Module</th>' +
      "<th>Description de l'operation</th><th>Adresse IP</th><th>Adresse MAC</th><th>Appareil / Navigateur</th></tr></thead><tbody>";
    for (const l of logs) {
      html +=
        '<tr>' +
        `<td class="text-center">${dateHeure(l.created_at)}</td>` +
        `<td class="fw-bold">${e(l.user_name)}</td>` +
        `<td class="text-center">${e(l.user_role)}</td>` +
        `<td>${e(l.hopital ?? 'Global / Admin')}</td>` +
        `<td class="text-center fw-bold">${e(l.action_type)}</td>` +
        `<td class="text-center">${e(l.module)}</td>` +
        `<td>${e(l.description)}</td>` +
        `<td class="text-center" style="mso-number-format:'@';">${e(l.ip_address)}</td>` +
        `<td class="text-center fw-bold" style="mso-number-format:'@';">${e(l.mac_address)}</td>` +
        `<td>${e(l.device_info)}</td>` +
        '</tr>';
    }
    html += '</tbody></table></body></html>';

    const horodatage = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    return { html, lignes: logs.length, nom: `JOURNAL_AUDIT_TRAIL_${horodatage}.xls` };
  }

  // ---------------------------------------------------------------- Logs système Laravel

  private fichierLog(): string {
    const f = laravelLogFile();
    if (!f) throw new NotFoundException('LARAVEL_PUBLIC_PATH manquant dans backend/.env');
    return f;
  }

  /** Lit et découpe laravel.log (même expression que AuditLogService::getLaravelLogs), du plus récent au plus ancien */
  async logsLaravel(niveau = 'ALL', recherche = '', limite = 200) {
    const fichier = this.fichierLog();
    if (!existsSync(fichier)) return { entrees: [], taille: '0 Ko', octets: 0 };

    const { size } = await stat(fichier);
    const debut = Math.max(0, size - LOG_MAX_OCTETS);
    const fd = await open(fichier, 'r');
    const buffer = Buffer.alloc(size - debut);
    await fd.read(buffer, 0, buffer.length, debut);
    await fd.close();
    const contenu = buffer.toString('utf8');

    const motif = /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] ([a-zA-Z0-9_]+)\.([A-Z]+): ([\s\S]*?)(?=\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]|$)/g;
    const blocs = [...contenu.matchAll(motif)].reverse();
    const filtre = niveau.toUpperCase();
    // "ERROR" regroupe aussi les niveaux plus graves (libellé Laravel : "ERROR / CRITICAL")
    const graves = ['ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'];
    const q = recherche.trim().toLowerCase();

    const entrees: { date: string; env: string; niveau: string; message: string; trace: string }[] = [];
    for (const m of blocs) {
      const niveauLog = m[3].toUpperCase();
      if (filtre !== 'ALL' && !(filtre === 'ERROR' ? graves.includes(niveauLog) : niveauLog === filtre)) continue;
      const [message, ...reste] = m[4].trim().split('\n');
      const trace = reste.join('\n');
      if (q && !`${message} ${trace}`.toLowerCase().includes(q)) continue;
      entrees.push({ date: m[1], env: m[2], niveau: niveauLog, message, trace });
      if (entrees.length >= limite) break;
    }
    return { entrees, taille: this.taille(size), octets: size };
  }

  private taille(octets: number) {
    const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return octets >= 1048576 ? `${fmt(octets / 1048576)} Mo` : `${fmt(octets / 1024)} Ko`;
  }

  /** Vide laravel.log (clearLaravelLogs) */
  async viderLogsLaravel(): Promise<boolean> {
    const fichier = this.fichierLog();
    if (!existsSync(fichier)) return false;
    await writeFile(fichier, '');
    return true;
  }

  /** Chemin du fichier pour le téléchargement */
  cheminLogLaravel(): string {
    const fichier = this.fichierLog();
    if (!existsSync(fichier)) throw new NotFoundException('Le fichier de log est introuvable.');
    return fichier;
  }
}
