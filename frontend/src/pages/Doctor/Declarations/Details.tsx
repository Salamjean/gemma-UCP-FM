import { DetailDeces as FicheDeces, DetailNaissance as FicheNaissance } from '../../Hospital/Declarations';

/** MÉDECIN > DÉCLARATIONS > fiche d'un décès (certificat imprimable) */
export function DetailDeces() {
  return <FicheDeces espace="medecin" />;
}

/** MÉDECIN > DÉCLARATIONS > fiche d'une naissance (certificat imprimable) */
export function DetailNaissance() {
  return <FicheNaissance espace="medecin" />;
}
