import { AnimatePresence } from 'framer-motion';
import { cloneElement, useEffect } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';

/**
 * Mise en page commune : menu en haut + page courante.
 * Gère l'animation de transition quand on change de page.
 */
export default function MainLayout() {
  const location = useLocation();
  const outlet = useOutlet();

  // Revient en haut à chaque changement de page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <>
      <Navbar />
      {/* initial={false} : pas de fondu au premier affichage (le loader s'en charge) */}
      <AnimatePresence mode="wait" initial={false}>
        {outlet && (
          <PageTransition key={location.pathname}>{cloneElement(outlet)}</PageTransition>
        )}
      </AnimatePresence>
    </>
  );
}
