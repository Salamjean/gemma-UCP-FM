import { ListeNaissances as Liste } from '../../Hospital/Declarations';

/**
 * MÉDECIN / SAGE-FEMME > DÉCLARATIONS > LISTE DES NAISSANCES
 * Équivalent Laravel : doctor.declaration.naissance.list — seulement les déclarations du médecin connecté.
 */
export default function ListeNaissances() {
  return <Liste espace="medecin" />;
}
