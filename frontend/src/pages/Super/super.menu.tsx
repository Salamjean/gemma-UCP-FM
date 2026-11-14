import { FaBell, FaHSquare, FaUserSlash } from 'react-icons/fa';
import { MdDashboard } from 'react-icons/md';
import type { RoleSpace } from '../../layouts/DashboardLayout/types';
import { Liste } from './Hopital';
import EspaceHopital from './Hopital/Espace/EspaceHopital';
import { menuHopitalOuvert } from './Hopital/Espace/menuHopital';
import { DetailDiffusion, ListeEnvois, NouvelleDiffusion } from './NotificationsPush';
import PersonnelSupprime from './PersonnelSupprime/PersonnelSupprime';
import { TableauDeBord } from './TableauDeBord';

/**
 * ESPACE ADMIN UCP-FM (rôle « admin ») — menu de la sidebar ET routes (une seule source).
 * Ne gère que les hôpitaux marqués UCP-FM (hospitals.is_ucp_fm = 1) : liste, supervision, modification.
 * Pas d'ajout d'hôpital, ni d'activation / désactivation, ni de téléconsultation, ni de réglages, ni de logs.
 * Repris de Laravel : resources/views/partials/inc/_super.blade.php
 * Ajouter une page : créer le fichier dans le dossier du module, puis l'ajouter ici.
 */
export const superSpace: RoleSpace = {
  role: 'admin',
  basePath: '/super',
  // Hôpital ouvert : la sidebar affiche ses rubriques (personnel, services, assurances, hospitalisation…)
  contextMenu: menuHopitalOuvert,
  menu: [
    { label: 'Tableau de bord', icon: MdDashboard, path: '', element: <TableauDeBord /> },
    {
      label: 'Hôpital',
      icon: FaHSquare,
      children: [
        { label: 'Liste', path: 'hopital/liste', element: <Liste /> },
      ],
      // Pages ouvertes depuis les boutons de la liste (pas dans la sidebar)
      hiddenPages: [
        // Hôpital ouvert : en-tête + onglets (vue d'ensemble, personnel, services, assurances, hospitalisation,
        // patients, consultations, déclarations, permissions) et modification de l'établissement
        { label: 'Hôpital', path: 'hopital/:id/*', element: <EspaceHopital /> },
      ],
    },
    {
      label: 'Notifications Push',
      icon: FaBell,
      children: [
        { label: 'Liste des envois', path: 'notifications-push/liste', element: <ListeEnvois /> },
        { label: 'Nouvelle diffusion', path: 'notifications-push/nouvelle', element: <NouvelleDiffusion /> },
      ],
      // Détail d'une diffusion (bouton "œil" de la liste, pas dans la sidebar)
      hiddenPages: [{ label: 'Détail', path: 'notifications-push/:lot', element: <DetailDiffusion /> }],
    },
    // Agents supprimés par les hôpitaux UCP-FM : réintégrer, changer d'hôpital, supprimer définitivement
    { label: 'Personnel supprimé', icon: FaUserSlash, path: 'personnel-supprime', element: <PersonnelSupprime /> },
  ],
};
