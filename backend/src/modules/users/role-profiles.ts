/**
 * RÔLES ET TABLES DE PROFIL — reprend la logique de Laravel
 * (gemma/app/Http/Controllers/Auth/CustomAuthController.php → roleResponse).
 *
 * Pour chaque rôle, le profil lié (table.user_id = users.id) doit exister et :
 *   status != 1   ET   delete != 1   (dans Laravel, 1 = désactivé / supprimé)
 * Le rôle "admin" (administrateurs UCP-FM) n'a pas de vérification.
 * Un rôle absent de cette liste est refusé (comme le "default" de Laravel).
 */
export interface RoleProfile {
  /** Table du profil */
  table: string;
  /** La table a une colonne `delete` */
  hasDeleteColumn: boolean;
  /** La table a une colonne `deleted_at` (SoftDeletes Laravel) */
  softDeletes: boolean;
  /** Message si le compte est refusé */
  deniedMessage?: string;
}

/**
 * Rôle des administrateurs UCP-FM (users.role_as = 'admin').
 * Plusieurs comptes peuvent avoir ce rôle ; aucun profil lié n'est exigé (comme « super » dans Laravel).
 * Le rôle Laravel « super » n'a PAS accès à cette application.
 */
export const ADMIN_ROLE = 'admin';

/**
 * RÔLES AUTORISÉS À SE CONNECTER SUR CETTE APPLICATION.
 * Les autres comptes Laravel (super, pharmacy, secretariat, cashier, accountant, patient…) sont refusés ici,
 * même avec le bon mot de passe. Ajouter un rôle à cette liste pour l'autoriser.
 */
export const ALLOWED_ROLES = [ADMIN_ROLE, 'hospital', 'doctor', 'infirmier', 'regulateur'];

export const ROLE_NOT_ALLOWED_MESSAGE =
  'Accès réservé aux hôpitaux, médecins, infirmiers, régulateurs et administrateurs.';

/** Compte hôpital dont l'hôpital n'est pas UCP-FM (hospitals.is_ucp_fm != 1) */
export const HOPITAL_NON_UCP_MESSAGE = 'Accès réservé aux hôpitaux de la DMHP.';
/** Médecin, infirmier·ère ou régulateur d'un hôpital qui n'est pas UCP-FM */
export const PERSONNEL_NON_UCP_MESSAGE = 'Accès réservé au personnel des hôpitaux de la DMHP : votre hôpital n’en fait pas partie.';

export const ROLE_PROFILES: Record<string, RoleProfile> = {
  hospital: { table: 'hospitals', hasDeleteColumn: true, softDeletes: true },
  doctor: { table: 'doctors', hasDeleteColumn: true, softDeletes: true },
  accountant: { table: 'accountants', hasDeleteColumn: true, softDeletes: false },
  cashier: { table: 'caissieres', hasDeleteColumn: true, softDeletes: true },
  infirmier: { table: 'infirmiers', hasDeleteColumn: true, softDeletes: false },
  /** Rôle propre à Gemma FM (table fm_regulateurs, créée par la migration RegulateursFm) */
  regulateur: { table: 'fm_regulateurs', hasDeleteColumn: true, softDeletes: false },
  pharmacy: { table: 'pharmacies', hasDeleteColumn: true, softDeletes: false },
  secretariat: { table: 'secretaires', hasDeleteColumn: true, softDeletes: true },
  patient: {
    table: 'patients',
    hasDeleteColumn: false,
    softDeletes: true,
    deniedMessage: "Vous n'êtes pas autorisé !",
  },
};
