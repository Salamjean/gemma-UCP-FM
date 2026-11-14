import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ROLE_HOME } from '../../config/roles';
import { ROUTES } from '../../config/site';
import { useAuth } from '../../context/AuthContext';
import type { Role } from '../../types';

/**
 * Protège un espace :
 * - pas connecté → page de connexion
 * - connecté avec un autre rôle → renvoyé vers son propre espace
 */
export default function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user, checking } = useAuth();
  const location = useLocation();

  if (checking) return null; // vérification de la session en cours
  if (!user) return <Navigate to={ROUTES.connexion} replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}
