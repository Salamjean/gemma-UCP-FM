import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { matchPath } from 'react-router-dom';
import type { AuthUser, Role } from '../../types';

/** Une page d'un module (sous-menu) */
export interface MenuLeaf {
  label: string;
  /** Chemin relatif à l'espace (ex. "hopital/liste") */
  path: string;
  element: ReactNode;
  /** Affiché seulement si… (ex. sage-femme / médecin). Absent = toujours */
  visible?: (user: AuthUser) => boolean;
}

/**
 * Page d'un module SANS lien dans la sidebar (ouverte depuis un bouton),
 * ex. "hopital/:id/modifier". Elle a sa route, son fil d'Ariane, et garde le module actif.
 */
export interface HiddenPage {
  label: string;
  /** Chemin relatif, peut contenir des paramètres (":id") */
  path: string;
  element: ReactNode;
}

/** Une entrée de la sidebar : un lien direct, ou un module avec sous-menu */
export interface MenuEntry {
  label: string;
  icon: IconType;
  /** Lien direct (sans sous-menu). "" = page d'accueil de l'espace (tableau de bord) */
  path?: string;
  element?: ReactNode;
  children?: MenuLeaf[];
  /** Pages du module ouvertes depuis des boutons (pas dans le menu) */
  hiddenPages?: HiddenPage[];
  visible?: (user: AuthUser) => boolean;
  /**
   * Pastille de compteur à côté du libellé (ex. télémédecines en attente).
   * Rechargée à l'ouverture, à chaque changement de page et toutes les 60 s ; masquée si 0.
   */
  badge?: () => Promise<number>;
  /** Titre de section affiché au-dessus de l'entrée (ex. nom de l'hôpital ouvert) */
  section?: string;
}

/** Un espace utilisateur complet (Super, Hôpital, Médecin, Infirmier) */
export interface RoleSpace {
  role: Role;
  /** Adresse de base, ex. "/super" */
  basePath: string;
  menu: MenuEntry[];
  /**
   * Sidebar contextuelle : selon la page courante (chemin relatif) et le nom de l'hôpital ouvert,
   * remplace le menu (ex. admin UCP-FM dans un hôpital). null = menu normal.
   * Les routes restent celles de `menu`.
   */
  contextMenu?: (rel: string, nomHopital: string) => MenuEntry[] | null;
}

/** Toutes les pages d'un espace (pour créer les routes), menus masqués et pages cachées compris */
export function allPages(space: RoleSpace) {
  return space.menu.flatMap((entry) => [
    ...(entry.children
      ? entry.children.map((c) => ({ path: c.path, element: c.element }))
      : entry.path !== undefined
        ? [{ path: entry.path, element: entry.element }]
        : []),
    ...(entry.hiddenPages ?? []).map((p) => ({ path: p.path, element: p.element })),
  ]);
}

/** Menu filtré pour un utilisateur donné */
export function visibleMenu(space: RoleSpace, user: AuthUser): MenuEntry[] {
  return space.menu
    .filter((e) => !e.visible || e.visible(user))
    .map((e) => (e.children ? { ...e, children: e.children.filter((c) => !c.visible || c.visible(user)) } : e))
    .filter((e) => !e.children || e.children.length > 0);
}

/** Le chemin relatif `rel` correspond-il à ce motif (avec paramètres éventuels) ? */
export const matches = (pattern: string, rel: string) =>
  matchPath({ path: `/${pattern}`, end: true }, `/${rel}`) !== null; // matchPath exige des chemins commençant par "/"

/** Module (entrée du menu) qui contient la page courante, y compris ses pages cachées */
export function findModule(menu: MenuEntry[], rel: string) {
  return menu.find(
    (e) => e.children?.some((c) => matches(c.path, rel)) || e.hiddenPages?.some((p) => matches(p.path, rel)),
  );
}
