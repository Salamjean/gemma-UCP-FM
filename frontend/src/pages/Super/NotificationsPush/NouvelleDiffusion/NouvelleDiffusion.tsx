import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type FormEvent } from 'react';
import { FaArrowLeft, FaExclamationTriangle, FaPaperPlane } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import SelectRecherche from '../../../../components/SelectRecherche';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import { useIcones } from '../../../../services/icones';
import type { CategorieDiffusion, CibleDiffusion, PatientCible, StatistiquesAppareils } from '../../../../types';
import c from '../../../../styles/espace.module.css';
import Compteurs from '../Compteurs';
import { CATEGORIES, CIBLES } from '../notifications.config';
import styles from './NouvelleDiffusion.module.css';

const TITRE_MAX = 150;
const MESSAGE_MAX = 1000;

/**
 * SUPER > NOTIFICATIONS PUSH > NOUVELLE DIFFUSION
 * Équivalent Laravel : super.notifications.add / super.notifications.send
 * Crée une notification In-App pour chaque patient ciblé + push sur les appareils joignables.
 */
export default function NouvelleDiffusion() {
  const navigate = useNavigate();
  const { logo } = useIcones();
  const [stats, setStats] = useState<StatistiquesAppareils | null>(null);
  const [patients, setPatients] = useState<PatientCible[]>([]);
  const [titre, setTitre] = useState('');
  const [message, setMessage] = useState('');
  const [categorie, setCategorie] = useState<CategorieDiffusion>('general');
  const [cible, setCible] = useState<CibleDiffusion>('all');
  const [patientId, setPatientId] = useState<number | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, boolean>>({});
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api.super.notifications.statistiques().then(setStats).catch((e) => alerte.echec(messageErreur(e)));
    api.super.notifications.patients().then(setPatients).catch((e) => alerte.echec(messageErreur(e)));
  }, []);

  // Nombre de patients concernés (approximation affichée avant l'envoi)
  const patient = patients.find((p) => p.id === patientId);
  const destinataires =
    cible === 'specific' ? (patient ? 1 : 0) : cible === 'all' ? stats?.patients ?? 0 : cible === 'android' ? stats?.android ?? 0 : stats?.ios ?? 0;
  const joignables =
    cible === 'specific' ? (patient?.jeton ? 1 : 0) : cible === 'all' ? stats?.avecJeton ?? 0 : destinataires;

  /** Mêmes règles que Laravel (NotificationController@send) */
  const valider = () => {
    const e: Record<string, string> = {};
    if (!titre.trim()) e.titre = 'Le titre de la notification est obligatoire.';
    if (!message.trim()) e.message = 'Le contenu du message est obligatoire.';
    if (cible === 'specific' && !patientId) e.patient = 'Veuillez sélectionner un patient spécifique.';
    setErreurs(Object.fromEntries(Object.keys(e).map((k) => [k, true])));
    const premiere = Object.values(e)[0];
    if (premiere) alerte.echec(premiere);
    return !premiere;
  };

  const demander = (e: FormEvent) => {
    e.preventDefault();
    if (valider()) setConfirmer(true);
  };

  const envoyer = async () => {
    setEnvoi(true);
    try {
      const r = await api.super.notifications.diffuser({
        titre: titre.trim(),
        message: message.trim(),
        cible,
        categorie,
        ...(cible === 'specific' && patientId ? { patientId } : {}),
      });
      setConfirmer(false);
      navigate('/super/notifications-push/liste');
      (r.type === 'succes' ? alerte.succes : alerte.attention)(r.message);
    } catch (err) {
      setConfirmer(false);
      alerte.echec(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  const cat = CATEGORIES[categorie];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Notifications push & In-App</p>
          <h1 className={c.titre}>Nouvelle diffusion</h1>
        </div>
        <Link to="/super/notifications-push/liste" className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Liste des envois
        </Link>
      </header>

      {stats && <Compteurs stats={stats} avecDiffusions={false} />}
      {stats && !stats.pushConfigure && (
        <p className={c.bandeau}>
          <FaExclamationTriangle aria-hidden="true" />
          Firebase n'est pas configuré : la notification sera enregistrée In-App, sans push sur les téléphones.
        </p>
      )}

      <div className={styles.grille}>
        <form className={c.bloc} onSubmit={demander} noValidate>
          {/* --- Message --- */}
          <h2 className={c.blocTitre}>Message</h2>
          <div className={styles.ligne}>
          <div className={`${styles.champ} ${erreurs.titre ? styles.invalide : ''}`}>
            <label htmlFor="titre">Titre <span className={styles.requis}>*</span></label>
            <input id="titre" maxLength={TITRE_MAX} placeholder="Ex. Campagne de vaccination" value={titre} onChange={(e) => { setTitre(e.target.value); setErreurs((x) => ({ ...x, titre: false })); }} />
            <span className={styles.compteurCar}>{titre.length} / {TITRE_MAX}</span>
          </div>
          <div className={`${styles.champ} ${erreurs.message ? styles.invalide : ''}`}>
            <label htmlFor="message">Message <span className={styles.requis}>*</span></label>
            <textarea id="message" rows={3} maxLength={MESSAGE_MAX} placeholder="Contenu de la notification…" value={message} onChange={(e) => { setMessage(e.target.value); setErreurs((x) => ({ ...x, message: false })); }} />
            <span className={styles.compteurCar}>{message.length} / {MESSAGE_MAX}</span>
          </div>
          </div>

          {/* --- Catégorie --- */}
          <h2 className={`${c.blocTitre} ${styles.espace}`}>Catégorie</h2>
          <div className={styles.categories} role="radiogroup" aria-label="Catégorie">
            {(Object.entries(CATEGORIES) as [CategorieDiffusion, (typeof CATEGORIES)[CategorieDiffusion]][]).map(([k, v]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={categorie === k}
                className={styles.categorie}
                style={categorie === k ? { background: v.fond, color: v.texte } : undefined}
                onClick={() => setCategorie(k)}
              >
                <v.icone aria-hidden="true" /> {v.label}
              </button>
            ))}
          </div>

          {/* --- Destinataires --- */}
          <h2 className={`${c.blocTitre} ${styles.espace}`}>Destinataires</h2>
          <div className={styles.cibles} role="radiogroup" aria-label="Destinataires">
            {(Object.entries(CIBLES) as [CibleDiffusion, (typeof CIBLES)[CibleDiffusion]][]).map(([k, v]) => {
              const n = k === 'all' ? stats?.avecJeton : k === 'android' ? stats?.android : k === 'ios' ? stats?.ios : undefined;
              return (
                <button key={k} type="button" role="radio" aria-checked={cible === k} className={`${styles.cible} ${cible === k ? styles.cibleActive : ''}`} onClick={() => setCible(k)}>
                  <v.icone className={styles.cibleIcone} aria-hidden="true" />
                  <strong>{v.label}</strong>
                  <small>{n !== undefined ? `${n} appareil${n > 1 ? 's' : ''} joignable${n > 1 ? 's' : ''}` : v.detail}</small>
                </button>
              );
            })}
          </div>

          <AnimatePresence initial={false}>
            {cible === 'specific' && (
              <motion.div className={styles.patient} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <label htmlFor="patient">Patient <span className={styles.requis}>*</span></label>
                <SelectRecherche
                  id="patient"
                  options={patients.map((p) => ({
                    id: p.id,
                    name: p.nom,
                    detail: [p.code, p.telephone, p.jeton ? 'appareil joignable' : 'sans appareil (In-App seulement)'].filter(Boolean).join(' · '),
                  }))}
                  value={patientId}
                  onChange={(id) => { setPatientId(id); setErreurs((x) => ({ ...x, patient: false })); }}
                  placeholder="Choisir un patient"
                  placeholderRecherche="Rechercher par nom, code, téléphone…"
                  aucunResultat="Aucun patient trouvé"
                  invalide={!!erreurs.patient}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <footer className={styles.pied}>
            <p className={styles.resume}>
              <strong>{destinataires}</strong> patient{destinataires > 1 ? 's' : ''} recevr{destinataires > 1 ? 'ont' : 'a'} la notification In-App
              {' · '}
              <strong>{joignables}</strong> push sur téléphone
            </p>
            <motion.button type="submit" className={c.principal} whileTap={{ scale: 0.97 }} disabled={envoi}>
              <FaPaperPlane aria-hidden="true" /> Diffuser
            </motion.button>
          </footer>
        </form>

        {/* --- Aperçu sur téléphone --- */}
        <aside className={styles.apercu} aria-label="Aperçu de la notification">
          <p className={styles.apercuTitre}>Aperçu sur le téléphone</p>
          <div className={styles.telephone}>
            <div className={styles.encoche} />
            <p className={styles.heure}>09:41</p>
            <motion.div className={styles.notif} layout>
              <div className={styles.notifHaut}>
                <img src={logo} alt="" className={styles.notifIcone} />
                <span>GEMMA</span>
                <span className={styles.notifQuand}>maintenant</span>
              </div>
              <strong className={styles.notifTitre}>{titre || 'Titre de la notification'}</strong>
              <p className={styles.notifTexte}>{message || 'Le contenu du message apparaîtra ici.'}</p>
            </motion.div>
            <span className={styles.categorieApercu} style={{ background: cat.fond, color: cat.texte }}>
              <cat.icone aria-hidden="true" /> {cat.label}
            </span>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        ouvert={confirmer}
        titre="Diffuser cette notification ?"
        message={`« ${titre.trim()} » sera envoyée à ${destinataires} patient(s) (${joignables} push sur téléphone). Cette action ne peut pas être annulée : les patients la recevront immédiatement.`}
        confirmer="Diffuser"
        enCours={envoi}
        onConfirmer={envoyer}
        onAnnuler={() => setConfirmer(false)}
      />
    </div>
  );
}
