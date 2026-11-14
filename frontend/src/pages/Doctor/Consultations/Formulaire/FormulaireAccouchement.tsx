import { useState } from 'react';
import { FaBaby, FaCertificate, FaHistory, FaHospitalUser, FaPlus, FaProcedures, FaTimes, FaUserNurse } from 'react-icons/fa';
import s from './FormulaireConsultation.module.css';
import { type Opt, type RepriseMaternite, Segments, TYPES_VISITE, type ValeursPrenatales, versFr, versIso } from './FormulairePrenatal';
import p from './FormulairePrenatal.module.css';
import a from './FormulaireAccouchement.module.css';

/** Étapes propres à l'accouchement (suivies des étapes communes Prescriptions et Issue) */
export const ETAPES_ACCOUCHEMENT = [
  { titre: 'Admission', detail: 'Entrée, antécédents, examen', icone: FaHospitalUser },
  { titre: 'Accouchement', detail: 'Travail, délivrance, post-partum', icone: FaProcedures },
  { titre: 'Nouveau-né', detail: 'Apgar, réanimation, soins', icone: FaBaby },
  { titre: 'Suivi de la mère', detail: 'VIH, PF, évacuation, sortie', icone: FaUserNurse },
  { titre: 'Naissance', detail: 'Déclaration & certificat', icone: FaCertificate },
];

/** Un nouveau-né à déclarer */
export interface EnfantDeclare {
  genre: '' | 'masculin' | 'feminin';
  heure: string;
  etat: string;
  prenom: string;
}

/** Déclaration de naissance faite avec l'accouchement */
export interface NaissanceSaisie {
  /** null = pas encore répondu */
  declarer: boolean | null;
  date: string;
  lieu: string;
  observations: string;
  enfants: EnfantDeclare[];
}

export const naissanceVide = (): NaissanceSaisie => ({ declarer: null, date: '', lieu: '', observations: '', enfants: [] });

const LIEUX_NAISSANCE = ['Salle d’accouchement', 'Déjà née à l’arrivée', 'Service d’hospitalisation', 'En cours de consultation', 'Aux urgences', 'En cours d’évacuation'];
const ETATS_ENFANT = ['Vivant à terme', 'Vivant prématuré', 'Vivant post-terme'];

const OUI_NON: Opt[] = [
  ['Oui', 'Oui'],
  ['Non', 'Non'],
];
const OUI_NON_NA: Opt[] = [...OUI_NON, ['NA', 'NA']];

/** Critères de l'indice d'Apgar (0, 1 ou 2 points chacun) */
const APGAR = ['Cœur', 'Respiration', 'Tonus', 'Couleur', 'Réflexes'];

/** Pré-remplit la déclaration avec le nouveau-né et l'accouchement (date / heure, sexe, état, jumeaux) */
export function preparerNaissance(v: ValeursPrenatales, actuelle: NaissanceSaisie): NaissanceSaisie {
  if (actuelle.enfants.length) return actuelle;
  const [date, heure] = (v.date_accouchement ?? '').split('T');
  const genre: EnfantDeclare['genre'] = v.sexe_enfant === 'Masculin' ? 'masculin' : v.sexe_enfant === 'Feminin' ? 'feminin' : '';
  const etat = v.etat_nouveau_ne === 'Prematuré' ? 'Vivant prématuré' : v.etat_nouveau_ne === 'Post-terme' ? 'Vivant post-terme' : 'Vivant à terme';
  const nombre = Math.min(Math.max(parseInt(v.gemellite ?? '', 10) || 1, 1), 6);
  const mortNe = !!v.mort_ne;
  return {
    declarer: mortNe ? false : actuelle.declarer,
    date: date || new Date().toISOString().slice(0, 10),
    lieu: actuelle.lieu || (v.accouch_dom === 'Oui' ? 'Déjà née à l’arrivée' : 'Salle d’accouchement'),
    observations: actuelle.observations,
    enfants: Array.from({ length: nombre }, (_, i) => ({ genre: i === 0 ? genre : '', heure: heure?.slice(0, 5) ?? '', etat, prenom: '' })),
  };
}

interface Props {
  /** 0 admission · 1 accouchement · 2 nouveau-né · 3 suivi de la mère · 4 déclaration de naissance */
  partie: number;
  v: ValeursPrenatales;
  onChange: (cle: string, valeur: string | null) => void;
  reprise: RepriseMaternite | null;
  naissance: NaissanceSaisie;
  onNaissance: (n: NaissanceSaisie) => void;
  /** Nom de la mère (déclaration) */
  mere: string;
  /** Déclaration déjà faite (fiche terminée) */
  declaration: { id: number; reference: string } | null;
}

