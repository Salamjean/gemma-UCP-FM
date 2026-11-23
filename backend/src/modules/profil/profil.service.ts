import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AuditService, type ContexteAudit } from '../../common/audit/audit.service';
import { laravelHash, laravelNow } from '../../common/laravel';
import { deleteImage, saveImage } from '../../common/uploads';
import { ADMIN_ROLE } from '../users/role-profiles';

/**
 * MON PROFIL — chaque utilisateur modifie SES données (comme les pages « profil » de Laravel) :
 *   admin       : nom, prénom, contact, photo          (users + admins, dossier « super »)
 *   hospital    : nom de l'établissement, contact, district sanitaire, direction générale, logo (hospitals, dossier « hospital »)
 *   doctor      : contact, adresse, photo               (doctors, dossier « doctor »)
 *   infirmier   : contact, adresse, photo               (infirmiers, dossier « infirmier »)
 *   regulateur  : contact, adresse, photo               (fm_regulateurs, dossier « regulateur »)
 * Le nom des agents, leur email et leur matricule sont gérés par l'hôpital (lecture seule ici, comme Laravel).
 * Mot de passe : l'actuel est demandé avant d'en changer.
 */
type Role = 'admin' | 'hospital' | 'doctor' | 'infirmier' | 'regulateur';

/** Table du profil et dossier des photos de chaque rôle (noms fixes : jamais issus de la requête) */
const PROFILS: Record<Role, { table: string; dossier: string }> = {
  admin: { table: 'admins', dossier: 'super' },
  hospital: { table: 'hospitals', dossier: 'hospital' },
  doctor: { table: 'doctors', dossier: 'doctor' },
  infirmier: { table: 'infirmiers', dossier: 'infirmier' },
  regulateur: { table: 'fm_regulateurs', dossier: 'regulateur' },
};

export interface MajProfil {
  nom?: string;
  prenom?: string;
  contact?: string;
  adresse?: string;
  district?: string;
  direction?: string;
}

const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const role = (r: string): Role => {
  if (!(r in PROFILS)) throw new BadRequestException('Rôle sans profil modifiable.');
  return r as Role;
};

