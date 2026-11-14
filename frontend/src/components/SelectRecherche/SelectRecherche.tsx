import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import styles from './SelectRecherche.module.css';

export interface OptionSelect<T extends string | number> {
  id: T;
  name: string;
  /** Petite ligne sous le nom (ex. code patient, téléphone) */
  detail?: string;
}

interface Props<T extends string | number> {
  /** id HTML du bouton (relié au <label htmlFor>) */
  id: string;
  options: OptionSelect<T>[];
  value: T | null;
  onChange: (id: T | null) => void;
  /** Texte affiché quand rien n'est choisi */
  placeholder: string;
  /** Texte du champ de recherche (ex. "Rechercher une région…") */
  placeholderRecherche: string;
  /** Texte si la recherche ne trouve rien */
  aucunResultat: string;
  /** Permet de vider le champ (champ facultatif) : texte de l'option "aucune" */
  optionVide?: string;
  /** Valeur affichée si elle ne correspond à aucune option (ancienne saisie libre) */
  valeurLibre?: string;
  /** Laisse la place d'une icône à gauche (champ avec icône) */
  avecIcone?: boolean;
  invalide?: boolean;
  /** Nombre de lignes visibles avant le défilement (2 par défaut : dès la 3e ligne, on fait défiler) */
  lignesVisibles?: number;
}

/** Recherche insensible aux majuscules et aux accents ("bere" trouve "Béré") */
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** PARTAGÉ — liste déroulante avec champ de recherche (localités, régions, patients…) */
export default function SelectRecherche<T extends string | number>({
  id,
  options,
  value,
  onChange,
  placeholder,
  placeholderRecherche,
  aucunResultat,
  optionVide,
  valeurLibre,
  avecIcone,
  invalide,
  lignesVisibles = 2,
}: Props<T>) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const choisie = options.find((o) => o.id === value);
  const affichage = choisie?.name ?? valeurLibre;

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [ouvert]);

  const resultats = useMemo(() => {
    const q = sansAccent(recherche.trim());
    return (q ? options.filter((o) => sansAccent(`${o.name} ${o.detail ?? ''}`).includes(q)) : options); // toutes les options (la liste défile)
  }, [options, recherche]);

  // Hauteur de la liste = hauteur réelle des N premières lignes (reste exact si une option a une 2e ligne de détail),
  // appliquée avant l'affichage ; au-delà de N lignes, on fait défiler.
  useLayoutEffect(() => {
    const ul = listeRef.current;
    if (!ouvert || !ul) return;
    const lignes = Array.from(ul.children) as HTMLElement[];
    ul.style.maxHeight = lignes.length > lignesVisibles ? `${lignes.slice(0, lignesVisibles).reduce((h, li) => h + li.offsetHeight, 0)}px` : '';
  }, [ouvert, resultats, lignesVisibles, recherche]);

  // À l'ouverture, l'option déjà choisie est amenée en haut de la liste (sans faire bouger la page)
  useLayoutEffect(() => {
    const ul = listeRef.current;
    const choisieEl = ul?.querySelector<HTMLElement>('[aria-selected="true"]')?.parentElement;
    if (ouvert && ul && choisieEl) ul.scrollTop = choisieEl.offsetTop - ul.offsetTop;
  }, [ouvert]);

  const choisir = (v: T | null) => {
    onChange(v);
    setOuvert(false);
    setRecherche('');
  };

  const classes = [styles.bouton, avecIcone && styles.avecIcone, invalide && styles.invalide, ouvert && styles.ouvert]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.select} ref={ref}>
      <button type="button" id={id} className={classes} onClick={() => setOuvert((o) => !o)} aria-haspopup="listbox" aria-expanded={ouvert}>
        <span className={affichage ? styles.valeur : styles.vide}>{affichage ?? placeholder}</span>
        <FaChevronDown aria-hidden="true" className={styles.chevron} />
      </button>

      <AnimatePresence>
        {ouvert && (
          <motion.div
            className={styles.menu}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <input
              autoFocus
              className={styles.recherche}
              placeholder={placeholderRecherche}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label={placeholderRecherche}
            />
            <ul role="listbox" ref={listeRef} className={styles.liste}>
              {optionVide && !recherche && (
                <li>
                  <button type="button" role="option" aria-selected={value === null && !valeurLibre} className={styles.optionVide} onClick={() => choisir(null)}>
                    {optionVide}
                  </button>
                </li>
              )}
              {resultats.map((o) => (
                <li key={o.id}>
                  <button type="button" role="option" aria-selected={o.id === value} className={o.id === value ? styles.active : ''} onClick={() => choisir(o.id)}>
                    <span className={styles.optionNom}>{o.name}</span>
                    {o.detail && <span className={styles.optionDetail}>{o.detail}</span>}
                  </button>
                </li>
              ))}
              {resultats.length === 0 && <li className={styles.aucun}>{aucunResultat}</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
