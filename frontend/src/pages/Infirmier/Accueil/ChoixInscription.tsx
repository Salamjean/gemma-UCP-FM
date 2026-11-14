import { motion } from 'framer-motion';
import { FaArrowLeft, FaArrowRight, FaBolt, FaClipboardList } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import type { EspaceAgent } from '../../../services/api';
import c from '../../../styles/espace.module.css';
import s from './ChoixInscription.module.css';

const CHOIX = [
  {
    chemin: 'complete',
    icone: FaClipboardList,
    titre: 'Inscription complète',
    texte: 'Dossier complet en 3 étapes : identité, contacts & pièce, puis affectation (facultative).',
    classe: s.bleu,
  },
  {
    chemin: 'urgence',
    icone: FaBolt,
    titre: "Inscription d'urgence",
    texte: 'Informations obligatoires seulement, sur une page, avec affectation immédiate du patient.',
    classe: s.rouge,
  },
];

/**
 * INFIRMIER / MÉDECIN > INSCRIRE UN NOUVEAU PATIENT — choix du type d'inscription
 * (bouton « Inscrire un nouveau patient ») : complète ou d'urgence.
 */
export default function ChoixInscription({ espace = 'infirmier' }: { espace?: EspaceAgent } = {}) {
  const base = espace === 'medecin' ? '/medecin' : '/infirmier';
  return (
    <div className={c.page}>
      <header className={c.entete}>
        <div>
          <p className={c.surtitre}>Accueil · Nouveau patient</p>
          <h1 className={c.titre}>Inscrire un nouveau patient</h1>
        </div>
        <Link to={base} className={c.secondaire}>
          <FaArrowLeft aria-hidden="true" /> Tableau de bord
        </Link>
      </header>

      <section className={c.bloc}>
        <p className={s.question}>Quel type d'inscription voulez-vous faire ?</p>
        <div className={s.choix}>
          {CHOIX.map((x, i) => (
            <motion.div key={x.chemin} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Link to={`${base}/patients/inscrire/${x.chemin}`} className={`${s.carte} ${x.classe}`}>
                <span className={s.icone}>
                  <x.icone aria-hidden="true" />
                </span>
                <strong>{x.titre}</strong>
                <small>{x.texte}</small>
                <span className={s.aller}>
                  Commencer <FaArrowRight aria-hidden="true" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
