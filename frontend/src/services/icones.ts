import { useSyncExternalStore } from 'react';
import type { IconesInfo } from '../types';
import { api, localAssetUrl } from './api';

/**
 * ICÔNES DU SITE — celles choisies dans Super > Réglages > Icônes (GET /api/icones, public).
 *   logo    → navbar, sidebar, carte de connexion
 *   loading → loader d'ouverture du site (comme Laravel : "icône pendant le chargement des pages")
 *   favicon → icône de l'onglet du navigateur
 * Si une icône n'est pas définie (ou si le backend ne répond pas) : image par défaut.
 *
 * Utilisation : const { logo } = useIcones();   — rafraîchir après modification : chargerIcones()
 */
export interface Icones {
  logo: string;
  loading: string;
  favicon: string;
}

const PAR_DEFAUT: Icones = {
  logo: '/images/logo.jpg',
  loading: '/images/logo.jpg',
  favicon: '/images/logo.jpg',
};

let etat: Icones = PAR_DEFAUT;
const abonnes = new Set<() => void>();

/** Adresse d'une icône + version (?v=…) pour que le navigateur recharge l'image quand elle change */
const adresse = (chemin: string | null, version: number) =>
  chemin ? `${localAssetUrl(chemin)}?v=${version}` : null;

/** Met à jour l'icône de l'onglet du navigateur */
function appliquerFavicon(href: string) {
  let liens = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  if (liens.length === 0) {
    const lien = document.createElement('link');
    lien.rel = 'icon';
    document.head.appendChild(lien);
    liens = [lien];
  }
  const ext = href.split('?')[0].split('.').pop()?.toLowerCase();
  const type = { svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext ?? ''];
  liens.forEach((l) => {
    l.href = href;
    if (type) l.type = type;
  });
}

/** Charge les icônes depuis le backend et les applique partout (sans recharger la page) */
export async function chargerIcones(): Promise<Icones> {
  try {
    const info: IconesInfo = await api.icones();
    const logo = adresse(info.logo, info.updatedAt) ?? PAR_DEFAUT.logo;
    etat = {
      logo,
      loading: adresse(info.loading, info.updatedAt) ?? logo,
      favicon: adresse(info.favicon, info.updatedAt) ?? PAR_DEFAUT.favicon,
    };
  } catch {
    etat = PAR_DEFAUT; // backend indisponible : images par défaut
  }
  appliquerFavicon(etat.favicon);
  abonnes.forEach((f) => f());
  return etat;
}

/** Icônes actuelles ; le composant se met à jour quand elles changent */
export function useIcones(): Icones {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => etat,
  );
}
