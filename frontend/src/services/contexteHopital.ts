import { useSyncExternalStore } from 'react';

/**
 * HÔPITAL OUVERT PAR L'ADMIN UCP-FM
 * Les pages de l'espace hôpital sont réutilisées dans l'espace d'administration (/super/hopital/:id/…) :
 *   - les appels « /hospital/… » partent avec l'en-tête X-Hopital-Id (le serveur travaille sur cet hôpital) ;
 *   - les liens des pages pointent vers /super/hopital/:id/… au lieu de /hopital/… ;
 *   - quelques éléments sont masqués (montants payés, réponse aux permissions).
 * Hors de l'espace d'administration, rien ne change (compte de l'hôpital).
 */
let hopitalOuvert: number | null = null;

/** Ouvre (ou ferme avec null) le contexte d'un hôpital pour l'admin */
export function ouvrirHopital(id: number | null) {
  hopitalOuvert = id;
}

/** Identifiant de l'hôpital ouvert par l'admin, sinon null */
export const hopitalOuvertId = () => hopitalOuvert;

/** Pages de l'espace hôpital affichées pour l'admin UCP-FM ? */
export const estAdminHopital = () => hopitalOuvert !== null;

/** Racine des liens des pages de l'espace hôpital : « /hopital » ou « /super/hopital/:id » */
export const baseHopital = () => (hopitalOuvert !== null ? `/super/hopital/${hopitalOuvert}` : '/hopital');

/* Nom de l'hôpital ouvert (titre de la sidebar contextuelle de l'admin) */
let nomOuvert = '';
const abonnes = new Set<() => void>();

/** Mémorise le nom de l'hôpital ouvert et prévient la sidebar */
export function nommerHopital(nom: string) {
  if (nom === nomOuvert) return;
  nomOuvert = nom;
  abonnes.forEach((f) => f());
}

/** Nom de l'hôpital ouvert (se met à jour quand l'en-tête l'a chargé) */
export function useNomHopitalOuvert() {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => nomOuvert,
  );
}
