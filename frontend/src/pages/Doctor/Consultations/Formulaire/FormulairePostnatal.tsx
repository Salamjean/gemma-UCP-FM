import { FaBaby, FaHistory, FaHandHoldingHeart, FaStethoscope } from 'react-icons/fa';
import s from './FormulaireConsultation.module.css';
import { type Opt, type RepriseMaternite, Segments, TYPES_VISITE, type ValeursPrenatales, versFr, versIso } from './FormulairePrenatal';
import p from './FormulairePrenatal.module.css';

/** Étapes propres à la consultation postnatale (suivies des étapes communes Prescriptions et Issue) */
export const ETAPES_POSTNATALES = [
  { titre: 'Visite & antécédents', detail: 'Accouchement, VAT, VIH', icone: FaBaby },
  { titre: 'Examen de la mère', detail: 'Général, gynécologique, enfant', icone: FaStethoscope },
  { titre: 'Conduite & suivi', detail: 'VIH, PF, résultat, rendez-vous', icone: FaHandHoldingHeart },
];

const OUI_NON: Opt[] = [
  ['Oui', 'Oui'],
  ['Non', 'Non'],
];
const OUI_NON_NA: Opt[] = [...OUI_NON, ['NA', 'NA']];
const oui_non: Opt[] = [
  ['oui', 'Oui'],
  ['non', 'Non'],
];
const POS_NEG: Opt[] = [
  ['Positif', 'Positif'],
  ['Négatif', 'Négatif'],
];

/** Constantes de la consultation (mêmes champs que le formulaire curatif : complètent celles de l'infirmier·ère) */
const CONSTANTES: [cle: string, libelle: string][] = [
  ['tension', 'Tension (mmHg)'],
  ['temperature', 'Température (°C)'],
  ['pouls', 'Pouls (bpm)'],
  ['saturation', 'Saturation O₂ (%)'],
  ['poids', 'Poids (kg)'],
  ['taille', 'Taille (cm)'],
  ['glycemieAJeun', 'Glycémie à jeun (g/l)'],
  ['glycemieNonAJeun', 'Glycémie non à jeun (g/l)'],
];

interface Props {
  /** 0 : visite & antécédents · 1 : examen de la mère · 2 : conduite & suivi */
  partie: number;
  v: ValeursPrenatales;
  onChange: (cle: string, valeur: string | null) => void;
  reprise: RepriseMaternite | null;
  /** Constantes de la consultation (valeurs du formulaire commun) */
  constantes: Record<string, string | null>;
  onConstante: (cle: string, valeur: string | null) => void;
}

/**
 * MÉDECIN > CONSULTATION POSTNATALE — étapes propres au registre postnatal
 * Repris de Laravel : users/doctor/consultation/formulaire/consultation/post-natale.blade.php
 */
