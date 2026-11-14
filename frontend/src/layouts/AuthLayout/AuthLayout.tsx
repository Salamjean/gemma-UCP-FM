import { AnimatePresence, motion } from 'framer-motion';
import { Link, useLocation, useOutlet } from 'react-router-dom';
import { ROUTES, SITE } from '../../config/site';
import styles from './AuthLayout.module.css';
import { useIcones } from '../../services/icones';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Mise en page des pages Auth (Connexion, Mot de passe oublié…) :
 * image de fond plein écran + carte blanche centrée avec le logo.
 * Pas de navbar ici. Le contenu de la carte vient de la page (pages/Auth/...).
 */
export default function AuthLayout() {
  // Icônes choisies dans Super > Réglages > Icônes (services/icones.ts)
  const icones = useIcones();
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <main className={styles.page}>
      {/* Image de fond : léger zoom arrière à l'arrivée */}
      <motion.img
        src={SITE.images.authBackground}
        alt=""
        className={styles.background}
        initial={{ opacity: 0, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: EASE }}
      />

      {/* Carte blanche */}
      <motion.section
        className={styles.card}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
      >
        <Link to={ROUTES.accueil} className={styles.logo} aria-label={`${SITE.name} — retour à l'accueil`}>
          <img src={icones.logo} alt={SITE.name} />
        </Link>

        {/* Contenu de la page, en fondu quand on passe d'une page Auth à l'autre */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </motion.section>
    </main>
  );
}