/**
 * MÉDECIN > ACCOUCHEMENT — étapes propres au registre d'accouchement + déclaration de naissance
 * Repris de Laravel (accouchement.blade.php + doctor.declaration.naissance), réordonné dans l'ordre des soins :
 * admission → accouchement & délivrance → nouveau-né → suivi de la mère → déclaration de naissance.
 */
export default function FormulaireAccouchement({ partie, v, onChange, reprise, naissance, onNaissance, mere, declaration }: Props) {
  const val = (k: string) => v[k] ?? null;
  const texte = (k: string) => ({ value: v[k] ?? '', onChange: (e: { target: { value: string } }) => onChange(k, e.target.value || null) });
  const nombre = (k: string) => ({ value: v[k] ?? '', inputMode: 'decimal' as const, onChange: (e: { target: { value: string } }) => onChange(k, e.target.value.replace(/[^\d.,/]/g, '').slice(0, 7) || null) });
  const date = (k: string, max?: string) => ({ type: 'date', max, value: versIso(v[k] ?? null), onChange: (e: { target: { value: string } }) => onChange(k, versFr(e.target.value)) });
  const dateHeure = (k: string) => ({ type: 'datetime-local', value: v[k] ?? '', onChange: (e: { target: { value: string } }) => onChange(k, e.target.value || null) });
  const heure = (k: string) => ({ type: 'time', value: v[k] ?? '', onChange: (e: { target: { value: string } }) => onChange(k, e.target.value || null) });
  const seg = (k: string, options: Opt[], nom: string) => <Segments nom={nom} valeur={val(k)} options={options} onChange={(x) => onChange(k, x)} />;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const ligne = (libelle: string, contenu: React.ReactNode) => (
    <div className={s.ligneChoix}>
      <span>{libelle}</span>
      {contenu}
    </div>
  );
  const champs = (liste: [string, string, ('texte' | 'nombre')?][], classe = s.troisColonnes) => (
    <div className={classe}>
      {liste.map(([k, l, t]) => (
        <label key={k} className={s.champ}>
          <span>{l}</span>
          {t === 'nombre' ? <input placeholder="0" {...nombre(k)} /> : <input maxLength={191} placeholder="…" {...texte(k)} />}
        </label>
      ))}
    </div>
  );
  const titre = (Icone: typeof FaBaby, h: string, sous: string) => (
    <div className={s.titreEtape}>
      <Icone aria-hidden="true" />
      <div>
        <h2>Accouchement · {h}</h2>
        <p>{sous}</p>
      </div>
    </div>
  );

  // Apgar : score détaillé (calcul) → total enregistré dans apgar_1mn / apgar_5mn
  const [apgar, setApgar] = useState<Record<string, number[]>>({ '1': [], '5': [] });
  const noter = (min: '1' | '5', i: number, note: number) => {
    const notes = [...(apgar[min] ?? [])];
    notes[i] = note;
    setApgar((x) => ({ ...x, [min]: notes }));
    if (APGAR.every((_, j) => notes[j] !== undefined)) onChange(min === '1' ? 'apgar_1mn' : 'apgar_5mn', String(notes.reduce((t, n) => t + n, 0)));
  };

  // ======================= 1. ADMISSION =======================
  if (partie === 0)
    return (
      <div className={s.sections}>
        {titre(FaHospitalUser, 'Admission', 'Identité et entrée de la parturiente, motif d’admission, antécédents, suivi prénatal et examen obstétrical d’entrée.')}

        {reprise && (
          <p className={p.reprise}>
            <FaHistory aria-hidden="true" /> Grossesse reprise de la {reprise.source === 'prenatale' ? 'dernière CPN' : 'visite précédente'} du {new Date(reprise.date).toLocaleDateString('fr-FR')}
            {reprise.detail ? ` (${TYPES_VISITE.find(([x]) => x === reprise.detail)?.[1] ?? reprise.detail})` : ''} : vérifiez et complétez.
          </p>
        )}

        <div>
          <h3 className={s.sousTitre}>Parturiente</h3>
          <div className={s.troisColonnes}>
            <label className={s.champ}>
              <span>Date d’arrivée</span>
              <input {...date('date_consultation', aujourdhui)} />
            </label>
            <label className={s.champ}>
              <span>N° gestante (report)</span>
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
            {v.mode_entree === 'Référée par un centre de santé' && (
              <label className={s.champ}>
                <span>Centre de santé</span>
                <input maxLength={191} {...texte('preciser_centre')} />
              </label>
            )}
            {v.mode_entree === 'autre' && (
              <label className={s.champ}>
                <span>Autre mode d’entrée</span>
                <input maxLength={191} {...texte('preciser_autre')} />
              </label>
            )}
            <label className={s.champ}>
              <span>Téléphone</span>
              <input inputMode="tel" maxLength={20} {...texte('telephone')} />
            </label>
            <label className={s.champ}>
              <span>2e contact</span>
              <input inputMode="tel" maxLength={20} {...texte('contact2')} />
            </label>
            <div className={s.champ}>
              <span>En cours de scolarisation</span>
              {seg(
                'en_scolarisation',
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
          <h3 className={s.sousTitre}>Motif d’admission</h3>
          <div className={s.grilleChoix}>
            {ligne('En travail', seg('en_travail', OUI_NON, 'En travail'))}
            {ligne(
              'Contractions',
              seg(
                'contractions',
                [
                  ['Présentes', 'Présentes'],
                  ['Regulières', 'Régulières'],
                  ['Non', 'Non'],
                ],
                'Contractions',
              ),
            )}
            {ligne('Poche des eaux intacte', seg('poche_intacte', OUI_NON, 'Poche des eaux'))}
            {ligne(
              'Liquide amniotique',
              seg(
                'aspect_amnio',
                [
                  ['Clair', 'Clair'],
                  ['teinté', 'Teinté'],
                  ['Meconial', 'Méconial'],
                ],
                'Liquide amniotique',
              ),
            )}
          </div>
          {v.poche_intacte === 'Non' && (
            <label className={`${s.champ} ${p.court}`}>
              <span>Temps écoulé depuis la rupture (heures)</span>
              <input placeholder="0" {...nombre('nbre_heure_ecoule')} />
            </label>
          )}
        </div>

        <div>
          <h3 className={s.sousTitre}>Antécédents</h3>
          <div className={s.grilleChoix}>
            {ligne('HTA', seg('hta', OUI_NON, 'HTA'))}
            {ligne('Diabète', seg('diabete', OUI_NON, 'Diabète'))}
          </div>
          <label className={`${s.champ} ${p.espace}`}>
            <span>Autres antécédents</span>
            <input maxLength={500} placeholder="Préciser…" {...texte('autre_antecedent')} />
          </label>
          <div className={a.cinq}>
            {(
              [
                ['gestite', 'Gestité'],
                ['parite', 'Parité'],
                ['gemellite', 'Gémellité (nb fœtus)'],
                ['premature', 'Prématurés'],
                ['enfant_vivant', 'Enfants vivants'],
                ['enfant_decede', 'Enfants décédés'],
                ['cesarienne', 'Césariennes'],
                ['avortement', 'Avortements'],
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
          <h3 className={s.sousTitre}>Suivi prénatal (PMI), VAT et VIH</h3>
          <div className={s.troisColonnes}>
            <label className={s.champ}>
              <span>Âge de la grossesse à la 1re CPN (SA)</span>
              <input placeholder="0" {...nombre('age_1e_cpn')} />
            </label>
            <label className={s.champ}>
              <span>Nombre de CPN</span>
              <input placeholder="0" {...nombre('nombre_cpn')} />
            </label>
            <label className={s.champ}>
              <span>Statut vaccinal VAT</span>
              <select {...texte('status_vaccination_vat')}>
                <option value="">— Sélectionner —</option>
                <option value="non_vaccine">Non vaccinée</option>
                <option value="incompletement_vaccine">Incomplètement vaccinée</option>
                <option value="correctement_vaccine">Correctement vaccinée</option>
              </select>
            </label>
          </div>
          <div className={s.grilleChoix}>
            {ligne(
              'Statut VIH à l’accueil',
              seg(
                'status_vih',
                [
                  ['positif', 'Positif'],
                  ['negatif', 'Négatif'],
                  ['inconnu', 'Inconnu'],
                ],
                'Statut VIH',
              ),
            )}
            {v.status_vih === 'positif' &&
              ligne(
                'Sous TARV',
                seg(
                  'tarv',
                  [
                    ['oui', 'Oui'],
                    ['non', 'Non'],
                  ],
                  'Sous TARV',
                ),
              )}
          </div>
          {v.status_vih === 'positif' && (
            <label className={`${s.champ} ${p.court}`}>
              <span>N° PEC</span>
              <input maxLength={100} {...texte('preciser_num_pec')} />
            </label>
          )}
        </div>

        <div>
          <h3 className={s.sousTitre}>Examen obstétrical d’entrée</h3>
          <div className={p.quatre}>
            <label className={s.champ}>
              <span>Groupe sanguin / Rhésus</span>
              <select {...texte('group_rhesus')}>
                <option value="">— Sélectionner —</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className={s.champ}>
              <span>DDR</span>
              <input {...date('ddr', aujourdhui)} />
            </label>
            <label className={s.champ}>
              <span>Terme prévu</span>
              <input {...date('terme_prevu')} />
            </label>
            <label className={s.champ}>
              <span>Tension (TA)</span>
              <input maxLength={20} placeholder="12/8" {...texte('TA')} />
            </label>
          </div>
          {champs(
            [
              ['Pouls', 'Pouls (bpm)', 'nombre'],
              ['temperature', 'Température (°C)', 'nombre'],
              ['HU', 'Hauteur utérine (cm)', 'nombre'],
              ['PO', 'Poids (kg)', 'nombre'],
              ['presentation', 'Présentation'],
              ['RCF', 'Rythme cardiaque fœtal (RCF)'],
              ['TV', 'Toucher vaginal (TV)'],
              ['Bassin', 'Bassin'],
              ['conjonctives', 'Conjonctives'],
              ['Oedemes', 'Œdèmes'],
              ['Varices', 'Varices'],
              ['Excision', 'Excision'],
              ['paludisme', 'Paludisme'],
            ],
            `${s.troisColonnes} ${a.marge}`,
          )}
        </div>
      </div>
    );

  // ======================= 2. ACCOUCHEMENT & DÉLIVRANCE =======================
  if (partie === 1)
    return (
      <div className={s.sections}>
        {titre(FaProcedures, 'Accouchement & délivrance', 'Naissance, délivrance du placenta et surveillance du post-partum immédiat.')}

        <div>
          <h3 className={s.sousTitre}>Accouchement</h3>
          <div className={s.troisColonnes}>
            <label className={s.champ}>
              <span>Date et heure de l’accouchement</span>
              <input {...dateHeure('date_accouchement')} max={`${aujourdhui}T23:59`} />
            </label>
            <label className={s.champ}>
              <span>N° d’accouchement</span>
              <input maxLength={50} {...texte('num_accouchement')} />
            </label>
            <div className={s.champ}>
              <span>Accouchement à domicile</span>
              {seg('accouch_dom', OUI_NON, 'Accouchement à domicile')}
            </div>
            <div className={s.champ}>
              <span>Mode d’accouchement</span>
              {seg(
                'mode_accouchement',
                [
                  ['Voie basse', 'Voie basse'],
                  ['Césarienne', 'Césarienne'],
                ],
                'Mode d’accouchement',
              )}
            </div>
            <label className={s.champ}>
              <span>Mode d’expulsion</span>
              <input maxLength={191} placeholder="Spontanée, ventouse, forceps…" {...texte('mode_expulsion')} />
            </label>
            <label className={s.champ}>
              <span>Interventions</span>
              <input maxLength={191} placeholder="Épisiotomie, suture…" {...texte('interventions')} />
            </label>
          </div>
          <label className={`${s.champ} ${p.espace}`}>
            <span>Actes</span>
            <input maxLength={500} {...texte('Actes')} />
          </label>
        </div>

        <div>
          <h3 className={s.sousTitre}>Délivrance</h3>
          <div className={s.troisColonnes}>
            <div className={s.champ}>
              <span>Mode de délivrance</span>
              {seg(
                'mode_delivrance',
                [
                  ['TCC', 'TCC'],
                  ['Normale', 'Normale'],
                  ['Artificielle', 'Artificielle'],
                ],
                'Mode de délivrance',
              )}
            </div>
            <label className={s.champ}>
              <span>Délivrée à</span>
              <input {...heure('heure_delivrance')} />
            </label>
            <div className={s.champ}>
              <span>Révision utérine</span>
              {seg('revision_uterine', OUI_NON, 'Révision utérine')}
            </div>
          </div>
          {champs(
            [
              ['placenta', 'Placenta'],
              ['examen', 'Examen du placenta'],
              ['membrane', 'Membranes'],
              ['cordon', 'Cordon'],
              ['particularite', 'Particularités'],
              ['Nbre_vo', 'Nombre de vaisseaux ombilicaux', 'nombre'],
            ],
            `${s.troisColonnes} ${a.marge}`,
          )}
        </div>

        <div>
          <h3 className={s.sousTitre}>Post-partum immédiat</h3>
          {champs([
            ['ta_apres_accouchement', 'TA après accouchement'],
            ['pouls_apres_accouchement', 'Pouls après accouchement', 'nombre'],
            ['conscience', 'Conscience'],
            ['globule_uterin', 'Globe utérin'],
            ['saignement_vulvaire', 'Saignement vulvaire'],
          ])}
          <div className={`${s.grilleChoix} ${a.marge}`}>{ligne('Complications obstétricales', seg('complication_obstetricales', OUI_NON, 'Complications'))}</div>
          {v.complication_obstetricales === 'Oui' && (
            <>
              <label className={`${s.champ} ${p.espace}`}>
                <span>Type de complications</span>
                <input maxLength={500} placeholder="Hémorragie, éclampsie, déchirure…" {...texte('type_complication')} />
              </label>
              <div className={p.bloc}>
                <span className={p.etiquette}>Prise en charge des hémorragies du post-partum immédiat (HPPI)</span>
                {seg(
                  'prise_en_charge_hppi',
                  [
                    ['UBT', 'UBT'],
                    ['Oui', 'Oui'],
                    ['Non', 'Non'],
                    ['Autre', 'Autres méthodes'],
                    ['Référées', 'Référées'],
                  ],
                  'HPPI',
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );

  // ======================= 3. NOUVEAU-NÉ =======================
  if (partie === 2) {
    const vivant = !v.mort_ne;
    return (
      <div className={s.sections}>
        {titre(FaBaby, 'Nouveau-né', 'Mensurations, indice d’Apgar, état à la naissance, réanimation et premiers soins.')}

        <div>
          <h3 className={s.sousTitre}>Identification</h3>
          <div className={p.quatre}>
            <div className={s.champ}>
              <span>Sexe</span>
              {seg(
                'sexe_enfant',
                [
                  ['Masculin', 'M'],
                  ['Feminin', 'F'],
                  ['Inconnu', 'ND'],
                ],
                'Sexe',
              )}
            </div>
            <label className={s.champ}>
              <span>Poids (g)</span>
              <input placeholder="3200" {...nombre('poids_enfant')} />
            </label>
            <label className={s.champ}>
              <span>Taille (cm)</span>
              <input placeholder="50" {...nombre('taille_enfant')} />
            </label>
            <label className={s.champ}>
              <span>Périmètre crânien (cm)</span>
              <input placeholder="34" {...nombre('perimetre_cranien')} />
            </label>
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Indice d’Apgar</h3>
          <div className={a.apgar}>
            <div className={a.apgarEntete}>
              <span>Critère</span>
              <span>1 minute</span>
              <span>5 minutes</span>
            </div>
            {APGAR.map((critere, i) => (
              <div key={critere} className={a.apgarLigne}>
                <span>{critere}</span>
                {(['1', '5'] as const).map((min) => (
                  <span key={min} className={s.segments}>
                    {[0, 1, 2].map((n) => (
                      <button key={n} type="button" className={apgar[min]?.[i] === n ? s.segmentActif : ''} onClick={() => noter(min, i, n)} aria-label={`${critere} à ${min} min : ${n}`}>
                        {n}
                      </button>
                    ))}
                  </span>
                ))}
              </div>
            ))}
            <div className={a.apgarTotal}>
              <span>Total (sur 10)</span>
              <input aria-label="Apgar à 1 minute" placeholder="—" {...nombre('apgar_1mn')} />
              <input aria-label="Apgar à 5 minutes" placeholder="—" {...nombre('apgar_5mn')} />
            </div>
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>État à la naissance</h3>
          <div className={s.grilleChoix}>
            {ligne(
              'Né vivant',
              <Segments
                nom="Né vivant"
                valeur={vivant ? 'Oui' : 'Non'}
                options={OUI_NON}
                onChange={(x) => {
                  if (x === 'Non') onChange('mort_ne', v.mort_ne ?? 'Frais');
                  else onChange('mort_ne', null);
                }}
              />,
            )}
            {vivant
              ? ligne(
                  'Terme',
                  seg(
                    'etat_nouveau_ne',
                    [
                      ['A terme', 'À terme'],
                      ['Prematuré', 'Prématuré'],
                      ['Post-terme', 'Post-terme'],
                    ],
                    'Terme',
                  ),
                )
              : ligne(
                  'Mort-né',
                  seg(
                    'mort_ne',
                    [
                      ['Frais', 'Frais'],
                      ['Macéré', 'Macéré'],
                    ],
                    'Mort-né',
                  ),
                )}
            {ligne('Malformation', seg('malformation', OUI_NON, 'Malformation'))}
          </div>
          {v.malformation === 'Oui' && (
            <label className={`${s.champ} ${p.espace}`}>
              <span>Type de malformation</span>
              <input maxLength={191} {...texte('type_malformation')} />
            </label>
          )}
        </div>

        {vivant && (
          <>
            <div>
              <h3 className={s.sousTitre}>Réanimation</h3>
              <div className={s.grilleChoix}>{ligne('A respiré / crié dans la 1re minute', seg('reaction_bebe', OUI_NON, 'Respiration'))}</div>
              {v.reaction_bebe === 'Non' && (
                <>
                  <div className={p.bloc}>
                    <span className={p.etiquette}>Gestes réalisés</span>
                    {seg(
                      'action_si',
                      [
                        ['Aspiration', 'Aspiration'],
                        ['ballon auto-gonflable', 'Ventilation au ballon'],
                        ['Oxygène', 'Oxygène'],
                      ],
                      'Gestes',
                    )}
                  </div>
                  <label className={`${s.champ} ${p.espace}`}>
                    <span>Résultat de la réanimation</span>
                    <input maxLength={191} {...texte('reanimation')} />
                  </label>
                </>
              )}
            </div>

            <div>
              <h3 className={s.sousTitre}>Premiers soins et allaitement</h3>
              <div className={s.troisColonnes}>
                <label className={s.champ}>
                  <span>Mise au sein (date et heure)</span>
                  <input {...dateHeure('date_mise_sein')} />
                </label>
                <div className={s.champ}>
                  <span>Conseils pour l’allaitement exclusif</span>
                  {seg('conseil_allaitement', OUI_NON, 'Conseils allaitement')}
                </div>
                <div className={s.champ}>
                  <span>Soins mère kangourou (SMK)</span>
                  {seg('skm', OUI_NON, 'SMK')}
                </div>
              </div>
              <div className={p.bloc}>
                <span className={p.etiquette}>Traitements administrés</span>
                <div className={p.puces}>
                  {(
                    [
                      ['SAT', 'S.A.T'],
                      ['Vitamine K1', 'Vitamine K1'],
                      ['Collyre', 'Collyre'],
                      ['CHX gel 7.1%', 'Soins ombilicaux CHX gel 7,1 %'],
                    ] as Opt[]
                  ).map(([x, l]) => {
                    const liste = (v.sat ?? '')
                      .split(',')
                      .map((y) => y.trim())
                      .filter(Boolean);
                    const actif = liste.includes(x);
                    return (
                      <button
                        key={x}
                        type="button"
                        className={`${s.puceChoix} ${actif ? s.puceChoixActive : ''}`}
                        aria-pressed={actif}
                        onClick={() => {
                          const n = actif ? liste.filter((y) => y !== x) : [...liste, x];
                          onChange('sat', n.length ? n.join(', ') : null);
                        }}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={s.deuxColonnes}>
                <label className={s.champ}>
                  <span>Autre traitement</span>
                  <input maxLength={191} {...texte('preciser_traitement')} />
                </label>
                <label className={s.champ}>
                  <span>Autres médicaments administrés</span>
                  <input maxLength={191} {...texte('autre_medicament')} />
                </label>
              </div>
              <div className={`${s.grilleChoix} ${a.marge}`}>{ligne('Prophylaxie ARV', seg('prophylaxie', OUI_NON_NA, 'Prophylaxie ARV'))}</div>
            </div>

            <div>
              <h3 className={s.sousTitre}>Évacuation du nouveau-né (si nécessaire)</h3>
              {champs([
                ['raison_evacuation', 'Évacué pour'],
                ['lieu_evacuation', 'Lieu'],
              ])}
              <label className={`${s.champ} ${p.court}`}>
                <span>Date d’évacuation</span>
                <input {...date('date_evacuation', aujourdhui)} />
              </label>
            </div>
          </>
        )}
      </div>
    );
  }

  // ======================= 4. SUIVI DE LA MÈRE =======================
  if (partie === 3)
    return (
      <div className={s.sections}>
        {titre(FaUserNurse, 'Suivi de la mère', 'Offre de services (VIH, planification familiale), évacuation, sortie et rendez-vous postnatal.')}

        <div>
          <h3 className={s.sousTitre}>Offre de service · VIH</h3>
          <div className={s.grilleChoix}>
            {ligne('Proposition de test VIH', seg('proposition_test_vih', OUI_NON_NA, 'Proposition de test'))}
            {ligne(
              'Résultat du test',
              seg(
                'resultat_test_vih',
                [
                  ['Positif', 'Positif'],
                  ['Négatif', 'Négatif'],
                  ['NA', 'NA'],
                ],
                'Résultat VIH',
              ),
            )}
            {ligne('Annonce du résultat', seg('annonce_resultat_vih', OUI_NON_NA, 'Annonce'))}
            {ligne('Initiation ARV', seg('init_arv', OUI_NON_NA, 'Initiation ARV'))}
          </div>
          <label className={`${s.champ} ${p.court}`}>
            <span>N° de dépistage</span>
            <input maxLength={100} {...texte('numero_depistage')} />
          </label>
        </div>

        <div>
          <h3 className={s.sousTitre}>Planification familiale</h3>
          <div className={s.grilleChoix}>{ligne('Conseil PF-PPI (≤ 48 h après l’accouchement)', seg('conseil_pf', OUI_NON, 'Conseil PF'))}</div>
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
          <h3 className={s.sousTitre}>Traitements de sortie</h3>
          <div className={s.deuxColonnes}>
            <label className={s.champ}>
              <span>Traitement de la mère</span>
              <textarea rows={2} maxLength={2000} placeholder="(l’ordonnance imprimable se fait à l’étape Prescriptions)" {...texte('ordonnane_mere')} />
            </label>
            <label className={s.champ}>
              <span>Traitement de l’enfant</span>
              <textarea rows={2} maxLength={2000} {...texte('ordonnance_enfant')} />
            </label>
          </div>
        </div>

        <div>
          <h3 className={s.sousTitre}>Évacuation de la mère</h3>
          <div className={s.grilleChoix}>{ligne('Mère évacuée', seg('evacuation_mere', OUI_NON, 'Évacuation de la mère'))}</div>
          {v.evacuation_mere === 'Oui' && (
            <>
              {champs(
                [
                  ['Motif_evacuation_mere', 'Motif d’évacuation'],
                  ['nom_etablissement', 'Établissement d’accueil'],
                ],
                `${s.deuxColonnes} ${a.marge}`,
              )}
              <div className={s.troisColonnes}>
                <label className={s.champ}>
                  <span>Heure de la décision</span>
                  <input {...heure('heure_decision')} />
                </label>
                <label className={s.champ}>
                  <span>Heure de départ effectif</span>
                  <input {...heure('heure_depart')} />
                </label>
                <div className={s.champ}>
                  <span>En ambulance</span>
                  {seg('Ambulance', OUI_NON, 'Ambulance')}
                </div>
              </div>
              {v.Ambulance === 'Non' && (
                <label className={`${s.champ} ${p.espace}`}>
                  <span>Moyen d’évacuation</span>
                  <input maxLength={191} {...texte('preciser_evacuation')} />
                </label>
              )}
            </>
          )}
        </div>

        <div>
          <h3 className={s.sousTitre}>Décès maternel</h3>
          <div className={s.grilleChoix}>{ligne('Décédée à la maternité', seg('deces_oui', OUI_NON, 'Décès maternel'))}</div>
          {v.deces_oui === 'Oui' && (
            <div className={s.deuxColonnes}>
              <label className={s.champ}>
                <span>Date du décès</span>
                <input {...date('date_deces_maternite', aujourdhui)} />
              </label>
              <label className={s.champ}>
                <span>Cause du décès</span>
                <input maxLength={500} {...texte('cause_deces')} />
              </label>
            </div>
          )}
        </div>

        <div>
          <h3 className={s.sousTitre}>Sortie et rendez-vous</h3>
          <div className={p.quatre}>
            <label className={s.champ}>
              <span>Date de sortie</span>
              <input {...date('date_sortie')} />
            </label>
            <label className={s.champ}>
              <span>Vitamine A (1re dose)</span>
              <input {...date('vit_A_1ere_dose')} />
            </label>
            <label className={s.champ}>
              <span>Vitamine A (2e dose)</span>
              <input {...date('vit_A_2e_dose')} />
            </label>
            <label className={s.champ}>
              <span>RDV consultation postnatale</span>
              <input {...date('date_prochain_rdv')} min={aujourdhui} />
            </label>
          </div>
          <label className={`${s.champ} ${p.espace}`}>
            <span>Responsable de l’accouchement</span>
            <input maxLength={191} placeholder="Nom de la sage-femme / du médecin" {...texte('responsable_accouchement')} />
          </label>
        </div>
      </div>
    );

  // ======================= 5. DÉCLARATION DE NAISSANCE =======================
  const n = naissance;
  const maj = (patch: Partial<NaissanceSaisie>) => onNaissance({ ...n, ...patch });
  const majEnfant = (i: number, patch: Partial<EnfantDeclare>) => maj({ enfants: n.enfants.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  return (
    <div className={s.sections}>
      {titre(FaCertificate, 'Déclaration de naissance', 'Le certificat médical de naissance du nouveau-né est établi à l’enregistrement de l’accouchement.')}

      {declaration ? (
        <p className={a.declaree}>
          <FaCertificate aria-hidden="true" /> Naissance déclarée : certificat {declaration.reference}.
        </p>
      ) : v.mort_ne ? (
        <p className={p.alerte}>Enfant mort-né : il n’y a pas de déclaration de naissance (pensez à la déclaration de décès si nécessaire).</p>
      ) : (
        <>
          <div className={s.ligneChoix}>
            <span>Déclarer la naissance maintenant</span>
            <Segments nom="Déclarer la naissance" valeur={n.declarer === null ? null : n.declarer ? 'Oui' : 'Non'} options={OUI_NON} onChange={(x) => maj({ declarer: x === null ? null : x === 'Oui' })} />
          </div>

          {n.declarer && (
            <>
              <div className={s.troisColonnes}>
                <label className={s.champ}>
                  <span>Mère</span>
                  <input value={mere} disabled />
                </label>
                <label className={s.champ}>
                  <span>
                    Date de naissance <em className={s.requis}>*</em>
                  </span>
                  <input type="date" max={aujourdhui} value={n.date} onChange={(e) => maj({ date: e.target.value })} />
                </label>
                <label className={s.champ}>
                  <span>
                    Lieu de naissance <em className={s.requis}>*</em>
                  </span>
                  <select value={n.lieu} onChange={(e) => maj({ lieu: e.target.value })}>
                    <option value="">— Sélectionner —</option>
                    {LIEUX_NAISSANCE.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={a.enfants}>
                {n.enfants.map((e, i) => (
                  <div key={i} className={a.enfant}>
                    <strong className={a.numero}>{n.enfants.length > 1 ? `Enfant ${i + 1}` : 'Nouveau-né'}</strong>
                    <div className={s.champ}>
                      <span>
                        Sexe <em className={s.requis}>*</em>
                      </span>
                      <Segments
                        nom={`Sexe de l’enfant ${i + 1}`}
                        valeur={e.genre || null}
                        options={[
                          ['masculin', 'Masculin'],
                          ['feminin', 'Féminin'],
                        ]}
                        onChange={(x) => majEnfant(i, { genre: (x as EnfantDeclare['genre']) ?? '' })}
                      />
                    </div>
                    <label className={s.champ}>
                      <span>
                        Heure <em className={s.requis}>*</em>
                      </span>
                      <input type="time" value={e.heure} onChange={(x) => majEnfant(i, { heure: x.target.value })} />
                    </label>
                    <label className={s.champ}>
                      <span>
                        État <em className={s.requis}>*</em>
                      </span>
                      <select value={e.etat} onChange={(x) => majEnfant(i, { etat: x.target.value })}>
                        {ETATS_ENFANT.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <label className={s.champ}>
                      <span>Prénom(s)</span>
                      <input maxLength={100} placeholder="Facultatif" value={e.prenom} onChange={(x) => majEnfant(i, { prenom: x.target.value })} />
                    </label>
                    {n.enfants.length > 1 && (
                      <button type="button" className={a.retirer} onClick={() => maj({ enfants: n.enfants.filter((_, j) => j !== i) })} aria-label={`Retirer l’enfant ${i + 1}`}>
                        <FaTimes />
                      </button>
                    )}
                  </div>
                ))}
                {n.enfants.length < 6 && (
                  <button type="button" className={s.puceChoix} onClick={() => maj({ enfants: [...n.enfants, { genre: '', heure: n.enfants[0]?.heure ?? '', etat: 'Vivant à terme', prenom: '' }] })}>
                    <FaPlus aria-hidden="true" /> Ajouter un enfant (naissance multiple)
                  </button>
                )}
              </div>

              <label className={s.champ}>
                <span>Observations</span>
                <textarea rows={2} maxLength={2000} value={n.observations} onChange={(e) => maj({ observations: e.target.value })} />
              </label>
              <p className={a.info}>
                À l’enregistrement : un dossier patient est créé pour chaque nouveau-né (rattaché à sa mère), la déclaration est enregistrée et le certificat médical de naissance s’ouvre, prêt à imprimer.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
