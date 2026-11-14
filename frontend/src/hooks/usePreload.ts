import { useEffect, useState } from 'react';
import { SITE } from '../config/site';
import { chargerIcones } from '../services/icones';

/** Durée minimale d'affichage du loader (ms) — pour qu'il ne "clignote" pas */
export const LOADER_MIN_DURATION = 1800;
/** Durée maximale (ms) — le site s'affiche même si une image est lente ou absente */
const LOADER_MAX_DURATION = 6000;

/** Précharge une image ; ne bloque jamais (résout aussi en cas d'erreur) */
const preloadImage = (src: string) =>
  new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
  });

/**
 * Renvoie true tant que le site charge :
 * polices + images principales, avec une durée minimale et maximale.
 */
export function usePreload() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Icônes choisies dans Super > Réglages (logo, chargement, favicon), puis préchargement des images
    const icones = Promise.race([chargerIcones(), new Promise((r) => setTimeout(r, 3000))]).then((ic) => {
      const { logo, loading } = (ic as { logo?: string; loading?: string } | undefined) ?? {};
      return Promise.all([logo, loading].filter(Boolean).map((src) => preloadImage(src as string)));
    });
    const assets = Promise.all([
      document.fonts.ready,
      icones,
      ...Object.entries(SITE.images)
        .filter(([cle]) => cle !== 'logo') // le logo vient des réglages (ci-dessus)
        .map(([, src]) => preloadImage(src)),
    ]);
    const minDelay = new Promise((r) => setTimeout(r, LOADER_MIN_DURATION));
    const maxDelay = new Promise((r) => setTimeout(r, LOADER_MAX_DURATION));

    let cancelled = false;
    Promise.race([Promise.all([assets, minDelay]), maxDelay]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return loading;
}
