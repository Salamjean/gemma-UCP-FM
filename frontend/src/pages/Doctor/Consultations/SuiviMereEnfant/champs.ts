/**
 * SUIVI MÈRE-ENFANT (PTME) — description des formulaires, repris de Laravel
 * (users/doctor/maternite/suivie-mere-enfant.blade.php + SuivieController).
 * Les clés sont celles envoyées au serveur ; « si » affiche un champ selon une autre réponse.
 */
export type Valeurs = Record<string, string>;

export interface Champ {
  k: string;
  libelle: string;
  type: 'date' | 'texte' | 'choix';
  options?: string[];
  /** Obligatoire (quand il est affiché) */
  requis?: boolean;
  aide?: string;
  si?: (v: Valeurs) => boolean;
  large?: boolean;
}

export interface Etape {
  titre: string;
  detail: string;
  sections: { titre: string; champs: Champ[] }[];
}

const OUI_NON = ['Oui', 'Non'];
const POS_NEG = ['Positif', 'Négatif'];

// ======================= SUIVI PRÉNATAL (MÈRE) =======================
export const ETAPES_PRENATAL: Etape[] = [
  {
    titre: 'Traitement ARV',
    detail: 'Visite, ARV, charge virale',
    sections: [
      {
        titre: 'Visite',
        champs: [
          { k: 'dateVisite', libelle: 'Date de la visite', type: 'date', requis: true },
          { k: 'ageGestationnel', libelle: 'Âge gestationnel (SA)', type: 'texte', requis: true, aide: 'Semaines d’aménorrhée, ou NA' },
        ],
      },
      {
        titre: 'Traitement antirétroviral',
        champs: [
          {
            k: 'statutArv',
            libelle: 'Statut ARV à l’enregistrement',
            type: 'choix',
            options: ['Positif sans ARV', 'Positif déjà sous ARV', 'Nouvellement diagnostiquée VIH Positif au cours du mois'],
            requis: true,
            large: true,
          },
          { k: 'dateInitiationArv', libelle: 'Date d’initiation du traitement ARV', type: 'date', requis: true },
          { k: 'mereSousArv', libelle: 'Mère toujours sous ARV ?', type: 'choix', options: OUI_NON, requis: true },
          { k: 'cotrimoxazole', libelle: 'Cotrimoxazole', type: 'choix', options: OUI_NON, requis: true },
        ],
      },
      {
        titre: 'Charge virale',
        champs: [
          { k: 'prelevementChargeVirale', libelle: 'Prélèvement pour charge virale', type: 'choix', options: OUI_NON, requis: true },
          { k: 'datePrelevementVirale', libelle: 'Date de prélèvement', type: 'date', requis: true, si: (v) => v.prelevementChargeVirale === 'Oui' },
          { k: 'dateReceptionResultat', libelle: 'Date de réception du résultat', type: 'date', requis: true, si: (v) => v.prelevementChargeVirale === 'Oui' },
          { k: 'resultatChargeVirale', libelle: 'Résultat / valeur', type: 'texte', requis: true, si: (v) => v.prelevementChargeVirale === 'Oui' },
        ],
      },
    ],
  },
  {
    titre: 'Conjoint & grossesse',
    detail: 'Dépistage, VIH, issue',
    sections: [
      {
        titre: 'Dépistage VIH du conjoint',
        champs: [
          { k: 'depistageVihConjoint', libelle: 'Dépistage VIH du conjoint', type: 'choix', options: [...OUI_NON, 'NA'], requis: true },
          { k: 'resultatVihConjoint', libelle: 'Résultat', type: 'choix', options: [...POS_NEG, 'NA'], requis: true, si: (v) => v.depistageVihConjoint === 'Oui' },
          { k: 'dateDepistageVihConjoint', libelle: 'Date de dépistage', type: 'date', requis: true, si: (v) => v.depistageVihConjoint === 'Oui' },
        ],
      },
      {
        titre: 'VIH et grossesse',
        champs: [
          { k: 'porteEntree', libelle: 'Porte d’entrée', type: 'choix', options: ['Consultation prénatale', 'Accouchement', 'Postnatales'], requis: true },
          { k: 'typeVih', libelle: 'Type de VIH', type: 'choix', options: ['VIH 1', 'VIH 2', 'VIH 3'], requis: true },
          { k: 'dateProbableAccouchement', libelle: 'Date probable d’accouchement', type: 'date', requis: true },
          { k: 'issueGrossesse', libelle: 'Issue de la grossesse', type: 'choix', options: ['A terme', 'Prématuré', 'Avortement / Fausse couche'], requis: true },
          { k: 'accouchementGemellaire', libelle: 'Accouchement gémellaire', type: 'choix', options: OUI_NON, requis: true },
          { k: 'contraceptionModerne', libelle: 'Méthode de contraception moderne', type: 'choix', options: OUI_NON, requis: true },
        ],
      },
    ],
  },
];

