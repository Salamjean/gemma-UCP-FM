import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import styles from './CarteStat.module.css';

export interface CarteStatProps {
  icone: string;
  valeur: number;
  libelle: string;
  /** Fond de la carte (couleur unie) */
  fond: string;
  /** Couleur du chiffre */
  couleur: string;
  index: number;
}

/** PARTAGÉ (tableaux de bord super, hôpital…) — Carte chiffrée : icône à gauche, nombre + libellé à droite */
export default function CarteStat({ icone, valeur, libelle, fond, couleur, index }: CarteStatProps) {
  // Le nombre "compte" jusqu'à sa valeur
  const count = useMotionValue(0);
  const arrondi = useTransform(count, (v) => Math.round(v).toLocaleString('fr-FR'));
  useEffect(() => {
    const controls = animate(count, valeur, { duration: 1, delay: 0.2 + index * 0.08, ease: 'easeOut' });
    return () => controls.stop();
  }, [count, valeur, index]);

  return (
    <motion.article
      className={styles.carte}
      style={{ background: fond }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      whileHover={{ y: -4 }}
    >
      <img src={icone} alt="" className={styles.icone} />
      <div className={styles.texte}>
        <motion.strong className={styles.valeur} style={{ color: couleur }}>
          {arrondi}
        </motion.strong>
        <span className={styles.libelle}>{libelle}</span>
      </div>
    </motion.article>
  );
}