@Injectable()
export class ProfilService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}

  private async ligneProfil(userId: number, r: Role): Promise<Record<string, any> | null> {
    const [p] = await this.db.query(`SELECT * FROM \`${PROFILS[r].table}\` WHERE user_id = ? LIMIT 1`, [userId]);
    return p ?? null;
  }

  /** Données affichées sur la page « Mon profil » */
  async lire(userId: number, roleJeton: string) {
    const r = role(roleJeton);
    const [u] = await this.db.query('SELECT id, name, prenom, email, created_at FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!u) throw new NotFoundException('Compte introuvable.');
    const p = await this.ligneProfil(userId, r);

    // Hôpital de rattachement et service (lecture seule) pour le personnel
    let hopital: string | null = null;
    let service: string | null = null;
    if (p?.hospital_id) {
      const [h] = await this.db.query('SELECT label FROM hospitals WHERE id = ? LIMIT 1', [p.hospital_id]);
      hopital = h?.label ?? null;
    }
    if (p?.service_hospital_id) {
      const [s] = await this.db.query('SELECT s.libelle FROM service_hospitals sh JOIN services s ON s.id = sh.service_id WHERE sh.id = ? LIMIT 1', [p.service_hospital_id]);
      service = s?.libelle ?? null;
    }

    return {
      role: r,
      email: u.email as string,
      nom: (r === 'hospital' ? (p?.label ?? u.name) : u.name) as string,
      prenom: (u.prenom as string) ?? null,
      contact: (p?.contact as string) ?? null,
      adresse: (p?.address as string) ?? null,
      photo: (p?.img_url as string) ?? null,
      dossierPhoto: PROFILS[r].dossier,
      matricule: (p?.matricule as string) ?? (r === 'hospital' ? ((p?.reference as string) ?? null) : null),
      hopital: r === 'hospital' ? null : hopital,
      service,
      district: r === 'hospital' ? ((p?.district_sanitaire as string) ?? null) : null,
      direction: r === 'hospital' ? ((p?.nom_direction_generale as string) ?? null) : null,
      membreDepuis: u.created_at,
      /** Champs que ce rôle peut modifier */
      modifiables: r === 'admin' ? ['nom', 'prenom', 'contact'] : r === 'hospital' ? ['nom', 'contact', 'district', 'direction'] : ['contact', 'adresse'],
    };
  }

  /** Mise à jour des données du profil (+ photo / logo facultatif) */
  async modifier(userId: number, roleJeton: string, dto: MajProfil, ctx: ContexteAudit, image?: Express.Multer.File) {
    const r = role(roleJeton);
    const nom = texte(dto.nom);
    const prenom = texte(dto.prenom);
    const contact = texte(dto.contact);
    const adresse = texte(dto.adresse);
    const district = texte(dto.district);
    const direction = texte(dto.direction);

    // Contrôles (avant toute écriture : tables MyISAM sans annulation possible)
    if (contact && !/^[0-9]{10}$/.test(contact)) throw new BadRequestException('Le contact doit contenir exactement 10 chiffres.');
    if (adresse.length > 191 || district.length > 191 || direction.length > 191 || nom.length > 191 || prenom.length > 191) {
      throw new BadRequestException('Un champ dépasse 191 caractères.');
    }
    if ((r === 'admin' || r === 'hospital') && nom.length < 3) throw new BadRequestException('Le nom doit contenir au moins 3 caractères.');
    if (r !== 'admin' && r !== 'hospital' && !contact) throw new BadRequestException('Le contact est obligatoire.');

    const p = await this.ligneProfil(userId, r);
    if (!p && r !== 'admin') throw new NotFoundException('Profil introuvable.');

    const dossier = PROFILS[r].dossier;
    const photo = image ? await saveImage(image, dossier) : null;
    const now = laravelNow();
    try {
      if (r === 'admin') {
        await this.db.query('UPDATE users SET name = ?, prenom = ?, updated_at = ? WHERE id = ?', [nom, prenom || null, now, userId]);
        if (p) {
          await this.db.query('UPDATE admins SET contact = ?, img_url = COALESCE(?, img_url), updated_at = ? WHERE id = ?', [contact, photo, now, p.id]);
        } else if (contact || photo) {
          await this.db.query('INSERT INTO admins (user_id, contact, img_url, status, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)', [userId, contact, photo, now, now]);
        }
      } else if (r === 'hospital') {
        // Comme Laravel : le nom de l'établissement est aussi le nom du compte
        await this.db.query('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [nom, now, userId]);
        await this.db.query(
          'UPDATE hospitals SET label = ?, contact = ?, district_sanitaire = ?, nom_direction_generale = ?, img_url = COALESCE(?, img_url), updated_at = ? WHERE id = ?',
          [nom, contact || null, district || null, direction || null, photo, now, p!.id],
        );
      } else {
        await this.db.query(`UPDATE \`${PROFILS[r].table}\` SET contact = ?, address = ?, img_url = COALESCE(?, img_url), updated_at = ? WHERE id = ?`, [
          contact,
          adresse || null,
          photo,
          now,
          p!.id,
        ]);
      }
    } catch (e) {
      if (photo) await deleteImage(dossier, photo); // pas de photo orpheline
      throw e;
    }
    if (photo && p?.img_url) await deleteImage(dossier, p.img_url as string);

    await this.audit.log(ctx, 'MODIFICATION', 'PROFIL', `Mise à jour de son profil${photo ? ' (nouvelle photo)' : ''}`, {}, r === 'hospital' ? Number(p!.id) : ((p?.hospital_id as number) ?? null));
    return { message: 'Votre profil a été mis à jour.' };
  }

  /** Changement de mot de passe : l'actuel est vérifié d'abord */
  async motDePasse(userId: number, actuel: string, nouveau: string, confirmation: string, ctx: ContexteAudit) {
    const [u] = await this.db.query('SELECT id, password FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!u) throw new NotFoundException('Compte introuvable.');
    const ok = await bcrypt.compare(actuel ?? '', String(u.password).replace(/^\$2y\$/, '$2a$'));
    // 400 et non 401 : le frontend déconnecte l'utilisateur sur toute réponse 401
    if (!ok) throw new BadRequestException('Mot de passe actuel incorrect.');
    if (!nouveau || nouveau.length < 8) throw new BadRequestException('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    if (nouveau !== confirmation) throw new BadRequestException('La confirmation ne correspond pas au nouveau mot de passe.');
    if (nouveau === actuel) throw new BadRequestException('Le nouveau mot de passe doit être différent de l’actuel.');
    await this.db.query('UPDATE users SET password = ?, updated_at = ? WHERE id = ?', [await laravelHash(nouveau), laravelNow(), userId]);
    await this.audit.log(ctx, 'MODIFICATION', 'PROFIL', 'Changement de son mot de passe');
    return { message: 'Votre mot de passe a été changé.' };
  }
}

export const ROLES_PROFIL = [ADMIN_ROLE, 'hospital', 'doctor', 'infirmier', 'regulateur'];
