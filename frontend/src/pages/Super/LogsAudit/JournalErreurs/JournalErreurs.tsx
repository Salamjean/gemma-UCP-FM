import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { FaBug, FaShieldAlt } from 'react-icons/fa';
import c from '../../../../styles/espace.module.css';
import JournalAudit from './JournalAudit';
import styles from './JournalErreurs.module.css';
import LogsLaravel from './LogsLaravel';

type Onglet = 'audit' | 'laravel';

/**
 * SUPER > LOGS & AUDIT > JOURNAL & ERREURS
 * Équivalent Laravel : super.logs.index (users/super/logs/index.blade.php)
 *   Onglet 1 : journal d'audit (qui a fait quoi, quand, depuis quel appareil) — table audit_logs
 *   Onglet 2 : logs système Laravel (erreurs, avertissements) — storage/logs/laravel.log
 */
export default function JournalErreurs() {
  const [onglet, setOnglet] = useState<Onglet>('audit');

  const onglets = [
    { id: 'audit' as const, label: "Journal d'audit", icone: FaShieldAlt },
    { id: 'laravel' as const, label: 'Logs système Laravel', icone: FaBug },
  ];

  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Logs & audit</p>
          <h1 className={c.titre}>Logs système & journal d'audit</h1>
        </div>
      </header>

      <div className={styles.onglets} role="tablist">
        {onglets.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={onglet === o.id}
            className={`${styles.onglet} ${onglet === o.id ? styles.ongletActif : ''}`}
            onClick={() => setOnglet(o.id)}
          >
            {onglet === o.id && <motion.span layoutId="onglet-logs" className={styles.ongletFond} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
            <span className={styles.ongletTexte}>
              <o.icone aria-hidden="true" /> {o.label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={onglet} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {onglet === 'audit' ? <JournalAudit /> : <LogsLaravel />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
