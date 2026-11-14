import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaHeartbeat, FaNotesMedical, FaPhoneAlt, FaUserMd, FaUsers, FaVideo } from 'react-icons/fa';
import { useParams } from 'react-router-dom';
import AppelVideo from '../../../components/AppelVideo';
import { api } from '../../../services/api';
import type { AccesAppelVideo, InvitationExpert } from '../../../types';
import { age } from '../../Infirmier/GestionPatients/DossierMedical/outils';
import s from './AvisExpert.module.css';

const CONSTANTES: { k: keyof InvitationExpert['constantes']; l: string; u: string }[] = [
  { k: 'tension', l: 'Tension artérielle', u: 'mmHg' },
  { k: 'temperature', l: 'Température', u: '°C' },
  { k: 'pouls', l: 'Pouls', u: 'bpm' },
  { k: 'saturation', l: 'SpO₂', u: '%' },
  { k: 'poids', l: 'Poids', u: 'kg' },
  { k: 'taille', l: 'Taille', u: 'cm' },
];

/** Dossier résumé du patient (avant l'appel et dans le panneau de l'appel) */
function Dossier({ info, sombre }: { info: InvitationExpert; sombre?: boolean }) {
  const ageTexte = age(info.patient.dateNaissance);
  return (
    <div className={sombre ? `${s.dossier} ${s.sombre}` : s.dossier}>
      <section>
        <h3>
          <FaUserMd aria-hidden="true" /> Dossier patient
        </h3>
        <strong className={s.patientNom}>{info.patient.nom}</strong>
        <small>{[info.patient.code, info.patient.genre, ageTexte].filter(Boolean).join(' · ')}</small>
      </section>
      <section>
        <h3>
          <FaHeartbeat aria-hidden="true" /> Constantes
        </h3>
        <div className={s.constantes}>
          {CONSTANTES.map((c) => (
            <span key={c.k}>
              <small>{c.l}</small>
              <strong>{info.constantes[c.k] ? `${info.constantes[c.k]} ${c.u}` : '—'}</strong>
            </span>
          ))}
        </div>
      </section>
      <section>
        <h3>
          <FaNotesMedical aria-hidden="true" /> Motif
        </h3>
        <p>{info.motif ?? '—'}</p>
        {info.observation && <p className={s.observation}>« {info.observation} »</p>}
      </section>
      <section>
        <h3>
          <FaUsers aria-hidden="true" /> Équipe en séance
        </h3>
        <p>
          {[info.medecin, info.infirmier].filter(Boolean).join(' · ') || '—'}
          {info.hopital && <small className={s.hopital}>{info.hopital}</small>}
        </p>
      </section>
    </div>
  );
}

/**
 * PUBLIC > AVIS D'EXPERT (lien d'invitation envoyé par le médecin pendant une téléconsultation, comme Laravel)
 * Le confrère indique son nom et sa spécialité puis rejoint l'appel, avec le dossier résumé du patient à côté.
 */
export default function AvisExpert() {
  const { id = '', code = '' } = useParams();
  const [info, setInfo] = useState<InvitationExpert | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState('');
  const [specialite, setSpecialite] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [acces, setAcces] = useState<AccesAppelVideo | null>(null);
  const [parti, setParti] = useState(false);

  useEffect(() => {
    document.title = 'Avis d’expert · Gemma';
    api.avisExpert
      .infos(id, code)
      .then(setInfo)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Lien invalide.'));
  }, [id, code]);

  const rejoindre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nom.trim().length < 2) return setErreur('Indiquez votre nom.');
    setEnvoi(true);
    setErreur(null);
    try {
      setAcces(await api.avisExpert.jeton(id, code, { nom: nom.trim(), specialite: specialite.trim() || undefined }));
      setParti(false);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <main className={s.page}>
      <motion.div className={s.carte} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <header className={s.entete}>
          <span className={s.icone}>
            <FaVideo aria-hidden="true" />
          </span>
          <div>
            <h1>Avis d’expert médical</h1>
            <p>Vous êtes invité·e à rejoindre une téléconsultation en direct.</p>
          </div>
        </header>

        {!info ? (
          <p className={erreur ? s.erreur : s.chargement}>{erreur ?? 'Vérification du lien…'}</p>
        ) : info.terminee ? (
          <p className={s.erreur}>Cette téléconsultation est terminée.</p>
        ) : (
          <>
            <Dossier info={info} />
            {parti && <p className={s.info}>Vous avez quitté l’appel. Vous pouvez le rejoindre à nouveau.</p>}
            <form className={s.formulaire} onSubmit={rejoindre}>
              <label>
                <span>
                  Votre nom <em>*</em>
                </span>
                <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Dr KOUASSI Jean" maxLength={80} required />
              </label>
              <label>
                <span>Spécialité</span>
                <input value={specialite} onChange={(e) => setSpecialite(e.target.value)} placeholder="Ex. Cardiologue, Pédiatre…" maxLength={60} />
              </label>
              {erreur && <p className={s.erreur}>{erreur}</p>}
              <button type="submit" className={s.rejoindre} disabled={envoi}>
                <FaPhoneAlt aria-hidden="true" /> {envoi ? 'Connexion…' : 'Rejoindre la téléconsultation'}
              </button>
            </form>
          </>
        )}
      </motion.div>

      <AnimatePresence>
        {acces && info && (
          <AppelVideo
            key={acces.salle}
            acces={acces}
            attente="En attente de l’équipe soignante…"
            panneau={<Dossier info={info} sombre />}
            onRaccrocher={() => {
              // Le confrère quitte seulement : l'appel continue pour le médecin et l'infirmier·ère
              setAcces(null);
              setParti(true);
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
