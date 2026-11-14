import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { FaExclamationTriangle, FaQuestionCircle } from 'react-icons/fa';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  ouvert: boolean;
  titre: string;
  message: string;
  /** Texte du bouton de confirmation */
  confirmer: string;
  /** "danger" = action qui coupe un accès (rouge), "normal" = bleu */
  ton?: 'danger' | 'normal';
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

/**
 * PARTAGÉ — fenêtre de confirmation (remplace le SweetAlert de Laravel).
 * Apparition en fondu + léger zoom ; Échap ou clic à l'extérieur = annuler.
 */
export default function ConfirmDialog({
  ouvert,
  titre,
  message,
  confirmer,
  ton = 'normal',
  enCours,
  onConfirmer,
  onAnnuler,
}: ConfirmDialogProps) {
  const boutonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    boutonRef.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && !enCours && onAnnuler();
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [ouvert, enCours, onAnnuler]);

  return (
    <AnimatePresence>
      {ouvert && (
        <motion.div
          className={styles.fond}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && !enCours && onAnnuler()}
        >
          <motion.div
            className={styles.boite}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-titre"
            aria-describedby="confirm-message"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
          >
            <span className={`${styles.icone} ${ton === 'danger' ? styles.iconeDanger : ''}`} aria-hidden="true">
              {ton === 'danger' ? <FaExclamationTriangle /> : <FaQuestionCircle />}
            </span>
            <h2 id="confirm-titre" className={styles.titre}>
              {titre}
            </h2>
            <p id="confirm-message" className={styles.message}>
              {message}
            </p>
            <div className={styles.boutons}>
              <button type="button" className={styles.annuler} onClick={onAnnuler} disabled={enCours}>
                Annuler
              </button>
              <button
                ref={boutonRef}
                type="button"
                className={`${styles.confirmer} ${ton === 'danger' ? styles.confirmerDanger : ''}`}
                onClick={onConfirmer}
                disabled={enCours}
              >
                {enCours ? 'Patientez…' : confirmer}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
