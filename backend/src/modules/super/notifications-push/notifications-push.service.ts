import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { laravelNow } from '../../../common/laravel';
import type { DiffusionDto } from './dto/diffusion.dto';
import { FcmService } from './fcm.service';

/** Ligne de patient_notifications avec les infos du patient */
interface LigneNotif {
  id: number;
  patient_id: number;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
  code_patient: string | null;
  telephone: string | null;
  device_type: string | null;
  p_token: string | null;
  u_token: string | null;
  nom: string | null;
  prenom: string | null;
  email: string | null;
}

/** Conditions SQL des cibles (identiques à NotificationService::sendBroadcast de Laravel) */
const SQL_ANDROID =
  "((LOWER(COALESCE(p.device_type, 'android')) = 'android' OR p.device_type IS NULL) AND LOWER(COALESCE(p.device_type, 'android')) NOT IN ('ios','iphone','ipad','apple'))";
const SQL_IOS =
  "(LOWER(p.device_type) IN ('ios','iphone','ipad','apple') OR LOWER(p.device_type) LIKE '%ios%' OR LOWER(p.device_type) LIKE '%iphone%')";
const SQL_JETON = "(p.fcm_token IS NOT NULL AND p.fcm_token <> '')";

const LIBELLE_CIBLE: Record<string, string> = {
  all: 'à tous les patients',
  android: 'aux utilisateurs Android',
  ios: 'aux utilisateurs iOS (Apple)',
  specific: 'au patient sélectionné',
};

const PAR_PAGE = 10;

/**
 * SUPER > NOTIFICATIONS PUSH
 * Reprend Laravel : app/Http/Controllers/Super/NotificationController.php + app/Services/NotificationService.php
 * Une "diffusion" = un lot (batch_id) de lignes patient_notifications (type broadcast), une par patient ciblé.
 */
@Injectable()
export class NotificationsPushService {
  private readonly logger = new Logger(NotificationsPushService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly fcm: FcmService,
  ) {}

  /** Auteur d'une diffusion : "nom prénom" comme Laravel (Auth::user()->name . ' ' . prenom) */
  async auteur(userId: number | null): Promise<{ id: number | null; nom: string }> {
    if (!userId) return { id: null, nom: 'Super Admin' };
    const [u] = await this.db.query('SELECT name, prenom FROM users WHERE id = ? LIMIT 1', [userId]);
    return { id: userId, nom: u ? `${u.name ?? ''} ${u.prenom ?? ''}`.trim() || 'Super Admin' : 'Super Admin' };
  }

  /** Statistiques des appareils (patients non supprimés) */
  async statistiques() {
    const [s] = await this.db.query(`
      SELECT COUNT(*) AS patients,
             SUM(${SQL_JETON}) AS avecJeton,
             SUM(${SQL_JETON} AND ${SQL_ANDROID}) AS android,
             SUM(${SQL_JETON} AND ${SQL_IOS}) AS ios
        FROM patients p WHERE p.deleted_at IS NULL`);
    return {
      patients: Number(s.patients),
      avecJeton: Number(s.avecJeton ?? 0),
      android: Number(s.android ?? 0),
      ios: Number(s.ios ?? 0),
      pushConfigure: this.fcm.estConfigure(),
    };
  }

  /** Toutes les notifications de diffusion, du plus récent au plus ancien */
  private async lignes(): Promise<LigneNotif[]> {
    const rows = await this.db.query(`
      SELECT pn.id, pn.patient_id, pn.title, pn.message, pn.data, pn.read_at, pn.created_at,
             p.code_patient, p.telephone, p.device_type, p.fcm_token AS p_token,
             u.fcm_token AS u_token, u.name AS nom, u.prenom, u.email
        FROM patient_notifications pn
        LEFT JOIN patients p ON p.id = pn.patient_id
        LEFT JOIN users u ON u.id = p.user_id
       WHERE pn.type = 'broadcast' OR JSON_EXTRACT(pn.data, '$.is_broadcast') = true
       ORDER BY pn.created_at DESC, pn.id DESC`);
    return rows.map((r: LigneNotif & { data: unknown }) => ({
      ...r,
      id: Number(r.id),
      patient_id: Number(r.patient_id),
      data: typeof r.data === 'string' ? JSON.parse(r.data || '{}') : ((r.data as Record<string, unknown>) ?? {}),
    }));
  }

  /** Regroupe par lot, comme Laravel (batch_id, sinon clé "LEGACY-…") */
  private grouper(lignes: LigneNotif[]): Map<string, LigneNotif[]> {
    const groupes = new Map<string, LigneNotif[]>();
    for (const l of lignes) {
      const d = new Date(l.created_at);
      const p = (n: number) => String(n).padStart(2, '0');
      const legacy = `LEGACY-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}-${l.title}`;
      const cle = String(l.data.batch_id ?? legacy);
      groupes.set(cle, [...(groupes.get(cle) ?? []), l]);
    }
    return groupes;
  }

