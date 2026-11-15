import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { FaCaretDown, FaChevronRight, FaSignOutAlt, FaUserCircle } from 'react-icons/fa';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { avatarUrl, DEFAULT_AVATAR, displayName, ROLE_HOME, roleSubtitle } from '../../../config/roles';
import { ROUTES, SITE } from '../../../config/site';
import { useAuth } from '../../../context/AuthContext';
import type { AuthUser } from '../../../types';
import { findModule, type MenuEntry, type RoleSpace } from '../types';
import styles from './Sidebar.module.css';
import { useIcones } from '../../../services/icones';

const EASE = [0.22, 1, 0.36, 1] as const;

interface SidebarProps {
  space: RoleSpace;
  menu: MenuEntry[];
  user: AuthUser;
  open: boolean;
  onClose: () => void;
}

/** SIDEBAR : logo, carte orange de l'utilisateur, menu des modules (sous-menus dépliables) */
export default function Sidebar({ space, menu, user, open, onClose }: SidebarProps) {
  // Icônes choisies dans Super > Réglages > Icônes (services/icones.ts)
  const icones = useIcones();
  const location = useLocation();
  const full = (path: string) => (path ? `${space.basePath}/${path}` : space.basePath);

  // Module ouvert : celui qui contient la page courante (pages cachées comprises, ex. Modifier)
  const rel = location.pathname.replace(space.basePath, '').replace(/^\//, '');
  const activeModule = findModule(menu, rel)?.label;
  const [openModule, setOpenModule] = useState<string | undefined>(activeModule);
  useEffect(() => {
    if (activeModule) setOpenModule(activeModule);
  }, [activeModule]);

  return (
    <>
      {/* Fond sombre derrière la sidebar sur mobile */}
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside className={`${styles.sidebar} ${open ? '' : styles.hidden}`} aria-label="Menu principal">
        <Link to={space.basePath} className={styles.logo}>
          <img src={icones.logo} alt={SITE.name} />
        </Link>

        <ProfileCard user={user} />

        <nav className={styles.menu}>
          {menu.map((entry, i) => (
            <motion.div
              key={entry.label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.4 }}
            >
              {entry.section && (
                <p className={styles.section} title={entry.section}>
                  {entry.section}
                </p>
              )}
              {entry.children ? (
                <>
                  <button
                    type="button"
                    className={`${styles.item} ${activeModule === entry.label ? styles.itemActive : ''}`}
                    onClick={() => setOpenModule((m) => (m === entry.label ? undefined : entry.label))}
                    aria-expanded={openModule === entry.label}
                  >
                    <entry.icon className={styles.icon} aria-hidden="true" />
                    <span className={styles.label} title={entry.label}>{entry.label}</span>
                    {entry.badge && <Compteur charger={entry.badge} libelle={entry.label} />}
                    <FaChevronRight
                      className={`${styles.chevron} ${openModule === entry.label ? styles.chevronOpen : ''}`}
                      aria-hidden="true"
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {openModule === entry.label && (
                      <motion.ul
                        className={styles.submenu}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                      >
                        {entry.children.map((leaf) => (
                          <li key={leaf.path}>
                            <NavLink to={full(leaf.path)} end className={styles.subitem}>
                              <span className={styles.dot} aria-hidden="true" />
                              {leaf.label}
                            </NavLink>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <NavLink to={full(entry.path ?? '')} end className={styles.item}>
                  <entry.icon className={styles.icon} aria-hidden="true" />
                  <span className={styles.label} title={entry.label}>{entry.label}</span>
                  {entry.badge && <Compteur charger={entry.badge} libelle={entry.label} />}
                </NavLink>
              )}
            </motion.div>
          ))}
        </nav>

        <p className={styles.footer}>- GEMMA -</p>
      </aside>
    </>
  );
}

/**
 * Pastille de compteur d'une entrée du menu (ex. télémédecines en attente).
 * Rechargée à chaque changement de page et toutes les 60 s ; rien n'est affiché si le compte vaut 0.
 */
function Compteur({ charger, libelle }: { charger: () => Promise<number>; libelle: string }) {
  const [n, setN] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    let actif = true;
    const maj = () =>
      charger()
        .then((v) => actif && setN(v))
        .catch(() => undefined); // un compteur indisponible ne doit pas gêner la navigation
    maj();
    const t = setInterval(maj, 60_000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [charger, pathname]);

  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.span
          key={n}
          className={styles.badge}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          aria-label={`${n} en attente pour ${libelle}`}
          title={`${n} en attente`}
        >
          {n > 99 ? '99+' : n}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Carte orange : photo, nom, rôle + menu déroulant (déconnexion) */
function ProfileCard({ user }: { user: AuthUser }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Ferme le menu déroulant au clic à l'extérieur
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className={styles.profile} ref={ref}>
      <button type="button" className={styles.profileButton} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <img
          src={avatarUrl(user)}
          alt=""
          className={styles.avatar}
          onError={(e) => (e.currentTarget.src = DEFAULT_AVATAR[user.role])}
        />
        <span className={styles.profileText}>
          <strong>{displayName(user)}</strong>
          <small>{roleSubtitle(user)}</small>
        </span>
        <FaCaretDown className={styles.caret} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.dropdown}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(`${ROLE_HOME[user.role]}/profil`);
              }}
            >
              <FaUserCircle aria-hidden="true" /> Mon profil
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate(ROUTES.connexion);
              }}
            >
              <FaSignOutAlt aria-hidden="true" /> Se déconnecter
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
