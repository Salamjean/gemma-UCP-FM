/**
 * CONSULTATION PRÉNATALE (CPN) — comme Laravel : registre_consultation_pre_natales
 * (vue users/doctor/consultation/formulaire/consultation/pre-natale.blade.php, ConsultationPreNataleRequest).
 * Les clés du formulaire sont les noms des colonnes de la table (tout est en texte, dates « JJ/MM/AAAA »).
 */
export const CHAMPS_PRENATALE = [
  // Renseignements administratifs
  'date_consultation', 'num_gest_prec', 'num_gest_visite', 'mode_entree', 'preciser_centre', 'preciser_autre',
  // Antécédents
  'hta', 'diabete', 'chirurgicaux', 'obstetricaux', 'gestite', 'parite', 'enft_vivants', 'enft_decedes', 'cesarienne', 'avortement', 'toxemie_grav',
  // Grossesse actuelle
  'ddr', 'terme_prevu', 'derniere_cpn', 'semaine_amenor', 'type_visite', 'preciser_cpn',
  // VAT, VIH à l'accueil
  'date_vat1', 'date_vat2', 'date_vatR', 'status_vat', 'status_vih', 'num_pec', 'prop_test', 'retesting', 'num_depistage',
  // Constantes
  'perimetre_brachial', 'ta', 'pouls',
  // Examen général
  'conjonctives', 'seins', 'vergetures', 'varices', 'oedemes', 'autres',
  // Examen obstétrical
  'po', 'hu', 'age_gest', 'bdc', 'presentation', 'tv', 'pathologie', 'Anemie', 'etat_nutri', 'conseil_pf', 'methode', 'resultat_consultation',
  // Examens biologiques
  'groupe_rhesus', 'taux_hemoglo', 'electrophèse', 'albumine', 'sucre', 'ecbu', 'glyc_exa', 'glyc_recu', 'resul_ajeun', 'resul_najeun', 'glyc_resul_na',
  'syph_exa', 'syph_recu', 'resul_syph', 'st_igG', 'st_igM', 'sr_igG', 'sr_igM', 'agHBs_exa', 'agHBs_recu', 'agHBs_resul',
  // VIH
  'resultat_vih', 'annonce_vih', 'conjoint_vih', 'status_vih_conjoint', 'Prel_charge', 'cv_inf1000',
  // Autres examens, prescriptions CPN, nutrition, rendez-vous
  'autres_exa', 'exa_echo', 'prescription', 'conseil_nutri', 'service_nutri', 'prec_sn', 'autre_medic', 'date_prochain_rdv',
] as const;

/** Repris de la dernière CPN de la patiente (antécédents et grossesse en cours) quand la visite n'a pas encore de registre */
export const CHAMPS_REPRIS = [
  'hta', 'diabete', 'chirurgicaux', 'obstetricaux', 'gestite', 'parite', 'enft_vivants', 'enft_decedes', 'cesarienne', 'avortement', 'toxemie_grav',
  'ddr', 'terme_prevu', 'date_vat1', 'date_vat2', 'date_vatR', 'status_vat', 'status_vih', 'num_pec', 'groupe_rhesus',
] as const;
