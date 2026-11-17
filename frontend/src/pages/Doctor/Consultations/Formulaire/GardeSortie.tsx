import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';
import type { NavigateFunction } from 'react-router-dom';
import s from './GardeSortie.module.css';

/** Où l'utilisateur voulait aller : un lien de l'application, ou le retour arrière du navigateur */
type Sortie = { type: 'lien'; href: string } | { type: 'retour' };

/**
 * FORMULAIRE DE CONSULTATION ouvert par « Consulter » — garde de sortie.
 * Tant qu'aucune issue n'est choisie, quitter la page (lien, menu, bouton Retour du navigateur, bouton de la page)
 * demande si la consultation doit être ANNULÉE (comme si rien ne s'était passé), gardée pour plus tard, ou si l'on reste.
 * (Fermer l'onglet ou recharger : simple avertissement du navigateur.)
 */
export function useGardeSortie(actif: boolean) {
  const [sortie, setSortie] = useState<Sortie | null>(null);
  // Garde levée définitivement (sortie confirmée, consultation enregistrée) : plus aucune question
  const libere = useRef(false);
  const actifRef = useRef(actif);
  actifRef.current = actif && !libere.current;

  useEffect(() => {
    if (!actif) return;

    // Liens internes (menu, fil d'Ariane, boutons-liens…) : interceptés avant React Router
    const clic = (e: MouseEvent) => {
      if (!actifRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setSortie({ type: 'lien', href: url.pathname + url.search + url.hash });
    };
    document.addEventListener('click', clic, true);

    // Bouton Retour du navigateur : une entrée d'historique « tampon » le retient
    window.history.pushState({ gardeConsultation: true }, '');
    const retour = () => {
      if (!actifRef.current) return;
      window.history.pushState({ gardeConsultation: true }, '');
      setSortie({ type: 'retour' });
    };
    window.addEventListener('popstate', retour);

    // Fermeture de l'onglet / rechargement : avertissement du navigateur
    const avant = (e: BeforeUnloadEvent) => {
      if (!actifRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avant);

    return () => {
      document.removeEventListener('click', clic, true);
      window.removeEventListener('popstate', retour);
      window.removeEventListener('beforeunload', avant);
    };
  }, [actif]);

  /** Bouton de la page (Retour / Annuler) : même question */
  const demanderSortie = useCallback(() => setSortie({ type: 'retour' }), []);
  /** Lève la garde (avant de naviguer soi-même) */
  const liberer = useCallback(() => {
    libere.current = true;
    actifRef.current = false;
  }, []);

  return { sortie, fermer: () => setSortie(null), demanderSortie, liberer };
}

/** Quitte réellement la page (après la réponse) : lien demandé, ou page précédente (l'entrée « tampon » est sautée) */
export function quitter(sortie: Sortie, navigate: NavigateFunction) {
  if (sortie.type === 'lien') navigate(sortie.href);
  else navigate(-2);
}

/** Fenêtre : annuler la consultation, la garder pour plus tard, ou rester */
export function FenetreQuitter({
  ouvert,
  enCours,
  onAnnulerConsultation,
  onGarder,
  onRester,
}: {
  ouvert: boolean;
  enCours: boolean;
  onAnnulerConsultation: () => void;
  onGarder: () => void;
  onRester: () => void;
}) {
  return (
    <AnimatePresence>
      {ouvert && (
        <motion.div className={s.fond} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && !enCours && onRester()}>
          <motion.div
            className={s.boite}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quitter-titre"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
          >
            <span className={s.icone} aria-hidden="true">
              <FaExclamationTriangle />
            </span>
            <h2 id="quitter-titre">Annuler la consultation ?</h2>
            <p>Vous quittez la page sans avoir choisi d’issue. Voulez-vous annuler cette consultation ? Le patient redeviendra comme avant, sans consultation ouverte.</p>
            <div className={s.boutons}>
              <button type="button" className={s.danger} onClick={onAnnulerConsultation} disabled={enCours}>
                {enCours ? 'Annulation…' : 'Oui, annuler la consultation'}
              </button>
              <button type="button" className={s.secondaire} onClick={onGarder} disabled={enCours}>
                Non, la garder ouverte
              </button>
              <button type="button" className={s.lien} onClick={onRester} disabled={enCours}>
                Rester sur la page
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
