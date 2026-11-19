import {
  FaClipboardCheck,
  FaHourglassHalf,
  FaHospitalUser,
  FaProcedures,
  FaShieldAlt,
  FaStethoscope,
  FaSyringe,
  FaVideo,
} from 'react-icons/fa';
import { MdDashboard } from 'react-icons/md';
import type { RoleSpace } from '../../layouts/DashboardLayout/types';
import { apiResultatsExpertise, api } from '../../services/api';
import { ResultatExpertiseInfirmier, ResultatsExpertiseInfirmier } from '../Doctor/ResultatsExpertise';
import { ProgrammerTelemedecineInfirmier } from '../Doctor/Telemedecine/Programmer';
import type { AuthUser } from '../../types';
import { AffecterPatient, ChoixInscription, InscriptionUrgence, InscrirePatient } from './Accueil';
import * as Consultations from './Consultations';
import { DossierMedical, ListePatients, ParcoursIntervention } from './GestionPatients';
import * as Hospitalisations from './Hospitalisations';
import { Permissions } from './Permissions';
import { Planning } from './Planning';
import * as SoinsInfirmier from './SoinsInfirmier';
import { TableauDeBord } from './TableauDeBord';
import { Teleconsultations } from './Teleconsultations';

/**
 * Comme Laravel (partials/inc/_infirmier.blade.php et _menu.blade.php) :
 *  - service 4 → menu "Soins infirmier", sinon → menu "Consultations"
 *  - "Télémédecine" (téléconsultations de Laravel) seulement si l'hôpital l'a activée, avec le nombre en attente
 *  - "Permissions" et "Planning" pour tous les agents de santé
 */
const serviceSoins = (u: AuthUser) => u.profile.serviceId === 4;
const teleconsultationActive = (u: AuthUser) => u.profile.teleconsultationActive !== false;
/** Badge de la sidebar : télémédecines en attente (fonction stable, définie une seule fois) */
const compterTelemedecines = () => api.infirmier.teleconsultations.enAttente().then((r) => r.enAttente);
/** Badge du menu : résultats d'expertise reçus non lus */
const compterResultats = () => apiResultatsExpertise('infirmier').nonLus().then((r) => r.nonLus);

/** ESPACE INFIRMIER — menu de la sidebar ET routes */
export const infirmierSpace: RoleSpace = {
  role: 'infirmier',
  basePath: '/infirmier',
  menu: [
    { label: 'Tableau de bord', icon: MdDashboard, path: '', element: <TableauDeBord /> },
    {
      label: 'Gestion Patients',
      icon: FaHospitalUser,
      children: [
        // Même page que le bouton "Rechercher et affecter" du tableau de bord
        { label: 'Vérifier / Rechercher', path: 'patients/rechercher', element: <AffecterPatient /> },
        { label: 'Liste des patients', path: 'patients/liste', element: <ListePatients /> },
      ],
      // Boutons du tableau de bord : inscrire un patient / rechercher et affecter (consultation directe, sans caisse)
      hiddenPages: [
        { label: 'Inscrire un patient', path: 'patients/inscrire', element: <ChoixInscription /> },
        { label: 'Inscription complète', path: 'patients/inscrire/complete', element: <InscrirePatient /> },
        { label: "Inscription d'urgence", path: 'patients/inscrire/urgence', element: <InscriptionUrgence /> },
        { label: 'Rechercher et affecter', path: 'patients/affecter', element: <AffecterPatient /> },
        { label: 'Dossier médical', path: 'patients/:id/dossier', element: <DossierMedical /> },
        { label: 'Parcours', path: 'patients/:id/parcours/:consultationId', element: <ParcoursIntervention /> },
        // « Consulter » : même formulaire de consultation que le médecin (ici car ce groupe est visible pour tous les infirmiers)
        { label: 'Consultation', path: 'consultations/medicale/:id', element: <Consultations.ConsultationMedicale /> },
        { label: 'Document', path: 'consultations/medicale/:id/document/:type', element: <Consultations.DocumentConsultationMedicale /> },
        // Issue « Référence » : fiche de référence à imprimer pour le patient
        { label: 'Fiche de référence', path: 'consultations/reference/:id', element: <Consultations.FicheReferenceInfirmier /> },
      ],
    },
    {
      label: 'Soins infirmier',
      icon: FaSyringe,
      visible: serviceSoins,
      children: [
        { label: 'Nouvelles', path: 'soins/nouvelles', element: <SoinsInfirmier.Nouvelles /> },
        { label: 'Tous les soins', path: 'soins/tous', element: <SoinsInfirmier.TousLesSoins /> },
        { label: 'Historique', path: 'soins/historique', element: <SoinsInfirmier.Historique /> },
      ],
    },
    {
      // Libellé "Télémédecine" (route inchangée) + pastille du nombre de télémédecines en attente
      label: 'Télémédecine',
      icon: FaVideo,
      visible: teleconsultationActive,
      path: 'teleconsultations',
      element: <Teleconsultations />,
      badge: compterTelemedecines,
      // Bouton « Programmer » : recherche du patient puis téléconsultation ou télé-expertise
      hiddenPages: [{ label: 'Programmer', path: 'teleconsultations/programmer', element: <ProgrammerTelemedecineInfirmier /> }],
    },
    // Consultations : plus de sous-onglets, l'onglet ouvre directement l'historique.
    // « Nouvelles » et « En attente » restent accessibles par les liens (tableau de bord, historique).
    {
      label: 'Consultations',
      icon: FaStethoscope,
      visible: (u) => !serviceSoins(u),
      path: 'consultations/historique',
      element: <Consultations.Historique />,
      hiddenPages: [
        { label: 'Nouvelles', path: 'consultations/nouvelles', element: <Consultations.Nouvelles /> },
        { label: 'En attente', path: 'consultations/toutes', element: <Consultations.Toutes /> },
        { label: 'Prise de constantes', path: 'consultations/formulaire/:id', element: <Consultations.FormulaireConstantes /> },
      ],
    },
    // Télé-expertises demandées depuis mes consultations : délai et résultat joint par l'expert
    {
      label: 'Réponses d’expertise',
      icon: FaClipboardCheck,
      path: 'resultats-expertise',
      element: <ResultatsExpertiseInfirmier />,
      badge: compterResultats,
      hiddenPages: [{ label: 'Réponse', path: 'resultats-expertise/:origineId', element: <ResultatExpertiseInfirmier /> }],
    },
    // Hospitalisations : onglet retiré du menu ; pages gardées pour les liens du tableau de bord
    {
      label: 'Hospitalisations',
      icon: FaProcedures,
      visible: () => false,
      hiddenPages: [{ label: 'Suivi & surveillance', path: 'hospitalisations/:id/suivi', element: <Hospitalisations.Suivi /> }],
      children: [
        { label: 'En cours', path: 'hospitalisations/en-cours', element: <Hospitalisations.EnCours /> },
        { label: 'Historique', path: 'hospitalisations/historique', element: <Hospitalisations.Historique /> },
      ],
    },
    {
      label: 'Permission',
      icon: FaShieldAlt,
      path: 'permissions',
      element: <Permissions />,
    },
    {
      label: 'Planning',
      icon: FaHourglassHalf,
      path: 'planning',
      element: <Planning />,
    },
  ],
};
