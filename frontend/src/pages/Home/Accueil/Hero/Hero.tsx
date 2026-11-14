import { motion } from 'framer-motion';
import { SITE } from '../../../../config/site';
import styles from './Hero.module.css';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * ACCUEIL > HERO — bandeau principal plein écran
 * - famille éclaircie, centrée derrière les textes (images/hero-famille.jpg)
 * - infirmière en bas à droite (images/hero-infirmiere.jpg)
 */
export default function Hero() {
  const titleLines = ['DANS LA GESTION DE', 'VOS PATIENTS'];

  return (
    <section className={`page ${styles.hero}`}>
      {/* Infirmière : arrive de loin (démarre plus petite) */}
      <motion.img
        src={SITE.images.heroNurse}
        alt="Infirmière souriante"
        className={styles.nurse}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.2, ease: EASE }}
      />

      {/* Colonne de texte : la famille est centrée derrière elle */}
      <div className={styles.column}>
        <div className={styles.familyLayer} aria-hidden="true">
          <motion.img
            src={SITE.images.heroFamily}
            alt=""
            className={styles.family}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.4, ease: EASE }}
          />
        </div>

        <div className={styles.content}>
          <div className={styles.eyebrow}>
            <motion.span
              className={styles.line}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
            />
            <motion.span
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              GEMMA VOUS ACCOMPAGNE
            </motion.span>
          </div>

          <h1 className={styles.title}>
            {titleLines.map((line, i) => (
              <span key={line} className={styles.mask}>
                <motion.span
                  className={styles.titleLine}
                  initial={{ y: '105%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.9, delay: 0.7 + i * 0.15, ease: EASE }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            className={styles.text}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1 }}
          >
            Centralisez les dossiers patients, les consultations, les prescriptions et
            l'historique médical dans une plateforme unique.
          </motion.p>
        </div>
      </div>
    </section>
  );
}
