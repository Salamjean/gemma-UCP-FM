import { ListeDeces as Liste } from '../../Hospital/Declarations';

/**
 * MÉDECIN / SAGE-FEMME > DÉCLARATIONS > LISTE DES DÉCÈS
 * Équivalent Laravel : doctor.declaration.deces.list — seulement les déclarations du médecin connecté.
 */
export default function ListeDeces() {
  return <Liste espace="medecin" />;
}
