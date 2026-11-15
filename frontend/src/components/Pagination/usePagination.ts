import { useEffect, useMemo, useRef, useState } from 'react';

/** Nombre de lignes par page de tous les tableaux du projet */
export const LIGNES_PAR_PAGE = 10;

export interface PaginationListe<T> {
  /** Lignes de la page courante (à afficher dans le tableau) */
  lignes: T[];
  page: number;
  pages: number;
  total: number;
  /** Index (0-based) de la première ligne de la page */
  debut: number;
  parPage: number;
  setPage: (page: number) => void;
}

/**
 * PARTAGÉ — pagination côté navigateur d'une liste déjà chargée (et filtrée).
 * Retour à la page 1 quand le nombre de lignes change (recherche, filtre, suppression) ;
 * un simple rechargement avec le même nombre de lignes garde la page courante.
 */
export function usePagination<T>(liste: T[] | null | undefined, parPage = LIGNES_PAR_PAGE): PaginationListe<T> {
  const total = liste?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / parPage));
  const [page, setPage] = useState(1);
  const totalPrecedent = useRef(total);
  useEffect(() => {
    if (totalPrecedent.current !== total) {
      totalPrecedent.current = total;
      setPage(1);
    }
  }, [total]);
  const courante = Math.min(Math.max(1, page), pages);
  const debut = (courante - 1) * parPage;
  const lignes = useMemo(() => (liste ?? []).slice(debut, debut + parPage), [liste, debut, parPage]);
  return { lignes, page: courante, pages, total, debut, parPage, setPage };
}
