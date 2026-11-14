import AffecterPatient from '../../Infirmier/Accueil/AffecterPatient';
import InscrirePatient from '../../Infirmier/Accueil/InscrirePatient';
import InscriptionUrgence from '../../Infirmier/Accueil/InscriptionUrgence';
import ChoixInscription from '../../Infirmier/Accueil/ChoixInscription';
import PermissionsAgent from '../../Infirmier/Permissions/Permissions';
import PlanningAgent from '../../Infirmier/Planning/Planning';

/**
 * MÉDECIN / SAGE-FEMME : pages partagées avec l'espace infirmier (même affichage, API /api/doctor/…)
 *   - Patients : inscription d'un nouveau patient, recherche & affectation (consultation du jour → prise de constantes par l'infirmier·ère) ;
 *   - Permission : demandes d'absence (type Laravel « doctor ») ;
 *   - Planning : jours et créneaux de service.
 */
export const InscrirePatientMedecin = () => <InscrirePatient espace="medecin" />;
export const InscriptionUrgenceMedecin = () => <InscriptionUrgence espace="medecin" />;
export const ChoixInscriptionMedecin = () => <ChoixInscription espace="medecin" />;
export const AffecterPatientMedecin = () => <AffecterPatient espace="medecin" />;
export const PermissionsMedecin = () => <PermissionsAgent espace="medecin" />;
export const PlanningMedecin = () => <PlanningAgent espace="medecin" />;
