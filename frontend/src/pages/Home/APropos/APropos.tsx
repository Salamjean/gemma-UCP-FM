import { motion } from 'framer-motion';
import AnimatedTitle from '../../../components/AnimatedTitle';
import Button from '../../../components/Button';
import Reveal from '../../../components/Reveal';
import { ROUTES } from '../../../config/site';
import styles from './APropos.module.css';

/** Fonctionnalités affichées sur la page — modifier ici le texte */
const FEATURES = [
  { num: '01', title: 'Dossiers patients', text: 'Toutes les informations de vos patients regroupées et accessibles en un clic.' },
  { num: '02', title: 'Consultations', text: 'Planifiez, suivez et documentez chaque consultation simplement.' },
  { num: '03', title: 'Prescriptions', text: 'Rédigez et retrouvez les ordonnances sans perdre de temps.' },
  { num: '04', title: 'Historique médical', text: 'Un suivi complet et chronologique du parcours de soins.' },
];

/** PAGE À PROPOS — présentation de Gemma */
export default function APropos() {
  return (
    <main className={`page ${styles.page}`}>
      <section className={styles.intro}>
        <Reveal y={0} x={-20}>
          <p className={styles.eyebrow}>
            <span className={styles.line} /> À PROPOS
          </p>
        </Reveal>
        <AnimatedTitle text="Une plateforme pensée pour les soignants" />
        <Reveal delay={0.3}>
          <p className={styles.lead}>
            Gemma simplifie le quotidien des professionnels de santé en réunissant
            dans un seul outil tout ce qui concerne le suivi des patients.
          </p>
        </Reveal>
      </section>

      <motion.section
        className={styles.features}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ staggerChildren: 0.12 }}
      >
        {FEATURES.map((f) => (
          <motion.article
            key={f.num}
            className={styles.feature}
            variants={{
              hidden: { opacity: 0, y: 40 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
            }}
          >
            <span className={styles.num}>{f.num}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </motion.article>
        ))}
      </motion.section>

      <Reveal className={styles.cta}>
        <Button to={ROUTES.contact}>Nous contacter</Button>
      </Reveal>
    </main>
  );
}
