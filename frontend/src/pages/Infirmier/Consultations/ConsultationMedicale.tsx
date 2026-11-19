import DocumentConsultation from '../../Doctor/Documents/DocumentConsultation';
import FicheReference from '../../Doctor/Documents/FicheReference';
import FormulaireConsultation from '../../Doctor/Consultations/Formulaire/FormulaireConsultation';
import { EspaceConsultationContexte } from '../../Doctor/Consultations/Formulaire/espace';

/**
 * INFIRMIER > CONSULTATION (bouton « Consulter » de Vérifier / Rechercher)
 * Le MÊME formulaire de consultation que le médecin, branché sur l'API de l'infirmier·ère.
 */
export function ConsultationMedicale() {
  return (
    <EspaceConsultationContexte.Provider value="infirmier">
      <FormulaireConsultation />
    </EspaceConsultationContexte.Provider>
  );
}

/** Fiche de référence du patient (issue « Référence »), à imprimer et remettre au patient */
export function FicheReferenceInfirmier() {
  return (
    <EspaceConsultationContexte.Provider value="infirmier">
      <FicheReference />
    </EspaceConsultationContexte.Provider>
  );
}

/** Ordonnance, bulletin d'examens, arrêt de travail de la consultation (à imprimer) */
export function DocumentConsultationMedicale() {
  return (
    <EspaceConsultationContexte.Provider value="infirmier">
      <DocumentConsultation />
    </EspaceConsultationContexte.Provider>
  );
}
