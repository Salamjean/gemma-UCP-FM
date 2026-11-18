import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FaDownload, FaShareSquare, FaTimes } from 'react-icons/fa';
import DiagnosticPwa from './DiagnosticPwa';
import { abonner, dejaInstallee, estIos, installationPossible, installer } from './installation';
import s from './InstallerApplication.module.css';

const CLE_MASQUE = 'gemma-installation-masquee';
const lireMasque = () => {
  try {
    return sessionStorage.getItem(CLE_MASQUE) === '1';
  } catch {
    return false;
  }
};

/**
 * PWA — bouton « Installer l'application » (toutes les pages).
 *   - Chrome / Edge : ouvre la vraie installation (application dans sa propre fenêtre, sans barre du navigateur) ;
 *   - iPhone / iPad : explique « Partager → Sur l'écran d'accueil » (Safari n'a pas de bouton d'installation) ;
 *   - masqué si l'application est déjà installée, ou si l'utilisateur le ferme (jusqu'à la prochaine ouverture).
 */
export default function InstallerApplication() {
  const [possible, setPossible] = useState(installationPossible());
  const [masque, setMasque] = useState(lireMasque());
  const [aideIos, setAideIos] = useState(false);
  const installee = dejaInstallee();
  const ios = estIos();

  useEffect(() => abonner(() => setPossible(installationPossible())), []);

  const fermer = () => {
    setMasque(true);
    try {
      sessionStorage.setItem(CLE_MASQUE, '1');
    } catch {
      /* stockage indisponible : masqué jusqu'au rechargement */
    }
  };

  const visible = !installee && !masque && (possible || ios);

  // « ?diagnostic-pwa » dans l'adresse : ce que le navigateur voit (HTTPS, service worker, manifeste…)
  if (new URLSearchParams(location.search).has('diagnostic-pwa')) return <DiagnosticPwa />;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div className={s.bandeau} role="region" aria-label="Installer l'application" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
          <img src="/pwa-icons/icon-192.png" alt="" className={s.icone} />
          <span className={s.texte}>
            <strong>Installer GEMMA</strong>
            <small>{ios ? 'Ajoutez l’application à votre écran d’accueil.' : 'Ouvrez GEMMA comme une application, sans la barre du navigateur.'}</small>
          </span>
          {ios ? (
            <button type="button" className={s.installer} onClick={() => setAideIos((x) => !x)}>
              <FaShareSquare aria-hidden="true" /> Comment ?
            </button>
          ) : (
            <button type="button" className={s.installer} onClick={() => void installer()}>
              <FaDownload aria-hidden="true" /> Installer
            </button>
          )}
          <button type="button" className={s.fermer} onClick={fermer} aria-label="Masquer">
            <FaTimes aria-hidden="true" />
          </button>
          {ios && aideIos && (
            <p className={s.aide}>
              Dans Safari, touchez <FaShareSquare aria-hidden="true" /> <strong>Partager</strong>, puis <strong>« Sur l’écran d’accueil »</strong>. GEMMA s’ouvrira ensuite en plein écran,
              sans la barre du navigateur.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
