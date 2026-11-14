import { useEffect, useState } from 'react';
import { FaBed, FaClock, FaFileMedical, FaPills, FaPlus, FaTimes } from 'react-icons/fa';
import { api } from '../../../../services/api';
import type { DoctorHospitalisationOptions } from '../../../../types';
import s from './FormulaireConsultation.module.css';

export interface LigneProtocole {
  /** médicament saisi par le médecin */
  nom: string;
  unite: string;
  quantite: number;
  posologie: string;
  voie: string;
  heures: string[];
}

export interface HospitalisationSaisie {
  chambreId: number | null;
  bedId: number | null;
  infirmierId: number | null;
  diagnostic: string;
  analyseMedical: string;
  sonde: string | null;
  oxygenotherapie: string | null;
  volume: string;
  regimeActif: boolean;
  regime: string;
  operationActive: boolean;
  dateOperation: string;
  protocole: LigneProtocole[];
}

export const hospitalisationVide = (diagnostic: string | null): HospitalisationSaisie => ({
  chambreId: null,
  bedId: null,
  infirmierId: null,
  diagnostic: diagnostic ?? '',
  analyseMedical: '',
  sonde: null,
  oxygenotherapie: null,
  volume: '',
  regimeActif: false,
  regime: '',
  operationActive: false,
  dateOperation: '',
  protocole: [],
});

const UNITES = ['UNITE', 'CP', 'AMP', 'FL', 'SACH', 'BOITE', 'GEL', 'SUPPO', 'ML'];
const VOIES = ['Orale', 'Intraveineuse (IV)', 'Intramusculaire (IM)', 'Sous-cutanée', 'Perfusion', 'Rectale', 'Cutanée', 'Inhalée'];
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

