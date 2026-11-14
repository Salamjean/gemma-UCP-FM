import ListeHospitalisations from './ListeHospitalisations';

/** MÉDECIN > HOSPITALISATION > EN ATTENTE DE CHAMBRE (pending_room) */
export default function EnAttente() {
  return <ListeHospitalisations statut="en-attente" />;
}