  private aPush = (l: LigneNotif) => !!(l.p_token || l.u_token || l.data.has_push);

  private resume(cle: string, g: LigneNotif[]) {
    const premier = g[0];
    return {
      lot: cle,
      titre: premier.title,
      message: premier.message,
      categorie: String(premier.data.category ?? 'general'),
      cible: String(premier.data.target ?? 'all'),
      envoyePar: String(premier.data.sent_by_name ?? 'Super Admin'),
      date: premier.created_at,
      destinataires: g.length,
      push: g.filter(this.aPush).length,
      lus: g.filter((l) => l.read_at).length,
    };
  }

  /** Liste des diffusions (recherche : titre, message, patient ; filtre : catégorie), 10 par page */
  async liste(recherche = '', categorie = '', page = 1) {
    let groupes = [...this.grouper(await this.lignes()).entries()];
    const q = recherche.trim().toLowerCase();
    if (q) {
      groupes = groupes.filter(([, g]) => {
        const p = g[0];
        if (p.title.toLowerCase().includes(q) || p.message.toLowerCase().includes(q)) return true;
        return g.some(
          (l) =>
            (l.code_patient ?? '').toLowerCase().includes(q) ||
            `${l.nom ?? ''} ${l.prenom ?? ''}`.toLowerCase().includes(q) ||
            (l.email ?? '').toLowerCase().includes(q),
        );
      });
    }
    if (categorie) groupes = groupes.filter(([, g]) => (g[0].data.category ?? 'general') === categorie);

    const total = groupes.length;
    const pageOk = Math.max(1, Math.min(Number(page) || 1, Math.max(1, Math.ceil(total / PAR_PAGE))));
    return {
      statistiques: { ...(await this.statistiques()), diffusions: total },
      total,
      page: pageOk,
      pages: Math.max(1, Math.ceil(total / PAR_PAGE)),
      diffusions: groupes.slice((pageOk - 1) * PAR_PAGE, pageOk * PAR_PAGE).map(([cle, g]) => this.resume(cle, g)),
    };
  }

  private async groupe(cle: string): Promise<LigneNotif[]> {
    const g = this.grouper(await this.lignes()).get(cle);
    if (!g?.length) throw new NotFoundException('Campagne de notification introuvable.');
    return g;
  }

  /** Détail d'une diffusion + tous ses destinataires */
  async detail(cle: string) {
    const g = await this.groupe(cle);
    const resume = this.resume(cle, g);
    return {
      ...resume,
      inAppSeulement: resume.destinataires - resume.push,
      destinataires: g.map((l) => {
        const appareil = (l.device_type ?? 'android').toLowerCase();
        return {
          id: l.id,
          codePatient: l.code_patient,
          nom: [l.nom, l.prenom].filter(Boolean).join(' ') || '—',
          telephone: l.telephone,
          appareil: ['ios', 'iphone', 'ipad', 'apple'].some((m) => appareil.includes(m)) ? 'iOS' : 'Android',
          canal: this.aPush(l) ? 'Push + In-App' : 'In-App',
          lu: !!l.read_at,
          luLe: l.read_at,
        };
      }),
      nombreDestinataires: resume.destinataires,
    };
  }

