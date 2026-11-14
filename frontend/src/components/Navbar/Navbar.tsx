import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { NAV_LINKS, ROUTES, SITE } from '../../config/site';
import { LOGO_LAYOUT_ID } from '../Loader';
import styles from './Navbar.module.css';
import { useIcones } from '../../services/icones';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Flèche du bouton Connexion */
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * MENU DU HAUT
 * - logo à gauche
 * - liens dans une "pilule" : la pastille blanche glisse vers la page active
 * - bouton Connexion avec flèche animée
 * - devient plus fin avec une ombre légère quand on fait défiler la page
 * - menu plein écran en fondu sur mobile
 */
export default function Navbar() {
  // Icônes choisies dans Super > Réglages > Icônes (services/icones.ts)
  const icones = useIcones();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  // Ferme le menu mobile quand on change de page
  useEffect(() => setOpen(false), [location.pathname]);

  // Détecte le défilement pour affiner la barre
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Bloque le défilement de la page quand le menu mobile est ouvert
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  return (
    <header className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.inner}>
        {/* Logo : à l'ouverture du site, il arrive depuis le centre du loader (layoutId partagé) */}
        <Link to={ROUTES.accueil} className={styles.logo} aria-label={`${SITE.name} — accueil`}>
          <motion.img
            layoutId={LOGO_LAYOUT_ID}
            src={icones.logo}
            alt={SITE.name}
            transition={{ layout: { duration: 0.9, ease: EASE } }}
          />
        </Link>

        {/* Liens (ordinateur) */}
        <nav className={styles.pill} aria-label="Navigation principale">
          {NAV_LINKS.map((link, i) => (
            <motion.div
              key={link.to}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 + i * 0.08, duration: 0.5 }} 
            >
              <NavLink to={link.to} end className={styles.link}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        className={styles.activeBg}
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className={styles.linkText}>{link.label}</span>
                  </>
                )}
              </NavLink>
            </motion.div>
          ))}
        </nav>

        {/* Bouton Connexion (ordinateur) */}
        <motion.div
          className={styles.ctaWrapper}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          <Link to={ROUTES.connexion} className={styles.cta}>
            Connexion
            <span className={styles.ctaIcon}>
              <ArrowIcon />
            </span>
          </Link>
        </motion.div>

        {/* Bouton menu (mobile) */}
        <button
          className={styles.burger}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={open}
        >
          <span className={open ? styles.burgerOpen : ''} />
          <span className={open ? styles.burgerOpen : ''} />
        </button>
      </div>

      {/* Menu plein écran (mobile) : apparition en fondu */}
      <AnimatePresence>
        {open && (
          <motion.nav
            className={styles.mobileMenu}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {NAV_LINKS.map((link, i) => (
              <motion.div
                key={link.to}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.07, duration: 0.5, ease: EASE }}
              >
                <NavLink to={link.to} end className={styles.mobileLink}>
                  <span className={styles.mobileIndex}>0{i + 1}</span>
                  {link.label}
                </NavLink>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + NAV_LINKS.length * 0.07, duration: 0.5, ease: EASE }}
            >
              <Link to={ROUTES.connexion} className={`${styles.cta} ${styles.mobileCta}`}>
                Connexion
                <span className={styles.ctaIcon}>
                  <ArrowIcon />
                </span>
              </Link>
            </motion.div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
