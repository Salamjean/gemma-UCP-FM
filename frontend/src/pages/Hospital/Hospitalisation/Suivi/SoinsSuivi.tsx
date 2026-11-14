import { motion } from 'framer-motion';
import { FaDisease, FaHandHoldingMedical, FaPills } from 'react-icons/fa';
import type { ElementSoin, SoinsSuivi as Soins } from '../../../../types';
import { jourHeureFr } from '../hospitalisation.format';
import styles from './Suivi.module.css';

/**
 * PARTAGÉ (fiche hospitalisation / observation) : pathologies, soins administrés, traitements
 * — tables pathologies, soins_administres, traitements de Laravel.
 */
export default function SoinsSuivi({ soins }: { soins: Soins }) {
  const colonnes: { titre: string; icone: typeof FaPills; liste: ElementSoin[]; fond: string; texte: string }[] = [
    { titre: 'Pathologies', icone: FaDisease, liste: soins.pathologies, fond: '#fde0e6', texte: '#c4213f' },
    { titre: 'Soins administrés', icone: FaHandHoldingMedical, liste: soins.soins, fond: '#e3f5ee', texte: '#0b7a54' },
    { titre: 'Traitements', icone: FaPills, liste: soins.traitements, fond: '#eaf3fe', texte: '#1f6fc6' },
  ];
  return (
    <div className={styles.soins}>
      {colonnes.map((col, i) => (
        <motion.section key={col.titre} className={styles.soin} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
          <header>
            <span className={styles.soinIcone} style={{ background: col.fond, color: col.texte }}>
              <col.icone aria-hidden="true" />
            </span>
            <h3>{col.titre}</h3>
            <span className={styles.soinNombre}>{col.liste.length}</span>
          </header>
          {col.liste.length ? (
            <ul>
              {col.liste.map((e) => (
                <li key={e.id}>
                  <span>{e.libelle}</span>
                  <small>{jourHeureFr(e.date)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.soinVide}>Rien d'enregistré.</p>
          )}
        </motion.section>
      ))}
    </div>
  );
}
