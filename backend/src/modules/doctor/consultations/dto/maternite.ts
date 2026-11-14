import { CHAMPS_PRENATALE, CHAMPS_REPRIS } from './prenatale';

/**
 * CONSULTATION POSTNATALE — comme Laravel : registre_consultation_post_natales
 * (vue users/doctor/consultation/formulaire/consultation/post-natale.blade.php, ConsultationPostNataleRequest).
 * Clés = colonnes de la table (texte, dates « JJ/MM/AAAA »).
 */
export const CHAMPS_POSTNATALE = [
  // Renseignements administratifs
  'date_consultation', 'mode_entree', 'numero_gestante', 'eleve', 'type_population', 'type_consultation_postnatale',
  // Examen général
  'pb', 'oedemes', 'varics', 'etat_conjonctives', 'conscience', 'seins', 'abdomen', 'globe_uterin',
  // Examen gynécologique
  'examen_perine', 'vulve', 'uterus', 'vessie', 'lochies', 'examen_speculum', 'test_acide_acetique', 'tv',
  // Enfant, allaitement, nutrition
  'enfant_vivant', 'enfant_jour_vaccin', 'femme_allaitante', 'allaitement_exlusif', 'autre_type_allaitement',
  'conseil_alimentation_mere', 'conseil_alimentation_enfant', 'etat_nutritionnel', 'retour_couche', 'patologies_associees',
  // Antécédents
  'antecedent_hta', 'antecedent_diabete', 'antecedent_autre', 'chirurgicaux', 'obstetricaux', 'gestite', 'parite',
  'nb_enfant_vivant', 'enfant_decede', 'cesarienne', 'Avortement', 'toxemie',
  // Accouchement
  'date_accouchement', 'antecedent_lieu_accouch', 'antecedent_mode_accouch',
  // VAT, VIH à l'accueil, méthode
  'date_vat1', 'date_vat2', 'date_vat_rappel', 'etat_vaccination', 'status_vih', 'methode_adoptee',
  // Planification familiale (conseils)
  'conseil_pf_pp1', 'conseil_pf_ppt', 'conseil_pf_ppp',
  // Conduite à tenir VIH
  'proposition_test_vih', 'retesting', 'numero_depistage_vih', 'resultat_test_depistage_vih', 'annonce_resultat', 'prophylaxie',
  // Examens biologiques
  'analyse_urine_albumine', 'analyse_urine_sucre', 'glycemie',
  // Offre de service PF et nutrition
  'offre_service_pf_conseil_pf_ppp1', 'offre_service_pf_conseil_pf_ppp', 'acceptation_methodes_contraceptives',
  'acceptation_methodes_contraceptives_precision', 'acceptation_methodes_contraceptives_methode',
  'offre_service_nutritionnel', 'offre_service_nutritionnel_oui_precision',
  // Résultat
  'observation', 'resultat_consultation', 'resultat_consultation_oui_precision', 'date_prochain_rdv',
] as const;

/** Repris de la dernière consultation postnatale (antécédents, accouchement, vaccination, statut VIH) */
const REPRIS_POSTNATALE = [
  'antecedent_hta', 'antecedent_diabete', 'antecedent_autre', 'chirurgicaux', 'obstetricaux', 'gestite', 'parite', 'nb_enfant_vivant',
  'enfant_decede', 'cesarienne', 'Avortement', 'toxemie', 'date_accouchement', 'antecedent_lieu_accouch', 'antecedent_mode_accouch',
  'date_vat1', 'date_vat2', 'date_vat_rappel', 'etat_vaccination', 'status_vih', 'numero_gestante',
];

const majuscule = (v: string | null) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : null);
const VAT: Record<string, string> = { non_vaccine: 'Non Vacciné', incompletement_vaccine: 'Incomplètement vacciné', correctement_vaccine: 'Correctement vacciné' };
const VIH: Record<string, string> = { Oui: 'Positif', Non: 'Négatif', Inconnu: 'Inconnu' };

