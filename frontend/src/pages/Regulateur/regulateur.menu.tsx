import { FaCalendarAlt, FaCalendarWeek, FaExchangeAlt, FaHistory, FaShieldAlt } from 'react-icons/fa';
import type { RoleSpace } from '../../layouts/DashboardLayout/types';
import PermissionsAgent from '../Infirmier/Permissions/Permissions';
import PlanningAgent from '../Infirmier/Planning/Planning';
import Calendrier from './Calendrier/Calendrier';
import Historique from './Historique/Historique';
import Regulation from './Regulation/Regulation';

/**
 * ESPACE RÉGULATEUR (rôle Gemma FM « regulateur », créé par l'hôpital dans Personnel de santé) — menu ET routes.
 *  - Régulation : réattribue un patient quand le médecin choisi n'est pas disponible (ou attend depuis 30 min) ;
 *  - Calendrier : disponibilités de tous les médecins de l'hôpital, semaine par semaine ;
 *  - Permissions / Mon planning : mêmes pages que les agents de santé (API /regulateur/…).
 */
export const regulateurSpace: RoleSpace = {
  role: 'regulateur',
  basePath: '/regulateur',
  menu: [
    { label: 'Régulation', icon: FaExchangeAlt, path: '', element: <Regulation /> },
    { label: 'Calendrier', icon: FaCalendarAlt, path: 'calendrier', element: <Calendrier /> },
    { label: 'Historique', icon: FaHistory, path: 'historique', element: <Historique /> },
    { label: 'Permissions', icon: FaShieldAlt, path: 'permissions', element: <PermissionsAgent espace="regulateur" /> },
    { label: 'Mon planning', icon: FaCalendarWeek, path: 'planning', element: <PlanningAgent espace="regulateur" /> },
  ],
};
