import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  FaArrowLeft,
  FaBriefcase,
  FaChevronDown,
  FaFileMedical,
  FaHospital,
  FaMapMarkerAlt,
  FaNotesMedical,
  FaPhoneAlt,
  FaRoute,
  FaPills,
  FaSearch,
  FaStethoscope,
  FaUserMd,
  FaUserNurse,
  FaVideo,
  FaUserEdit,
} from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ModifierPatient from '../../Accueil/ModifierPatient';
import { alerte, messageErreur } from '../../../../services/alertes';
import { apiAgent, uploadUrl, type EspaceAgent } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { DossierMedical as Dossier } from '../../../../types';
import s from './DossierMedical.module.css';
import { age, CONSTANTES, dateHeure, initiales } from './outils';

/**
 * INFIRMIER > DOSSIER MÉDICAL D'UN PATIENT (page dédiée, bouton "œil" de la liste des patients)
 * Repris de Laravel : users/doctor/patient/dossier_medical.blade.php + partials/patient_interventions_table.blade.php
 *   en-tête patient, puis historique de toutes ses consultations (tous établissements) ;
 *   chaque consultation se déplie : constantes, bilan & diagnostic, ordonnances, documents, antécédents.
 */
export default function DossierMedical({ espace = 'infirmier' }: { espace?: EspaceAgent } = {}) {
  const base = espace === 'medecin' ? '/medecin' : '/infirmier';
  const { id } = useParams();
  const navigate = useNavigate();
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [erreur, setErreur] = useState(false);
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [imgErreur, setImgErreur] = useState(false);
  const [miseAJour, setMiseAJour] = useState(false);
  const [rechargement, setRechargement] = useState(0);
  // Recherche dans l'historique : n° de consultation ou nom (médecin, infirmier·ère, hôpital, service, motif, diagnostic)
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    apiAgent(espace)
      .patients.dossier(Number(id))
      .then((d) => {
        setDossier(d);
        setOuverte(d.interventions[0]?.id ?? null); // la plus récente ouverte par défaut
      })
      .catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible d'ouvrir le dossier : ${messageErreur(e)}`);
      });
  }, [id, rechargement, espace]);

  const retour = (
    <button type="button" className={c.secondaire} onClick={() => navigate(-1)}>
      <FaArrowLeft aria-hidden="true" /> Retour
    </button>
  );

  if (!dossier) {
    return (
      <div className={c.page}>
        <header className={c.entete}>
          <div>
            <p className={c.surtitre}>Gestion patients</p>
            <h1 className={c.titre}>Dossier médical</h1>
          </div>
          {retour}
        </header>
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Dossier introuvable.' : 'Chargement du dossier…'}</p>
        </section>
      </div>
    );
  }

  const { patient, interventions } = dossier;
  const feminin = (patient.genre ?? '').toLowerCase().startsWith('f');
  const photo = patient.imgUrl ? (patient.imgUrl.startsWith('http') ? patient.imgUrl : uploadUrl('patient', patient.imgUrl)) : null;
  const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = sansAccents(recherche.trim());
  const filtrees = q
    ? interventions.filter((it) => [it.code, it.medecin, it.infirmier, it.hopital, it.service, it.motif, it.diagnostic].some((v) => v && sansAccents(String(v)).includes(q)))
    : interventions;

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Gestion patients</p>
          <h1 className={c.titre}>Dossier médical</h1>
        </div>
        <div className={c.boutons}>
          <button type="button" className={c.secondaire} onClick={() => setMiseAJour(true)}>
            <FaUserEdit aria-hidden="true" /> Mettre à jour les informations
          </button>
          {espace === 'infirmier' && (
            <Link to="/infirmier/patients/liste" className={c.secondaire}>
              Liste des patients
            </Link>
          )}
          {retour}
        </div>
      </header>

      {/* --- En-tête patient --- */}
      <motion.section className={`${c.bloc} ${s.patient}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {photo && !imgErreur ? (
          <img src={photo} alt="" className={s.avatar} onError={() => setImgErreur(true)} />
        ) : (
          <span className={`${s.avatar} ${s.initiales} ${feminin ? s.feminin : ''}`}>{initiales(patient.nom)}</span>
        )}
        <div className={s.identite}>
          <h2>{patient.nom}</h2>
          <span className={s.dossierNo}>Dossier N° {patient.code}</span>
          <p className={s.meta}>
            <span>{feminin ? 'Féminin' : patient.genre ? 'Masculin' : '—'}</span>
            <span>{age(patient.dateNaissance) ?? 'Âge inconnu'}</span>
            <span>
              <FaBriefcase aria-hidden="true" /> {patient.profession ?? 'Profession non renseignée'}
            </span>
          </p>
          <p className={s.meta}>
            <span>
              <FaPhoneAlt aria-hidden="true" /> {patient.telephone ?? 'Non renseigné'}
            </span>
            <span>
              <FaMapMarkerAlt aria-hidden="true" /> {patient.residence ?? 'Résidence inconnue'}
            </span>
          </p>
        </div>
        <dl className={s.infos}>
          <div>
            <dt>Né(e) le</dt>
            <dd>
              {patient.dateNaissance ?? '—'}
              {patient.lieuNaissance ? ` à ${patient.lieuNaissance}` : ''}
            </dd>
          </div>
          <div>
            <dt>N° CMU</dt>
            <dd>{patient.numCmu ?? '—'}</dd>
          </div>
          <div>
            <dt>Groupe sanguin</dt>
            <dd>{patient.groupeSanguin ?? '—'}</dd>
          </div>
          <div>
            <dt>Allergies</dt>
            <dd>{patient.allergies ?? '—'}</dd>
          </div>
        </dl>
      </motion.section>

      {/* --- Historique --- */}
      <section className={c.bloc}>
        <div className={s.historiqueEntete}>
          <span className={s.historiqueIcone}>
            <FaFileMedical aria-hidden="true" />
          </span>
          <div>
            <h2>Historique et dossier médical complet</h2>
            <p>Constatations, prises de constantes, diagnostics et soins reçus dans tous les établissements.</p>
          </div>
          {interventions.length > 0 && (
            <label className={s.recherche}>
              <FaSearch aria-hidden="true" />
              <input
                type="search"
                placeholder="Nom ou N° de consultation…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                aria-label="Rechercher une consultation par nom ou numéro"
              />
            </label>
          )}
          <span className={s.compte}>
            {q ? `${filtrees.length} / ` : ''}
            {interventions.length} consultation{interventions.length > 1 ? 's' : ''}
          </span>
        </div>

        {interventions.length > 0 && filtrees.length === 0 && (
          <div className={s.vide}>
            <FaSearch aria-hidden="true" />
            <strong>Aucune consultation ne correspond</strong>
            <p>Essayez un autre nom ou numéro de consultation.</p>
          </div>
        )}

        {interventions.length === 0 ? (
          <div className={s.vide}>
            <FaFileMedical aria-hidden="true" />
            <strong>Aucune intervention enregistrée</strong>
            <p>Ce patient n'a encore aucune consultation dans le système.</p>
          </div>
        ) : (
          <ol className={s.frise}>
            {filtrees.map((it, i) => {
              const ouvert = ouverte === it.id;
              return (
                <motion.li key={it.id} className={`${s.intervention} ${ouvert ? s.interventionOuverte : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}>
                  <button type="button" className={s.ligne} onClick={() => setOuverte(ouvert ? null : it.id)} aria-expanded={ouvert}>
                    <span className={s.date}>
                      <strong>{dateHeure(it.date)}</strong>
                      <small>N° {it.code}</small>
                    </span>
                    <span className={s.lieu}>
                      <strong>
                        <FaHospital aria-hidden="true" /> {it.hopital}
                      </strong>
                      <small>
                        {it.service} ·{' '}
                        {it.enLigne ? (
                          <>
                            <FaVideo aria-hidden="true" /> En ligne
                          </>
                        ) : (
                          'Présentiel'
                        )}
                      </small>
                    </span>
                    <span className={s.motif}>
                      <strong>{it.motif}</strong>
                      {it.diagnostic && <small>Diagnostic : {it.diagnostic}</small>}
                    </span>
                    <span className={s.intervenants}>
                      {it.medecin && (
                        <small>
                          <FaUserMd aria-hidden="true" /> {/^dr\.?\s/i.test(it.medecin) ? it.medecin : `Dr ${it.medecin}`}
                        </small>
                      )}
                      {it.infirmier && (
                        <small>
                          <FaUserNurse aria-hidden="true" /> Inf. {it.infirmier}
                        </small>
                      )}
                      {!it.medecin && !it.infirmier && <small>Non spécifié</small>}
                    </span>
                    <span className={s.statut}>
                      <span className={`${c.badge} ${it.terminee ? c.badgeOk : s.badgeAttente}`}>{it.terminee ? 'Terminée' : 'Non terminée'}</span>
                      {it.issue && <small>{it.issue}</small>}
                    </span>
                    <FaChevronDown className={`${s.chevron} ${ouvert ? s.chevronOuvert : ''}`} aria-hidden="true" />
                  </button>

                  <AnimatePresence initial={false}>
                    {ouvert && (
                      <motion.div className={s.detail} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}>
                        <div className={s.detailInterieur}>
                          {/* Constantes */}
                          <div className={s.carte}>
                            <h3>
                              <FaStethoscope aria-hidden="true" /> Prise de constantes
                            </h3>
                            <div className={s.constantes}>
                              {CONSTANTES.map((k) => (
                                <div key={k.cle} className={it.constantes[k.cle] ? '' : s.constanteVide}>
                                  <span>{k.libelle}</span>
                                  <strong>{it.constantes[k.cle] ? `${it.constantes[k.cle]} ${k.unite}` : 'N/A'}</strong>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Bilan */}
                          <div className={s.carte}>
                            <h3>
                              <FaNotesMedical aria-hidden="true" /> Bilan médical & diagnostic
                            </h3>
                            <dl className={s.bilan}>
                              <div>
                                <dt>Motif</dt>
                                <dd>{it.motif}</dd>
                              </div>
                              {it.examenPhysique && (
                                <div>
                                  <dt>Examen physique</dt>
                                  <dd>{it.examenPhysique}</dd>
                                </div>
                              )}
                              <div>
                                <dt>Diagnostic retenu</dt>
                                <dd>{it.diagnostic ?? 'Aucun diagnostic spécifique enregistré'}</dd>
                              </div>
                            </dl>
                            {it.antecedents && (
                              <div className={s.antecedents}>
                                <span className={s.sousTitre}>Antécédents du registre</span>
                                <div className={s.pastilles}>
                                  {(
                                    [
                                      ['HTA', it.antecedents.hta],
                                      ['Alcool', it.antecedents.alcool],
                                      ['Tabac', it.antecedents.tabac],
                                      ['Drépanocytose', it.antecedents.drepanocytose],
                                    ] as [string, string | null][]
                                  ).map(([l, v]) => (
                                    <span key={l} className={`${c.badge} ${/oui/i.test(v ?? '') ? s.badgeRisque : c.badgeNeutre}`}>
                                      {l} : {v ?? 'Non'}
                                    </span>
                                  ))}
                                </div>
                                {it.antecedents.traitementsAnterieurs && <p className={s.note}>Traitements antérieurs : {it.antecedents.traitementsAnterieurs}</p>}
                              </div>
                            )}
                          </div>

                          {/* Ordonnances & documents */}
                          <div className={s.carte}>
                            <h3>
                              <FaPills aria-hidden="true" /> Prescriptions & documents
                            </h3>
                            {it.ordonnances.length === 0 ? (
                              <p className={s.note}>Aucune ordonnance émise lors de cette intervention.</p>
                            ) : (
                              it.ordonnances.map((o, k) => (
                                <div key={k} className={s.ordonnance}>
                                  <span className={s.sousTitre}>
                                    Ordonnance {o.type}
                                    {o.reference ? ` · ${o.reference}` : ''}
                                  </span>
                                  {o.medicaments.length === 0 ? (
                                    <p className={s.note}>Aucun médicament listé.</p>
                                  ) : (
                                    <ul>
                                      {o.medicaments.map((m, j) => (
                                        <li key={j}>
                                          <strong>{m.nom}</strong>
                                          <small>
                                            {m.posologie ?? 'Selon ordonnance'}
                                            {m.quantite ? ` · Qté ${m.quantite}` : ''}
                                            {m.duree ? ` · ${m.duree}` : ''}
                                          </small>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ))
                            )}
                            {(it.documents.examen || it.documents.arret || it.documents.hospitalisation) && (
                              <div className={s.pastilles}>
                                {it.documents.examen && <span className={`${c.badge} ${s.badgeInfo}`}>Bulletin d'examen demandé</span>}
                                {it.documents.arret && <span className={`${c.badge} ${s.badgeInfo}`}>Arrêt de travail délivré</span>}
                                {it.documents.hospitalisation && <span className={`${c.badge} ${s.badgeRisque}`}>Hospitalisation requise</span>}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={s.actionsDetail}>
                          <Link to={`${base}/patients/${patient.id}/parcours/${it.id}`} className={c.principal}>
                            <FaRoute aria-hidden="true" /> Voir tout le parcours
                          </Link>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ol>
        )}
      </section>
      {miseAJour && (
        <ModifierPatient
          espace={espace}
          patientId={Number(id)}
          onFermer={() => setMiseAJour(false)}
          onEnregistre={() => {
            setMiseAJour(false);
            setRechargement((x) => x + 1);
          }}
        />
      )}
    </div>
  );
}
