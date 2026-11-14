import { motion } from 'framer-motion';
import { SITE } from '../../config/site';
import styles from './Loader.module.css';
import { useIcones } from '../../services/icones';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Identifiant partagé : le logo du loader "vole" vers le logo de la navbar */
export const LOGO_LAYOUT_ID = 'site-logo';

/**
 * Écran de chargement plein écran avec le logo.
 * Affiché à l'ouverture du site (géré dans app/App.tsx).
 * À la fin : le fond blanc s'efface et le logo se déplace jusqu'à sa place dans la navbar
 * (même layoutId que le logo de components/Navbar).
 * Durée minimale : LOADER_MIN_DURATION dans hooks/usePreload.ts
 */
export default function Loader() {
  // Icônes choisies dans Super > Réglages > Icônes (services/icones.ts)
  const icones = useIcones();
  return (
    <motion.div
      className={styles.loader}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}
      role="status"
      aria-label="Chargement"
    >
      <div className={styles.center}>
        {/* Apparition : le logo se dévoile de gauche à droite */}
        <motion.div
          initial={{ clipPath: 'inset(0 100% 0 0)', opacity: 0 }}
          animate={{ clipPath: 'inset(0 0% 0 0)', opacity: 1 }}
          transition={{ clipPath: { duration: 0.9, ease: EASE }, opacity: { duration: 0.3 } }}
        >
          {/* Le logo "respire" pendant le chargement */}
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: 0.9, ease: 'easeInOut' }}
          >
            <motion.img
              layoutId={LOGO_LAYOUT_ID}
              src={icones.loading}
              alt={SITE.name}
              className={styles.logo}
            />
          </motion.div>
        </motion.div>

        {/* Barre de progression bleue unie */}
        <div className={styles.track}>
          <motion.span
            className={styles.bar}
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
