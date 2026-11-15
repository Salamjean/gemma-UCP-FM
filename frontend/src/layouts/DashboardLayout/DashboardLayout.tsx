import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FaHome } from 'react-icons/fa';
import { useLocation, useOutlet } from 'react-router-dom';
import { CentreAppels } from '../../components/AppelVideo';
import { useNomHopitalOuvert } from '../../services/contexteHopital';
import { useAuth } from '../../context/AuthContext';
import styles from './DashboardLayout.module.css';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { matches, visibleMenu, type RoleSpace } from './types';

/**
 * MISE EN PAGE DES ESPACES CONNECTÉS (Super, Médecin, Infirmier)
 * Sidebar à gauche + barre du haut + fil d'Ariane + contenu sur fond à motif.
 * Le menu vient de l'espace (pages/<Role>/<role>.menu.tsx).
 */
export default function DashboardLayout({ space }: { space: RoleSpace }) {
  const { user } = useAuth();
  const location = useLocation();
  const outlet = useOutlet();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Mobile : sidebar fermée par défaut, et refermée après chaque navigation
  useEffect(() => {
    if (window.matchMedia('(max-width: 900px)').matches) setSidebarOpen(false);
  }, [location.pathname]);

  const rel = location.pathname.replace(space.basePath, '').replace(/^\//, '');
  const nomHopital = useNomHopitalOuvert();
  // Sidebar contextuelle (ex. hôpital ouvert par l'admin UCP-FM), sinon menu de l'espace
  const contexte = useMemo(() => space.contextMenu?.(rel, nomHopital) ?? null, [space, rel, nomHopital]);
  const menu = useMemo(() => contexte ?? (user ? visibleMenu(space, user) : []), [contexte, space, user]);

  // Fil d'Ariane : "Accueil" ou "Module - Page"
  const crumbs = useMemo(() => {
    if (rel === 'profil') return ['Mon profil'];
    for (const entry of contexte ?? space.menu) {
      if (entry.path !== undefined && entry.path === rel) return [...(contexte && nomHopital ? [nomHopital] : []), entry.path === '' ? 'Accueil' : entry.label];
      const leaf = entry.children?.find((c) => matches(c.path, rel)) ?? entry.hiddenPages?.find((p) => matches(p.path, rel));
      if (leaf) return [...(contexte && nomHopital ? [nomHopital] : []), entry.label, leaf.label];
    }
    return ['Accueil'];
  }, [rel, space, contexte, nomHopital]);

  if (!user) return null;

  return (
    <div className={`${styles.shell} ${sidebarOpen ? '' : styles.collapsed}`}>
      <Sidebar space={space} menu={menu} user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className={styles.main}>
        <Topbar onToggleSidebar={() => setSidebarOpen((o) => !o)} />

        <nav className={styles.breadcrumb} aria-label="Fil d'Ariane">
          <FaHome className={styles.homeIcon} aria-hidden="true" />
          {crumbs.map((c, i) => (
            <span key={i}>
              <span className={styles.sep}>-</span> {c}
            </span>
          ))}
        </nav>

        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={location.pathname}
            className={styles.content}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {outlet}
          </motion.main>
        </AnimatePresence>
      </div>

      {/* Télémédecine : appels vidéo entre médecin et infirmier·ère */}
      {(user.role === 'doctor' || user.role === 'infirmier') && <CentreAppels role={user.role} />}
    </div>
  );
}