/** Un examen répété (PCR, sérologie) : date, âge, résultat, annonce aux parents, date d'annonce */
const examen = (p: string, titre: string, libelleDate = 'Date du prélèvement', libelleAge = 'Âge au moment du prélèvement') => ({
  titre,
  champs: [
    { k: `${p}Date`, libelle: libelleDate, type: 'date' as const, requis: true },
    { k: `${p}Age`, libelle: libelleAge, type: 'texte' as const, requis: true, aide: 'Ex. 6 semaines' },
    { k: `${p}Resultat`, libelle: 'Résultat', type: 'choix' as const, options: POS_NEG, requis: true },
    { k: `${p}Annonce`, libelle: 'Annonce du résultat aux parents', type: 'choix' as const, options: OUI_NON, requis: true },
    { k: `${p}DateAnnonce`, libelle: 'Date d’annonce', type: 'date' as const, requis: true, si: (v: Valeurs) => v[`${p}Annonce`] === 'Oui' },
  ],
});

// ======================= SUIVI POSTNATAL (ENFANT EXPOSÉ) =======================
export const ETAPES_POSTNATAL: Etape[] = [
  {
    titre: 'Enfant & visite',
    detail: 'Identité, prophylaxie, alimentation',
    sections: [
      {
        titre: 'Informations relatives à l’enfant',
        champs: [
          { k: 'nomEnfant', libelle: 'Nom de l’enfant', type: 'texte', aide: 'Nom et prénoms mis à jour s’ils sont tous deux renseignés' },
          { k: 'prenomEnfant', libelle: 'Prénom(s) de l’enfant', type: 'texte' },
        ],
      },
      {
        titre: 'Visite',
        champs: [
          { k: 'dateVisite', libelle: 'Date de la visite', type: 'date', requis: true },
          { k: 'ageVisite', libelle: 'Âge au moment de la visite', type: 'texte', requis: true, aide: 'Ex. 6 semaines' },
          { k: 'prophylaxieArvEnfant', libelle: 'Prophylaxie ARV remise à l’enfant', type: 'choix', options: OUI_NON, requis: true },
          { k: 'dateRemise', libelle: 'Date de remise', type: 'date', requis: true, si: (v) => v.prophylaxieArvEnfant === 'Oui' },
          {
            k: 'typeAlimentation',
            libelle: 'Type d’alimentation',
            type: 'choix',
            options: ['Allaitement exclusif', 'Alimentation de remplacement exclusif', 'Alimentation de complément'],
            requis: true,
            large: true,
          },
        ],
      },
    ],
  },
  {
    titre: 'PCR',
    detail: '1er, 2e et 3e PCR',
    sections: [examen('pcr1', '1er PCR'), examen('pcr2', '2e PCR'), examen('pcr3', '3e PCR')],
  },
  {
    titre: 'Traitements & résultat',
    detail: 'CTX, INH, sérologies, résultat final',
    sections: [
      {
        titre: 'Cotrimoxazole (CTX)',
        champs: [
          { k: 'sousCtx', libelle: 'Enfant sous CTX', type: 'choix', options: OUI_NON, requis: true },
          { k: 'ctxDate', libelle: 'Date d’initiation du CTX', type: 'date', requis: true, si: (v) => v.sousCtx === 'Oui' },
          { k: 'ctxAge', libelle: 'Âge à l’initiation du CTX', type: 'texte', requis: true, si: (v) => v.sousCtx === 'Oui' },
        ],
      },
      {
        titre: 'Prophylaxie à l’isoniazide (INH)',
        champs: [
          { k: 'sousInh', libelle: 'Enfant sous INH', type: 'choix', options: OUI_NON, requis: true },
          { k: 'inhDate', libelle: 'Date d’initiation de l’INH', type: 'date', requis: true, si: (v) => v.sousInh === 'Oui' },
          { k: 'inhAge', libelle: 'Âge à l’initiation de l’INH', type: 'texte', requis: true, si: (v) => v.sousInh === 'Oui' },
        ],
      },
      examen('sero1', 'Sérologie VIH (1)', 'Date', 'Âge au moment du test'),
      examen('sero2', 'Sérologie VIH (2)', 'Date', 'Âge au moment du test'),
      {
        titre: 'Résultat final du suivi',
        champs: [
          {
            k: 'resultatFinal',
            libelle: 'Résultat',
            type: 'choix',
            options: ['Négatif sorti du programme', 'Perdu de vue', 'Décédé', 'Positif adressé pour la PEC', 'Positif non mis sous ARV', 'Transferé', 'Réferé'],
            requis: true,
            large: true,
          },
          { k: 'siteTransfert', libelle: 'Site de transfert ou de référence', type: 'texte', si: (v) => v.resultatFinal === 'Transferé' || v.resultatFinal === 'Réferé' },
          { k: 'dateStatutFinal', libelle: 'Date du statut final', type: 'date' },
        ],
      },
    ],
  },
];

/** Champs visibles et obligatoires non remplis d'une étape (premier message d'erreur) */
export function manquant(etape: Etape, v: Valeurs): string | null {
  for (const sec of etape.sections) {
    for (const c of sec.champs) {
      if (c.requis && (!c.si || c.si(v)) && !String(v[c.k] ?? '').trim()) return `${sec.titre} : ${c.libelle.charAt(0).toLowerCase()}${c.libelle.slice(1)} est obligatoire.`;
    }
  }
  return null;
}

/** Valeurs à envoyer : seulement les champs affichés et remplis */
export function aEnvoyer(etapes: Etape[], v: Valeurs) {
  const out: Valeurs = {};
  for (const e of etapes) for (const sec of e.sections) for (const c of sec.champs) if ((!c.si || c.si(v)) && String(v[c.k] ?? '').trim()) out[c.k] = String(v[c.k]).trim();
  return out;
}
