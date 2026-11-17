import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaDownload, FaHospitalAlt, FaPaperclip, FaShareSquare } from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { RefereDetail } from '../../../types';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient } from '../Consultations/ListeConsultations';
import ResultatExpert from './ResultatExpert';
import s from './Referes.module.css';

/**
 * MÉDECIN (EXPERT) > TÉLÉ-EXPERTISE > JOINDRE LE RÉSULTAT (page dédiée)
 * Ouverte à la fin de la consultation quand l'expert indique qu'il fournit un résultat :
 * avis, consignes au requérant et documents, envoyés au requérant (« Résultats d'expertise »).
 */
export default function JoindreResultat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState<RefereDetail | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    api.doctor.referes
      .detail(Number(id))
      .then(setD)
      .catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible d'ouvrir la télé-expertise : ${messageErreur(e)}`);
      });
  }, [id]);

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Télé-expertise</p>
          <h1 className={c.titre}>Joindre le résultat</h1>
        </div>
        <button type="button" className={c.secondaire} onClick={() => navigate('/medecin/telemedecine')}>
          <FaArrowLeft aria-hidden="true" /> Télémédecine
        </button>
      </header>

      {!d ? (
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Télé-expertise introuvable ou non accessible.' : 'Chargement…'}</p>
        </section>
      ) : (
        <>
          <motion.section className={`${c.bloc} ${s.bandeau}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <span className={s.patient}>
              <AvatarPatient patient={d.patient} />
              <span>
                <strong>{d.patient.nom}</strong>
                <small>
                  {d.patient.code} · {age(d.patient.dateNaissance) ?? 'Âge inconnu'}
                </small>
              </span>
            </span>
            <dl className={s.resume}>
              <div>
                <dt>Requérant</dt>
                <dd>
                  {d.referePar ?? '—'}
                  {d.service ? ` · ${d.service}` : ''}
                </dd>
              </div>
              <div>
                <dt>Établissement</dt>
                <dd>
                  <FaHospitalAlt aria-hidden="true" /> {d.hopital ?? '—'}
                </dd>
              </div>
            </dl>
          </motion.section>

          {/* La demande : motif et documents partagés par le requérant */}
          <section className={c.bloc}>
            <h2 className={s.titreBloc}>
              <FaShareSquare aria-hidden="true" /> Demande de télé-expertise
            </h2>
            <p className={s.motifReference}>{d.justification ?? d.motif ?? 'Motif non précisé'}</p>
            {d.diagnostic && <p className={s.note}>Diagnostic du requérant : {d.diagnostic}</p>}
            <h3 className={s.sousTitreResultat}>Documents partagés</h3>
            {d.documents.length === 0 ? (
              <p className={s.note}>Aucun document partagé.</p>
            ) : (
              <ul className={s.documents}>
                {d.documents.map((x) => (
                  <li key={x.id}>
                    <FaPaperclip aria-hidden="true" />
                    <span>
                      <strong>{x.libelle}</strong>
                      <small>{x.nom}</small>
                    </span>
                    <button type="button" className={c.secondaire} onClick={() => api.doctor.referes.telecharger(d.origineId, x.id, x.nom).catch((e) => alerte.echec(messageErreur(e)))}>
                      <FaDownload aria-hidden="true" /> Télécharger
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link to={`/medecin/referes/${d.origineId}`} className={s.lienFiche}>
              Voir la fiche complète (constantes, prescriptions…)
            </Link>
            {/* Issue d'une vraie consultation : l'expert peut aussi consulter le patient (formulaire de consultation) */}
            {d.avecConsultation && d.consultationDestinataire && (
              <Link to={`/medecin/consultations/${d.consultationDestinataire.id}`} className={`${c.secondaire} ${s.boutonConsultation}`}>
                {d.consultationDestinataire.terminee ? 'Voir ma consultation' : 'Ouvrir le formulaire de consultation'}
              </Link>
            )}
          </section>

          <ResultatExpert
            d={d}
            ouvrir
            onEnvoye={() =>
              // Résultat envoyé : on reste sur la page (documents visibles, complétables) ; sinon retour à Télémédecine
              api.doctor.referes
                .detail(d.origineId)
                .then(setD)
                .catch(() => navigate('/medecin/telemedecine'))
            }
          />
        </>
      )}
    </div>
  );
}
