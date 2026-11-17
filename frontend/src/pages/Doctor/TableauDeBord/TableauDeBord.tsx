import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { FaArrowRight, FaClock, FaHistory, FaHospital, FaMugHot, FaPlay, FaSearch, FaStethoscope, FaSyncAlt, FaUserPlus, FaUsers, FaVideo } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DoctorDashboard, ExpertiseDisponible } from '../../../types';
import Chrono, { CompteARebours, delaiExpertise } from '../Telemedecine/Chrono';
import { BadgeType } from '../Telemedecine/Telemedecine';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient, heure } from '../Consultations/ListeConsultations';
import { libelleDate } from '../Telemedecine/CarteTelemedecine';
import s from './TableauDeBord.module.css';

const salutation = () => (new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir');
const docteur = (nom: string) => (/^dr\.?\s/i.test(nom) ? nom : `Dr ${nom}`);

/**
 * MÉDECIN / SAGE-FEMME > TABLEAU DE BORD
 * Équivalent Laravel : partials/dashboard/doctor.blade.php — file des consultations du jour
 * (actualisée automatiquement), accès direct au prochain patient.
 */
export default function TableauDeBord() {
  const [data, setData] = useState<DoctorDashboard | null>(null);
  const [maj, setMaj] = useState<Date | null>(null);
  // Télé-expertises externes de mon service, à prendre en charge
  const [disponibles, setDisponibles] = useState<ExpertiseDisponible[]>([]);

  const charger = useCallback(() => {
    api.doctor.referes
      .disponibles()
      .then(setDisponibles)
      .catch(() => setDisponibles([]));
    api.doctor
      .tableauDeBord()
      .then((d) => {
        setData(d);
        setMaj(new Date());
      })
      .catch((e) => alerte.echec(`Impossible de charger le tableau de bord : ${messageErreur(e)}`));
  }, []);

  useEffect(() => {
    charger();
    const t = setInterval(charger, 15000); // Laravel : actualisation automatique
    return () => clearInterval(t);
  }, [charger]);

  const prochain = data?.file[0] ?? null;
  const suivants = data?.file.slice(1) ?? [];
  const teleProchaine = data?.telemedecines[0] ?? null;
  const teleSuivantes = data?.telemedecines.slice(1) ?? [];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Tableau de bord</p>
          <h1 className={c.titre}>
            {salutation()}
            {data ? `, ${docteur(data.medecin.nom)}` : ''}
          </h1>
        </div>
        <div className={c.boutons}>
          <Link to="/medecin/consultations/historique" className={c.secondaire}>
            <FaHistory aria-hidden="true" /> Historique
          </Link>
          <button type="button" className={c.secondaire} onClick={charger}>
            <FaSyncAlt aria-hidden="true" /> Actualiser
          </button>
        </div>
      </header>

      {/* --- Situation du médecin --- */}
      <motion.section className={`${c.bloc} ${s.situation}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className={s.service}>
          <span className={`${s.pastille} ${data?.medecin.enService ? s.pastilleActive : ''}`} aria-hidden="true" />
          <div>
            <strong>{!data ? 'Chargement…' : data.medecin.permission ? 'En permission : hors service' : data.medecin.enService ? 'En service' : 'Hors de votre créneau'}</strong>
            <small>
              <FaHospital aria-hidden="true" /> {data?.medecin.hopital ?? '—'}
              {data?.medecin.service ? ` · ${data.medecin.service}` : ''}
              {data?.medecin.creneau ? ` · ${data.medecin.creneau}` : ''}
            </small>
          </div>
        </div>
        {/* Accueil du patient, comme chez l'infirmier·ère : inscription ou vérification, puis consultation directe */}
        <div className={s.actions}>
          <Link to="/medecin/patients/inscrire" className={`${s.action} ${s.actionBleue}`}>
            <span className={s.actionIcone}>
              <FaUserPlus aria-hidden="true" />
            </span>
            <span className={s.actionTexte}>
              <strong>Inscrire un nouveau patient</strong>
              <small>Complète ou d'urgence, puis consultation</small>
            </span>
            <FaArrowRight className={s.actionFleche} aria-hidden="true" />
          </Link>
          <Link to="/medecin/patients/affecter" className={`${s.action} ${s.actionVerte}`}>
            <span className={s.actionIcone}>
              <FaSearch aria-hidden="true" />
            </span>
            <span className={s.actionTexte}>
              <strong>Vérifier / Rechercher</strong>
              <small>Patient déjà inscrit : dossier, téléphone ou nom</small>
            </span>
            <FaArrowRight className={s.actionFleche} aria-hidden="true" />
          </Link>
        </div>
        <dl className={s.chiffres}>
          <div>
            <dt>En attente aujourd'hui</dt>
            <dd>{data?.compteurs.duJour ?? '—'}</dd>
          </div>
          <div>
            <dt>En attente (tous jours)</dt>
            <dd>{data?.compteurs.enAttente ?? '—'}</dd>
          </div>
          <div>
            <dt>Terminées aujourd'hui</dt>
            <dd>{data?.compteurs.termineesJour ?? '—'}</dd>
          </div>
        </dl>
      </motion.section>

      {/* --- Deux colonnes égales : consultations | télémédecine, même présentation --- */}
      <div className={s.grille}>
        {/* ================= CONSULTATIONS ================= */}
        <div className={s.colonne}>
          <motion.section className={`${s.prochain} ${prochain ? '' : s.prochainVide}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {prochain ? (
              <>
                <span className={s.etiquette}>Prochain patient</span>
                <div className={s.prochainPatient}>
                  <AvatarPatient patient={prochain.patient} />
                  <div>
                    <strong title={prochain.patient.nom}>{prochain.patient.nom}</strong>
                    <small>
                      {prochain.patient.code}
                      {age(prochain.patient.dateNaissance) ? ` · ${age(prochain.patient.dateNaissance)}` : ''}
                    </small>
                  </div>
                  {prochain.urgence && <span className={s.urgence}>Urgence</span>}
                  <dl className={s.prochainInfos}>
                    <div>
                      <dt>Motif</dt>
                      <dd title={String(prochain.motif)}>{prochain.motif}</dd>
                    </div>
                    <div>
                      <dt>Prestation</dt>
                      <dd title={String(prochain.prestation)}>{prochain.prestation}</dd>
                    </div>
                    <div>
                      <dt>Arrivé à</dt>
                      <dd title={String(heure(prochain.creeLe))}>{heure(prochain.creeLe)}</dd>
                    </div>
                  </dl>
                </div>
                <Link to={`/medecin/consultations/${prochain.id}`} className={s.commencer}>
                  <FaPlay aria-hidden="true" /> Commencer la consultation
                </Link>
              </>
            ) : (
              <>
                <FaMugHot className={s.videIcone} aria-hidden="true" />
                <strong>Aucun patient en attente aujourd'hui</strong>
                <small>Les patients envoyés par l'infirmier s'afficheront ici automatiquement.</small>
                {(data?.compteurs.enAttente ?? 0) > 0 && (
                  <Link to="/medecin/consultations/tous-les-patients" className={c.secondaire}>
                    Voir les {data!.compteurs.enAttente} patient(s) des jours précédents <FaArrowRight aria-hidden="true" />
                  </Link>
                )}
              </>
            )}
          </motion.section>

          <motion.section className={c.bloc} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className={s.fileEntete}>
              <span className={s.fileIcone}>
                <FaUsers aria-hidden="true" />
              </span>
              <div>
                <h2>File d'attente du jour</h2>
                <p>
                  <FaClock aria-hidden="true" /> Actualisée automatiquement{maj ? ` · ${maj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
                </p>
              </div>
              <Link to="/medecin/consultations/tous-les-patients" className={s.lien}>
                Tous <span>{data?.compteurs.enAttente ?? 0}</span>
              </Link>
            </div>

            {!data ? (
              <p className={c.vide}>Chargement…</p>
            ) : suivants.length === 0 ? (
              <div className={s.fileVide}>
                <FaStethoscope aria-hidden="true" />
                <p>{prochain ? 'Aucun autre patient après le prochain.' : 'La file est vide pour le moment.'}</p>
              </div>
            ) : (
              <ol className={s.file}>
                {suivants.map((x, i) => (
                  <motion.li key={x.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}>
                    <AvatarPatient patient={x.patient} />
                    <span className={s.fileTexte}>
                      <strong>
                        {x.patient.nom}
                        {x.urgence && <em className={s.urgence}>Urgence</em>}
                      </strong>
                      <small>
                        {x.motif} · {x.prestation}
                      </small>
                    </span>
                    <span className={s.fileHeure}>{heure(x.creeLe)}</span>
                    <Link to={`/medecin/consultations/${x.id}`} className={`${c.principal} ${s.consulter}`}>
                      <FaPlay aria-hidden="true" /> Consulter
                    </Link>
                  </motion.li>
                ))}
              </ol>
            )}
          </motion.section>
        </div>

        {/* ================= TÉLÉMÉDECINE ================= */}
        <div className={s.colonne}>
          <motion.section className={`${s.prochain} ${teleProchaine ? '' : s.prochainVide}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {teleProchaine ? (
              <>
                {/* Même ligne : type de demande à gauche, compte à rebours à droite */}
                <div className={s.prochainEntete}>
                  <span className={s.etiquette}>
                    <FaVideo aria-hidden="true" /> Prochaine demande · <BadgeType item={teleProchaine} />
                  </span>
                  <CompteARebours date={teleProchaine.date} heure={teleProchaine.heure} echeance={teleProchaine.expertise?.echeance} delai={delaiExpertise(teleProchaine.expertise)} />
                </div>
                <div className={s.prochainPatient}>
                  <AvatarPatient patient={teleProchaine.patient} />
                  <div>
                    <strong title={teleProchaine.patient.nom}>{teleProchaine.patient.nom}</strong>
                    <small>
                      {teleProchaine.patient.code}
                      {age(teleProchaine.patient.dateNaissance) ? ` · ${age(teleProchaine.patient.dateNaissance)}` : ''}
                    </small>
                  </div>
                  {teleProchaine.urgence && <span className={s.urgence}>Urgence</span>}
                  <dl className={s.prochainInfos}>
                    <div>
                      <dt>Motif</dt>
                      <dd title={String(teleProchaine.motif)}>{teleProchaine.motif}</dd>
                    </div>
                    <div>
                      <dt>Demandée par</dt>
                      <dd title={String(teleProchaine.infirmier ?? 'Demande en ligne du patient')}>{teleProchaine.infirmier ?? 'Demande en ligne du patient'}</dd>
                    </div>
                    <div>
                      <dt>Rendez-vous</dt>
                      <dd title={`${libelleDate(teleProchaine.date)}${teleProchaine.heure ? ` à ${teleProchaine.heure}` : ''}`}>
                        {/* L'heure d'abord : c'est l'info utile si le texte est coupé */}
                        {teleProchaine.heure ? `${teleProchaine.heure} · ` : ''}
                        {libelleDate(teleProchaine.date)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <Link
                  // Télé-expertise programmée : pas de consultation, le résultat est joint directement
                  to={
                    teleProchaine.expertise && !teleProchaine.expertise.avecConsultation
                      ? `/medecin/referes/${teleProchaine.expertise.origineId}/resultat`
                      : `/medecin/consultations/${teleProchaine.id}`
                  }
                  className={s.commencer}
                >
                  <FaPlay aria-hidden="true" />{' '}
                  {teleProchaine.type === 'teleexpertise'
                    ? teleProchaine.expertise?.avecConsultation
                      ? 'Démarrer la télé-expertise'
                      : 'Joindre le résultat'
                    : 'Démarrer la téléconsultation'}
                </Link>
              </>
            ) : (
              <>
                <FaVideo className={s.videIcone} aria-hidden="true" />
                <strong>Aucune demande en attente</strong>
                <small>Les téléconsultations et télé-expertises qui vous sont adressées s'afficheront ici.</small>
              </>
            )}
          </motion.section>

          <motion.section className={c.bloc} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className={s.fileEntete}>
              <span className={s.fileIcone}>
                <FaVideo aria-hidden="true" />
              </span>
              <div>
                <h2>Téléconsultations et télé-expertises</h2>
                <p>
                  <FaClock aria-hidden="true" /> Actualisée automatiquement{maj ? ` · ${maj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
                </p>
              </div>
              <Link to="/medecin/telemedecine" className={s.lien}>
                Toutes <span>{data?.telemedecinesEnAttente ?? 0}</span>
              </Link>
            </div>

            {!data ? (
              <p className={c.vide}>Chargement…</p>
            ) : teleSuivantes.length === 0 ? (
              <div className={s.fileVide}>
                <FaVideo aria-hidden="true" />
                <p>{teleProchaine ? 'Aucune autre demande après la prochaine.' : 'Aucune demande pour le moment.'}</p>
              </div>
            ) : (
              <ol className={s.file}>
                {teleSuivantes.map((x, i) => (
                  <motion.li key={x.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}>
                    <AvatarPatient patient={x.patient} />
                    <span className={s.fileTexte}>
                      <strong>
                        {x.patient.nom}
                        {x.urgence && <em className={s.urgence}>Urgence</em>}
                      </strong>
                      <small>
                        {x.type === 'teleexpertise' ? 'Télé-expertise' : x.type === 'urgence' ? 'Urgence' : 'Téléconsultation'} · {x.motif}
                        {x.infirmier ? ` · ${x.infirmier}` : ''}
                      </small>
                    </span>
                    <span className={s.fileHeure}>
                      {libelleDate(x.date)}
                      {x.heure ? ` · ${x.heure}` : ''}
                      <Chrono compact recueLe={x.creeLe} date={x.date} heure={x.heure} echeance={x.expertise?.echeance} delai={delaiExpertise(x.expertise)} />
                    </span>
                    <Link to={`/medecin/consultations/${x.id}`} className={`${c.principal} ${s.consulter}`}>
                      <FaPlay aria-hidden="true" /> Démarrer
                    </Link>
                  </motion.li>
                ))}
              </ol>
            )}

            {disponibles.length > 0 && (
              <>
                <div className={s.fileEntete}>
                  <div>
                    <h2>Télé-expertises externes à prendre en charge</h2>
                    <p>Adressées à votre service par d'autres établissements de la DMHP</p>
                  </div>
                  <Link to="/medecin/telemedecine" className={s.lien}>
                    Toutes <span>{disponibles.length}</span>
                  </Link>
                </div>
                <ol className={s.file}>
                  {disponibles.slice(0, 5).map((x) => (
                    <li key={x.origineId}>
                      <AvatarPatient patient={x.patient} />
                      <span className={s.fileTexte}>
                        <strong>{x.patient.nom}</strong>
                        <small>
                          {x.hopital ?? '—'}
                          {x.motif ? ` · ${x.motif}` : ''}
                        </small>
                      </span>
                      <span className={s.fileHeure}>
                        <Chrono compact recueLe={x.recueLe} date={x.datePrevue} heure={x.heurePrevue} echeance={x.echeance} delai={delaiExpertise(x)} />
                      </span>
                      <Link to={`/medecin/referes/${x.origineId}`} className={`${c.principal} ${s.consulter}`}>
                        <FaPlay aria-hidden="true" /> Voir
                      </Link>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </motion.section>
        </div>
      </div>
    </div>
  );
}
