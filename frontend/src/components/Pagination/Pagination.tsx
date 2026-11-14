import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import styles from './Pagination.module.css';

interface Props {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  /** Texte à gauche, ex. "16 entrées" */
  resume?: string;
}

/** PARTAGÉ — pagination : précédent / numéros / suivant */
export default function Pagination({ page, pages, onChange, resume }: Props) {
  if (pages <= 1 && !resume) return null;
  // Numéros affichés : première, dernière, et deux autour de la page courante
  const numeros = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1,
  );
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <span className={styles.resume}>{resume}</span>
      {pages > 1 && (
        <div className={styles.boutons}>
          <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Page précédente">
            <FaChevronLeft />
          </button>
          {numeros.map((n, i) => (
            <span key={n} className={styles.groupe}>
              {i > 0 && n - numeros[i - 1] > 1 && <span className={styles.ellipse}>…</span>}
              <button
                type="button"
                className={n === page ? styles.actif : ''}
                onClick={() => onChange(n)}
                aria-current={n === page ? 'page' : undefined}
              >
                {n}
              </button>
            </span>
          ))}
          <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Page suivante">
            <FaChevronRight />
          </button>
        </div>
      )}
    </nav>
  );
}
