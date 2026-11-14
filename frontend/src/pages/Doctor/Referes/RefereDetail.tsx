import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  FaArrowLeft,
  FaCheckCircle,
  FaDownload,
  FaEye,
  FaPlay,
  FaFileAlt,
  FaFileImage,
  FaFilePdf,
  FaFlask,
  FaHeartbeat,
  FaHospitalAlt,
  FaNotesMedical,
  FaPaperclip,
  FaPills,
  FaShareSquare,
  FaHandHoldingMedical,
  FaUserCheck,
} from 'react-icons/fa';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../services/alertes';
import { api } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { RefereDetail as Detail } from '../../../types';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient, heure, jour } from '../Consultations/ListeConsultations';
import { DOCUMENTS as DOCUMENTS_IMPRIMABLES } from '../Documents/DocumentConsultation';
import s from './Referes.module.css';

const taille = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);
const icone = (type: string) => (type.includes('pdf') ? FaFilePdf : type.startsWith('image/') ? FaFileImage : FaFileAlt);
const CONSTANTES: { k: keyof Detail['constantes']; l: string; u: string }[] = [
  { k: 'tension', l: 'TA', u: 'mmHg' },
  { k: 'temperature', l: 'T°', u: '°C' },
  { k: 'pouls', l: 'Pouls', u: 'bpm' },
  { k: 'saturation', l: 'SpO₂', u: '%' },
  { k: 'poids', l: 'Poids', u: 'kg' },
  { k: 'taille', l: 'Taille', u: 'cm' },
];

/**
 * MÉDECIN > RÉFÉRÉS > FICHE D'UNE RÉFÉRENCE (lecture seule)
 * Patient, médecin et établissement d'origine, motif de la référence, constantes, diagnostic, prescriptions, documents joints.
 */
