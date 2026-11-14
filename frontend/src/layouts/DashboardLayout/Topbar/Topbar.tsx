import { FaBars, FaSignOutAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../config/site';
import { useAuth } from '../../../context/AuthContext';
import styles from './Topbar.module.css';

/** BARRE DU HAUT : bouton pour masquer/afficher la sidebar + "Se déconnecter" */
export default function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.burger} onClick={onToggleSidebar} aria-label="Afficher / masquer le menu">
        <FaBars />
      </button>

      <button
        type="button"
        className={styles.logout}
        onClick={() => {
          logout();
          navigate(ROUTES.connexion);
        }}
      >
        <FaSignOutAlt aria-hidden="true" /> Se déconnecter
      </button>
    </header>
  );
}