  /** Patients pour la cible "Patient spécifique" */
  async patients() {
    const rows = await this.db.query(`
      SELECT p.id, p.code_patient, p.telephone, u.name, u.prenom, ${SQL_JETON} AS jeton
        FROM patients p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`);
    return rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      nom: [r.name, r.prenom].filter(Boolean).join(' ') || `Patient #${r.id}`,
      code: r.code_patient ?? null,
      telephone: r.telephone ?? null,
      jeton: Number(r.jeton) === 1,
    }));
  }

  /**
   * Diffusion (sendBroadcast) : une notification In-App par patient ciblé + push si l'appareil a un jeton.
   * @returns le lot créé et les compteurs
   */
  async diffuser(
    dto: Pick<DiffusionDto, 'titre' | 'message' | 'cible' | 'categorie' | 'patientId' | 'ecran'>,
    auteur: { id: number | null; nom: string },
    relanceDe?: string,
  ) {
    const lot = `BRD-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(3).toString('hex').slice(0, 4).toUpperCase()}`;
    const filtre =
      dto.cible === 'specific' ? 'AND p.id = ?' : dto.cible === 'android' ? `AND ${SQL_ANDROID}` : dto.cible === 'ios' ? `AND ${SQL_IOS}` : '';
    const params = dto.cible === 'specific' ? [dto.patientId] : [];
    if (dto.cible === 'specific') {
      const [existe] = await this.db.query('SELECT id FROM patients WHERE id = ? AND deleted_at IS NULL', [dto.patientId]);
      if (!existe) throw new BadRequestException('Veuillez sélectionner un patient spécifique.');
    }

    const patients = await this.db.query(
      `SELECT p.id, p.user_id, p.device_type, u.device_type AS u_device, COALESCE(NULLIF(p.fcm_token, ''), NULLIF(u.fcm_token, '')) AS token,
              u.id AS u_id
         FROM patients p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.deleted_at IS NULL ${filtre}`,
      params,
    );

    let inApp = 0;
    let push = 0;
    for (const p of patients) {
      const brut = String(p.device_type || p.u_device || 'android').toLowerCase();
      const appareil = ['ios', 'iphone', 'ipad', 'apple'].some((m) => brut.includes(m)) ? 'ios' : 'android';
      const data = {
        category: dto.categorie,
        screen: dto.ecran || 'Notifications',
        sent_by_user_id: auteur.id,
        sent_by_name: auteur.nom,
        ...(relanceDe ? { is_resend_of: relanceDe } : {}),
        ...(dto.cible === 'specific' ? { patient_id: Number(p.id) } : {}),
        is_broadcast: true,
        batch_id: lot,
        target: dto.cible,
        device_type: appareil,
        delivery_channel: p.token ? 'push_fcm' : 'in_app',
        has_push: !!p.token,
        sent_at: new Date().toISOString(),
      };
      const now = laravelNow();
      const res = await this.db.query(
        `INSERT INTO patient_notifications (patient_id, user_id, type, title, message, data, created_at, updated_at)
         VALUES (?, ?, 'broadcast', ?, ?, ?, ?, ?)`,
        [p.id, p.u_id ?? p.user_id ?? null, dto.titre, dto.message, JSON.stringify(data), now, now],
      );
      inApp++;
      if (p.token) {
        const ok = await this.fcm.envoyer(p.token, dto.titre, dto.message, {
          ...data,
          notification_id: res.insertId,
          type: 'broadcast',
        });
        if (ok) push++;
      }
    }
    this.logger.log(`Diffusion ${lot} : ${inApp} in-app créées, ${push} push envoyés`);
    return { lot, inApp, push, cible: dto.cible };
  }

  /** Message de résultat, comme Laravel (succès si au moins un push, sinon avertissement) */
  messageResultat(r: { inApp: number; push: number; cible: string }, titre: string, relance = false) {
    const cible = LIBELLE_CIBLE[r.cible] ?? 'aux destinataires';
    if (r.push > 0) {
      return {
        type: 'succes' as const,
        message: relance
          ? `Notification Push '${titre}' relancée avec succès ${cible} ! (${r.push} push FCM direct(s), ${r.inApp} notification(s) In-App).`
          : `Notification Push diffusée avec succès ${cible} ! (${r.push} appareil(s) notifié(s) en Push FCM direct, ${r.inApp} patient(s) avec notification In-App enregistrée).`,
      };
    }
    return {
      type: 'attention' as const,
      message: relance
        ? `Notification '${titre}' relancée et enregistrée In-App pour ${r.inApp} patient(s), mais aucun push direct n'a pu être délivré (aucun jeton mobile actif trouvé).`
        : `La notification a été enregistrée In-App pour ${r.inApp} patient(s), mais aucun appareil mobile actif avec un jeton FCM valide n'a pu recevoir le push instantané.`,
    };
  }

  /** Relance à l'identique (resend) : même titre, message, cible et catégorie, nouveau lot */
  async relancer(cle: string, auteur: { id: number | null; nom: string }) {
    const g = await this.groupe(cle);
    const p = g[0];
    const cible = String(p.data.target ?? 'all') as DiffusionDto['cible'];
    const resultat = await this.diffuser(
      {
        titre: p.title,
        message: p.message,
        cible,
        categorie: String(p.data.category ?? 'general') as DiffusionDto['categorie'],
        patientId: cible === 'specific' ? Number(p.data.patient_id ?? p.patient_id) : undefined,
        ecran: String(p.data.screen ?? 'Notifications'),
      },
      auteur,
      cle,
    );
    return { ...resultat, titre: p.title };
  }

  /** Suppression de toute la campagne (destroy) */
  async supprimer(cle: string): Promise<number> {
    const ids = (await this.groupe(cle)).map((l) => l.id);
    await this.db.query(`DELETE FROM patient_notifications WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    return ids.length;
  }
}