/** Première consultation postnatale : antécédents repris de la dernière CPN (noms et valeurs convertis) */
const DEPUIS_CPN: Record<string, (cpn: Record<string, string | null>) => string | null> = {
  antecedent_hta: (x) => majuscule(x.hta),
  antecedent_diabete: (x) => majuscule(x.diabete),
  chirurgicaux: (x) => x.chirurgicaux,
  obstetricaux: (x) => x.obstetricaux,
  gestite: (x) => x.gestite,
  parite: (x) => x.parite,
  nb_enfant_vivant: (x) => x.enft_vivants,
  enfant_decede: (x) => x.enft_decedes,
  cesarienne: (x) => x.cesarienne,
  Avortement: (x) => x.avortement,
  toxemie: (x) => x.toxemie_grav,
  date_vat1: (x) => x.date_vat1,
  date_vat2: (x) => x.date_vat2,
  date_vat_rappel: (x) => x.date_vatR,
  etat_vaccination: (x) => (x.status_vat ? (VAT[x.status_vat] ?? null) : null),
  status_vih: (x) => (x.status_vih ? (VIH[x.status_vih] ?? null) : null),
  numero_gestante: (x) => x.num_gest_visite,
};

/**
 * ACCOUCHEMENT — comme Laravel : registre_accouchements
 * (vue users/doctor/consultation/formulaire/consultation/accouchement.blade.php, ConsultationAccouchementRequest).
 */
export const CHAMPS_ACCOUCHEMENT = [
  // Admission
  'date_consultation', 'numero_gestante', 'origine', 'mode_entree', 'preciser_centre', 'preciser_autre', 'en_scolarisation', 'telephone', 'contact2',
  'mode_admission', 'en_travail', 'contractions', 'poche_intacte', 'nbre_heure_ecoule', 'aspect_amnio',
  // Antécédents, VIH, PMI
  'hta', 'diabete', 'autre_antecedent', 'gestite', 'parite', 'gemellite', 'premature', 'enfant_vivant', 'enfant_decede', 'cesarienne', 'avortement', 'toxemie',
  'status_vih', 'preciser_num_pec', 'tarv', 'age_1e_cpn', 'nombre_cpn', 'status_vaccination_vat',
  // Examen obstétrical à l'entrée
  'group_rhesus', 'ddr', 'terme_prevu', 'HU', 'PO', 'presentation', 'RCF', 'Excision', 'Oedemes', 'Varices', 'TA', 'Pouls', 'temperature', 'conjonctives', 'Bassin', 'TV', 'paludisme',
  // Accouchement et délivrance
  'date_accouchement', 'num_accouchement', 'accouch_dom', 'mode_accouchement', 'mode_expulsion', 'interventions', 'Actes',
  'mode_delivrance', 'heure_delivrance', 'placenta', 'examen', 'membrane', 'cordon', 'particularite', 'Nbre_vo', 'revision_uterine',
  // Post-partum immédiat
  'ta_apres_accouchement', 'pouls_apres_accouchement', 'conscience', 'globule_uterin', 'saignement_vulvaire', 'complication_obstetricales', 'type_complication', 'prise_en_charge_hppi',
  // Nouveau-né
  'sexe_enfant', 'taille_enfant', 'poids_enfant', 'perimetre_cranien', 'apgar_1mn', 'apgar_5mn', 'etat_nouveau_ne', 'mort_ne', 'malformation', 'type_malformation',
  'reaction_bebe', 'action_si', 'reanimation', 'date_mise_sein', 'conseil_allaitement', 'skm', 'sat', 'preciser_traitement', 'prophylaxie', 'autre_medicament',
  'raison_evacuation', 'lieu_evacuation', 'date_evacuation',
  // Mère : offre de services, sortie, évacuation
  'proposition_test_vih', 'numero_depistage', 'resultat_test_vih', 'annonce_resultat_vih', 'init_arv', 'conseil_pf', 'methode_adoptee',
  'ordonnane_mere', 'ordonnance_enfant', 'deces_oui', 'date_deces_maternite', 'cause_deces', 'date_sortie', 'mode_sortie',
  'evacuation_mere', 'Motif_evacuation_mere', 'heure_decision', 'heure_depart', 'nom_etablissement', 'Ambulance', 'preciser_evacuation',
  'vit_A_1ere_dose', 'vit_A_2e_dose', 'date_prochain_rdv', 'responsable_accouchement', 'fiche_renseignee', 'fiche_rens_complet',
] as const;

