import Pagination from './Pagination';
import type { PaginationListe } from './usePagination';

/**
 * PARTAGÉ — pied de tableau paginé : « 11–20 sur 37 » + précédent / numéros / suivant.
 * Rien n'est affiché tant que la liste tient sur une seule page (10 lignes ou moins).
 */
export default function PaginationTableau<T>({ pagination: p }: { pagination: PaginationListe<T> }) {
  if (p.total <= p.parPage) return null;
  const fin = Math.min(p.debut + p.parPage, p.total);
  return <Pagination page={p.page} pages={p.pages} onChange={p.setPage} resume={`${p.debut + 1}–${fin} sur ${p.total}`} />;
}
