import Button from '../../components/Button';
import { ROUTES } from '../../config/site';
import styles from './NotFound.module.css';

/** PAGE 404 — adresse inconnue */
export default function NotFound() {
  return (
    <main className={`page ${styles.page}`}>
      <h1 className={styles.code}>404</h1>
      <p>Cette page n'existe pas.</p>
      <Button to={ROUTES.accueil}>Retour à l'accueil</Button>
    </main>
  );
}
