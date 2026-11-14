import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { FaChevronDown, FaDownload, FaFileAlt, FaSearch, FaSyncAlt, FaTrashAlt } from 'react-icons/fa';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../../services/alertes';
import { api } from '../../../../services/api';
import c from '../../../../styles/espace.module.css';
import type { EntreeLogLaravel } from '../../../../types';
import styles from './JournalErreurs.module.css';

/** Niveaux du filtre (repris de Laravel) et couleur de badge */
const NIVEAUX = [
  { id: 'ALL', label: 'Tous les niveaux' },
  { id: 'ERROR', label: 'ERROR / CRITICAL' },
  { id: 'WARNING', label: 'WARNING' },
  { id: 'INFO', label: 'INFO' },
  { id: 'DEBUG', label: 'DEBUG' },
];
function couleurNiveau(n: string) {
  if (['ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'].includes(n)) return { background: '#fde0e6', color: '#c4213f' };
  if (n === 'WARNING' || n === 'NOTICE') return { background: '#fff3df', color: '#b56b00' };
  if (n === 'INFO') return { background: '#eaf3fe', color: '#1f6fc6' };
  return { background: '#f1f3f8', color: '#5d6577' };
}

/** Onglet "Logs système Laravel" : 200 dernières entrées de storage/logs/laravel.log */
export default function LogsLaravel() {
  const [niveau, setNiveau] = useState('ALL');
  const [recherche, setRecherche] = useState('');
  const [entrees, setEntrees] = useState<EntreeLogLaravel[] | null>(null);
  const [taille, setTaille] = useState('');
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    api.super.logs
      .laravel(niveau, recherche)
      .then((r) => {
        setEntrees(r.entrees);
        setTaille(r.taille);
        setOuvert(null);
      })
      .catch((e) => alerte.echec(`Impossible de lire les logs Laravel : ${messageErreur(e)}`));
  }, [niveau, recherche]);

  useEffect(() => {
    const t = setTimeout(charger, recherche ? 350 : 0);
    return () => clearTimeout(t);
  }, [charger, recherche]);

  const telecharger = async () => {
    try {
      await api.super.logs.telechargerLaravel();
    } catch (e) {
      alerte.echec(messageErreur(e));
    }
  };

  const vider = async () => {
    setEnCours(true);
    try {
      const r = await api.super.logs.viderLaravel();
      setConfirmer(false);
      alerte.succes(r.message);
      charger();
    } catch (e) {
      setConfirmer(false);
      alerte.echec(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className={c.bloc}>
      <div className={styles.fichier}>
        <span className={styles.fichierIcone}><FaFileAlt aria-hidden="true" /></span>
        <span>
          <strong>storage/logs/laravel.log</strong>
          <span className={c.sousTexte}>Taille actuelle : {taille || '…'} · 200 dernières entrées affichées</span>
        </span>
        <div className={styles.fichierBoutons}>
          <button type="button" className={c.secondaire} onClick={charger} title="Actualiser">
            <FaSyncAlt aria-hidden="true" />
          </button>
          <button type="button" className={c.secondaire} onClick={telecharger}>
            <FaDownload aria-hidden="true" /> Télécharger
          </button>
          <button type="button" className={c.danger} onClick={() => setConfirmer(true)}>
            <FaTrashAlt aria-hidden="true" /> Vider
          </button>
        </div>
      </div>

      <div className={c.filtres}>
        <label className={`${c.champ} ${c.recherche} ${styles.rechercheChamp}`}>
          <FaSearch aria-hidden="true" />
          <input type="search" placeholder="Rechercher dans les messages et traces…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher dans les logs" />
        </label>
        <select className={c.champ} value={niveau} onChange={(e) => setNiveau(e.target.value)} aria-label="Niveau">
          {NIVEAUX.map((n) => (
            <option key={n.id} value={n.id}>{n.label}</option>
          ))}
        </select>
      </div>

      <ul className={styles.logs}>
        {entrees?.map((e, i) => (
          <li key={`${e.date}-${i}`} className={styles.log}>
            <button type="button" className={styles.logHaut} onClick={() => setOuvert(ouvert === i ? null : i)} aria-expanded={ouvert === i} disabled={!e.trace}>
              <span className={c.badge} style={couleurNiveau(e.niveau)}>{e.niveau}</span>
              <span className={styles.logDate}>{e.date}</span>
              <span className={styles.logMessage}>{e.message}</span>
              {e.trace && <FaChevronDown className={`${styles.logChevron} ${ouvert === i ? styles.logChevronOuvert : ''}`} aria-hidden="true" />}
            </button>
            <AnimatePresence initial={false}>
              {ouvert === i && e.trace && (
                <motion.pre className={styles.trace} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  {e.trace}
                </motion.pre>
              )}
            </AnimatePresence>
          </li>
        ))}
        {entrees && entrees.length === 0 && <li className={c.vide}>Aucune entrée {niveau !== 'ALL' || recherche ? 'pour ces filtres' : 'dans le fichier'}.</li>}
        {!entrees && <li className={c.vide}>Chargement…</li>}
      </ul>

      <ConfirmDialog
        ouvert={confirmer}
        titre="Vider les logs Laravel ?"
        message="Tout le contenu de storage/logs/laravel.log sera effacé définitivement. Pensez à le télécharger avant si vous voulez le conserver."
        confirmer="Vider"
        ton="danger"
        enCours={enCours}
        onConfirmer={vider}
        onAnnuler={() => setConfirmer(false)}
      />
    </section>
  );
}