export default function RefereDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [erreur, setErreur] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [prise, setPrise] = useState(false);

  /** Référence externe : le médecin s'attribue le patient, puis ouvre directement sa consultation */
  const prendreEnCharge = async () => {
    if (!d) return;
    setPrise(true);
    try {
      const r = await api.doctor.referes.prendreEnCharge(d.origineId);
      alerte.succes(r.message);
      navigate(`/medecin/consultations/${r.consultationId}`);
    } catch (e) {
      alerte.echec(messageErreur(e));
      setConfirmation(false);
      api.doctor.referes
        .detail(d.origineId)
        .then(setD)
        .catch(() => undefined);
    } finally {
      setPrise(false);
    }
  };

  useEffect(() => {
    api.doctor.referes
      .detail(Number(id))
      .then(setD)
      .catch((e) => {
        setErreur(true);
        alerte.echec(`Impossible d'ouvrir la référence : ${messageErreur(e)}`);
      });
  }, [id]);

  const entete = (
    <header className={c.entete}>
      <div>
        <p className={c.surtitre}>Référés</p>
        <h1 className={c.titre}>{d ? (d.type === 'externe' ? 'Référence externe' : 'Référence interne') : 'Référence'}</h1>
      </div>
      <button type="button" className={c.secondaire} onClick={() => navigate(-1)}>
        <FaArrowLeft aria-hidden="true" /> Retour
      </button>
    </header>
  );

  if (!d) {
    return (
      <div className={c.page}>
        {entete}
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Référence introuvable ou non accessible.' : 'Chargement…'}</p>
        </section>
      </div>
    );
  }

  const constantes = CONSTANTES.filter((k) => d.constantes[k.k]);

  return (
    <div className={c.page}>
      {entete}

      <motion.section className={`${c.bloc} ${s.bandeau}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <span className={s.patient}>
          <AvatarPatient patient={d.patient} />
          <span>
            <strong>{d.patient.nom}</strong>
            <small>
              {d.patient.code} · {age(d.patient.dateNaissance) ?? 'Âge inconnu'}
              {d.patient.telephone ? ` · ${d.patient.telephone}` : ''}
            </small>
          </span>
        </span>
        <dl className={s.resume}>
          <div>
            <dt>Référé par</dt>
            <dd>
              Dr {(d.referePar ?? '—').replace(/^dr\.?\s*/i, '')}
              {d.service ? ` · ${d.service}` : ''}
            </dd>
          </div>
          <div>
            <dt>Établissement</dt>
            <dd>
              <FaHospitalAlt aria-hidden="true" /> {d.hopital ?? '—'}
              {d.hopitalContact ? ` · ${d.hopitalContact}` : ''}
            </dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>
              {jour(d.date)} à {heure(d.date)}
            </dd>
          </div>
          <div>
            <dt>Allergies</dt>
            <dd>{d.patient.allergies ?? 'Aucune connue'}</dd>
          </div>
        </dl>
      </motion.section>

      <div className={s.grille}>
        <div className={s.colonne}>
          <section className={c.bloc}>
            <h2 className={s.titreBloc}>
              <FaShareSquare aria-hidden="true" /> Motif de la référence
            </h2>
            <p className={s.motifReference}>{d.justification ?? 'Non précisé'}</p>
            <dl className={s.liste}>
              <div>
                <dt>Motif de consultation</dt>
                <dd>{d.motif ?? '—'}</dd>
              </div>
              <div>
                <dt>Diagnostic retenu</dt>
                <dd>{d.diagnostic ?? 'Non renseigné'}</dd>
              </div>
              {d.examenPhysique && (
                <div>
                  <dt>Examen physique</dt>
                  <dd>{d.examenPhysique}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className={c.bloc}>
            <h2 className={s.titreBloc}>
              <FaHeartbeat aria-hidden="true" /> Constantes
            </h2>
            {constantes.length === 0 ? (
              <p className={s.note}>Aucune constante enregistrée.</p>
            ) : (
              <div className={s.constantes}>
                {constantes.map((k) => (
                  <span key={k.k}>
                    <small>{k.l}</small>
                    {d.constantes[k.k]} {k.u}
                  </span>
                ))}
              </div>
            )}
          </section>

          {(d.prescriptions.length > 0 || d.examens.length > 0) && (
            <section className={c.bloc}>
              <h2 className={s.titreBloc}>
                <FaPills aria-hidden="true" /> Prescriptions
              </h2>
              {d.prescriptions.length > 0 && (
                <ul className={s.prescriptions}>
                  {d.prescriptions.map((p, i) => (
                    <li key={i}>
                      <strong>{p.nom}</strong>
                      <small>{[`×${p.quantite}`, p.posologie, p.duree].filter(Boolean).join(' · ')}</small>
                    </li>
                  ))}
                </ul>
              )}
              {d.examens.length > 0 && (
                <p className={s.note}>
                  <FaFlask aria-hidden="true" /> Examens demandés : {d.examens.join(', ')}
                </p>
              )}
            </section>
          )}
        </div>

        <section className={c.bloc}>
          <h2 className={s.titreBloc}>
            <FaPaperclip aria-hidden="true" /> Documents joints <span className={s.compte}>{d.documents.length + d.documentsPrescrits.length}</span>
          </h2>
          {/* Documents prescrits par le médecin d'origine : ouverts dans la page d'impression (PDF) */}
          {d.documentsPrescrits.length > 0 && (
            <ul className={s.documents}>
              {d.documentsPrescrits.map((x) => {
                const info = DOCUMENTS_IMPRIMABLES.find((k) => k.id === x.type)!;
                return (
                  <li key={x.type}>
                    <info.icone aria-hidden="true" />
                    <span>
                      <strong>{info.titre}</strong>
                      <small>
                        Prescrit par {d.referePar ? `Dr ${d.referePar.replace(/^dr\.?\s*/i, '')}` : 'le médecin d’origine'}
                        {x.code ? ` · ${x.code}` : ''} · {jour(x.date)}
                      </small>
                    </span>
                    <Link to={`/medecin/consultations/${d.origineId}/document/${x.type}`} className={c.secondaire}>
                      <FaEye aria-hidden="true" /> Voir / imprimer
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {d.documents.length === 0 ? (
            d.documentsPrescrits.length === 0 && <p className={s.note}>Aucun document joint à cette référence.</p>
          ) : (
            <ul className={s.documents}>
              {d.documents.map((x) => {
                const Icone = icone(x.type);
                return (
                  <li key={x.id}>
                    <Icone aria-hidden="true" />
                    <span>
                      <strong>{x.libelle}</strong>
                      <small>
                        {x.nom} · {taille(x.taille)}
                      </small>
                    </span>
                    <button type="button" className={c.secondaire} onClick={() => api.doctor.referes.telecharger(d.origineId, x.id, x.nom).catch((e) => alerte.echec(messageErreur(e)))}>
                      <FaDownload aria-hidden="true" /> Télécharger
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={s.note}>
            <FaNotesMedical aria-hidden="true" /> Consultation d’origine : {d.code}
          </p>
        </section>
      </div>

      {/* Référence externe : prise en charge par un médecin (de cet hôpital ou d'un autre) */}
      {d.peutPrendreEnCharge && (
        <section className={`${c.bloc} ${s.barreConsulter}`}>
          <span>
            <FaHandHoldingMedical aria-hidden="true" /> Ce patient attend un médecin. Après lecture de la référence, vous pouvez prendre en charge son traitement.
          </span>
          <button type="button" className={c.principal} onClick={() => setConfirmation(true)}>
            <FaUserCheck aria-hidden="true" /> Prendre en charge ce patient
          </button>
        </section>
      )}
      {d.priseEnCharge && !d.priseEnCharge.parMoi && (
        <section className={`${c.bloc} ${s.barreConsulter}`}>
          <span>
            <FaUserCheck aria-hidden="true" /> Pris en charge par Dr {(d.priseEnCharge.par ?? '—').replace(/^dr\.?\s*/i, '')} le {jour(d.priseEnCharge.le)} à {heure(d.priseEnCharge.le)}.
          </span>
        </section>
      )}

      {/* Référence interne qui m'est adressée : consulter le patient après avoir lu la référence */}
      {d.consultationDestinataire && (
        <section className={`${c.bloc} ${s.barreConsulter}`}>
          <span>
            <FaCheckCircle aria-hidden="true" />
            {d.consultationDestinataire.terminee ? 'Vous avez déjà consulté ce patient.' : 'Après avoir pris connaissance de la référence, consultez le patient.'}
          </span>
          <Link to={`/medecin/consultations/${d.consultationDestinataire.id}`} className={d.consultationDestinataire.terminee ? c.secondaire : c.principal}>
            {d.consultationDestinataire.terminee ? <FaEye aria-hidden="true" /> : <FaPlay aria-hidden="true" />} {d.consultationDestinataire.terminee ? 'Voir la consultation' : 'Consulter le patient'}
          </Link>
        </section>
      )}
      <ConfirmDialog
        ouvert={confirmation}
        titre="Prendre en charge ce patient ?"
        message={`${d.patient.nom} vous sera attribué : une consultation du jour sera créée à votre nom, avec les constantes de la référence. Les autres médecins ne pourront plus le prendre en charge.`}
        confirmer="Prendre en charge"
        enCours={prise}
        onConfirmer={prendreEnCharge}
        onAnnuler={() => setConfirmation(false)}
      />
    </div>
  );
}
