import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ADMIN_ROLE, ALLOWED_ROLES, HOPITAL_NON_UCP_MESSAGE, PERSONNEL_NON_UCP_MESSAGE, ROLE_NOT_ALLOWED_MESSAGE, ROLE_PROFILES } from './role-profiles';
import { User } from './user.entity';

export type AccountCheck = { ok: true } | { ok: false; message: string };

export interface UserProfile {
  /** Nom du fichier photo dans Laravel (public/assets/uploads/<role>/...) */
  imgUrl: string | null;
  /** Médecins : 1 = Médecin, 2 = Sage femme (table type_agents) */
  typeAgentId: number | null;
  typeAgent: string | null;
  /** Médecins : spécialité (doctors.type_name) */
  typeName: string | null;
  /** Infirmiers : service (service_hospitals.service_id) — 4 = menu "Soins infirmier" */
  serviceId?: number | null;
  /** Infirmiers : téléconsultation active sur leur hôpital */
  teleconsultationActive?: boolean;
}

/** Lecture des utilisateurs de la base Laravel */
@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /** Utilisateur actif (non supprimé) par email, AVEC son hash de mot de passe */
  findByEmailWithPassword(email: string) {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.email = :email', { email })
      .getOne(); // les lignes avec deleted_at sont exclues automatiquement
  }

  findById(id: number) {
    return this.users.findOne({ where: { id } });
  }

  /**
   * Infos de profil affichées dans la carte orange de la sidebar (comme partials/_menu.blade.php) :
   * photo, et pour les médecins le type d'agent (1 = Médecin, 2 = Sage femme) qui change le menu.
   */
  async getProfile(user: User): Promise<UserProfile> {
    const empty: UserProfile = { imgUrl: null, typeAgentId: null, typeAgent: null, typeName: null };
    if (user.role === ADMIN_ROLE) {
      const [row] = await this.users.manager.query(
        'SELECT img_url FROM admins WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
        [user.id],
      );
      return { ...empty, imgUrl: row?.img_url ?? null };
    }
    if (user.role === 'hospital') {
      const [row] = await this.users.manager.query(
        'SELECT img_url FROM hospitals WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
        [user.id],
      );
      return { ...empty, imgUrl: row?.img_url ?? null };
    }
    if (user.role === 'regulateur') {
      const [row] = await this.users.manager.query('SELECT img_url FROM fm_regulateurs WHERE user_id = ? LIMIT 1', [user.id]);
      return { ...empty, imgUrl: row?.img_url ?? null };
    }
    if (user.role === 'doctor') {
      const [row] = await this.users.manager.query(
        `SELECT d.img_url, d.type_agent_id, d.type_name, t.libelle
           FROM doctors d LEFT JOIN type_agents t ON t.id = d.type_agent_id
          WHERE d.user_id = ? AND d.deleted_at IS NULL LIMIT 1`,
        [user.id],
      );
      return {
        imgUrl: row?.img_url ?? null,
        typeAgentId: row?.type_agent_id != null ? Number(row.type_agent_id) : null,
        typeAgent: row?.libelle ?? null,
        typeName: row?.type_name ?? null,
      };
    }
    if (user.role === 'infirmier') {
      // Comme partials/inc/_infirmier.blade.php : service (4 → menu "Soins infirmier")
      // et téléconsultation active sur l'hôpital (par défaut : oui)
      const [row] = await this.users.manager.query(
        `SELECT i.img_url, sh.service_id, h.is_teleconsultation_active
           FROM infirmiers i
           LEFT JOIN service_hospitals sh ON sh.id = i.service_hospital_id
           LEFT JOIN hospitals h ON h.id = i.hospital_id
          WHERE i.user_id = ? LIMIT 1`,
        [user.id],
      );
      return {
        ...empty,
        imgUrl: row?.img_url ?? null,
        serviceId: row?.service_id != null ? Number(row.service_id) : null,
        teleconsultationActive: row?.is_teleconsultation_active == null ? true : Number(row.is_teleconsultation_active) === 1,
      };
    }
    return empty;
  }

  /**
   * Vérifie que le compte est autorisé, comme Laravel (roleResponse) :
   * profil lié existant, non désactivé (status != 1), non supprimé (delete != 1).
   */
  async checkAccount(user: User): Promise<AccountCheck> {
    // Rôle autorisé sur cette application ? (super, doctor, infirmier)
    if (!ALLOWED_ROLES.includes(user.role)) return { ok: false, message: ROLE_NOT_ALLOWED_MESSAGE };

    // Administrateurs UCP-FM (rôle « admin ») : pas de profil lié à vérifier
    if (user.role === ADMIN_ROLE) return { ok: true };

    const profile = ROLE_PROFILES[user.role];
    if (!profile) return { ok: false, message: 'Inscrivez-vous !' };

    const denied = profile.deniedMessage ?? 'Compte désactivé ou supprimé !';

    // Nom de table issu de ROLE_PROFILES (constante) — jamais d'une saisie utilisateur
    // Personnel (médecin, infirmier·ère, régulateur) : on lit aussi l'hôpital où il travaille
    const avecHopital = user.role !== 'hospital';
    const columns = ['status', profile.hasDeleteColumn ? '`delete`' : 'NULL AS `delete`', avecHopital ? 'hospital_id' : 'NULL AS hospital_id'].join(', ');
    const softDelete = profile.softDeletes ? ' AND deleted_at IS NULL' : '';
    const rows: { status: unknown; delete: unknown; hospital_id: unknown }[] = await this.users.manager.query(
      `SELECT ${columns} FROM \`${profile.table}\` WHERE user_id = ?${softDelete} LIMIT 1`,
      [user.id],
    );

    const row = rows[0];
    if (!row) return { ok: false, message: denied };
    if (Number(row.status) === 1 || Number(row.delete) === 1) return { ok: false, message: denied };

    // Seuls les hôpitaux UCP-FM (hospitals.is_ucp_fm = 1) ont accès à cette application :
    // le compte de l'hôpital lui-même ET son personnel (médecins, sages-femmes, infirmiers, régulateurs).
    // Vérifié à la connexion et à chaque rechargement (/me) : un hôpital retiré du UCP-FM coupe l'accès de tous.
    const [h] =
      user.role === 'hospital'
        ? await this.users.manager.query('SELECT id FROM hospitals WHERE user_id = ? AND is_ucp_fm = 1 AND deleted_at IS NULL LIMIT 1', [user.id])
        : await this.users.manager.query('SELECT id FROM hospitals WHERE id = ? AND is_ucp_fm = 1 AND deleted_at IS NULL LIMIT 1', [row.hospital_id]);
    if (!h) return { ok: false, message: user.role === 'hospital' ? HOPITAL_NON_UCP_MESSAGE : PERSONNEL_NON_UCP_MESSAGE };
    return { ok: true };
  }
}
