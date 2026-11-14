import { FaBaby, FaFlask, FaHistory, FaStethoscope } from 'react-icons/fa';
import s from './FormulaireConsultation.module.css';
import p from './FormulairePrenatal.module.css';

/** Reprise des antécédents de la visite précédente de la patiente */
export interface RepriseMaternite {
  date: string;
  source: 'prenatale' | 'postnatale';
  detail: string | null;
}

/** Valeurs du registre CPN : clés = colonnes de registre_consultation_pre_natales (texte, dates « JJ/MM/AAAA ») */
export type ValeursPrenatales = Record<string, string | null>;

/** Étapes propres à la consultation prénatale (suivies des étapes communes Prescriptions et Issue) */
export const ETAPES_PRENATALES = [
  { titre: 'Visite & antécédents', detail: 'Grossesse, VAT, VIH', icone: FaBaby },
  { titre: 'Examen clinique', detail: 'Général & obstétrical', icone: FaStethoscope },
  { titre: 'Biologie & suivi', detail: 'Examens, CPN, rendez-vous', icone: FaFlask },
];

// ---------- Dates « JJ/MM/AAAA » (format Laravel) ↔ champ date ----------
export const versIso = (d: string | null) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
export const versFr = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};
const ajouterJours = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export type Opt = [valeur: string, libelle: string];
const OUI_NON: Opt[] = [
  ['oui', 'Oui'],
  ['non', 'Non'],
];
const OUI_NON_NA: Opt[] = [...OUI_NON, ['na', 'NA']];
const OUI_NON_NA_MAJ: Opt[] = [
  ['Oui', 'Oui'],
  ['Non', 'Non'],
  ['NA', 'NA'],
];
const POS_NEG: Opt[] = [
  ['positif', 'Positif'],
  ['negatif', 'Négatif'],
];
const NEG_POS_NA: Opt[] = [
  ['negatif', 'Négatif'],
  ['positif', 'Positif'],
  ['na', 'NA'],
];
export const TYPES_VISITE: Opt[] = [
  ['cpn1_1erT', 'CPN1 au 1er trimestre'],
  ['cpn1_autreT', 'CPN1 autre trimestre'],
  ['cpn2', 'CPN2'],
  ['cpn3', 'CPN3'],
  ['cpn4_9e_mois', 'CPN4 au 9e mois'],
  ['cpn4_autreT', 'CPN4 autre trimestre'],
  ['cpn5_plus', 'CPN5 et plus'],
];
const PRESCRIPTIONS_CPN: Opt[] = [
  ['Fer', 'Fer'],
  ['Folates', 'Folates'],
  ['SP1', 'SP1'],
  ['SP2', 'SP2'],
  ['SP3', 'SP3'],
  ['SP4', 'SP4'],
  ['SP5+', 'SP5 et plus'],
  ['Fluor', 'Fluor'],
  ['Milda', 'MILDA'],
  ['Déparasitant', 'Déparasitant'],
  ['CTX', 'CTX'],
  ['ARV', 'Initiation ARV'],
];

/** Choix segmenté (cliquer à nouveau sur la valeur choisie la retire) */
export function Segments({ valeur, options, onChange, nom }: { valeur: string | null; options: Opt[]; onChange: (v: string | null) => void; nom: string }) {
  return (
    <div className={s.segments} role="radiogroup" aria-label={nom}>
      {options.map(([val, lib]) => (
        <button key={val} type="button" role="radio" aria-checked={valeur === val} className={valeur === val ? s.segmentActif : ''} onClick={() => onChange(valeur === val ? null : val)}>
          {lib}
        </button>
      ))}
    </div>
  );
}

interface Props {
  /** 0 : visite & antécédents · 1 : examen clinique · 2 : biologie & suivi */
  partie: number;
  v: ValeursPrenatales;
  onChange: (cle: string, valeur: string | null) => void;
  /** Antécédents repris de la visite précédente */
  reprise: RepriseMaternite | null;
}

/**
 * MÉDECIN > CONSULTATION PRÉNATALE (CPN) — étapes propres au registre prénatal
 * Repris de Laravel : users/doctor/consultation/formulaire/consultation/pre-natale.blade.php
 */
