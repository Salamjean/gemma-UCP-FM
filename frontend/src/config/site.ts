/**
 * INFOS DU SITE — nom, images, coordonnées, liens du menu.
 * Les images sont dans frontend/public/images/ (remplacer les fichiers en gardant le même nom).
 */
export const SITE = {
  name: 'Gemma',
  images: {
    logo: '/images/logo.jpg',
    heroFamily: '/images/hero-famille.jpg', // famille éclaircie, centrée derrière les textes de l'accueil
    heroNurse: '/images/hero-infirmiere.jpg', // infirmière en bas à droite de l'accueil
    authBackground: '/images/auth-background.jpg', // fond des pages Auth (connexion…)
  },
  contact: {
    email: 'contact@gemma.example', // TODO : vrai email
    phone: '+000 00 00 00 00', // TODO : vrai numéro
    address: 'Adresse des bureaux', // TODO : vraie adresse
  },
};

/** Chemins des pages — utilisés par le routeur et par le menu */
export const ROUTES = {
  accueil: '/',
  aPropos: '/a-propos',
  contact: '/contact',
  connexion: '/connexion',
  motDePasseOublie: '/mot-de-passe-oublie',
  /** lien d'invitation d'un confrère à une téléconsultation (généré par le médecin) */
  avisExpert: '/teleconsultation/expert/:id/:code',
} as const;

/** Liens affichés dans le menu (le bouton Connexion est géré à part) */
export const NAV_LINKS = [
  { to: ROUTES.accueil, label: 'Accueil' },
  { to: ROUTES.aPropos, label: 'A Propos' },
  { to: ROUTES.contact, label: 'Contact' },
];
