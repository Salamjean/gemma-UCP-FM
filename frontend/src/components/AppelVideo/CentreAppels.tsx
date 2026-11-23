import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { FaCheck, FaCopy, FaFileMedical, FaPhoneAlt, FaPhoneVolume, FaTimes, FaUserPlus, FaVideo, FaWhatsapp } from 'react-icons/fa';
import { useLocation, useNavigate } from 'react-router-dom';
import { alerte, messageErreur } from '../../services/alertes';
import { api } from '../../services/api';
import type { AccesAppelVideo, AppelEntrant } from '../../types';
import AppelVideo from './AppelVideo';
import v from './AppelVideo.module.css';
import s from './CentreAppels.module.css';
import { arreterSonnerie, demarrerSonnerie, preparerSonnerie } from './sonnerie';

const EVENEMENT = 'gemma:appel-video';

/** Démarrer (ou rejoindre) l'appel vidéo d'une télémédecine depuis n'importe quelle page */
export function lancerAppelVideo(consultationId: number) {
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: { consultationId } }));
}

/** Ouvrir un appel dont l'accès est déjà obtenu (ex. appel d'urgence lancé par l'infirmier·ère) */
export function ouvrirAppelVideo(acces: AccesAppelVideo) {
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: { acces } }));
}

/** Fenêtre « Inviter un confrère » : lien sécurisé à copier ou envoyer par WhatsApp (comme Laravel) */
function InviterConfrere({ consultationId, onFermer }: { consultationId: number; onFermer: () => void }) {
  const [lien, setLien] = useState<{ url: string; patient: string } | null>(null);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    let actif = true;
    api.doctor.appels
      .invitation(consultationId)
      .then((r) => actif && setLien({ url: `${window.location.origin}${r.chemin}`, patient: r.patient }))
      .catch((e) => {
        alerte.echec(messageErreur(e));
        onFermer();
      });
    return () => {
      actif = false;
    };
  }, [consultationId, onFermer]);

  const copier = async () => {
    if (!lien) return;
    try {
      await navigator.clipboard.writeText(lien.url);
    } catch {
      (document.getElementById('lien-confrere') as HTMLInputElement | null)?.select();
      document.execCommand('copy');
    }
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  };

  const whatsapp = lien
    ? `https://wa.me/?text=${encodeURIComponent(`Bonjour Docteur, je vous invite à rejoindre ma téléconsultation en direct pour le patient ${lien.patient} afin d'apporter votre expertise médicale : ${lien.url}`)}`
    : '#';

  return (
    <motion.div className={s.voile} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onFermer}>
      <motion.div className={s.fenetre} initial={{ y: 16 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="titre-invitation">
        <header className={s.fenetreHaut}>
          <span className={s.fenetreIcone}>
            <FaUserPlus aria-hidden="true" />
          </span>
          <div>
            <h2 id="titre-invitation">Inviter un confrère médecin</h2>
            <p>Pour un 2e avis pendant la téléconsultation</p>
          </div>
          <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer">
            <FaTimes />
          </button>
        </header>
        {!lien ? (
          <p className={s.chargement}>Génération du lien sécurisé…</p>
        ) : (
          <>
            <p className={s.explication}>
              Partagez ce lien avec un confrère : il indique son nom et sa spécialité, puis rejoint l’appel avec le dossier résumé du patient et ses constantes. Le lien ne fonctionne que pour cette téléconsultation.
            </p>
            <div className={s.lien}>
              <input id="lien-confrere" readOnly value={lien.url} onFocus={(e) => e.target.select()} />
              <button type="button" onClick={copier} className={s.copier}>
                {copie ? <FaCheck aria-hidden="true" /> : <FaCopy aria-hidden="true" />} {copie ? 'Copié' : 'Copier'}
              </button>
            </div>
            <a href={whatsapp} target="_blank" rel="noreferrer" className={s.whatsapp}>
              <FaWhatsapp aria-hidden="true" /> Envoyer par WhatsApp
            </a>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * CENTRE D'APPELS (espaces médecin et infirmier·ère), monté dans la mise en page :
 *   - vérifie toutes les 4 s les appels lancés par un autre participant → bandeau « Rejoindre » ;
 *   - ouvre la fenêtre d'appel (lancerAppelVideo depuis une page, ou « Rejoindre ») ;
 *   - médecin : « Formulaire de consultation » réduit l'appel et ouvre le formulaire (l'appel continue),
 *     « Inviter un confrère » donne le lien sécurisé.
 */
export default function CentreAppels({ role }: { role: 'doctor' | 'infirmier' }) {
  const appels = role === 'doctor' ? api.doctor.appels : api.infirmier.appels;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [entrants, setEntrants] = useState<AppelEntrant[]>([]);
  const [ignores, setIgnores] = useState<number[]>([]);
  const [acces, setAcces] = useState<AccesAppelVideo | null>(null);
  const [reduit, setReduit] = useState(false);
  const [invitation, setInvitation] = useState(false);
  const [ouverture, setOuverture] = useState<number | null>(null);

  const ouvrir = useCallback(
    async (consultationId: number) => {
      // Déjà dans cet appel : on l'agrandit simplement
      if (acces?.consultationId === consultationId) return setReduit(false);
      setOuverture(consultationId);
      try {
        const a = await appels.rejoindre(consultationId);
        setReduit(false);
        setAcces(a);
      } catch (e) {
        alerte.echec(messageErreur(e));
      } finally {
        setOuverture(null);
      }
    },
    [appels, acces],
  );

  // Lancement depuis une page (liste de télémédecine…)
  useEffect(() => {
    const ecouter = (e: Event) => {
      const d = (e as CustomEvent<{ consultationId?: number; acces?: AccesAppelVideo }>).detail;
      if (d.acces) {
        setReduit(false);
        setAcces(d.acces);
      } else if (d.consultationId) ouvrir(d.consultationId);
    };
    window.addEventListener(EVENEMENT, ecouter);
    return () => window.removeEventListener(EVENEMENT, ecouter);
  }, [ouvrir]);

  // Appels entrants (pas pendant un appel)
  useEffect(() => {
    if (acces) return;
    let actif = true;
    const lire = () =>
      appels
        .entrants()
        .then((l) => actif && setEntrants(l))
        .catch(() => undefined);
    lire();
    const t = setInterval(lire, 4000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [appels, acces]);

  const raccrocher = async () => {
    if (acces) await appels.terminer(acces.consultationId).catch(() => undefined);
    setAcces(null);
    setInvitation(false);
  };

  const fermerInvitation = useCallback(() => setInvitation(false), []);

  const formulaire = acces ? `/medecin/consultations/${acces.consultationId}` : '';
  const ouvrirFormulaire = () => {
    setReduit(true);
    if (pathname !== formulaire) navigate(formulaire);
  };

  const visibles = entrants.filter((a) => !ignores.includes(a.consultationId));

  // Le son devient possible au premier geste de l'utilisateur (règle des navigateurs)
  useEffect(() => preparerSonnerie(), []);

  // SONNERIE : un appel attend qu'on décroche (pas déjà en appel) → ça sonne ; urgence → bips rapides
  const sonnant = !acces && !ouverture ? visibles.filter((a) => a.statut !== 'in_call') : [];
  const typeSonnerie = sonnant.length === 0 ? null : sonnant.some((a) => a.urgence) ? 'urgence' : 'normal';
  useEffect(() => {
    if (typeSonnerie) demarrerSonnerie(typeSonnerie);
    else arreterSonnerie();
  }, [typeSonnerie]);
  useEffect(() => () => arreterSonnerie(), []);

  return (
    <>
      <AnimatePresence>
        {!acces && visibles.length > 0 && (
          <motion.div className={s.pile} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            {visibles.map((a) => (
              <div key={a.consultationId} className={a.urgence ? `${s.appel} ${s.appelUrgence}` : s.appel} role="alert">
                <span className={a.urgence ? `${s.icone} ${s.iconeUrgence}` : s.icone}>
                  {a.urgence ? <FaPhoneVolume aria-hidden="true" /> : <FaVideo aria-hidden="true" />}
                </span>
                <span className={s.texte}>
                  <strong>
                    {a.urgence ? 'URGENCE' : a.statut === 'in_call' ? 'Appel en cours' : 'Appel entrant'} · {a.appelant}
                  </strong>
                  <small>Télémédecine · {a.patient}</small>
                </span>
                <button type="button" className={s.rejoindre} onClick={() => ouvrir(a.consultationId)} disabled={ouverture === a.consultationId}>
                  <FaPhoneAlt aria-hidden="true" /> {ouverture === a.consultationId ? 'Connexion…' : a.urgence ? 'Décrocher' : 'Rejoindre'}
                </button>
                <button type="button" className={s.ignorer} onClick={() => setIgnores((x) => [...x, a.consultationId])} aria-label="Ignorer">
                  <FaTimes />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {acces && (
          <AppelVideo
            key={acces.salle}
            acces={acces}
            onRaccrocher={raccrocher}
            attente={acces.attente}
            reduit={reduit}
            onBasculer={() => setReduit((r) => !r)}
            actions={
              role === 'doctor' ? (
                <>
                  <button type="button" className={v.actionHaut} onClick={() => setInvitation(true)} title="Inviter un confrère pour un 2e avis">
                    <FaUserPlus aria-hidden="true" /> <span>Inviter un confrère</span>
                  </button>
                  <button type="button" className={`${v.actionHaut} ${v.actionPrincipale}`} onClick={ouvrirFormulaire} title="Remplir la consultation sans quitter l’appel">
                    <FaFileMedical aria-hidden="true" /> <span>Formulaire de consultation</span>
                  </button>
                </>
              ) : null
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{acces && invitation && <InviterConfrere consultationId={acces.consultationId} onFermer={fermerInvitation} />}</AnimatePresence>
    </>
  );
}
