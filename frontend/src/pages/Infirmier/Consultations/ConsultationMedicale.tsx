import DocumentConsultation from '../../Doctor/Documents/DocumentConsultation';
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

/** Ordonnance, bulletin d'examens, arrêt de travail de la consultation (à imprimer) */
export function DocumentConsultationMedicale() {
  return (
    <EspaceConsultationContexte.Provider value="infirmier">
      <DocumentConsultation />
    </EspaceConsultationContexte.Provider>
  );
}