export default function FormulairePostnatal({ partie, v, onChange, reprise, constantes, onConstante }: Props) {
  const val = (k: string) => v[k] ?? null;
  const texte = (k: string) => ({ value: v[k] ?? '', onChange: (e: { target: { value: string } }) => onChange(k, e.target.value || null) });
  const nombre = (k: string) => ({ value: v[k] ?? '', inputMode: 'decimal' as const, onChange: (e: { target: { value: string } }) => onChange(k, e.target.value.replace(/[^\d.,]/g, '').slice(0, 6) || null) });
  const date = (k: string, max?: string) => ({ type: 'date', max, value: versIso(v[k] ?? null), onChange: (e: { target: { value: string } }) => onChange(k, versFr(e.target.value)) });
  const seg = (k: string, options: Opt[], nom: string) => <Segments nom={nom} valeur={val(k)} options={options} onChange={(x) => onChange(k, x)} />;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const ligne = (libelle: string, contenu: React.ReactNode) => (
    <div className={s.ligneChoix}>
      <span>{libelle}</span>
      {contenu}
    </div>
  );
  const champsTexte = (liste: [string, string][]) => (
    <div className={s.troisColonnes}>
      {liste.map(([k, l]) => (
        <label key={k} className={s.champ}>
          <span>{l}</span>
          <input maxLength={191} placeholder="…" {...texte(k)} />
        </label>
      ))}
    </div>
  );

  // ======================= 1. VISITE & ANTÉCÉDENTS =======================
  if (partie === 0)
    return (
      <div className={s.sections}>
        <div className={s.titreEtape}>
          <FaBaby aria-hidden="true" />
          <div>
            <h2>Consultation postnatale · Visite & antécédents</h2>
            <p>Renseignements de la patiente, antécédents, accouchement, vaccination et statut VIH.</p>
          </div>
        </div>

        {reprise && (
          <p className={p.reprise}>
            <FaHistory aria-hidden="true" /> Antécédents repris de la {reprise.source === 'prenatale' ? 'dernière CPN' : 'consultation postnatale'} du {new Date(reprise.date).toLocaleDateString('fr-FR')}
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
              <span>N° gestante</span>
              <input maxLength={100} placeholder="08/B/2020/CPN2/R3/P15" {...texte('numero_gestante')} />
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
            <label className={s.champ}>
              <span>Type de consultation postnatale</span>
              <select {...texte('type_consultation_postnatale')}>
                <option value="">— Sélectionner —</option>
                {['06 à 72 heures', '06 à 10 jours', '06 à 08 semaines', 'Autre'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className={s.champ}>
              <span>Type de population</span>
              <select {...texte('type_population')}>
                <option value="">— Sélectionner —</option>
                <option value="Population général">Population générale</option>
                {['TS', 'UD', 'HSH', 'PC'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <div className={s.champ}>
              <span>En cours de scolarisation</span>
              {seg(
                'eleve',
                [
                  ['oui', 'Oui'],
                  ['non', 'Non'],
                  ['na', 'NA'],
                ],
                'Scolarisation',
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Antécédents</h3>
          <div className={s.grilleChoix}>
            {ligne('HTA', seg('antecedent_hta', OUI_NON, 'HTA'))}
            {ligne('Diabète', seg('antecedent_diabete', OUI_NON, 'Diabète'))}
          </div>
          <div className={s.troisColonnes}>
            <label className={s.champ}>
              <span>Autres antécédents médicaux</span>
              <input maxLength={500} placeholder="Préciser…" {...texte('antecedent_autre')} />
            </label>
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
                ['nb_enfant_vivant', 'Enfants vivants'],
                ['enfant_decede', 'Enfants décédés'],
                ['cesarienne', 'Césariennes'],
                ['Avortement', 'Avortements'],
                ['toxemie', 'Toxémie gravidique'],
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
          <h3 className={s.sousTitre}>Accouchement</h3>
          <div className={s.troisColonnes}>
            <label className={s.champ}>
              <span>Date de l’accouchement</span>
              <input {...date('date_accouchement', aujourdhui)} />
            </label>
            <div className={s.champ}>
              <span>Lieu d’accouchement</span>
              {seg(
                'antecedent_lieu_accouch',
                [
                  ['En établissement de soins', 'Établissement de soins'],
                  ['A domicile', 'À domicile'],
                ],
                'Lieu d’accouchement',
              )}
            </div>
            <div className={s.champ}>
              <span>Mode d’accouchement</span>
              {seg(
                'antecedent_mode_accouch',
                [
                  ['Voie basse', 'Voie basse'],
                  ['Césarienne', 'Césarienne'],
                ],
                'Mode d’accouchement',
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Vaccination antitétanique (VAT) et VIH</h3>
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
              <input {...date('date_vat_rappel', aujourdhui)} />
            </label>
          </div>
          <div className={p.bloc}>
            <span className={p.etiquette}>Statut VAT</span>
            {seg(
              'etat_vaccination',
              [
                ['Non Vacciné', 'Non vaccinée'],
                ['Incomplètement vacciné', 'Incomplètement vaccinée'],
                ['Correctement vacciné', 'Correctement vaccinée'],
              ],
              'Statut VAT',
            )}
          </div>
          <div className={p.bloc}>
            <span className={p.etiquette}>Statut VIH à l’accueil</span>
            {seg('status_vih', [...POS_NEG, ['Inconnu', 'Inconnu']], 'Statut VIH')}
          </div>
        </div>
      </div>
    );

  // ======================= 2. EXAMEN DE LA MÈRE =======================
  if (partie === 1)
    return (
      <div className={s.sections}>
        <div className={s.titreEtape}>
          <FaStethoscope aria-hidden="true" />
          <div>
            <h2>Consultation postnatale · Examen de la mère</h2>
            <p>Constantes, examen général, examen gynécologique, enfant, allaitement et nutrition.</p>
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Constantes</h3>
          <div className={p.quatre}>
            {CONSTANTES.map(([k, l]) => (
              <label key={k} className={s.champ}>
                <span>{l}</span>
                <input maxLength={20} value={constantes[k] ?? ''} onChange={(e) => onConstante(k, e.target.value || null)} />
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Examen général</h3>
          {champsTexte([
            ['pb', 'Périmètre brachial (PB)'],
            ['oedemes', 'Œdèmes'],
            ['varics', 'Varices'],
            ['etat_conjonctives', 'État des conjonctives'],
            ['conscience', 'Conscience'],
            ['seins', 'Seins'],
            ['abdomen', 'Abdomen'],
            ['globe_uterin', 'Globe utérin'],
          ])}
        </div>

        <div>
          <h3 className={s.sousTitre}>Examen gynécologique</h3>
          {champsTexte([
            ['examen_perine', 'Examen du périnée'],
            ['vulve', 'Vulve'],
            ['uterus', 'Utérus'],
            ['vessie', 'Vessie'],
            ['lochies', 'Lochies'],
            ['examen_speculum', 'Examen au spéculum'],
            ['test_acide_acetique', 'Test à l’acide acétique'],
            ['tv', 'Toucher vaginal (TV)'],
          ])}
          <label className={`${s.champ} ${p.espace}`}>
            <span>Pathologies associées</span>
            <input maxLength={500} placeholder="…" {...texte('patologies_associees')} />
          </label>
        </div>

        <div>
          <h3 className={s.sousTitre}>Enfant, allaitement et nutrition</h3>
          <div className={s.grilleChoix}>
            {ligne('Enfant vivant', seg('enfant_vivant', OUI_NON, 'Enfant vivant'))}
            {ligne('Enfant à jour de ses vaccins', seg('enfant_jour_vaccin', OUI_NON, 'Vaccins de l’enfant'))}
            {ligne('Femme allaitante', seg('femme_allaitante', OUI_NON, 'Femme allaitante'))}
            {ligne('Allaitement exclusif', seg('allaitement_exlusif', OUI_NON, 'Allaitement exclusif'))}
            {ligne('Conseil en alimentation de la mère', seg('conseil_alimentation_mere', OUI_NON, 'Alimentation de la mère'))}
            {ligne('Conseil en alimentation de l’enfant', seg('conseil_alimentation_enfant', OUI_NON, 'Alimentation de l’enfant'))}
            {ligne('Retour de couches', seg('retour_couche', OUI_NON, 'Retour de couches'))}
          </div>
          {v.allaitement_exlusif === 'Non' && (
            <label className={`${s.champ} ${p.espace}`}>
              <span>Autre type d’allaitement</span>
              <input maxLength={191} placeholder="Mixte, artificiel…" {...texte('autre_type_allaitement')} />
            </label>
          )}
          <div className={p.bloc}>
            <span className={p.etiquette}>État nutritionnel</span>
            {seg(
              'etat_nutritionnel',
              [
                ['Normal', 'Normal'],
                ['Malnutrition aigue modérée', 'Malnutrition aiguë modérée'],
                ['Aigue sévère', 'Malnutrition aiguë sévère'],
                ['Surpoids', 'Surpoids'],
                ['Obésité', 'Obésité'],
              ],
              'État nutritionnel',
            )}
          </div>
        </div>
      </div>
    );

  // ======================= 3. CONDUITE & SUIVI =======================
  return (
    <div className={s.sections}>
      <div className={s.titreEtape}>
        <FaHandHoldingHeart aria-hidden="true" />
        <div>
          <h2>Consultation postnatale · Conduite & suivi</h2>
          <p>Dépistage VIH, examens biologiques, planification familiale, nutrition, résultat et prochain rendez-vous.</p>
        </div>
      </div>

      <div>
        <h3 className={s.sousTitre}>Conduite à tenir · VIH</h3>
        <div className={s.grilleChoix}>
          {ligne('Proposition de test VIH', seg('proposition_test_vih', OUI_NON_NA, 'Proposition de test'))}
          {ligne('Retesting', seg('retesting', OUI_NON_NA, 'Retesting'))}
          {ligne(
            'Résultat du test de dépistage',
            seg(
              'resultat_test_depistage_vih',
              [
                ['Négatif', 'Négatif'],
                ['Positif', 'Positif'],
                ['NA', 'NA'],
              ],
              'Résultat VIH',
            ),
          )}
          {ligne('Annonce du résultat', seg('annonce_resultat', OUI_NON, 'Annonce du résultat'))}
          {ligne('Prophylaxie ARV pour l’enfant', seg('prophylaxie', OUI_NON, 'Prophylaxie ARV'))}
        </div>
        <label className={`${s.champ} ${p.court}`}>
          <span>N° de dépistage VIH</span>
          <input maxLength={100} placeholder="Préciser" {...texte('numero_depistage_vih')} />
        </label>
      </div>

      <div>
        <h3 className={s.sousTitre}>Examens biologiques</h3>
        <div className={s.grilleChoix}>
          {ligne('Albumine (urines)', seg('analyse_urine_albumine', POS_NEG, 'Albumine'))}
          {ligne('Sucre (urines)', seg('analyse_urine_sucre', POS_NEG, 'Sucre'))}
          {ligne(
            'Glycémie',
            seg(
              'glycemie',
              [
                ['Réaliser', 'Réalisée'],
                ['Non réaliser', 'Non réalisée'],
              ],
              'Glycémie',
            ),
          )}
        </div>
      </div>

      <div>
        <h3 className={s.sousTitre}>Planification familiale</h3>
        <div className={s.grilleChoix}>
          {ligne('Conseil PF-PP1 (avant la sortie)', seg('conseil_pf_pp1', OUI_NON, 'Conseil PF-PP1'))}
          {ligne('Conseil PF-PP tardif (48 h à 6 semaines)', seg('conseil_pf_ppt', OUI_NON, 'Conseil PF-PP tardif'))}
          {ligne('Conseil PF-PP prolongé (6 semaines à 1 an)', seg('conseil_pf_ppp', OUI_NON, 'Conseil PF-PP prolongé'))}
          {ligne('Offre de service : conseil PF-PP1', seg('offre_service_pf_conseil_pf_ppp1', oui_non, 'Offre PF-PP1'))}
          {ligne('Offre de service : conseil PF-PP', seg('offre_service_pf_conseil_pf_ppp', oui_non, 'Offre PF-PP'))}
          {ligne('Acceptation de méthodes contraceptives', seg('acceptation_methodes_contraceptives', [...oui_non, ['na', 'NA']], 'Acceptation'))}
        </div>
        {v.acceptation_methodes_contraceptives === 'oui' && (
          <div className={p.bloc}>
            <span className={p.etiquette}>Type de méthode acceptée</span>
            {seg(
              'acceptation_methodes_contraceptives_precision',
              [
                ['oral', 'Orale'],
                ['injectable', 'Injectable'],
                ['implant', 'Implant'],
                ['diu', 'DIU'],
              ],
              'Type de méthode',
            )}
          </div>
        )}
        <div className={p.bloc}>
          <span className={p.etiquette}>Méthode adoptée</span>
          {seg(
            'methode_adoptee',
            [
              ['Orale', 'Orale'],
              ['Injectable', 'Injectable'],
              ['Implant', 'Implant'],
              ['DIU', 'DIU'],
              ['Permanente', 'Permanente'],
              ['Aucune', 'Aucune'],
            ],
            'Méthode adoptée',
          )}
        </div>
      </div>

      <div>
        <h3 className={s.sousTitre}>Nutrition</h3>
        <div className={s.grilleChoix}>{ligne('Offre de service nutritionnel', seg('offre_service_nutritionnel', oui_non, 'Offre nutritionnelle'))}</div>
        {v.offre_service_nutritionnel === 'oui' && (
          <label className={`${s.champ} ${p.espace}`}>
            <span>Précisez le service</span>
            <input maxLength={191} {...texte('offre_service_nutritionnel_oui_precision')} />
          </label>
        )}
      </div>

      <div>
        <h3 className={s.sousTitre}>Résultat de la consultation</h3>
        {seg(
          'resultat_consultation',
          [
            ['visite post natale normale', 'Visite postnatale normale'],
            ['visite post natale avec complication', 'Avec complication'],
          ],
          'Résultat',
        )}
        {v.resultat_consultation === 'visite post natale avec complication' && (
          <>
            <label className={`${s.champ} ${p.espace}`}>
              <span>Précisez la complication</span>
              <input maxLength={500} {...texte('resultat_consultation_oui_precision')} />
            </label>
            <p className={p.alerte}>Complication : à l’étape « Issue », référez ou hospitalisez la patiente si nécessaire.</p>
          </>
        )}
        <div className={s.deuxColonnes}>
          <label className={s.champ}>
            <span>Observation</span>
            <textarea rows={2} maxLength={2000} {...texte('observation')} />
          </label>
          <label className={s.champ}>
            <span>Date du prochain rendez-vous</span>
            <input {...date('date_prochain_rdv')} min={aujourdhui} />
          </label>
        </div>
      </div>
    </div>
  );
}
