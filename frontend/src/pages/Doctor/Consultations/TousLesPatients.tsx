import { FaUsers } from 'react-icons/fa';
import { api } from '../../../services/api';
import ListeConsultations from './ListeConsultations';

/**
 * MÉDECIN > CONSULTATIONS > TOUS LES PATIENTS
 * Équivalent Laravel : doctor.consultation.all — toutes les consultations en attente du médecin, tous jours confondus.
 */
export default function TousLesPatients() {
  return (
    <ListeConsultations
      surtitre="Consultations"
      titre="Tous les patients en attente"
      description="Consultations qui vous sont attribuées et pas encore terminées, tous jours confondus."
      charger={api.doctor.consultations.enAttente}
      actualiser
      icone={FaUsers}
      videTitre="Aucun patient en attente"
      videTexte="Toutes vos consultations sont terminées."
    />
  );
}
