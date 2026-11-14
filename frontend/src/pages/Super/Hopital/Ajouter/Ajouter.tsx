import { api } from '../../../../services/api';
import HopitalForm from '../HopitalForm/HopitalForm';

/**
 * SUPER > HÔPITAL > AJOUTER
 * Équivalent Laravel : super.hospital.add / super.hospital.store
 * Crée le compte de connexion de l'hôpital (users, rôle hospital) + l'hôpital (hospitals), marqué UCP-FM d'office.
 * Le formulaire est dans ../HopitalForm (partagé avec "Modifier").
 */
export default function Ajouter() {
  return (
    <HopitalForm
      mode="ajout"
      titre="Ajout d'un hôpital UCP-FM"
      onEnvoyer={async (data) => (await api.super.hopitaux.creer(data)).message}
    />
  );
}
