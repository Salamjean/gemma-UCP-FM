import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  FaArrowLeft,
  FaBed,
  FaBookMedical,
  FaCalendarCheck,
  FaCheck,
  FaClipboardCheck,
  FaDoorOpen,
  FaFileAlt,
  FaFileMedicalAlt,
  FaFlagCheckered,
  FaHeartbeat,
  FaHospital,
  FaNotesMedical,
  FaPills,
  FaRoute,
  FaSignInAlt,
  FaStethoscope,
  FaUserMd,
  FaUserNurse,
  FaUsers,
  FaVideo,
} from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../../services/alertes';
import { apiAgent, uploadUrl, type EspaceAgent } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { ParcoursIntervention } from '../../../../types';
import { age, CONSTANTES, dateHeure, initiales } from '../DossierMedical/outils';
import s from './Parcours.module.css';

/** Icône de chaque étape de la frise */
const ICONES: Record<string, IconType> = {
  admission: FaSignInAlt,
  ouverture: FaCalendarCheck,
  constantes: FaHeartbeat,
  orientation: FaClipboardCheck,
  medecin: FaUserMd,
  ordonnance: FaPills,
  examen: FaFileMedicalAlt,
  arret: FaFileAlt,
  hospitalisation: FaBed,
  sortie: FaDoorOpen,
  fin: FaFlagCheckered,
};

const sansDr = (n: string) => n.replace(/^dr\.?\s*/i, '');

/**
 * INFIRMIER > PARCOURS D'UNE INTERVENTION (bouton « Voir tout le parcours » du dossier médical)
 * Repris de Laravel : users/patient/parcours_intervention.blade.php
 *   frise du début à la fin (admission → constantes → médecin → prescriptions → hospitalisation → issue),
 *   puis : 1. équipe, 2. constantes, 3. examen & diagnostic, 4. prescriptions, 5. issue, 6. registre.
 * Lecture seule.
 */
