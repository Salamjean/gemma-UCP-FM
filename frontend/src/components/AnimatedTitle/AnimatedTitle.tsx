import { motion } from 'framer-motion';
import styles from './AnimatedTitle.module.css';

interface AnimatedTitleProps {
  text: string;
  className?: string;
}

/** Titre dont chaque mot remonte depuis un masque, l'un après l'autre */
export default function AnimatedTitle({ text, className }: AnimatedTitleProps) {
  const words = text.split(' ');
  return (
    <motion.h2
      className={`${styles.title} ${className ?? ''}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false, amount: 0.5 }}
      transition={{ staggerChildren: 0.08 }}
    >
      {words.map((word, i) => (
        <span key={i} className={styles.mask}>
          <motion.span
            className={styles.word}
            variants={{
              hidden: { y: '110%' },
              visible: { y: '0%', transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  );
}
