import ListeHospitalisations from './ListeHospitalisations';

/** MÉDECIN > HOSPITALISATION > EN COURS (in_progress) */
export default function EnCours() {
  return <ListeHospitalisations statut="en-cours" />;
}