export default function Parcours({ espace = 'infirmier' }: { espace?: EspaceAgent } = {}) {
  const base = espace === 'medecin' ? '/medecin' : '/infirmier';
  const { id, consultationId } = useParams();
  const navigate = useNavigate();
  const [parcours, setParcours] = useState<ParcoursIntervention | null>(null);
  const [erreur, setErreur] = useState(false);
  const [imgErreur, setImgErreur] = useState(false);

  useEffect(() => {
    apiAgent(espace)
      .patients.parcours(Number(id), Number(consultationId))
      .then(setParcours)
      .catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible d'ouvrir le parcours : ${messageErreur(e)}`);
      });
  }, [id, consultationId, espace]);

  const entete = (
    <header className={c.entete}>
      <div>
        <p className={c.surtitre}>Dossier médical</p>
        <h1 className={c.titre}>Parcours de l'intervention</h1>
      </div>
      <div className={c.boutons}>
        <Link to={`${base}/patients/${id}/dossier`} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Retour au dossier
        </Link>
        {/* Consultation faite par l'infirmier·ère : formulaire de consultation complet, en lecture */}
        {parcours?.consultationDirecte && (
          <Link to={espace === 'medecin' ? `/medecin/consultations/${parcours.id}` : `/infirmier/consultations/medicale/${parcours.id}`} className={c.principal}>
            <FaStethoscope aria-hidden="true" /> Voir le formulaire de consultation
          </Link>
        )}
      </div>
    </header>
  );

  if (!parcours) {
    return (
      <div className={c.page}>
        {entete}
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Intervention introuvable.' : 'Chargement du parcours…'}</p>
          {erreur && (
            <button type="button" className={c.secondaire} onClick={() => navigate(-1)}>
              Retour
            </button>
          )}
        </section>
      </div>
    );
  }

  const { patient, equipe, examen, issue, registre } = parcours;
  const feminin = (patient.genre ?? '').toLowerCase().startsWith('f');
  const photo = patient.imgUrl ? (patient.imgUrl.startsWith('http') ? patient.imgUrl : uploadUrl('patient', patient.imgUrl)) : null;
  const faites = parcours.etapes.filter((e) => e.faite).length;

  return (
    <div className={c.page}>
      {entete}

      {/* --- Patient & intervention --- */}
      <motion.section className={`${c.bloc} ${s.bandeau}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {photo && !imgErreur ? (
          <img src={photo} alt="" className={s.avatar} onError={() => setImgErreur(true)} />
        ) : (
          <span className={`${s.avatar} ${s.initiales} ${feminin ? s.feminin : ''}`}>{initiales(patient.nom)}</span>
        )}
        <div className={s.identite}>
          <h2>{patient.nom}</h2>
          <p>
            Dossier N° {patient.code ?? '—'} · {feminin ? 'Féminin' : patient.genre ? 'Masculin' : '—'} · {age(patient.dateNaissance) ?? 'Âge inconnu'}
          </p>
        </div>
        <dl className={s.resume}>
          <div>
            <dt>Intervention</dt>
            <dd className={s.code}>{parcours.code}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{dateHeure(parcours.date)}</dd>
          </div>
          <div>
            <dt>Établissement</dt>
            <dd>
              <FaHospital aria-hidden="true" /> {parcours.hopital}
            </dd>
          </div>
          <div>
            <dt>Service</dt>
            <dd>{parcours.service}</dd>
          </div>
        </dl>
        <div className={s.etats}>
          <span className={`${c.badge} ${parcours.terminee ? c.badgeOk : s.badgeAttente}`}>{parcours.terminee ? 'Terminée' : 'En cours'}</span>
          <span className={`${c.badge} ${s.badgeInfo}`}>
            {parcours.enLigne ? (
              <>
                <FaVideo aria-hidden="true" /> En ligne
              </>
            ) : (
              'Présentiel'
            )}
          </span>
          {parcours.urgence && <span className={`${c.badge} ${s.badgeRisque}`}>Urgence</span>}
        </div>
      </motion.section>

      <div className={s.grille}>
        {/* --- Frise du début à la fin --- */}
        <section className={`${c.bloc} ${s.friseBloc}`}>
          <div className={s.titreBloc}>
            <span className={s.titreIcone}>
              <FaRoute aria-hidden="true" />
            </span>
            <div>
              <h2>Du début à la fin</h2>
              <p>
                {faites} étape{faites > 1 ? 's' : ''} sur {parcours.etapes.length}
              </p>
            </div>
          </div>
          <ol className={s.frise}>
            {parcours.etapes.map((e, i) => {
              const Icone = ICONES[e.cle] ?? FaCheck;
              return (
                <motion.li
                  key={`${e.cle}-${i}`}
                  className={`${s.etape} ${e.faite ? s.etapeFaite : s.etapeAVenir}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <span className={s.point}>
                    <Icone aria-hidden="true" />
                  </span>
                  <div className={s.etapeTexte}>
                    <strong>{e.titre}</strong>
                    {e.detail && <span>{e.detail}</span>}
                    <small>{e.date ? dateHeure(e.date) : e.faite ? 'Réalisée' : 'À venir'}</small>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </section>

        <div className={s.sections}>
          {/* 1. Équipe */}
          <section className={c.bloc}>
            <h3 className={s.sectionTitre}>
              <span>1</span> <FaUsers aria-hidden="true" /> Équipe médicale & intervenants
            </h3>
            <div className={s.equipe}>
              <div>
                <FaUserMd aria-hidden="true" />
                <small>Médecin traitant</small>
                <strong className={equipe.medecin ? '' : s.attente}>{equipe.medecin ? `Dr ${sansDr(equipe.medecin)}` : 'En attente d’attribution'}</strong>
              </div>
              <div>
                <FaUserNurse aria-hidden="true" />
                <small>Infirmier(ère) responsable</small>
                <strong>{equipe.infirmier}</strong>
              </div>
            </div>
          </section>

          {/* 2. Constantes */}
          <section className={c.bloc}>
            <h3 className={s.sectionTitre}>
              <span>2</span> <FaHeartbeat aria-hidden="true" /> Constantes physiques
            </h3>
            <div className={s.constantes}>
              {CONSTANTES.map((k) => {
                const v = parcours.constantes[k.cle];
                return (
                  <div key={k.cle} className={v ? '' : s.constanteVide}>
                    <small>{k.libelle}</small>
                    <strong>{v ? `${v} ${k.unite}` : 'N/A'}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Examen & diagnostic */}
          <section className={c.bloc}>
            <h3 className={s.sectionTitre}>
              <span>3</span> <FaStethoscope aria-hidden="true" /> Examen médical & diagnostic
            </h3>
            <dl className={s.liste}>
              <div>
                <dt>Motif de consultation</dt>
                <dd>{examen.motif}</dd>
              </div>
              {examen.observationInfirmiere && (
                <div>
                  <dt>Observation infirmière</dt>
                  <dd>{examen.observationInfirmiere}</dd>
                </div>
              )}
              <div>
                <dt>Examen physique</dt>
                <dd>{examen.examenPhysique ?? 'Non renseigné'}</dd>
              </div>
              <div>
                <dt>Diagnostic retenu</dt>
                <dd>{examen.diagnostic ?? 'Aucun diagnostic renseigné'}</dd>
              </div>
            </dl>
          </section>

          {/* 4. Prescriptions */}
          <section className={c.bloc}>
            <h3 className={s.sectionTitre}>
              <span>4</span> <FaPills aria-hidden="true" /> Prescriptions & imagerie
            </h3>
            {parcours.ordonnances.length === 0 ? (
              <p className={s.note}>Aucune ordonnance émise lors de cette intervention.</p>
            ) : (
              parcours.ordonnances.map((o, k) => (
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
            <div className={s.documents}>
              <span className={`${c.badge} ${parcours.documents.examen ? s.badgeInfo : c.badgeNeutre}`}>Bulletin d'examen : {parcours.documents.examen ? 'Oui' : 'Non'}</span>
              <span className={`${c.badge} ${parcours.documents.arret ? s.badgeInfo : c.badgeNeutre}`}>Arrêt de travail : {parcours.documents.arret ? 'Oui' : 'Non'}</span>
              <span className={`${c.badge} ${parcours.documents.hospitalisation ? s.badgeRisque : c.badgeNeutre}`}>
                Hospitalisation : {parcours.documents.hospitalisation ? 'Oui' : 'Non'}
              </span>
            </div>
          </section>

          {/* 5. Issue */}
          <section className={c.bloc}>
            <h3 className={s.sectionTitre}>
              <span>5</span> <FaNotesMedical aria-hidden="true" /> Issue de la consultation & sortie
            </h3>
            <dl className={s.liste}>
              <div>
                <dt>Issue</dt>
                <dd>{issue.libelle}</dd>
              </div>
              <div>
                <dt>Justification</dt>
                <dd>{issue.justification ?? 'Aucune remarque enregistrée'}</dd>
              </div>
            </dl>
          </section>

          {/* 6. Registre */}
          <section className={c.bloc}>
            <h3 className={s.sectionTitre}>
              <span>6</span> <FaBookMedical aria-hidden="true" /> Registre médical
            </h3>
            {!registre ? (
              <p className={s.note}>Aucun registre ouvert pour cette intervention.</p>
            ) : (
              <>
                <p className={s.note}>
                  N° <strong>{registre.code}</strong>
                  {registre.type ? ` · ${registre.type}` : ''}
                </p>
                <div className={s.documents}>
                  {(
                    [
                      ['HTA', registre.antecedents.hta],
                      ['Alcool', registre.antecedents.alcool],
                      ['Tabac', registre.antecedents.tabac],
                      ['Drépanocytose', registre.antecedents.drepanocytose],
                    ] as [string, string | null][]
                  ).map(([l, v]) => (
                    <span key={l} className={`${c.badge} ${/oui/i.test(v ?? '') ? s.badgeRisque : c.badgeNeutre}`}>
                      {l} : {v ?? 'Non'}
                    </span>
                  ))}
                </div>
                {registre.antecedents.traitementsAnterieurs && <p className={s.note}>Traitements antérieurs : {registre.antecedents.traitementsAnterieurs}</p>}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
