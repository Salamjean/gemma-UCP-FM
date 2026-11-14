import { FaFileSignature, FaHospitalUser, FaHourglassHalf, FaProcedures, FaShareSquare, FaShieldAlt, FaStethoscope, FaVideo } from 'react-icons/fa';
import { MdDashboard } from 'react-icons/md';
import type { RoleSpace } from '../../layouts/DashboardLayout/types';
import type { AuthUser } from '../../types';
import { api } from '../../services/api';
import { AffecterPatientMedecin, ChoixInscriptionMedecin, InscriptionUrgenceMedecin, InscrirePatientMedecin, PermissionsMedecin, PlanningMedecin } from './Agent';
import { DocumentConsultation, FormulaireConsultation, Historique, Nouvelles, SuiviMereEnfant, TousLesPatients } from './Consultations';
import { DetailDeces, DetailNaissance, EnregistrerDeces, ListeDeces, ListeNaissances } from './Declarations';
import * as Hospitalisation from './Hospitalisation';
import { TableauDeBord } from './TableauDeBord';
import { RefereDetail, Referes } from './Referes';
import { Telemedecine } from './Telemedecine';

/**
 * Comme Laravel (partials/inc/_doctor.blade.php) : le menu dépend du type d'agent
 *   type_agent_id 2 = Sage femme → menu "sage" ; sinon → menu "médecin"
 */
const estSageFemme = (u: AuthUser) => u.profile.typeAgentId === 2;
const estMedecin = (u: AuthUser) => !estSageFemme(u);

/** Badge du menu : patients du jour en attente du médecin */
const compterPatientsDuJour = () => api.doctor.consultations.nouvelles().then((l) => l.length);
/** Badge du menu : patients hospitalisés en attente de chambre */
const compterEnAttenteDeChambre = () => api.doctor.hospitalisations.compteurs().then((c) => c.enAttente);
/** Badge du menu : patients référés à moi, pas encore consultés */
const compterReferes = () => api.doctor.referes.liste().then((r) => r.internes.filter((x) => !x.terminee).length);
/** Badge du menu : télémédecines en attente */
const compterTelemedecines = () => api.doctor.telemedecines('en-attente').then((d) => d.compteurs.enAttente);

/**
 * ESPACE MÉDECIN / SAGE-FEMME (rôle "doctor") — menu de la sidebar ET routes.
 * Repris de Laravel : partials/inc/agent/_doctor.blade.php et _sage.blade.php
 */
export const doctorSpace: RoleSpace = {
  role: 'doctor',
  basePath: '/medecin',
  menu: [
    { label: 'Tableau de bord', icon: MdDashboard, path: '', element: <TableauDeBord /> },
    // Patients : inscrire un patient, le rechercher et l'affecter (comme l'infirmier)
    {
      label: 'Patients',
      icon: FaHospitalUser,
      children: [
        { label: 'Inscrire un patient', path: 'patients/inscrire', element: <ChoixInscriptionMedecin /> },
        { label: 'Rechercher / affecter', path: 'patients/affecter', element: <AffecterPatientMedecin /> },
      ],
      // Ouvertes depuis la page « Inscrire un patient » (choix : complète ou d'urgence)
      hiddenPages: [
        { label: 'Inscription complète', path: 'patients/inscrire/complete', element: <InscrirePatientMedecin /> },
        { label: "Inscription d'urgence", path: 'patients/inscrire/urgence', element: <InscriptionUrgenceMedecin /> },
      ],
    },
    {
      label: 'Consultations',
      icon: FaStethoscope,
      badge: compterPatientsDuJour,
      hiddenPages: [
        { label: 'Consultation', path: 'consultations/:id', element: <FormulaireConsultation /> },
        { label: 'Document', path: 'consultations/:id/document/:type', element: <DocumentConsultation /> },
      ],
      children: [
        { label: 'Nouvelles', path: 'consultations/nouvelles', element: <Nouvelles /> },
        { label: 'Tous les patients', path: 'consultations/tous-les-patients', element: <TousLesPatients />, visible: estMedecin },
        { label: 'Historique', path: 'consultations/historique', element: <Historique /> },
        { label: 'Suivi mère-enfant', path: 'consultations/suivi-mere-enfant', element: <SuiviMereEnfant />, visible: estSageFemme },
      ],
    },
    // Remplace « Appels Vidéo HD » : télémédecines programmées par l'infirmier ou demandées en ligne
    { label: 'Télémédecine', icon: FaVideo, path: 'telemedecine', element: <Telemedecine />, badge: compterTelemedecines },
    // Référés : patients adressés par un collègue (interne) + références externes de tous les médecins
    {
      label: 'Référés',
      icon: FaShareSquare,
      path: 'referes',
      element: <Referes />,
      badge: compterReferes,
      hiddenPages: [{ label: 'Référence', path: 'referes/:id', element: <RefereDetail /> }],
    },
    {
      label: 'Déclarations',
      icon: FaFileSignature,
      hiddenPages: [
        { label: 'Détail décès', path: 'declarations/deces/:id', element: <DetailDeces /> },
        { label: 'Détail naissance', path: 'declarations/naissances/:id', element: <DetailNaissance /> },
      ],
      children: [
        { label: 'Enregistrer un décès', path: 'declarations/enregistrer-deces', element: <EnregistrerDeces /> },
        { label: 'Liste des décès', path: 'declarations/deces', element: <ListeDeces /> },
        { label: 'Liste des naissances', path: 'declarations/naissances', element: <ListeNaissances /> },
      ],
    },
    {
      label: 'Hospitalisation',
      icon: FaProcedures,
      visible: estMedecin,
      badge: compterEnAttenteDeChambre,
      hiddenPages: [{ label: 'Suivi', path: 'hospitalisation/:id', element: <Hospitalisation.Suivi /> }],
      children: [
        { label: 'En attente', path: 'hospitalisation/en-attente', element: <Hospitalisation.EnAttente /> },
        { label: 'En cours', path: 'hospitalisation/en-cours', element: <Hospitalisation.EnCours /> },
        { label: 'Historique', path: 'hospitalisation/historique', element: <Hospitalisation.Historique /> },
      ],
    },
    { label: 'Permission', icon: FaShieldAlt, path: 'permission', element: <PermissionsMedecin /> },
    { label: 'Planning', icon: FaHourglassHalf, path: 'planning', element: <PlanningMedecin /> },
  ],
};
