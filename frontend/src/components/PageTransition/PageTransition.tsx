import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Animation entre deux pages : l'ancienne page s'efface,
 * la nouvelle apparaît en fondu avec un léger glissement vers le haut.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      {children}
    </motion.div>
  );
}
