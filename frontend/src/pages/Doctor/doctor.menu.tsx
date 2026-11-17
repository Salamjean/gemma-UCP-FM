import { FaClipboardCheck, FaFileSignature, FaHospitalUser, FaHourglassHalf, FaProcedures, FaShareSquare, FaShieldAlt, FaStethoscope, FaVideo } from 'react-icons/fa';
import { MdDashboard } from 'react-icons/md';
import type { RoleSpace } from '../../layouts/DashboardLayout/types';
import { api } from '../../services/api';
import {
  AffecterPatientMedecin,
  ChoixInscriptionMedecin,
  DossierMedicalMedecin,
  InscriptionUrgenceMedecin,
  InscrirePatientMedecin,
  ParcoursMedecin,
  PermissionsMedecin,
  PlanningMedecin,
} from './Agent';
import { DocumentConsultation, FormulaireConsultation, Historique, Nouvelles, SuiviMereEnfant, TousLesPatients } from './Consultations';
import { DetailDeces, DetailNaissance, EnregistrerDeces, ListeDeces, ListeNaissances } from './Declarations';
import * as Hospitalisation from './Hospitalisation';
import { TableauDeBord } from './TableauDeBord';
import { JoindreResultat, RefereDetail, Referes } from './Referes';
import { Telemedecine } from './Telemedecine';
import { ProgrammerTelemedecineMedecin } from './Telemedecine/Programmer';
import { ResultatExpertiseMedecin, ResultatsExpertiseMedecin } from './ResultatsExpertise';

/** Badge du menu : télémédecines en attente */
const compterTelemedecines = () => api.doctor.telemedecines('en-attente').then((d) => d.compteurs.enAttente);
/** Badge du menu : résultats d'expertise reçus non lus */
const compterResultats = () => api.doctor.resultatsExpertise.nonLus().then((r) => r.nonLus);

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
        { label: 'Vérifier / Rechercher', path: 'patients/affecter', element: <AffecterPatientMedecin /> },
      ],
      // Ouvertes depuis la page « Inscrire un patient » (choix : complète ou d'urgence)
      hiddenPages: [
        { label: 'Inscription complète', path: 'patients/inscrire/complete', element: <InscrirePatientMedecin /> },
        { label: "Inscription d'urgence", path: 'patients/inscrire/urgence', element: <InscriptionUrgenceMedecin /> },
        // Dossier médical du patient trouvé (Vérifier / Rechercher) et parcours d'une intervention
        { label: 'Dossier médical', path: 'patients/:id/dossier', element: <DossierMedicalMedecin /> },
        { label: 'Parcours', path: 'patients/:id/parcours/:consultationId', element: <ParcoursMedecin /> },
      ],
    },
    // Remplace « Appels Vidéo HD » : télémédecines programmées par l'infirmier ou demandées en ligne
    {
      label: 'Télémédecine',
      icon: FaVideo,
      path: 'telemedecine',
      element: <Telemedecine />,
      badge: compterTelemedecines,
      // Bouton « Programmer » : recherche du patient puis téléconsultation ou télé-expertise
      hiddenPages: [{ label: 'Programmer', path: 'telemedecine/programmer', element: <ProgrammerTelemedecineMedecin /> }],
    },
    // Consultations : plus de sous-onglets, l'onglet ouvre directement l'historique.
    // Les autres pages restent accessibles par les liens (tableau de bord, formulaire…).
    {
      label: 'Consultations',
      icon: FaStethoscope,
      path: 'consultations/historique',
      element: <Historique />,
      hiddenPages: [
        { label: 'Nouvelles', path: 'consultations/nouvelles', element: <Nouvelles /> },
        { label: 'Tous les patients', path: 'consultations/tous-les-patients', element: <TousLesPatients /> },
        { label: 'Suivi mère-enfant', path: 'consultations/suivi-mere-enfant', element: <SuiviMereEnfant /> },
        { label: 'Consultation', path: 'consultations/:id', element: <FormulaireConsultation /> },
        { label: 'Document', path: 'consultations/:id/document/:type', element: <DocumentConsultation /> },
      ],
    },
    // Télé-expertises que j'ai demandées : délai et résultat joint par l'expert
    {
      label: 'Résultats d’expertise',
      icon: FaClipboardCheck,
      path: 'resultats-expertise',
      element: <ResultatsExpertiseMedecin />,
      badge: compterResultats,
      hiddenPages: [{ label: 'Résultat', path: 'resultats-expertise/:origineId', element: <ResultatExpertiseMedecin /> }],
    },
    // Référés : onglet retiré du menu (les télé-expertises sont dans Télémédecine) ; pages gardées pour les liens
    {
      label: 'Référés',
      icon: FaShareSquare,
      path: 'referes',
      element: <Referes />,
      visible: () => false,
      hiddenPages: [
        { label: 'Référence', path: 'referes/:id', element: <RefereDetail /> },
        // Fin de consultation d'une télé-expertise : l'expert joint son résultat
        { label: 'Joindre le résultat', path: 'referes/:id/resultat', element: <JoindreResultat /> },
      ],
    },
    // Déclarations : onglet retiré du menu ; pages gardées (certificat de naissance ouvert depuis le formulaire)
    {
      label: 'Déclarations',
      icon: FaFileSignature,
      visible: () => false,
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
    // Hospitalisation : onglet retiré du menu ; pages gardées (ouvertes depuis l'issue « Hospitalisation »)
    {
      label: 'Hospitalisation',
      icon: FaProcedures,
      visible: () => false,
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