export default function FormulairePrenatal({ partie, v, onChange, reprise }: Props) {
  const val = (k: string) => v[k] ?? null;
  const texte = (k: string, extra: Record<string, unknown> = {}) => ({ value: v[k] ?? '', onChange: (e: { target: { value: string } }) => onChange(k, e.target.value || null), ...extra });
  const nombre = (k: string) => ({ value: v[k] ?? '', inputMode: 'decimal' as const, onChange: (e: { target: { value: string } }) => onChange(k, e.target.value.replace(/[^\d.,]/g, '').slice(0, 6) || null) });
  const date = (k: string, max?: string) => ({ type: 'date', max, value: versIso(v[k] ?? null), onChange: (e: { target: { value: string } }) => onChange(k, versFr(e.target.value)) });
  const seg = (k: string, options: Opt[], nom: string) => <Segments nom={nom} valeur={val(k)} options={options} onChange={(x) => onChange(k, x)} />;
  const aujourdhui = new Date().toISOString().slice(0, 10);

  // DDR → terme prévu (DDR + 280 jours) et semaines d'aménorrhée à la date de la visite
  const saisirDdr = (iso: string) => {
    onChange('ddr', versFr(iso));
    if (!iso) return;
    onChange('terme_prevu', versFr(ajouterJours(iso, 280)));
    const visite = versIso(v.date_consultation ?? null) || aujourdhui;
    const sa = Math.floor((new Date(`${visite}T12:00:00`).getTime() - new Date(`${iso}T12:00:00`).getTime()) / (7 * 86400000));
    if (sa >= 0 && sa <= 45) {
      onChange('semaine_amenor', String(sa));
      if (!v.age_gest) onChange('age_gest', String(sa));
    }
  };

  const prescriptions = (v.prescription ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const basculerPrescription = (x: string) => {
    const liste = prescriptions.includes(x) ? prescriptions.filter((y) => y !== x) : [...prescriptions, x];
    onChange('prescription', liste.length ? liste.join(', ') : null);
  };

  const ligne = (libelle: string, contenu: React.ReactNode) => (
    <div className={s.ligneChoix}>
      <span>{libelle}</span>
      {contenu}
    </div>
  );

  // ======================= 1. VISITE & ANTÉCÉDENTS =======================
  if (partie === 0)
    return (
      <div className={s.sections}>
        <div className={s.titreEtape}>
          <FaBaby aria-hidden="true" />
          <div>
            <h2>Consultation prénatale · Visite & antécédents</h2>
            <p>Renseignements de la gestante, antécédents, grossesse en cours, vaccination et statut VIH.</p>
          </div>
        </div>

        {reprise && (
          <p className={p.reprise}>
            <FaHistory aria-hidden="true" /> Antécédents et grossesse repris de la CPN du {new Date(reprise.date).toLocaleDateString('fr-FR')}
            {reprise.detail ? ` (${TYPES_VISITE.find(([x]) => x === reprise.detail)?.[1] ?? reprise.detail})` : ''} : vérifiez et complétez.
          </p>
        )}

        <div>
          <h3 className={s.sousTitre}>Renseignements administratifs</h3>
          <div className={s.troisColonnes}>
            <label className={s.champ}>
              <span>Date de consultation</span>
              <input {...date('date_consultation', aujourdhui)} />
            </label>
            <label className={s.champ}>
              <span>N° gestante précédent (report)</span>
              <input maxLength={100} placeholder="08/B/2020/CPN2/R3/P15" {...texte('num_gest_prec')} />
            </label>
            <label className={s.champ}>
              <span>N° gestante de la visite</span>
              <input maxLength={100} placeholder="08/B/2020/CPN2/R3/P15" {...texte('num_gest_visite')} />
            </label>
            <label className={s.champ}>
              <span>Mode d’entrée</span>
              <select {...texte('mode_entree')}>
                <option value="">— Sélectionner —</option>
                <option value="Venue lui-même">Venue d’elle-même</option>
                <option value="Référée par un centre de santé">Référée par un centre de santé</option>
                <option value="Référée par un tradipraticien">Référée par un tradipraticien</option>
                <option value="autre">Autre</option>
              </select>
            </label>
            {v.mode_entree === 'Référée par un centre de santé' && (
              <label className={s.champ}>
                <span>Centre de santé</span>
                <input maxLength={191} placeholder="Préciser le centre" {...texte('preciser_centre')} />
              </label>
            )}
            {v.mode_entree === 'autre' && (
              <label className={s.champ}>
                <span>Autre mode d’entrée</span>
                <input maxLength={191} placeholder="Préciser" {...texte('preciser_autre')} />
              </label>
            )}
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Antécédents</h3>
          <div className={s.grilleChoix}>
            {ligne('HTA', seg('hta', OUI_NON, 'HTA'))}
            {ligne('Diabète', seg('diabete', OUI_NON, 'Diabète'))}
          </div>
          <div className={s.deuxColonnes}>
            <label className={s.champ}>
              <span>Antécédents chirurgicaux</span>
              <input maxLength={500} placeholder="Préciser…" {...texte('chirurgicaux')} />
            </label>
            <label className={s.champ}>
              <span>Antécédents obstétricaux</span>
              <input maxLength={500} placeholder="Préciser…" {...texte('obstetricaux')} />
            </label>
          </div>
          <div className={p.chiffres}>
            {(
              [
                ['gestite', 'Gestité'],
                ['parite', 'Parité'],
                ['enft_vivants', 'Enfants vivants'],
                ['enft_decedes', 'Enfants décédés'],
                ['cesarienne', 'Césariennes'],
                ['avortement', 'Avortements'],
                ['toxemie_grav', 'Toxémie gravidique'],
              ] as [string, string][]
            ).map(([k, l]) => (
              <label key={k} className={s.champ}>
                <span>{l}</span>
                <input placeholder="0" {...nombre(k)} />
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Grossesse en cours</h3>
          <div className={p.quatre}>
            <label className={s.champ}>
              <span>DDR (dernières règles)</span>
              <input type="date" max={aujourdhui} value={versIso(v.ddr ?? null)} onChange={(e) => saisirDdr(e.target.value)} />
            </label>
            <label className={s.champ}>
              <span>Terme prévu</span>
              <input {...date('terme_prevu')} />
            </label>
            <label className={s.champ}>
              <span>Date de la dernière CPN</span>
              <input {...date('derniere_cpn', aujourdhui)} />
            </label>
            <label className={s.champ}>
              <span>Semaines d’aménorrhée</span>
              <input placeholder="0" {...nombre('semaine_amenor')} />
            </label>
          </div>
          <div className={p.bloc}>
            <span className={p.etiquette}>Type de visite</span>
            {seg('type_visite', TYPES_VISITE, 'Type de visite')}
          </div>
          <label className={`${s.champ} ${p.court}`}>
            <span>Préciser la CPN</span>
            <input maxLength={100} placeholder="CPN…" {...texte('preciser_cpn')} />
          </label>
        </div>

        <div>
          <h3 className={s.sousTitre}>Vaccination antitétanique (VAT)</h3>
          <div className={s.troisColonnes}>
            <label className={s.champ}>
              <span>Date VAT 1</span>
              <input {...date('date_vat1', aujourdhui)} />
            </label>
            <label className={s.champ}>
              <span>Date VAT 2</span>
              <input {...date('date_vat2', aujourdhui)} />
            </label>
            <label className={s.champ}>
              <span>Date VAT rappel</span>
              <input {...date('date_vatR', aujourdhui)} />
            </label>
          </div>
          <div className={p.bloc}>
            <span className={p.etiquette}>Statut VAT</span>
            {seg(
              'status_vat',
              [
                ['non_vaccine', 'Non vaccinée'],
                ['incompletement_vaccine', 'Incomplètement vaccinée'],
                ['correctement_vaccine', 'Correctement vaccinée'],
              ],
              'Statut VAT',
            )}
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>VIH à l’accueil</h3>
          <div className={s.grilleChoix}>
            {ligne(
              'Statut VIH à l’accueil',
              seg(
                'status_vih',
                [
                  ['Oui', 'Positif'],
                  ['Non', 'Négatif'],
                  ['Inconnu', 'Inconnu'],
                ],
                'Statut VIH',
              ),
            )}
            {ligne('Proposition de test VIH', seg('prop_test', OUI_NON_NA_MAJ, 'Proposition de test'))}
            {ligne('Retesting', seg('retesting', OUI_NON_NA_MAJ, 'Retesting'))}
          </div>
          <div className={s.deuxColonnes}>
            {v.status_vih === 'Oui' && (
              <label className={s.champ}>
                <span>N° PEC</span>
                <input maxLength={100} placeholder="N° de prise en charge" {...texte('num_pec')} />
              </label>
            )}
            <label className={s.champ}>
              <span>N° de dépistage VIH</span>
              <input maxLength={100} placeholder="Préciser" {...texte('num_depistage')} />
            </label>
          </div>
        </div>
      </div>
    );

  // ======================= 2. EXAMEN CLINIQUE =======================
  if (partie === 1)
    return (
      <div className={s.sections}>
        <div className={s.titreEtape}>
          <FaStethoscope aria-hidden="true" />
          <div>
            <h2>Consultation prénatale · Examen clinique</h2>
            <p>Constantes, examen général, examen obstétrical, planification familiale et résultat de la consultation.</p>
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Constantes</h3>
          <div className={s.troisColonnes}>
            <label className={s.champ}>
              <span>Tension artérielle (mmHg)</span>
              <input maxLength={20} placeholder="12/8" {...texte('ta')} />
            </label>
            <label className={s.champ}>
              <span>Pouls (bpm)</span>
              <input placeholder="80" {...nombre('pouls')} />
            </label>
            <label className={s.champ}>
              <span>Périmètre brachial (cm)</span>
              <input placeholder="0" {...nombre('perimetre_brachial')} />
            </label>
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Examen général</h3>
          <div className={s.troisColonnes}>
            {(
              [
                ['conjonctives', 'Conjonctives'],
                ['seins', 'Seins'],
                ['vergetures', 'Vergetures'],
                ['varices', 'Varices'],
                ['oedemes', 'Œdèmes'],
                ['autres', 'Autres'],
              ] as [string, string][]
            ).map(([k, l]) => (
              <label key={k} className={s.champ}>
                <span>{l}</span>
                <input maxLength={191} placeholder="…" {...texte(k)} />
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Examen obstétrical</h3>
          <div className={s.troisColonnes}>
            {(
              [
                ['po', 'Poids (PO, kg)', true],
                ['hu', 'Hauteur utérine (HU, cm)', true],
                ['age_gest', 'Âge gestationnel (SA)', true],
                ['bdc', 'Bruits du cœur (BDC)', false],
                ['presentation', 'Présentation', false],
                ['tv', 'Toucher vaginal (TV)', false],
              ] as [string, string, boolean][]
            ).map(([k, l, num]) => (
              <label key={k} className={s.champ}>
                <span>{l}</span>
                {num ? <input placeholder="0" {...nombre(k)} /> : <input maxLength={191} placeholder="…" {...texte(k)} />}
              </label>
            ))}
          </div>
          <label className={`${s.champ} ${p.espace}`}>
            <span>Pathologies associées</span>
            <input maxLength={500} placeholder="…" {...texte('pathologie')} />
          </label>
          <div className={s.grilleChoix}>{ligne('Anémie clinique', seg('Anemie', OUI_NON_NA_MAJ.slice(0, 2), 'Anémie clinique'))}</div>
          <div className={p.bloc}>
            <span className={p.etiquette}>État nutritionnel</span>
            {seg(
              'etat_nutri',
              [
                ['Normal', 'Normal'],
                ['Malnutrition aigue modérée', 'Malnutrition aiguë modérée'],
                ['Malnutrition aigue sévère', 'Malnutrition aiguë sévère'],
                ['Surpoids', 'Surpoids'],
                ['Obésité', 'Obésité'],
              ],
              'État nutritionnel',
            )}
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Planification familiale (offre de service dans le PPI)</h3>
          <div className={s.grilleChoix}>{ligne('Conseil PF', seg('conseil_pf', OUI_NON, 'Conseil PF'))}</div>
          {v.conseil_pf === 'oui' && (
            <div className={p.bloc}>
              <span className={p.etiquette}>Méthode souhaitée</span>
              {seg(
                'methode',
                [
                  ['orale', 'Orale'],
                  ['injectable', 'Injectable'],
                  ['implant', 'Implant'],
                  ['diu', 'DIU'],
                ],
                'Méthode',
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className={s.sousTitre}>Résultat de la consultation</h3>
          {seg(
            'resultat_consultation',
            [
              ['grossesse-normale', 'Grossesse normale'],
              ['grossesse-risque', 'Grossesse à risque'],
            ],
            'Résultat de la consultation',
          )}
          {v.resultat_consultation === 'grossesse-risque' && <p className={p.alerte}>Grossesse à risque : à l’étape « Issue », référez ou hospitalisez la patiente si nécessaire.</p>}
        </div>
      </div>
    );

  // ======================= 3. BIOLOGIE & SUIVI =======================
  return (
    <div className={s.sections}>
      <div className={s.titreEtape}>
        <FaFlask aria-hidden="true" />
        <div>
          <h2>Consultation prénatale · Biologie & suivi</h2>
          <p>Examens biologiques, dépistages, prescriptions de la CPN et prochain rendez-vous.</p>
        </div>
      </div>

      <div>
        <h3 className={s.sousTitre}>Bilan sanguin</h3>
        <div className={s.troisColonnes}>
          <label className={s.champ}>
            <span>Groupe sanguin / Rhésus</span>
            <select {...texte('groupe_rhesus')}>
              <option value="">— Sélectionner —</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className={s.champ}>
            <span>Taux d’hémoglobine (g/dl)</span>
            <input placeholder="0" {...nombre('taux_hemoglo')} />
          </label>
          <label className={s.champ}>
            <span>Électrophorèse de l’hémoglobine</span>
            <input maxLength={100} placeholder="AA, AS…" {...texte('electrophèse')} />
          </label>
        </div>
      </div>

      <div>
        <h3 className={s.sousTitre}>Analyse d’urine</h3>
        <div className={s.grilleChoix}>
          {ligne('Albumine', seg('albumine', POS_NEG, 'Albumine'))}
          {ligne('Sucre', seg('sucre', POS_NEG, 'Sucre'))}
          {ligne('Nitrites / ECBU', seg('ecbu', POS_NEG, 'ECBU'))}
        </div>
      </div>

      <div>
        <h3 className={s.sousTitre}>Glycémie</h3>
        <div className={s.grilleChoix}>
          {ligne('Examen demandé', seg('glyc_exa', OUI_NON_NA, 'Glycémie demandée'))}
          {ligne('Résultat reçu', seg('glyc_recu', OUI_NON_NA, 'Glycémie reçue'))}
        </div>
        {v.glyc_recu === 'oui' && (
          <div className={s.deuxColonnes}>
            <label className={s.champ}>
              <span>Glycémie à jeun (g/l)</span>
              <input placeholder="0" {...nombre('resul_ajeun')} />
            </label>
            <label className={s.champ}>
              <span>Glycémie non à jeun (g/l)</span>
              <input placeholder="0" {...nombre('resul_najeun')} />
            </label>
          </div>
        )}
      </div>

      <div>
        <h3 className={s.sousTitre}>Dépistages</h3>
        <div className={p.tableau}>
          {(
            [
              ['Syphilis', 'syph_exa', 'syph_recu', 'resul_syph', OUI_NON],
              ['AgHBs (hépatite B)', 'agHBs_exa', 'agHBs_recu', 'agHBs_resul', OUI_NON_NA],
            ] as [string, string, string, string, Opt[]][]
          ).map(([l, exa, recu, res, opts]) => (
            <div key={l} className={p.depistage}>
              <strong>{l}</strong>
              <span>
                <small>Demandé</small>
                {seg(exa, opts, `${l} demandé`)}
              </span>
              <span>
                <small>Reçu</small>
                {seg(recu, opts, `${l} reçu`)}
              </span>
              <span>
                <small>Résultat</small>
                {seg(res, NEG_POS_NA, `${l} résultat`)}
              </span>
            </div>
          ))}
        </div>
        <div className={p.quatre}>
          <label className={s.champ}>
            <span>Toxoplasmose IgG</span>
            <input maxLength={50} {...texte('st_igG')} />
          </label>
          <label className={s.champ}>
            <span>Toxoplasmose IgM</span>
            <input maxLength={50} {...texte('st_igM')} />
          </label>
          <label className={s.champ}>
            <span>Rubéole IgG</span>
            <input maxLength={50} {...texte('sr_igG')} />
          </label>
          <label className={s.champ}>
            <span>Rubéole IgM</span>
            <input maxLength={50} {...texte('sr_igM')} />
          </label>
        </div>
      </div>

      <div>
        <h3 className={s.sousTitre}>VIH</h3>
        <div className={s.grilleChoix}>
          {ligne('Résultat du test de dépistage', seg('resultat_vih', NEG_POS_NA, 'Résultat VIH'))}
          {ligne('Annonce du résultat', seg('annonce_vih', OUI_NON_NA, 'Annonce du résultat'))}
          {ligne('Dépistage du conjoint', seg('conjoint_vih', OUI_NON_NA, 'Dépistage du conjoint'))}
          {ligne('Statut du conjoint', seg('status_vih_conjoint', NEG_POS_NA, 'Statut du conjoint'))}
          {ligne('Prélèvement charge virale', seg('Prel_charge', OUI_NON_NA, 'Prélèvement charge virale'))}
          {ligne('Charge virale ≤ 1000 copies/ml (3e trimestre)', seg('cv_inf1000', OUI_NON_NA, 'Charge virale'))}
        </div>
      </div>

      <div className={s.deuxColonnes}>
        <label className={s.champ}>
          <span>Autres examens biologiques</span>
          <textarea rows={2} maxLength={2000} placeholder="Préciser…" {...texte('autres_exa')} />
        </label>
        <label className={s.champ}>
          <span>Échographie / radiologie</span>
          <textarea rows={2} maxLength={2000} placeholder="Préciser…" {...texte('exa_echo')} />
        </label>
      </div>

      <div>
        <h3 className={s.sousTitre}>Prescriptions de la CPN</h3>
        <div className={p.puces}>
          {PRESCRIPTIONS_CPN.map(([x, l]) => (
            <button key={x} type="button" className={`${s.puceChoix} ${prescriptions.includes(x) ? s.puceChoixActive : ''}`} aria-pressed={prescriptions.includes(x)} onClick={() => basculerPrescription(x)}>
              {l}
            </button>
          ))}
        </div>
        <label className={`${s.champ} ${p.espace}`}>
          <span>Autres médicaments</span>
          <input maxLength={500} placeholder="Préciser (ou utilisez l’ordonnance à l’étape suivante)" {...texte('autre_medic')} />
        </label>
      </div>

      <div>
        <h3 className={s.sousTitre}>Nutrition et prochain rendez-vous</h3>
        <div className={s.grilleChoix}>
          {ligne('Conseil nutritionnel', seg('conseil_nutri', OUI_NON_NA_MAJ.slice(0, 2), 'Conseil nutritionnel'))}
          {ligne('Service nutritionnel', seg('service_nutri', OUI_NON_NA_MAJ.slice(0, 2), 'Service nutritionnel'))}
        </div>
        <div className={s.deuxColonnes}>
          {v.service_nutri === 'Oui' && (
            <label className={s.champ}>
              <span>Service nutritionnel</span>
              <input maxLength={191} placeholder="Préciser le service" {...texte('prec_sn')} />
            </label>
          )}
          <label className={s.champ}>
            <span>Date du prochain rendez-vous</span>
            <input {...date('date_prochain_rdv')} min={aujourdhui} />
          </label>
        </div>
      </div>
    </div>
  );
}
