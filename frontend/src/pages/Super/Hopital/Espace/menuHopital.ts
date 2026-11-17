import { matchPath } from 'react-router-dom';
import { FaArrowLeft, FaBed, FaBuilding, FaChartPie, FaFileMedical, FaShieldAlt, FaStethoscope, FaUserMd, FaUsers } from 'react-icons/fa';
import { FaChildren } from 'react-icons/fa6';
import type { MenuEntry } from '../../../../layouts/DashboardLayout/types';
import { api } from '../../../../services/api';

/**
 * Rubriques de l'hôpital ouvert par l'admin UCP-FM, affichées dans la SIDEBAR
 * (pas de caisse, pharmacie, secrétariat, comptabilité ni montants).
 * `prefixes` : débuts de chemin qui gardent la rubrique active (pages de détail, modification…).
 */
const RUBRIQUES: { libelle: string; icon: MenuEntry['icon']; prefixes: string[]; pages: [string, string][]; masquee?: boolean }[] = [
  {
    libelle: 'Personnel',
    icon: FaUserMd,
    prefixes: ['personnel-sante', 'specialites'],
    pages: [
      ['Médecins', 'personnel-sante/medecins'],
      ['Sages-femmes', 'personnel-sante/sages-femmes'],
      ['Infirmiers', 'personnel-sante/infirmiers'],
      ['Régulateurs', 'personnel-sante/regulateurs'],
      ['Ajouter un agent', 'personnel-sante/ajouter'],
      ['Spécialités médicales', 'specialites/liste'],
    ],
  },
  { libelle: 'Services', icon: FaBuilding, prefixes: ['services'], pages: [['Liste', 'services/liste'], ['Ajouter', 'services/ajouter']] },
  // Assurances, Hospitalisation, Déclarations : retirées du menu (comme dans l'espace hôpital) ; pages gardées
  { libelle: 'Assurances', icon: FaShieldAlt, prefixes: ['assurances'], pages: [['Liste', 'assurances/liste'], ['Ajouter', 'assurances/ajouter']], masquee: true },
  {
    libelle: 'Hospitalisation',
    icon: FaBed,
    prefixes: ['hospitalisation'],
    masquee: true,
    pages: [
      ['Gestion des chambres', 'hospitalisation/chambres'],
      ['Hospitalisations', 'hospitalisation/liste'],
      ['Observations', 'hospitalisation/observations'],
    ],
  },
  { libelle: 'Patients', icon: FaUsers, prefixes: ['patients'], pages: [['Liste', 'patients/liste']] },
  { libelle: 'Consultations', icon: FaStethoscope, prefixes: ['consultations'], pages: [['Nouvelles', 'consultations/nouvelles'], ['Historique', 'consultations/historique']] },
  { libelle: 'Déclarations', icon: FaChildren, prefixes: ['declarations'], pages: [['Naissances', 'declarations/naissances'], ['Décès', 'declarations/deces']], masquee: true },
  {
    libelle: 'Permissions',
    icon: FaFileMedical,
    prefixes: ['permissions'],
    pages: [
      ['En attente', 'permissions/en-attente'],
      ['Accordées', 'permissions/accordees'],
      ['Refusées', 'permissions/refusees'],
    ],
  },
];

/** Menus déjà construits (fonctions de compteur stables d'une page à l'autre) */
const cache = new Map<string, MenuEntry[]>();

/**
 * Sidebar de l'admin quand un hôpital est ouvert (/super/hopital/:id/…), sinon null (menu normal).
 * `rel` : chemin relatif à /super ; `nom` : nom de l'hôpital (titre de section).
 */
export function menuHopitalOuvert(rel: string, nom: string): MenuEntry[] | null {
  const id = matchPath({ path: '/hopital/:id/*' }, `/${rel}`)?.params.id;
  if (!id || !/^\d+$/.test(id)) return null;

  const cle = `${id}|${nom}`;
  const deja = cache.get(cle);
  if (deja) return deja;

  const base = `hopital/${id}`;
  const menu: MenuEntry[] = [
    { label: 'Retour aux hôpitaux', icon: FaArrowLeft, path: 'hopital/liste' },
    {
      label: 'Vue d’ensemble',
      icon: FaChartPie,
      path: base,
      section: nom || 'Hôpital ouvert',
      hiddenPages: [
        { label: 'Modifier', path: `${base}/modifier`, element: null },
        // Rubriques retirées du menu : leurs pages restent ouvrables (liens de la vue d'ensemble)
        ...RUBRIQUES.filter((r) => r.masquee).flatMap((r) => r.prefixes.map((p) => ({ label: r.libelle, path: `${base}/${p}/*`, element: null }))),
      ],
    },
    ...RUBRIQUES.filter((r) => !r.masquee).map(
      (r): MenuEntry => ({
        label: r.libelle,
        icon: r.icon,
        children: r.pages.map(([label, chemin]) => ({ label, path: `${base}/${chemin}`, element: null })),
        hiddenPages: r.prefixes.map((p) => ({ label: 'Détail', path: `${base}/${p}/*`, element: null })),
        // Demandes de permission en attente (consultation seule pour l'admin)
        badge: r.prefixes[0] === 'permissions' ? () => api.super.hopitaux.supervision(Number(id)).then((d) => d.activite.permissionsEnAttente) : undefined,
      }),
    ),
  ];
  cache.set(cle, menu);
  return menu;
}
