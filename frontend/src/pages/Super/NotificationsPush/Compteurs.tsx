import { motion } from 'framer-motion';
import { FaAndroid, FaApple, FaBullhorn, FaMobileAlt, FaUsers } from 'react-icons/fa';
import type { StatistiquesAppareils } from '../../../types';
import c from '../../../styles/espace.module.css';

/** Compteurs des appareils (repris de Laravel : patients, appareils joignables, Android, iOS, diffusions) */
export default function Compteurs({ stats, avecDiffusions = true }: { stats: StatistiquesAppareils; avecDiffusions?: boolean }) {
  const cartes = [
    { icone: FaUsers, valeur: stats.patients, libelle: 'Patients inscrits', fond: '#eaf3fe', texte: '#1f6fc6' },
    { icone: FaMobileAlt, valeur: stats.avecJeton, libelle: 'Appareils joignables', fond: '#e3f5ee', texte: '#0b7a54' },
    { icone: FaAndroid, valeur: stats.android, libelle: 'Android', fond: '#eaf6e5', texte: '#3d8b1f' },
    { icone: FaApple, valeur: stats.ios, libelle: 'iOS (Apple)', fond: '#f1f3f8', texte: '#3a3f4b' },
    ...(avecDiffusions ? [{ icone: FaBullhorn, valeur: stats.diffusions ?? 0, libelle: 'Diffusions', fond: '#efe9fd', texte: '#6a3fd6' }] : []),
  ];
  return (
    <div className={`${c.compteurs} ${avecDiffusions ? '' : c.compteursQuatre}`}>
      {cartes.map((k, i) => (
        <motion.div key={k.libelle} className={c.compteur} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
          <span className={c.compteurIcone} style={{ background: k.fond, color: k.texte }}>
            <k.icone aria-hidden="true" />
          </span>
          <span className={c.compteurTexte}>
            <strong>{k.valeur.toLocaleString('fr-FR')}</strong>
            <span>{k.libelle}</span>
          </span>
        </motion.div>
      ))}
    </div>
  );
}
