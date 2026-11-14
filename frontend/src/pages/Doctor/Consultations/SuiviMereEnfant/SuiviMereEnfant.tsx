import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaArrowRight, FaBaby, FaCheck, FaEye, FaFemale, FaPlus, FaSearch, FaTimes } from 'react-icons/fa';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { DossierSuiviMereEnfant, PatientSuiviItem, TypeSuiviMereEnfant } from '../../../../types';
import a from '../../../Infirmier/Accueil/Accueil.module.css';
import m from '../../../Infirmier/Accueil/ModifierPatient.module.css';
import { aEnvoyer, type Champ, ETAPES_POSTNATAL, ETAPES_PRENATAL, type Etape, manquant, type Valeurs } from './champs';
import s from './SuiviMereEnfant.module.css';

const ONGLETS: { id: TypeSuiviMereEnfant; titre: string; detail: string; icone: typeof FaFemale }[] = [
  { id: 'prenatale', titre: 'Suivi prénatal', detail: 'La mère (PTME)', icone: FaFemale },
  { id: 'postnatale', titre: 'Suivi postnatal', detail: 'L’enfant exposé', icone: FaBaby },
];

const p2 = (n: number) => String(n).padStart(2, '0');
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const dateFr = (x: unknown) => {
  const t = String(x ?? '');
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : t || '—';
};
const initiales = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();

/** Visite postnatale enregistrée → valeurs à plat (mêmes clés que le formulaire) pour l'affichage détaillé */
function aplatir(type: TypeSuiviMereEnfant, item: Record<string, unknown>): Valeurs {
  const v: Valeurs = {};
  for (const [k, x] of Object.entries(item)) if (x !== null && x !== undefined && typeof x !== 'object') v[k] = String(x);
  if (type === 'postnatale') {
    for (const pcr of (item.pcr as Record<string, unknown>[]) ?? []) {
      const p = `pcr${pcr.numero}`;
      Object.assign(v, { [`${p}Date`]: pcr.date ?? '', [`${p}Age`]: pcr.age ?? '', [`${p}Resultat`]: pcr.resultat ?? '', [`${p}Annonce`]: pcr.annonce ?? '', [`${p}DateAnnonce`]: pcr.dateAnnonce ?? '' });
    }
    for (const sero of (item.serologies as Record<string, unknown>[]) ?? []) {
      const p = `sero${sero.numero}`;
      Object.assign(v, { [`${p}Date`]: sero.date ?? '', [`${p}Age`]: sero.age ?? '', [`${p}Resultat`]: sero.resultat ?? '', [`${p}Annonce`]: sero.annonce ?? '', [`${p}DateAnnonce`]: sero.dateAnnonce ?? '' });
    }
  }
  return v;
}

/** Badge coloré d'un résultat */
const Resultat = ({ v }: { v: unknown }) => {
  const t = String(v ?? '');
  if (!t) return <span className={s.muet}>—</span>;
  const classe = /positif/i.test(t) ? s.positif : /n[ée]gatif|sorti/i.test(t) ? s.negatif : s.neutre;
  return <span className={`${c.badge} ${classe}`}>{t}</span>;
};

/** Un champ du formulaire (saisie) */
function ChampSaisie({ champ, v, maj, erreur }: { champ: Champ; v: Valeurs; maj: (k: string, x: string) => void; erreur: boolean }) {
  const val = v[champ.k] ?? '';
  const classe = `${a.champ} ${champ.large ? s.large : ''} ${erreur && champ.requis && !val.trim() ? a.invalide : ''}`;
  return (
    <div className={classe}>
      <span className={a.etiquette}>
        {champ.libelle} {champ.requis && <span className={a.requis}>*</span>}
      </span>
      {champ.type === 'choix' ? (
        <div className={a.choix} role="radiogroup" aria-label={champ.libelle}>
          {champ.options!.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={val === o} className={`${a.option} ${val === o ? a.optionActive : ''}`} onClick={() => maj(champ.k, val === o ? '' : o)}>
              {o}
            </button>
          ))}
        </div>
      ) : (
        <input
          type={champ.type === 'date' ? 'date' : 'text'}
          max={champ.type === 'date' && champ.k !== 'dateProbableAccouchement' ? aujourdhui() : undefined}
          maxLength={champ.type === 'texte' ? 100 : undefined}
          placeholder={champ.aide}
          value={val}
          onChange={(e) => maj(champ.k, e.target.value)}
          aria-label={champ.libelle}
        />
      )}
    </div>
  );
}

/**
 * MÉDECIN / SAGE-FEMME > CONSULTATIONS > SUIVI MÈRE-ENFANT (PTME)
 * Équivalent Laravel : doctor.suivie.suivie (users/doctor/maternite/suivie-mere-enfant.blade.php)
 *   - suivi prénatal de la mère : ARV, charge virale, conjoint, grossesse ;
 *   - suivi postnatal de l'enfant exposé : prophylaxie, alimentation, 3 PCR, CTX, INH, sérologies, résultat final.
 */