function OuiNon({ valeur, onChange, nom }: { valeur: string | null; onChange: (v: string | null) => void; nom: string }) {
  return (
    <div className={s.segments} role="radiogroup" aria-label={nom}>
      {['Oui', 'Non'].map((o) => (
        <button key={o} type="button" role="radio" aria-checked={valeur === o} className={valeur === o ? s.segmentActif : ''} onClick={() => onChange(valeur === o ? null : o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * MÉDECIN > CONSULTATION > ISSUE « HOSPITALISATION »
 * Repris de Laravel : formulaire/issue/hospitalisation.blade.php
 *   1. chambre et lit (facultatif : sans lit, le patient attend une chambre), infirmier(ère) ;
 *   2. dossier : diagnostic principal, analyses avant admission, sonde, oxygénothérapie, volume, régime, opération ;
 *   3. protocole thérapeutique (obligatoire) : médicaments saisis par le médecin, quantité, posologie, voie, heures.
 */
export default function IssueHospitalisation({ valeur, onChange }: { valeur: HospitalisationSaisie; onChange: (v: HospitalisationSaisie) => void }) {
  const [options, setOptions] = useState<DoctorHospitalisationOptions | null>(null);
  const [saisie, setSaisie] = useState('');
  const [uniteSaisie, setUniteSaisie] = useState('UNITE');
  const [heureSaisie, setHeureSaisie] = useState<Record<number, string>>({});
  const v = valeur;
  const maj = (patch: Partial<HospitalisationSaisie>) => onChange({ ...v, ...patch });
  const majLigne = (i: number, patch: Partial<LigneProtocole>) => maj({ protocole: v.protocole.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  useEffect(() => {
    api.doctor.hospitalisations
      .options()
      .then(setOptions)
      .catch(() => setOptions({ chambres: [], infirmiers: [] }));
  }, []);

  const chambre = options?.chambres.find((c) => c.id === v.chambreId) ?? null;

  const ajouterMedicament = () => {
    const nom = saisie.trim().replace(/\s+/g, ' ');
    if (!nom) return;
    if (!v.protocole.some((l) => l.nom.toLowerCase() === nom.toLowerCase())) {
      maj({ protocole: [...v.protocole, { nom, unite: uniteSaisie, quantite: 1, posologie: '', voie: '', heures: [] }] });
    }
    setSaisie('');
  };

  const ajouterHeure = (i: number) => {
    const h = heureSaisie[i];
    if (!h || v.protocole[i].heures.includes(h)) return;
    majLigne(i, { heures: [...v.protocole[i].heures, h].sort() });
    setHeureSaisie((x) => ({ ...x, [i]: '' }));
  };

  return (
    <div className={s.hospitalisation}>
      {/* --- 1. Chambre --- */}
      <div className={s.hospBloc}>
        <h3 className={s.sousTitre}>
          <FaBed aria-hidden="true" /> Chambre et lit <small className={s.facultatif}>facultatif : sans lit, le patient attend une chambre</small>
        </h3>
        {!options ? (
          <p className={s.note}>Chargement des chambres…</p>
        ) : options.chambres.length === 0 ? (
          <p className={s.note}>Aucune chambre active dans votre établissement.</p>
        ) : (
          <div className={s.chambres}>
            {options.chambres.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={c.lits.length === 0}
                className={`${s.chambre} ${v.chambreId === c.id ? s.chambreActive : ''}`}
                onClick={() => maj(v.chambreId === c.id ? { chambreId: null, bedId: null } : { chambreId: c.id, bedId: null })}
              >
                <strong>{c.numero}</strong>
                <small>
                  {c.type ?? 'Chambre'} · {fcfa(c.prix)}/j
                </small>
                <em>{c.lits.length === 0 ? 'Complète' : `${c.lits.length} lit(s) libre(s)`}</em>
              </button>
            ))}
          </div>
        )}
        {chambre && (
          <div className={s.puces}>
            {chambre.lits.map((l) => (
              <button key={l.id} type="button" className={`${s.puceChoix} ${v.bedId === l.id ? s.puceChoixActive : ''}`} onClick={() => maj({ bedId: v.bedId === l.id ? null : l.id })}>
                <FaBed aria-hidden="true" /> Lit {l.numero}
              </button>
            ))}
          </div>
        )}
        <label className={s.champ}>
          <span>Infirmier(ère) en charge</span>
          <select value={v.infirmierId ?? ''} onChange={(e) => maj({ infirmierId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— Aucun —</option>
            {options?.infirmiers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* --- 2. Dossier --- */}
      <div className={s.hospBloc}>
        <h3 className={s.sousTitre}>
          <FaFileMedical aria-hidden="true" /> Dossier d’hospitalisation
        </h3>
        <div className={s.deuxColonnes}>
          <label className={s.champ}>
            <span>Diagnostic principal</span>
            <textarea rows={2} value={v.diagnostic} onChange={(e) => maj({ diagnostic: e.target.value })} placeholder="Diagnostic justifiant l’hospitalisation…" />
          </label>
          <label className={s.champ}>
            <span>Analyses médicales avant admission</span>
            <textarea rows={2} value={v.analyseMedical} onChange={(e) => maj({ analyseMedical: e.target.value })} placeholder="Bilans réalisés ou demandés…" />
          </label>
        </div>
        <div className={s.grilleChoix}>
          <div className={s.ligneChoix}>
            <span>Sonde</span>
            <OuiNon nom="Sonde" valeur={v.sonde} onChange={(o) => maj({ sonde: o })} />
          </div>
          <div className={s.ligneChoix}>
            <span>Oxygénothérapie</span>
            <OuiNon nom="Oxygénothérapie" valeur={v.oxygenotherapie} onChange={(o) => maj({ oxygenotherapie: o })} />
          </div>
          <div className={s.ligneChoix}>
            <span>Régime alimentaire</span>
            <OuiNon nom="Régime" valeur={v.regimeActif ? 'Oui' : 'Non'} onChange={(o) => maj({ regimeActif: o === 'Oui', regime: o === 'Oui' ? v.regime : '' })} />
          </div>
          <div className={s.ligneChoix}>
            <span>Opération prévue</span>
            <OuiNon nom="Opération" valeur={v.operationActive ? 'Oui' : 'Non'} onChange={(o) => maj({ operationActive: o === 'Oui', dateOperation: o === 'Oui' ? v.dateOperation : '' })} />
          </div>
          <label className={`${s.ligneChoix} ${s.ligneSaisie}`}>
            <span>Volume (L)</span>
            <select value={v.volume} onChange={(e) => maj({ volume: e.target.value })}>
              <option value="">—</option>
              {['1', '2', '3', '4', '5'].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        {(v.regimeActif || v.operationActive) && (
          <div className={s.deuxColonnes}>
            {v.regimeActif && (
              <label className={s.champ}>
                <span>Description du régime</span>
                <input value={v.regime} onChange={(e) => maj({ regime: e.target.value })} placeholder="Sans sel, hydrique…" />
              </label>
            )}
            {v.operationActive && (
              <label className={s.champ}>
                <span>Date de l’opération</span>
                <input type="date" value={v.dateOperation} onChange={(e) => maj({ dateOperation: e.target.value })} />
              </label>
            )}
          </div>
        )}
      </div>

      {/* --- 3. Protocole thérapeutique --- */}
      <div className={s.hospBloc}>
        <h3 className={s.sousTitre}>
          <FaPills aria-hidden="true" /> Protocole thérapeutique <em className={s.requis}>*</em>
        </h3>
        <div className={s.saisieProtocole}>
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                ajouterMedicament();
              }
            }}
            placeholder="Nom du médicament (ex. : Artésunate 60 mg inj.)"
            aria-label="Nom du médicament"
          />
          <select value={uniteSaisie} onChange={(e) => setUniteSaisie(e.target.value)} aria-label="Unité">
            {UNITES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <button type="button" className={s.boutonAjout} onClick={ajouterMedicament} disabled={!saisie.trim()}>
            <FaPlus aria-hidden="true" /> Ajouter
          </button>
        </div>

        {v.protocole.length === 0 ? (
          <p className={s.alerteProtocole}>Saisissez au moins un médicament : le protocole est obligatoire pour hospitaliser le patient.</p>
        ) : (
          <ul className={s.medicaments}>
            {v.protocole.map((l, i) => (
              <li key={l.nom}>
                <div className={s.medicamentNom}>
                  <strong>{l.nom}</strong>
                  <button type="button" className={s.retirer} onClick={() => maj({ protocole: v.protocole.filter((_, j) => j !== i) })} aria-label={`Retirer ${l.nom}`}>
                    <FaTimes />
                  </button>
                </div>
                <div className={s.medicamentChamps}>
                  <label>
                    <small>Posologie</small>
                    <input value={l.posologie} onChange={(e) => majLigne(i, { posologie: e.target.value })} placeholder="1 g toutes les 8 h" />
                  </label>
                  <label>
                    <small>Quantité ({l.unite})</small>
                    <input type="number" min={1} value={l.quantite} onChange={(e) => majLigne(i, { quantite: Math.max(1, Number(e.target.value) || 1) })} />
                  </label>
                  <label>
                    <small>Voie d’administration</small>
                    <select value={l.voie} onChange={(e) => majLigne(i, { voie: e.target.value })}>
                      <option value="">—</option>
                      {VOIES.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <small>Heure d’administration</small>
                    <span className={s.ajoutHeure}>
                      <input type="time" value={heureSaisie[i] ?? ''} onChange={(e) => setHeureSaisie((x) => ({ ...x, [i]: e.target.value }))} />
                      <button type="button" onClick={() => ajouterHeure(i)} aria-label="Ajouter l'heure">
                        <FaPlus />
                      </button>
                    </span>
                  </label>
                </div>
                {l.heures.length > 0 && (
                  <div className={s.puces}>
                    {l.heures.map((h) => (
                      <span key={h} className={s.puce}>
                        <FaClock aria-hidden="true" /> {h}
                        <button type="button" onClick={() => majLigne(i, { heures: l.heures.filter((x) => x !== h) })} aria-label={`Retirer ${h}`}>
                          <FaTimes />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