/** Accouchement : grossesse en cours reprise de la dernière CPN (noms et valeurs convertis) */
const VIH_ACC: Record<string, string> = { Oui: 'positif', Non: 'negatif', Inconnu: 'inconnu' };
const ACC_DEPUIS_CPN: Record<string, (cpn: Record<string, string | null>) => string | null> = {
  numero_gestante: (x) => x.num_gest_visite,
  hta: (x) => majuscule(x.hta),
  diabete: (x) => majuscule(x.diabete),
  gestite: (x) => x.gestite,
  parite: (x) => x.parite,
  enfant_vivant: (x) => x.enft_vivants,
  enfant_decede: (x) => x.enft_decedes,
  cesarienne: (x) => x.cesarienne,
  avortement: (x) => x.avortement,
  toxemie: (x) => x.toxemie_grav,
  status_vih: (x) => (x.status_vih ? (VIH_ACC[x.status_vih] ?? null) : null),
  preciser_num_pec: (x) => x.num_pec,
  status_vaccination_vat: (x) => x.status_vat,
  group_rhesus: (x) => x.groupe_rhesus,
  ddr: (x) => x.ddr,
  terme_prevu: (x) => x.terme_prevu,
};

export type TypeMaternite = 'prenatale' | 'postnatale' | 'accouchement';

/** Registres de maternité (comme Laravel formulaireMotif : le libellé de la prestation choisit le formulaire) */
export const MATERNITE: Record<
  TypeMaternite,
  {
    table: string;
    typeRegistre: string;
    motif: string;
    champs: readonly string[];
    repris: readonly string[];
    depuisCpn?: typeof DEPUIS_CPN;
    /** La dernière CPN (grossesse en cours) passe avant la visite précédente du même type */
    cpnDabord?: boolean;
  }
> = {
  prenatale: {
    table: 'registre_consultation_pre_natales',
    typeRegistre: 'consultation prenatale',
    motif: 'Consultation prénatale',
    champs: CHAMPS_PRENATALE,
    repris: CHAMPS_REPRIS,
  },
  postnatale: {
    table: 'registre_consultation_post_natales',
    typeRegistre: 'consultation postnatale',
    motif: 'Consultation postnatale',
    champs: CHAMPS_POSTNATALE,
    repris: REPRIS_POSTNATALE,
    depuisCpn: DEPUIS_CPN,
  },
  accouchement: {
    table: 'registre_accouchements',
    typeRegistre: 'accouchement',
    motif: 'Accouchement',
    champs: CHAMPS_ACCOUCHEMENT,
    // Accouchement précédent : seulement les antécédents stables
    repris: ['hta', 'diabete', 'autre_antecedent', 'group_rhesus'],
    depuisCpn: ACC_DEPUIS_CPN,
    cpnDabord: true,
  },
};

/** Type de registre de maternité d'après le libellé de la prestation (null = consultation curative) */
export function typeMaternite(libelle: unknown): TypeMaternite | null {
  const l = String(libelle ?? '');
  if (/accouchement/i.test(l)) return 'accouchement';
  if (/post\s*-?\s*natal/i.test(l)) return 'postnatale';
  if (/pr[ée]\s*-?\s*natal/i.test(l)) return 'prenatale';
  return null;
}

/** Ne garde que les champs du registre, en texte (2 000 caractères maximum) ; les valeurs vides deviennent NULL */
export function nettoyerMaternite(type: TypeMaternite, brut: unknown): Record<string, string | null> {
  const src = brut && typeof brut === 'object' ? (brut as Record<string, unknown>) : {};
  const out: Record<string, string | null> = {};
  for (const k of MATERNITE[type].champs) {
    const v = src[k];
    const t = Array.isArray(v) ? v.map(String).join(', ') : v === null || v === undefined ? '' : String(v);
    out[k] = t.trim() ? t.trim().slice(0, 2000) : null;
  }
  return out;
}
