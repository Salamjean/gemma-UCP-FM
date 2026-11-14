import {
  FaAddressBook,
  FaBed,
  FaShieldAlt,
  FaSuperpowers,
  FaThermometerHalf,
  FaUserMd,
  FaUsers,
} from 'react-icons/fa';
import { FaBuildingUser, FaChildren } from 'react-icons/fa6';
import { MdDashboard } from 'react-icons/md';
import type { RoleSpace } from '../../layouts/DashboardLayout/types';
import * as Assurances from './Assurances';
import * as Consultations from './Consultations';
import * as Declarations from './Declarations';
import * as Hospitalisation from './Hospitalisation';
import * as Patients from './Patients';
import * as Permissions from './Permissions';
import * as PersonnelSante from './PersonnelSante';
import * as Services from './Services';
import * as SpecialitesMedicales from './SpecialitesMedicales';
import { TableauDeBord } from './TableauDeBord';

/**
 * ESPACE HÔPITAL (rôle "hospital") — menu de la sidebar ET routes (une seule source).
 * Repris de Laravel : resources/views/partials/inc/_hospital.blade.php
 * ("Grille des prix" est en commentaire dans Laravel → non repris ;
 *  "Personnel administratif", "Pharmacie", "Recette" et "Comptabilité" retirés : ils ne font pas partie de ce projet)
 */
export const hospitalSpace: RoleSpace = {
  role: 'hospital',
  basePath: '/hopital',
  menu: [
    { label: 'Tableau de bord', icon: MdDashboard, path: '', element: <TableauDeBord /> },
    {
      label: 'Services',
      icon: FaBuildingUser,
      children: [
        { label: 'Liste', path: 'services/liste', element: <Services.Liste /> },
        { label: 'Ajouter', path: 'services/ajouter', element: <Services.Ajouter /> },
      ],
      // Pages ouvertes depuis les boutons de la liste (pas dans la sidebar)
      hiddenPages: [
        { label: 'Fiche', path: 'services/:id', element: <Services.Detail /> },
        { label: 'Modifier', path: 'services/:id/modifier', element: <Services.Detail edition /> },
      ],
    },
    {
      label: 'Assurances',
      icon: FaSuperpowers,
      children: [
        { label: 'Liste', path: 'assurances/liste', element: <Assurances.Liste /> },
        { label: 'Ajouter', path: 'assurances/ajouter', element: <Assurances.Ajouter /> },
      ],
      hiddenPages: [{ label: 'Modifier', path: 'assurances/:id/modifier', element: <Assurances.Modifier /> }],
    },
    {
      // Nom abrégé dans la sidebar (titre complet sur les pages : "Spécialités médicales")
      label: 'Spécialités',
      icon: FaAddressBook,
      children: [
        { label: 'Liste', path: 'specialites/liste', element: <SpecialitesMedicales.Liste /> },
        { label: 'Ajouter', path: 'specialites/ajouter', element: <SpecialitesMedicales.Ajouter /> },
      ],
      hiddenPages: [{ label: 'Modifier', path: 'specialites/:id/modifier', element: <SpecialitesMedicales.Modifier /> }],
    },
    {
      label: 'Personnel de santé',
      icon: FaUserMd,
      children: [
        { label: 'Médecins', path: 'personnel-sante/medecins', element: <PersonnelSante.ListeAgents type="medecin" /> },
        { label: 'Sages-femmes', path: 'personnel-sante/sages-femmes', element: <PersonnelSante.ListeAgents type="sage-femme" /> },
        { label: 'Infirmiers', path: 'personnel-sante/infirmiers', element: <PersonnelSante.ListeAgents type="infirmier" /> },
        { label: 'Régulateurs', path: 'personnel-sante/regulateurs', element: <PersonnelSante.ListeAgents type="regulateur" /> },
        { label: 'Ajouter', path: 'personnel-sante/ajouter', element: <PersonnelSante.Ajouter /> },
      ],
      // Modification d'un agent (bouton "crayon" des listes) — :type = medecin | sage-femme | infirmier
      hiddenPages: [{ label: 'Modifier', path: 'personnel-sante/:type/:id/modifier', element: <PersonnelSante.Modifier /> }],
    },
    {
      label: 'Hospitalisation',
      icon: FaBed,
      children: [
        { label: 'Gestion des chambres', path: 'hospitalisation/chambres', element: <Hospitalisation.GestionChambres /> },
        { label: 'Hospitalisation', path: 'hospitalisation/liste', element: <Hospitalisation.Hospitalisations /> },
      ],
      // Pages ouvertes depuis les boutons des listes (pas dans la sidebar)
      hiddenPages: [
        { label: 'Ajouter une chambre', path: 'hospitalisation/chambres/ajouter', element: <Hospitalisation.AjouterChambre /> },
        { label: 'Modifier la chambre', path: 'hospitalisation/chambres/:id/modifier', element: <Hospitalisation.ModifierChambre /> },
        { label: 'Détail', path: 'hospitalisation/liste/:id', element: <Hospitalisation.HospitalisationDetail /> },
      ],
    },
    {
      label: 'Patients',
      icon: FaUsers,
      children: [{ label: 'Liste', path: 'patients/liste', element: <Patients.Liste /> }],
      hiddenPages: [{ label: 'Détail patient', path: 'patients/:id', element: <Patients.Detail /> }],
    },
    {
      label: 'Consultations',
      icon: FaThermometerHalf,
      children: [
        { label: 'Nouvelles', path: 'consultations/nouvelles', element: <Consultations.Nouvelles /> },
        { label: 'Historique', path: 'consultations/historique', element: <Consultations.Historique /> },
      ],
      hiddenPages: [{ label: 'Détail consultation', path: 'consultations/:id', element: <Consultations.Detail /> }],
    },
    {
      label: 'Déclarations',
      icon: FaChildren,
      children: [
        { label: 'Liste des naissances', path: 'declarations/naissances', element: <Declarations.ListeNaissances /> },
        { label: 'Liste des décès', path: 'declarations/deces', element: <Declarations.ListeDeces /> },
      ],
      hiddenPages: [
        { label: 'Détail naissance', path: 'declarations/naissances/:id', element: <Declarations.DetailNaissance /> },
        { label: 'Détail décès', path: 'declarations/deces/:id', element: <Declarations.DetailDeces /> },
      ],
    },
    {
      label: 'Permission',
      icon: FaShieldAlt,
      children: [
        { label: 'Permission en attente', path: 'permissions/en-attente', element: <Permissions.ListePermissions statut="pending" /> },
        { label: 'Permission succès', path: 'permissions/accordees', element: <Permissions.ListePermissions statut="agree" /> },
        { label: 'Permission annulées', path: 'permissions/refusees', element: <Permissions.ListePermissions statut="reject" /> },
      ],
    },
  ],
};
