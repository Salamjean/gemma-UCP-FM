import { uploadUrl } from '../services/api';
import type { AuthUser, Role } from '../types';

/**
 * RÔLES — libellés et page d'accueil de chaque espace.
 * Libellés repris de Laravel (app/Helpers/helpers.php → roleFr).
 */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin DMHP',
  hospital: 'Hôpital',
  doctor: 'Docteur',
  infirmier: 'Infirmier(e)',
  regulateur: 'Régulateur',
};

/** Adresse de l'espace de chaque rôle (son tableau de bord) */
export const ROLE_HOME: Record<Role, string> = {
  admin: '/super',
  hospital: '/hopital',
  doctor: '/medecin',
  infirmier: '/infirmier',
  regulateur: '/regulateur',
};

/** Deuxième ligne de la carte orange (comme partials/_menu.blade.php) */
export function roleSubtitle(user: AuthUser): string {
  if (user.role === 'doctor') {
    if (user.profile.typeAgentId === 2) return 'Sage femme';
    return ['Médecin', user.profile.typeName].filter(Boolean).join(' ');
  }
  return ROLE_LABELS[user.role] ?? user.role;
}

/** Nom affiché : "nom prénom" comme Laravel */
export const displayName = (user: AuthUser) =>
  [user.name, user.prenom].filter(Boolean).join(' ') || user.email || '';

/**
 * Photo de profil : fichier envoyé dans Laravel (servi par le backend sur /api/uploads/...),
 * sinon l'image par défaut de Laravel.
 */
const UPLOAD_FOLDER: Record<Role, string> = { admin: 'super', hospital: 'hospital', doctor: 'doctor', infirmier: 'infirmier', regulateur: 'regulateur' };
export const DEFAULT_AVATAR: Record<Role, string> = {
  admin: '/images/dashboard/avatar-super.png',
  hospital: '/images/dashboard/avatar-hospital.gif',
  doctor: '/images/dashboard/avatar-doctor.png',
  infirmier: '/images/dashboard/avatar-doctor.png',
  regulateur: '/images/dashboard/avatar-doctor.png',
};
export function avatarUrl(user: AuthUser): string {
  return user.profile.imgUrl ? uploadUrl(UPLOAD_FOLDER[user.role], user.profile.imgUrl) : DEFAULT_AVATAR[user.role];
}
