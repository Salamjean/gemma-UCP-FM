import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { FaCheck, FaDownload, FaFilePdf, FaTimes } from 'react-icons/fa';
import { uploadUrl } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import type { DemandePermission } from '../../../types';
import { heure, jour, nombreJours, STATUTS, typeAgent } from './permissions.config';
import styles from './Permissions.module.css';

interface Props {
  demande: DemandePermission | null;
  onFermer: () => void;
  onDecider: (statut: 'agree' | 'reject') => void;
}

/**
 * HÔPITAL > PERMISSIONS — fenêtre de détail d'une demande (bouton "œil")
 * Équivalent Laravel : la fenêtre "editModal" de users/permission/list.blade.php (nom, dates, description, justificatif).
 */
export default function DetailPermission({ demande, onFermer, onDecider }: Props) {
  useEffect(() => {
    if (!demande) return;
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [demande, onFermer]);

  const fichier = demande?.justificatif ? uploadUrl('permission', demande.justificatif) : null;
  const estPdf = !!demande?.justificatif?.toLowerCase().endsWith('.pdf');

  return (
    <AnimatePresence>
      {demande && (
        <motion.div className={styles.voile} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
          <motion.div
            className={styles.fenetre}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titre-permission"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <header className={styles.fenetreEntete}>
              <div>
                <p className={styles.fenetreCode}>Demande n° {demande.code}</p>
                <h2 id="titre-permission">{demande.agent}</h2>
                <span className={c.sousTexte}>
                  {typeAgent(demande)}
                  {demande.matricule ? ` · ${demande.matricule}` : ''}
                  {demande.email ? ` · ${demande.email}` : ''}
                </span>
              </div>
              <button type="button" className={styles.fermer} onClick={onFermer} aria-label="Fermer">
                <FaTimes />
              </button>
            </header>

            <div className={styles.periode}>
              <div>
                <span>Du</span>
                <strong>{jour(demande.debut)}</strong>
                {demande.heureDebut && <small>à {heure(demande.heureDebut)}</small>}
              </div>
              <span className={styles.periodeDuree}>{nombreJours(demande.debut, demande.fin)} j</span>
              <div>
                <span>Au</span>
                <strong>{jour(demande.fin)}</strong>
                {demande.heureFin && <small>à {heure(demande.heureFin)}</small>}
              </div>
            </div>

            <div className={styles.champDetail}>
              <span>Motif</span>
              <p>{demande.motif || '—'}</p>
            </div>

            <div className={styles.champDetail}>
              <span>Justificatif</span>
              {fichier ? (
                estPdf ? (
                  <a href={fichier} target="_blank" rel="noreferrer" className={styles.fichier}>
                    <FaFilePdf aria-hidden="true" /> Ouvrir le PDF
                  </a>
                ) : (
                  <a href={fichier} target="_blank" rel="noreferrer" className={styles.apercuImage} title="Ouvrir en grand">
                    <img src={fichier} alt="Justificatif de la demande" />
                  </a>
                )
              ) : (
                <p className={c.sousTexte}>Aucun justificatif joint.</p>
              )}
              {fichier && (
                <a href={fichier} download className={styles.telecharger}>
                  <FaDownload aria-hidden="true" /> Télécharger
                </a>
              )}
            </div>

            <footer className={styles.fenetrePied}>
              <span className={c.badge} style={{ background: STATUTS[demande.statut].fond, color: STATUTS[demande.statut].texte }}>
                {STATUTS[demande.statut].libelle}
              </span>
              {demande.statut === 'pending' ? (
                <div className={styles.decisions}>
                  <button type="button" className={c.danger} onClick={() => onDecider('reject')}>
                    <FaTimes aria-hidden="true" /> Refuser
                  </button>
                  <button type="button" className={c.principal} onClick={() => onDecider('agree')}>
                    <FaCheck aria-hidden="true" /> Accorder
                  </button>
                </div>
              ) : (
                <button type="button" className={c.secondaire} onClick={onFermer}>Fermer</button>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
