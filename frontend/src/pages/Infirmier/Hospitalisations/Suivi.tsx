import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { FaArrowLeft, FaBed, FaCheck, FaClock, FaFileMedical, FaHeartbeat, FaLock, FaPills, FaSave, FaUserMd } from 'react-icons/fa';
import { useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../services/alertes';
import { api, uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { AjouterSurveillancePayload, InfirmierHospitalisationSuivi } from '../../../types';
import { age, initiales } from '../GestionPatients/DossierMedical/outils';
import s from './Suivi.module.css';
import { PaginationTableau, usePagination } from '../../../components/Pagination';

const dateFr = (x: string | null) => {
  if (!x) return '—';
  const [a, m, j] = x.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
};

/** Paramètres de surveillance (tous obligatoires, comme Laravel) */
const PARAMETRES: { k: keyof AjouterSurveillancePayload; libelle: string; unite: string; placeholder: string }[] = [
  { k: 'ta', libelle: 'TA', unite: 'mmHg', placeholder: '12/8' },
  { k: 'temperature', libelle: 'T°', unite: '°C', placeholder: '37.2' },
  { k: 'pouls', libelle: 'Pouls', unite: 'bpm', placeholder: '78' },
  { k: 'diurese', libelle: 'Diurèse', unite: 'ml', placeholder: '500' },
  { k: 'glycemie', libelle: 'Glycémie', unite: 'g/l', placeholder: '1.05' },
  { k: 'sao2', libelle: 'SaO₂', unite: '%', placeholder: '98' },
  { k: 'poids', libelle: 'Poids', unite: 'kg', placeholder: '70' },
];
const CONSCIENCES = ['Consciente', 'Obnubilée', 'Confuse', 'Somnolente', 'Comateuse'];
const FORMULAIRE_VIDE: AjouterSurveillancePayload = { ta: '', temperature: '', pouls: '', diurese: '', conscience: 'Consciente', glycemie: '', sao2: '', poids: '', heure: '', evolution: '', conduite_tenir: '' };

/**
 * INFIRMIER > HOSPITALISATIONS > SUIVI & SURVEILLANCE (page dédiée)
 * Repris de Laravel : users/infirmier/suivi/hospitalisation.blade.php (SuiviController)
 *   - informations du patient ;
 *   - un onglet par journée : protocole thérapeutique du médecin, heure par heure (« Non appliqué » → « Appliqué ») ;
 *   - surveillances H1, H2… et saisie d'une nouvelle surveillance (paramètres obligatoires).
 * Hospitalisation terminée : consultation seule.
 */
export default function Suivi() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<InfirmierHospitalisationSuivi | null>(null);
  const [erreur, setErreur] = useState(false);
  const [jourActif, setJourActif] = useState<number | null>(null);
  const [heureAConfirmer, setHeureAConfirmer] = useState<{ id: number; heure: string; produit: string } | null>(null);
  const [application, setApplication] = useState(false);
  const [form, setForm] = useState<AjouterSurveillancePayload>(FORMULAIRE_VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [photoErreur, setPhotoErreur] = useState(false);

  const charger = useCallback(
    (garderJour = false) =>
      api.infirmier.hospitalisations
        .suivi(Number(id))
        .then((d) => {
          setData(d);
          if (!garderJour) setJourActif(d.journees[d.journees.length - 1]?.id ?? null);
        })
        .catch((e) => {
          setErreur(true);
          alerte.echec(`Impossible d'ouvrir le suivi : ${messageErreur(e)}`);
        }),
    [id],
  );

  useEffect(() => {
    charger();
  }, [charger]);

  const appliquer = async () => {
    if (!heureAConfirmer) return;
    setApplication(true);
    try {
      const r = await api.infirmier.hospitalisations.appliquerHeure(heureAConfirmer.id);
      alerte.succes(r.message);
      await charger(true);
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setApplication(false);
      setHeureAConfirmer(null);
    }
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    const manquant = [...PARAMETRES.map((p) => p.k), 'conscience' as const].find((k) => !String(form[k] ?? '').trim());
    if (manquant) {
      alerte.attention('Tous les paramètres de surveillance sont obligatoires (TA, T°, pouls, diurèse, conscience, glycémie, SaO₂, poids).');
      return;
    }
    setEnvoi(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => String(v ?? '').trim() !== '')) as AjouterSurveillancePayload;
      const r = await api.infirmier.hospitalisations.ajouterSurveillance(data.hospitalisation.id, payload);
      alerte.succes(r.message);
      setForm(FORMULAIRE_VIDE);
      await charger(true);
    } catch (err) {
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const entete = (
    <header className={c.entete}>
      <div>
        <p className={c.surtitre}>Hospitalisations</p>
        <h1 className={c.titre}>Suivi & surveillance</h1>
      </div>
      <button type="button" className={c.secondaire} onClick={() => navigate(-1)}>
        <FaArrowLeft aria-hidden="true" /> Retour
      </button>
    </header>
  );

  // Tableaux du jour affiché : 10 lignes par page (avant le retour anticipé du chargement)
  const jourAffiche = data ? (data.journees.find((j) => j.id === jourActif) ?? data.journees[data.journees.length - 1] ?? null) : null;
  const pgProtocoles = usePagination(jourAffiche?.protocoles);
  const pgSurveillances = usePagination(jourAffiche?.surveillances);

  if (!data) {
    return (
      <div className={c.page}>
        {entete}
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Hospitalisation introuvable.' : 'Chargement du suivi…'}</p>
        </section>
      </div>
    );
  }

  const { hospitalisation: h, patient } = data;
  const feminin = (patient.genre ?? '').toLowerCase().startsWith('f');
  const photo = patient.imgUrl ? (patient.imgUrl.startsWith('http') ? patient.imgUrl : uploadUrl('patient', patient.imgUrl)) : null;
  const jour = data.journees.find((j) => j.id === jourActif) ?? data.journees[data.journees.length - 1] ?? null;
  const index = jour ? data.journees.indexOf(jour) : -1;
  const dernierJour = index === data.journees.length - 1;
  const saisieOuverte = !h.terminee && dernierJour;
  const dossier = [
    ['Diagnostic', h.diagnostic],
    ['Régime', h.regime],
    ['Sonde', h.sonde],
    ['Oxygénothérapie', h.oxygenotherapie],
    ['Volume', h.volume ? `${h.volume} L` : null],
    ['Opération prévue', h.operations.length ? h.operations.map(dateFr).join(', ') : null],
    ['Consignes du médecin', h.remarque],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className={c.page}>
      {entete}

      {/* --- Patient --- */}
      <motion.section className={`${c.bloc} ${s.patient}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className={s.identite}>
          {photo && !photoErreur ? (
            <img src={photo} alt="" className={s.avatar} onError={() => setPhotoErreur(true)} />
          ) : (
            <span className={`${s.avatar} ${s.initiales} ${feminin ? s.feminin : ''}`}>{initiales(patient.nom)}</span>
          )}
          <div>
            <span className={s.dossier}>N° Dossier médical | {patient.code}</span>
            <strong>{patient.nom}</strong>
            <small>
              Hospitalisation du {dateFr(h.dateDebut)} · N° {h.code}
            </small>
          </div>
          <div className={s.etats}>
            {h.terminee ? <span className={`${c.badge} ${c.badgeOk}`}>Terminée{h.motifSortie ? ` · ${h.motifSortie}` : ''}</span> : <span className={`${c.badge} ${s.badgeBleu}`}>En cours</span>}
            <span className={s.lit}>
              <FaBed aria-hidden="true" /> {h.lit ?? 'En attente de chambre'}
            </span>
          </div>
        </div>
        <dl className={s.infos}>
          {(
            [
              ['Né(e) le', patient.dateNaissance],
              ['Âge', age(patient.dateNaissance)],
              ['Sexe', feminin ? 'Féminin' : patient.genre ? 'Masculin' : null],
              ['Résidence actuelle', patient.residence],
              ['Contact', patient.telephone],
              ['N° assurance / CMU', patient.assurance],
              ['Médecin', h.medecin.nom ? `Dr ${h.medecin.nom.replace(/^dr\.?\s*/i, '')}` : null],
              ['Motif de la consultation', data.motifConsultation],
            ] as [string, string | null][]
          ).map(([l, v]) => (
            <div key={l}>
              <dt>{l}</dt>
              <dd title={v ?? ''}>{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {dossier.length > 0 && (
          <div className={s.dossierMedical}>
            <span>
              <FaFileMedical aria-hidden="true" /> Dossier d’hospitalisation
            </span>
            <div>
              {dossier.map(([l, v]) => (
                <span key={l} className={s.pastille}>
                  <em>{l} :</em> {v}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.section>

      {h.terminee && (
        <p className={s.bandeauFin}>
          <FaLock aria-hidden="true" /> Cette hospitalisation est terminée{h.dateFin ? ` depuis le ${dateFr(h.dateFin)}` : ''}. La saisie de surveillance et l’application du protocole ne sont plus autorisées.
        </p>
      )}

      {/* --- Journées --- */}
      {data.journees.length === 0 ? (
        <section className={c.bloc}>
          <p className={c.vide}>Aucune journée d’hospitalisation enregistrée.</p>
        </section>
      ) : (
        <>
          <nav className={s.onglets} aria-label="Journées d'hospitalisation">
            {data.journees.map((j, i) => (
              <button key={j.id} type="button" className={`${s.onglet} ${j.id === jour?.id ? s.ongletActif : ''}`} onClick={() => setJourActif(j.id)}>
                <strong>J{i + 1}</strong>
                <small>{dateFr(j.jour)}</small>
              </button>
            ))}
          </nav>

          {jour && (
            <motion.div key={jour.id} className={s.journee} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p className={s.equipe}>
                <FaUserMd aria-hidden="true" /> {jour.medecin ? `Dr ${jour.medecin.replace(/^dr\.?\s*/i, '')}` : 'Médecin —'}
                {jour.infirmier && ` · Inf. ${jour.infirmier}`}
                {jour.lit && ` · ${jour.lit}`}
              </p>

              {/* Protocole thérapeutique */}
              <section className={c.bloc}>
                <div className={s.titreBloc}>
                  <FaPills aria-hidden="true" />
                  <div>
                    <h2>Protocoles thérapeutiques</h2>
                    <p>Cliquez sur une heure pour confirmer que le protocole a été appliqué.</p>
                  </div>
                </div>
                {jour.protocoles.length === 0 ? (
                  <p className={s.note}>Aucun protocole prescrit pour cette journée.</p>
                ) : (
                  <>
                  <div className={c.tableWrap}>
                    <table className={`${c.table} ${c.centre}`}>
                      <thead>
                        <tr>
                          <th>Produit à administrer</th>
                          <th>Quantité</th>
                          <th>Dosage</th>
                          <th>Voie d’admission</th>
                          <th>Heures d’application</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pgProtocoles.lignes.map((p) => (
                          <tr key={p.id}>
                            <td className={s.produit}>
                              <strong>{p.produit}</strong>
                            </td>
                            <td>
                              {p.quantite}
                              {p.unite ? ` ${p.unite}` : ''}
                            </td>
                            <td>{p.dosage ?? '—'}</td>
                            <td>{p.voie ?? '—'}</td>
                            <td>
                              {p.heures.length === 0 ? (
                                <span className={s.note}>Aucune heure</span>
                              ) : (
                                <span className={s.heures}>
                                  {p.heures.map((x) =>
                                    x.applique ? (
                                      <span key={x.id} className={`${s.heure} ${s.heureFaite}`} title={x.appliqueA ? `Appliqué à ${x.appliqueA}` : 'Appliqué'}>
                                        <FaCheck aria-hidden="true" /> {x.heure}
                                        <small>Appliqué{x.appliqueA ? ` ${x.appliqueA}` : ''}</small>
                                      </span>
                                    ) : (
                                      <button
                                        key={x.id}
                                        type="button"
                                        className={`${s.heure} ${s.heureAFaire}`}
                                        disabled={h.terminee}
                                        onClick={() => setHeureAConfirmer({ id: x.id, heure: x.heure, produit: p.produit })}
                                      >
                                        <FaClock aria-hidden="true" /> {x.heure}
                                        <small>Non appliqué</small>
                                      </button>
                                    ),
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationTableau pagination={pgProtocoles} />
                  </>
                )}
              </section>

              {/* Surveillances */}
              <section className={c.bloc}>
                <div className={s.titreBloc}>
                  <FaHeartbeat aria-hidden="true" />
                  <div>
                    <h2>Surveillance</h2>
                    <p>Paramètres relevés pendant la journée.</p>
                  </div>
                  <span className={s.compte}>{jour.surveillances.length}</span>
                </div>
                {jour.surveillances.length === 0 ? (
                  <p className={s.note}>Aucune surveillance pour cette journée.</p>
                ) : (
                  <>
                  <div className={c.tableWrap}>
                    <table className={`${c.table} ${c.centre}`}>
                      <thead>
                        <tr>
                          <th />
                          <th>TA (mmHg)</th>
                          <th>T° (°C)</th>
                          <th>Pouls (bpm)</th>
                          <th>Diurèse (ml)</th>
                          <th>Conscience</th>
                          <th>Glycémie (g/l)</th>
                          <th>SaO₂ (%)</th>
                          <th>Poids (kg)</th>
                          <th>Heure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pgSurveillances.lignes.map((v, i) => (
                          <tr key={v.id} title={[v.evolution, v.conduite].filter(Boolean).join(' — ')}>
                            <td>
                              <span className={s.numeroH}>H{i + 1}</span>
                            </td>
                            <td>{v.ta ?? '—'}</td>
                            <td>{v.temperature ?? '—'}</td>
                            <td>{v.pouls ?? '—'}</td>
                            <td>{v.diurese ?? '—'}</td>
                            <td>{v.conscience ?? '—'}</td>
                            <td>{v.glycemie ?? '—'}</td>
                            <td>{v.sao2 ?? '—'}</td>
                            <td>{v.poids ?? '—'}</td>
                            <td>{v.heure ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationTableau pagination={pgSurveillances} />
                  </>
                )}

                {saisieOuverte ? (
                  <form className={s.formulaire} onSubmit={enregistrer} noValidate>
                    <h3>Nouvelle surveillance</h3>
                    <div className={s.parametres}>
                      {PARAMETRES.map((p) => (
                        <label key={p.k} className={s.parametre}>
                          <small>
                            {p.libelle} <em>*</em>
                          </small>
                          <span>
                            <input value={form[p.k] ?? ''} placeholder={p.placeholder} onChange={(e) => setForm((f) => ({ ...f, [p.k]: e.target.value }))} />
                            <i>{p.unite}</i>
                          </span>
                        </label>
                      ))}
                      <label className={s.parametre}>
                        <small>
                          Conscience <em>*</em>
                        </small>
                        <select value={form.conscience ?? ''} onChange={(e) => setForm((f) => ({ ...f, conscience: e.target.value }))}>
                          {CONSCIENCES.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </label>
                      <label className={s.parametre}>
                        <small>Heure (facultatif)</small>
                        <input type="time" value={form.heure ?? ''} onChange={(e) => setForm((f) => ({ ...f, heure: e.target.value }))} />
                      </label>
                    </div>
                    <div className={s.deuxColonnes}>
                      <label className={s.champ}>
                        <span>Évolution</span>
                        <textarea rows={2} value={form.evolution ?? ''} onChange={(e) => setForm((f) => ({ ...f, evolution: e.target.value }))} placeholder="État du patient depuis la dernière surveillance…" />
                      </label>
                      <label className={s.champ}>
                        <span>Conduite à tenir</span>
                        <textarea rows={2} value={form.conduite_tenir ?? ''} onChange={(e) => setForm((f) => ({ ...f, conduite_tenir: e.target.value }))} placeholder="Actions réalisées ou à prévoir…" />
                      </label>
                    </div>
                    <div className={s.pied}>
                      <button type="button" className={c.secondaire} onClick={() => setForm(FORMULAIRE_VIDE)} disabled={envoi}>
                        Annuler
                      </button>
                      <button type="submit" className={c.principal} disabled={envoi}>
                        <FaSave aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Valider'}
                      </button>
                    </div>
                  </form>
                ) : (
                  !h.terminee && <p className={s.note}>La saisie se fait sur la journée en cours (J{data.journees.length}).</p>
                )}
              </section>
            </motion.div>
          )}
        </>
      )}

      <ConfirmDialog
        ouvert={!!heureAConfirmer}
        titre="Confirmation"
        message={heureAConfirmer ? `Avez-vous appliqué le protocole renseigné par le médecin ? ${heureAConfirmer.produit} — ${heureAConfirmer.heure}` : ''}
        confirmer="Oui, appliqué"
        enCours={application}
        onConfirmer={appliquer}
        onAnnuler={() => setHeureAConfirmer(null)}
      />
    </div>
  );
}
