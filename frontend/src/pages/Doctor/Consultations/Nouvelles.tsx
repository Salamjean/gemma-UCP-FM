import { api } from '../../../services/api';
import ListeConsultations from './ListeConsultations';

/**
 * MÉDECIN / SAGE-FEMME > CONSULTATIONS > NOUVELLES
 * Équivalent Laravel : doctor.consultation.today — patients du jour, constantes prises, en attente du médecin
 * (urgences en tête, actualisation automatique).
 */
export default function Nouvelles() {
  return (
    <ListeConsultations
      surtitre="Consultations"
      titre="Patients du jour"
      description="Patients orientés vers vous aujourd'hui, constantes prises."
      charger={api.doctor.consultations.nouvelles}
      actualiser
      videTitre="Aucun patient en attente aujourd'hui"
      videTexte="Les patients envoyés par l'infirmier après la prise de constantes apparaîtront ici en direct."
    />
  );
}
