/**
 * UCP-FM : l'espace d'administration (rôle Laravel « super ») ne gère que les hôpitaux
 * marqués comme appartenant au UCP-FM (hospitals.is_ucp_fm = 1, colonne ajoutée par Laravel).
 */
export const HOPITAL_UCP = 'is_ucp_fm = 1 AND deleted_at IS NULL';

/** Sous-requête : identifiants des hôpitaux UCP-FM (pour filtrer patients, consultations, déclarations, journaux…) */
export const IDS_HOPITAUX_UCP = `(SELECT id FROM hospitals WHERE ${HOPITAL_UCP})`;
