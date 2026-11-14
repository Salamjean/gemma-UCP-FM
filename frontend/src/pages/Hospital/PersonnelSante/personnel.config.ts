import type { IconType } from 'react-icons';
import { FaRandom, FaUserMd, FaUserNurse } from 'react-icons/fa';
import { FaPersonPregnant } from 'react-icons/fa6';
import type { TypeAgent } from '../../../types';

/**
 * HÔPITAL > PERSONNEL DE SANTÉ — configuration des types d'agents (pas de pharmacie dans ce projet)
 * Régulateur : rôle propre à Gemma FM, réattribue un patient quand le médecin choisi n'est pas disponible.
 * (libellés, icônes, couleurs, préfixe du matricule, dossier des photos dans Laravel).
 */
export interface ConfigAgent {
  id: TypeAgent;
  libelle: string;
  pluriel: string;
  /** Adresse de la liste : /hopital/personnel-sante/<chemin> */
  chemin: string;
  icone: IconType;
  fond: string;
  texte: string;
  /** Dossier des photos : <LARAVEL_PUBLIC_PATH>/assets/uploads/<dossier> */
  dossier: string;
  description: string;
}

export const AGENTS: Record<TypeAgent, ConfigAgent> = {
  medecin: {
    id: 'medecin',
    libelle: 'Médecin',
    pluriel: 'Médecins',
    chemin: 'medecins',
    icone: FaUserMd,
    fond: '#eaf3fe',
    texte: '#1f6fc6',
    dossier: 'doctor',
    description: 'Généraliste ou spécialiste',
  },
  'sage-femme': {
    id: 'sage-femme',
    libelle: 'Sage-femme',
    pluriel: 'Sages-femmes',
    chemin: 'sages-femmes',
    icone: FaPersonPregnant,
    fond: '#fde8f1',
    texte: '#c2185b',
    dossier: 'doctor',
    description: 'Suivi de grossesse et accouchements',
  },
  infirmier: {
    id: 'infirmier',
    libelle: 'Infirmier(e)',
    pluriel: 'Infirmiers',
    chemin: 'infirmiers',
    icone: FaUserNurse,
    fond: '#e3f5ee',
    texte: '#0b7a54',
    dossier: 'infirmier',
    description: 'Soins, un ou plusieurs services',
  },
  regulateur: {
    id: 'regulateur',
    libelle: 'Régulateur',
    pluriel: 'Régulateurs',
    chemin: 'regulateurs',
    icone: FaRandom,
    fond: '#fff3df',
    texte: '#a15c00',
    dossier: 'regulateur',
    description: 'Réattribue un patient si son médecin est indisponible',
  },
};

export const ORDRE_AGENTS: TypeAgent[] = ['medecin', 'sage-femme', 'infirmier', 'regulateur'];

/** Préfixe ajouté au matricule (comme Laravel) */
export const prefixeMatricule = (type: TypeAgent, typeName?: string) =>
  type === 'medecin' ? (typeName === 'specialiste' ? 'MS' : 'MG') : type === 'sage-femme' ? 'SG' : type === 'regulateur' ? 'REG' : 'INF';

/** Jours du planning (index Laravel : 0 = lundi … 6 = dimanche) */
export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
