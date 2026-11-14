import { FaHistory } from 'react-icons/fa';
import { api } from '../../../services/api';
import ListeConsultations from './ListeConsultations';

/**
 * MÉDECIN / SAGE-FEMME > CONSULTATIONS > HISTORIQUE
 * Équivalent Laravel : doctor.consultation.history — consultations passées, issue et documents délivrés.
 */
export default function Historique() {
  return (
    <ListeConsultations
      surtitre="Consultations"
      titre="Historique des consultations"
      description="Vos consultations passées, avec leur issue et les documents délivrés."
      charger={api.doctor.consultations.historique}
      historique
      icone={FaHistory}
      videTitre="Aucune consultation dans l'historique"
      videTexte="Les consultations terminées s'afficheront ici."
    />
  );
}