export default function SuiviMereEnfant() {
  const [type, setType] = useState<TypeSuiviMereEnfant>('prenatale');
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState<PatientSuiviItem[] | null>(null);
  const [cherche, setCherche] = useState(false);
  const [dossier, setDossier] = useState<DossierSuiviMereEnfant | null>(null);
  const [form, setForm] = useState<{ etape: number; v: Valeurs; erreurs: boolean } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [detail, setDetail] = useState<Valeurs | null>(null);

  const etapes: Etape[] = type === 'prenatale' ? ETAPES_PRENATAL : ETAPES_POSTNATAL;

  // Recherche (après une courte pause de saisie)
  useEffect(() => {
    if (q.trim().length < 2) {
      setResultats(null);
      return;
    }
    let actif = true;
    setCherche(true);
    const t = setTimeout(() => {
      api.doctor.suiviMereEnfant
        .rechercher(type, q.trim())
        .then((r) => {
          if (actif) setResultats(r);
        })
        .catch((e) => {
          if (actif) alerte.echec(messageErreur(e));
        })
        .finally(() => {
          if (actif) setCherche(false);
        });
    }, 350);
    return () => {
      actif = false;
      clearTimeout(t);
    };
  }, [q, type]);

  const changerType = (t: TypeSuiviMereEnfant) => {
    setType(t);
    setDossier(null);
    setForm(null);
    setResultats(null);
    setQ('');
  };

  const ouvrir = async (id: number) => {
    try {
      setDossier(await api.doctor.suiviMereEnfant.dossier(type, id));
      setForm(null);
    } catch (e) {
      alerte.echec(messageErreur(e));
    }
  };

  const nouveauSuivi = () => {
    const v: Valeurs = { dateVisite: aujourdhui() };
    if (type === 'postnatale' && dossier && !dossier.patient.nomProvisoire) Object.assign(v, { nomEnfant: dossier.patient.nom, prenomEnfant: dossier.patient.prenom });
    setForm({ etape: 0, v, erreurs: false });
  };

  const maj = (k: string, x: string) => setForm((f) => (f ? { ...f, v: { ...f.v, [k]: x } } : f));

  const allerA = (n: number) => {
    if (!form) return;
    if (n > form.etape) {
      for (let i = form.etape; i < n; i++) {
        const err = manquant(etapes[i], form.v);
        if (err) {
          setForm({ ...form, etape: i, erreurs: true });
          return void alerte.echec(err);
        }
      }
    }
    setForm({ ...form, etape: n, erreurs: false });
  };

  const enregistrer = async () => {
    if (!form || !dossier) return;
    for (let i = 0; i < etapes.length; i++) {
      const err = manquant(etapes[i], form.v);
      if (err) {
        setForm({ ...form, etape: i, erreurs: true });
        return void alerte.echec(err);
      }
    }
    setEnvoi(true);
    try {
      const corps = { ...aEnvoyer(etapes, form.v), [type === 'prenatale' ? 'patientId' : 'enfantId']: dossier.patient.id };
      const r = await api.doctor.suiviMereEnfant.enregistrer(type, corps);
      alerte.succes(r.message);
      setForm(null);
      setDossier(await api.doctor.suiviMereEnfant.dossier(type, dossier.patient.id));
    } catch (e) {
      alerte.echec(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  const nomPatient = dossier ? `${dossier.patient.nom} ${dossier.patient.prenom}`.trim() : '';

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Consultations · Maternité</p>
          <h1 className={c.titre}>Suivi mère-enfant (PTME)</h1>
        </div>
      </header>

      {/* --- Prénatal / postnatal --- */}
      <div className={s.onglets} role="tablist" aria-label="Type de suivi">
        {ONGLETS.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={type === o.id} className={`${s.onglet} ${type === o.id ? s.ongletActif : ''}`} onClick={() => changerType(o.id)}>
            <o.icone aria-hidden="true" />
            <span>
              <strong>{o.titre}</strong>
              <small>{o.detail}</small>
            </span>
          </button>
        ))}
      </div>

      <div className={s.grille}>
        {/* --- Recherche --- */}
        <section className={`${c.bloc} ${s.recherche}`}>
          <label className={s.saisie}>
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder={type === 'prenatale' ? 'N° de dossier (DM), nom ou téléphone de la mère' : 'N° de dossier (DM) de l’enfant, nom de l’enfant ou de la mère'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </label>
          {cherche && <p className={s.aide}>Recherche…</p>}
          {!cherche && resultats && resultats.length === 0 && (
            <p className={s.aide}>{type === 'prenatale' ? 'Aucune patiente trouvée (le suivi prénatal concerne une femme).' : 'Aucun enfant trouvé (l’enfant doit être rattaché à sa mère).'}</p>
          )}
          {!resultats && <p className={s.aide}>{type === 'prenatale' ? 'Recherchez la mère pour voir ou ajouter son suivi prénatal.' : 'Recherchez l’enfant (ou sa mère) pour voir ou ajouter son suivi postnatal.'}</p>}
          <ul className={s.resultats}>
            {resultats?.map((p) => (
              <li key={p.id}>
                <button type="button" className={dossier?.patient.id === p.id ? s.resultatActif : ''} onClick={() => ouvrir(p.id)}>
                  <span className={s.avatar}>{initiales(p.nom)}</span>
                  <span className={s.texte}>
                    <strong>{p.nom}</strong>
                    <small>{[p.code, p.age, p.mere ? `mère : ${p.mere.nom}` : null].filter(Boolean).join(' · ')}</small>
                  </span>
                  {p.nbSuivis > 0 && <span className={`${c.badge} ${s.neutre}`}>{p.nbSuivis} suivi(s)</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* --- Dossier --- */}
        <section className={c.bloc}>
          {!dossier ? (
            <div className={s.vide}>
              {type === 'prenatale' ? <FaFemale aria-hidden="true" /> : <FaBaby aria-hidden="true" />}
              <strong>Choisissez {type === 'prenatale' ? 'une patiente' : 'un enfant'}</strong>
              <p>Son historique de suivi s’affichera ici.</p>
            </div>
          ) : (
            <>
              <div className={s.fiche}>
                <span className={s.avatarGrand}>{initiales(nomPatient)}</span>
                <div className={s.texte}>
                  <strong>{nomPatient}</strong>
                  <small>{[dossier.patient.code, dossier.patient.dateNaissance ? `né(e) le ${dossier.patient.dateNaissance}` : null, dossier.patient.age].filter(Boolean).join(' · ')}</small>
                  {dossier.mere && (
                    <small>
                      Mère : {dossier.mere.nom} ({dossier.mere.code}
                      {dossier.mere.age ? `, ${dossier.mere.age}` : ''})
                    </small>
                  )}
                </div>
                {!form && (
                  <button type="button" className={c.principal} onClick={nouveauSuivi}>
                    <FaPlus aria-hidden="true" /> Nouveau suivi
                  </button>
                )}
              </div>
              {dossier.patient.nomProvisoire && !form && <p className={s.rappel}>Nouveau-né enregistré à la naissance : complétez son nom et ses prénoms lors du prochain suivi.</p>}

              <AnimatePresence mode="wait">
                {form ? (
                  <motion.div key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <ol className={a.etapes}>
                      {etapes.map((e, i) => {
                        const faite = i < form.etape;
                        return (
                          <li key={e.titre} className={`${a.etape} ${i === form.etape ? a.etapeActive : ''} ${faite ? a.etapeFaite : ''}`}>
                            <button type="button" onClick={() => allerA(i)} aria-current={i === form.etape ? 'step' : undefined}>
                              <span className={a.etapeNumero}>
                                {i === form.etape && <motion.span layoutId="etape-ptme" className={a.etapeFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                                <span className={a.etapeChiffre}>{faite ? <FaCheck aria-hidden="true" /> : i + 1}</span>
                              </span>
                              <span className={a.etapeTexte}>
                                <small>Étape {i + 1}</small>
                                {e.titre}
                              </span>
                            </button>
                            {i < etapes.length - 1 && (
                              <span className={a.etapeTrait}>
                                <motion.span initial={false} animate={{ width: faite ? '100%' : '0%' }} />
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>

                    {etapes[form.etape].sections.map((sec) => {
                      const visibles = sec.champs.filter((ch) => !ch.si || ch.si(form.v));
                      return (
                        <div key={sec.titre} className={s.section}>
                          <h3>{sec.titre}</h3>
                          <div className={s.champs}>
                            {visibles.map((ch) => (
                              <ChampSaisie key={ch.k} champ={ch} v={form.v} maj={maj} erreur={form.erreurs} />
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    <footer className={a.pied}>
                      {form.etape === 0 ? (
                        <button type="button" className={c.secondaire} onClick={() => setForm(null)} disabled={envoi}>
                          Annuler
                        </button>
                      ) : (
                        <button type="button" className={c.secondaire} onClick={() => allerA(form.etape - 1)} disabled={envoi}>
                          <FaArrowLeft aria-hidden="true" /> Précédent
                        </button>
                      )}
                      <span className={a.piedEtape}>
                        Étape {form.etape + 1} / {etapes.length}
                      </span>
                      {form.etape < etapes.length - 1 ? (
                        <button type="button" className={c.principal} onClick={() => allerA(form.etape + 1)}>
                          Suivant <FaArrowRight aria-hidden="true" />
                        </button>
                      ) : (
                        <button type="button" className={c.principal} onClick={enregistrer} disabled={envoi}>
                          <FaCheck aria-hidden="true" /> {envoi ? 'Enregistrement…' : 'Enregistrer le suivi'}
                        </button>
                      )}
                    </footer>
                  </motion.div>
                ) : (
                  <motion.div key="historique" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <h3 className={s.titreHistorique}>Historique des suivis {type === 'prenatale' ? 'prénatals' : 'postnatals'}</h3>
                    {dossier.suivis.length === 0 ? (
                      <p className={c.vide}>Aucun suivi enregistré : cliquez sur « Nouveau suivi ».</p>
                    ) : (
                      <div className={c.tableWrap}>
                        <table className={`${c.table} ${c.centre}`}>
                          <thead>
                            {type === 'prenatale' ? (
                              <tr>
                                <th>Date de visite</th>
                                <th>Âge gest.</th>
                                <th>Statut ARV</th>
                                <th>Sous ARV</th>
                                <th>Charge virale</th>
                                <th>Conjoint</th>
                                <th>Issue</th>
                                <th>Actions</th>
                              </tr>
                            ) : (
                              <tr>
                                <th>Date de visite</th>
                                <th>Âge</th>
                                <th>Alimentation</th>
                                <th>PCR 1</th>
                                <th>PCR 2</th>
                                <th>PCR 3</th>
                                <th>Résultat final</th>
                                <th>Actions</th>
                              </tr>
                            )}
                          </thead>
                          <tbody>
                            {dossier.suivis.map((x) => {
                              const r = x as Record<string, unknown>;
                              const pcr = (r.pcr as Record<string, unknown>[]) ?? [];
                              return (
                                <tr key={x.id}>
                                  <td>{dateFr(x.dateVisite)}</td>
                                  {type === 'prenatale' ? (
                                    <>
                                      <td>{String(r.ageGestationnel ?? '—')}</td>
                                      <td className={s.cellule}>{String(r.statutArv ?? '—')}</td>
                                      <td>{String(r.mereSousArv ?? '—')}</td>
                                      <td>{r.prelevementChargeVirale === 'Oui' ? String(r.resultatChargeVirale ?? 'Oui') : 'Non'}</td>
                                      <td>
                                        <Resultat v={r.depistageVihConjoint === 'Oui' ? r.resultatVihConjoint : r.depistageVihConjoint} />
                                      </td>
                                      <td>{String(r.issueGrossesse ?? '—')}</td>
                                    </>
                                  ) : (
                                    <>
                                      <td>{String(r.ageVisite ?? '—')}</td>
                                      <td className={s.cellule}>{String(r.typeAlimentation ?? '—')}</td>
                                      {[0, 1, 2].map((i) => (
                                        <td key={i}>
                                          <Resultat v={pcr[i]?.resultat} />
                                        </td>
                                      ))}
                                      <td>
                                        <Resultat v={r.resultatFinal} />
                                      </td>
                                    </>
                                  )}
                                  <td>
                                    <button type="button" className={c.secondaire} onClick={() => setDetail(aplatir(type, r))}>
                                      <FaEye aria-hidden="true" /> Voir
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </section>
      </div>

      {/* --- Détail d'une visite --- */}
      {detail && (
        <div className={m.voile} onClick={() => setDetail(null)}>
          <div className={m.fenetre} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="titre-detail-suivi">
            <header className={m.haut}>
              <span className={m.icone}>{type === 'prenatale' ? <FaFemale aria-hidden="true" /> : <FaBaby aria-hidden="true" />}</span>
              <div>
                <h2 id="titre-detail-suivi">
                  Suivi {type === 'prenatale' ? 'prénatal' : 'postnatal'} du {dateFr(detail.dateVisite)}
                </h2>
                <p>{nomPatient}</p>
              </div>
              <button type="button" className={m.fermer} onClick={() => setDetail(null)} aria-label="Fermer">
                <FaTimes />
              </button>
            </header>
            <div className={m.corps}>
              {etapes
                .flatMap((e) => e.sections)
                .filter((sec) => sec.champs.some((ch) => !['nomEnfant', 'prenomEnfant'].includes(ch.k)))
                .map((sec) => (
                  <div key={sec.titre}>
                    <h3 className={m.titre}>{sec.titre}</h3>
                    <dl className={s.detail}>
                      {sec.champs
                        .filter((ch) => !['nomEnfant', 'prenomEnfant'].includes(ch.k) && (!ch.si || ch.si(detail)))
                        .map((ch) => (
                          <div key={ch.k}>
                            <dt>{ch.libelle}</dt>
                            <dd>{ch.type === 'date' ? dateFr(detail[ch.k]) : detail[ch.k] || '—'}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
