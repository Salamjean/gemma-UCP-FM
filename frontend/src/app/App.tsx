import { AnimatePresence, MotionConfig } from 'framer-motion';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Loader from '../components/Loader';
import ProtectedRoute from '../components/ProtectedRoute';
import { ROUTES } from '../config/site';
import { AuthProvider } from '../context/AuthContext';
import { usePreload } from '../hooks/usePreload';
import AuthLayout from '../layouts/AuthLayout';
import DashboardLayout from '../layouts/DashboardLayout';
import { allPages, type RoleSpace } from '../layouts/DashboardLayout/types';
import MainLayout from '../layouts/MainLayout';
import Connexion from '../pages/Auth/Connexion';
import MotDePasseOublie from '../pages/Auth/MotDePasseOublie';
import { doctorSpace } from '../pages/Doctor/doctor.menu';
import { hospitalSpace } from '../pages/Hospital/hospital.menu';
import Accueil from '../pages/Home/Accueil';
import APropos from '../pages/Home/APropos';
import AvisExpert from '../pages/Home/AvisExpert';
import Contact from '../pages/Home/Contact';
import { infirmierSpace } from '../pages/Infirmier/infirmier.menu';
import { regulateurSpace } from '../pages/Regulateur/regulateur.menu';
import NotFound from '../pages/NotFound';
import { superSpace } from '../pages/Super/super.menu';

/** Espaces connectés : un par utilisateur (menu + pages définis dans pages/<Role>/<role>.menu.tsx) */
const SPACES: RoleSpace[] = [superSpace, hospitalSpace, doctorSpace, infirmierSpace, regulateurSpace];

/**
 * ROUTEUR — associe chaque URL à une page.
 * - pages publiques : pages/Home/ (+ chemin dans config/site.ts + <Route> ci-dessous)
 * - authentification : pages/Auth/
 * - espaces connectés : pages/Super, pages/Hospital, pages/Doctor, pages/Infirmier → routes créées depuis leur fichier .menu.tsx
 */
export default function App() {
  const loading = usePreload();

  return (
    // reducedMotion="user" : respecte le réglage "réduire les animations" du système
    <MotionConfig reducedMotion="user">
      {/* Loader avec le logo, affiché à l'ouverture du site */}
      <AnimatePresence>{loading && <Loader key="loader" />}</AnimatePresence>

      {/* Le site n'est monté qu'après le loader : ses animations d'entrée se jouent au bon moment */}
      {!loading && (
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* HOME : pages publiques, avec la navbar */}
              <Route element={<MainLayout />}>
                <Route path={ROUTES.accueil} element={<Accueil />} />
                <Route path={ROUTES.aPropos} element={<APropos />} />
                <Route path={ROUTES.contact} element={<Contact />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              {/* Confrère invité à une téléconsultation (lien sécurisé, sans connexion ni navbar) */}
              <Route path={ROUTES.avisExpert} element={<AvisExpert />} />

              {/* AUTH : image de fond + carte centrée, sans navbar */}
              <Route element={<AuthLayout />}>
                <Route path={ROUTES.connexion} element={<Connexion />} />
                <Route path={ROUTES.motDePasseOublie} element={<MotDePasseOublie />} />
              </Route>

              {/* ESPACES CONNECTÉS : sidebar + barre du haut, réservés à leur rôle */}
              {SPACES.map((space) => (
                <Route
                  key={space.role}
                  path={space.basePath}
                  element={
                    <ProtectedRoute role={space.role}>
                      <DashboardLayout space={space} />
                    </ProtectedRoute>
                  }
                >
                  {allPages(space).map((page) =>
                    page.path === '' ? (
                      <Route key="index" index element={page.element} />
                    ) : (
                      <Route key={page.path} path={page.path} element={page.element} />
                    ),
                  )}
                </Route>
              ))}
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      )}
    </MotionConfig>
  );
}
