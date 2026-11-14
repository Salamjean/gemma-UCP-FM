import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  /** décalage de départ (px) : y > 0 = arrive du bas */
  y?: number;
  x?: number;
  className?: string;
}

/**
 * Fait apparaître son contenu quand la section arrive à l'écran.
 * Rejoue l'animation à chaque passage (once: false).
 */
export default function Reveal({ children, delay = 0, y = 40, x = 0, className }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
