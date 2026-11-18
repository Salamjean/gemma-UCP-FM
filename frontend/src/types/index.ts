/** Types partagés — doivent correspondre aux réponses du backend */

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  /** "Se souvenir de moi" : jeton valable plus longtemps */
  remember?: boolean;
}

/** Rôles autorisés sur cette application */
export type Role = 'admin' | 'hospital' | 'doctor' | 'infirmier' | 'regulateur';

/** Infos de profil (carte orange de la sidebar, variantes de menu) */
export interface UserProfile {
  /** Nom du fichier photo dans Laravel (public/assets/uploads/<role>/...) */
  imgUrl: string | null;
  /** Médecins : 1 = Médecin, 2 = Sage femme */
  typeAgentId: number | null;
  typeAgent: string | null;
  /** Médecins : spécialité */
  typeName: string | null;
  /** Infirmiers : service (4 = menu "Soins infirmier") */
  serviceId?: number | null;
  /** Infirmiers : téléconsultation active sur leur hôpital */
  teleconsultationActive?: boolean;
}

/** Utilisateur de la base Laravel (table users) */
export interface AuthUser {
  id: number;
  email: string | null;
  name: string | null;
  prenom: string | null;
  role: Role;
  profile: UserProfile;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/** GET /api/super/tableau-de-bord */
export interface SuperDashboard {
  cartes: {
    hopitaux: number;
    patients: number;
    consultations: number;
    naissances: number;
    deces: number;
  };
  /** ['2026-02', …] — 10 derniers mois */
  mois: string[];
  naissances: number[];
  deces: number[];
  consultations: number[];
  /** Les 12 mois de l'année en cours (janvier → décembre) — pour l'export Excel */
  annee?: { mois: string[]; naissances: number[]; deces: number[]; consultations: number[] };
  /** Export : naissances / décès de chaque hôpital DMHP pour chaque mois de l'année ([hôpital][mois]) */
  parHopital?: { mois: string[]; hopitaux: { id: number; label: string }[]; naissances: number[][]; deces: number[][] };
}

/** SUPER > RÉGLAGES > ICÔNES */
export interface IconesInfo {
  logo: string | null;
  loading: string | null;
  favicon: string | null;
  updatedAt: number;
}

/** SUPER > HÔPITAL — GET /api/super/hopitaux */
export interface Hopital {
  id: number;
  reference: string | null;
  label: string | null;
  contact: string | null;
  imgUrl: string | null;
  district: string | null;
  directionGenerale: string | null;
  localite: string | null;
  email: string | null;
  actif: boolean;
  teleconsultation: boolean;
  createdAt: string | null;
}

/** GET /api/super/hopitaux/:id — fiche pour "Modifier" */
export interface HopitalDetail {
  id: number;
  reference: string | null;
  label: string | null;
  contact: string | null;
  localiteId: number | null;
  district: string | null;
  directionGenerale: string | null;
  teleconsultation: boolean;
  email: string | null;
  imgUrl: string | null;
}

/** GET /api/super/hopitaux/:id/supervision — bouton "Ouvrir" */
export interface HopitalSupervision {
  hopital: Omit<Hopital, 'id'> & { id: number };
  /** Activité médicale (sans caisse ni montants) */
  activite: {
    consultations: number;
    consultationsJour: number;
    naissances: number;
    deces: number;
    patients: number;
    hospitalisationsEnCours: number;
    permissionsEnAttente: number;
    assurances: number;
  };
  lits: { total: number; occupes: number; libres: number };
  /** Personnel de santé seulement (pas de secrétariat, caisse, comptabilité ni pharmacie) */
  personnel: { medecins: number; sagesFemmes: number; infirmiers: number; total: number };
  services: { id: number; libelle: string | null; actif: boolean; medecins: number }[];
}

/** Sous-préfecture (champ "localité") */
export interface Localite {
  id: number;
  name: string;
}

/** GET /api/hospital/tableau-de-bord (données de l'hôpital connecté) */
export interface HospitalDashboard {
  /** Nom de l'hôpital connecté */
  hopital?: string;
  cartes: {
    consultations: number;
    naissances: number;
    deces: number;
  };
  mois: string[];
  naissances: number[];
  deces: number[];
  consultations: number[];
  /** Les 12 mois de l'année en cours (janvier → décembre) — pour l'export Excel */
  annee?: { mois: string[]; naissances: number[]; deces: number[]; consultations: number[] };
}


/* =========================================================
   SUPER > LOGS & AUDIT
   ========================================================= */
export interface LigneAudit {
  id: number;
  date: string;
  utilisateur: string | null;
  role: string | null;
  hopital: string | null;
  action: string;
  module: string | null;
  description: string;
  ip: string | null;
  appareil: string | null;
  navigateur: string | null;
}

export interface JournalAudit {
  periode: { debut: string; fin: string };
  total: number;
  page: number;
  pages: number;
  lignes: LigneAudit[];
  statistiques: { total: number; telechargements: number; creations: number; machines: number };
  filtres: { hopitaux: { id: number; label: string }[]; actions: string[]; roles: string[] };
}

export interface FiltresAudit {
  recherche?: string;
  hopital?: string;
  action?: string;
  role?: string;
  debut?: string;
  fin?: string;
  page?: number;
}

export interface EntreeLogLaravel {
  date: string;
  env: string;
  niveau: string;
  message: string;
  trace: string;
}

/* =========================================================
   SUPER > NOTIFICATIONS PUSH
   ========================================================= */
export type CibleDiffusion = 'all' | 'android' | 'ios' | 'specific';
export type CategorieDiffusion = 'general' | 'alert' | 'reminder' | 'update' | 'info';

export interface StatistiquesAppareils {
  patients: number;
  avecJeton: number;
  android: number;
  ios: number;
  /** Compte de service Firebase présent */
  pushConfigure: boolean;
  diffusions?: number;
}

export interface ResumeDiffusion {
  lot: string;
  titre: string;
  message: string;
  categorie: CategorieDiffusion;
  cible: CibleDiffusion;
  envoyePar: string;
  date: string;
  destinataires: number;
  push: number;
  lus: number;
}

export interface DetailDiffusion extends Omit<ResumeDiffusion, 'destinataires'> {
  inAppSeulement: number;
  nombreDestinataires: number;
  destinataires: {
    id: number;
    codePatient: string | null;
    nom: string;
    telephone: string | null;
    appareil: 'Android' | 'iOS';
    canal: string;
    lu: boolean;
    luLe: string | null;
  }[];
}

export interface PatientCible {
  id: number;
  nom: string;
  code: string | null;
  telephone: string | null;
  jeton: boolean;
}

/** Résultat d'une diffusion : "attention" = enregistrée In-App mais aucun push délivré */
export interface ResultatDiffusion {
  lot: string;
  type: 'succes' | 'attention';
  message: string;
}

/* =========================================================
   HÔPITAL > SERVICES (service_hospitals + prestation_hospitals)
   ========================================================= */
export interface ServiceHopital {
  id: number;
  libelle: string;
  description: string | null;
  actif: boolean;
  /** Nombre d'actes médicaux tarifés */
  actes: number;
  prixMin: number | null;
  prixMax: number | null;
  /** Médecins + infirmiers affectés (empêchent la suppression) */
  agents: number;
  creeLe: string | null;
}

export interface ElementCatalogue {
  id: number;
  libelle: string;
}

export interface ActeService {
  id: number;
  libelle: string;
  prix: number;
  description: string | null;
  /** Affecté à un médecin ou déjà utilisé en consultation : non supprimable */
  verrouille: boolean;
}

export interface ServiceDetail {
  id: number;
  libelle: string;
  description: string | null;
  actif: boolean;
  actes: ActeService[];
  /** Actes du catalogue de ce service pas encore pratiqués par l'hôpital */
  disponibles: ElementCatalogue[];
}

/** Acte envoyé au backend : du catalogue (prestationServiceId) ou nouveau (libelle) */
export interface ActeSaisi {
  prestationServiceId?: number;
  libelle?: string;
  prix: number;
  description?: string;
}

export interface NouveauService {
  serviceId?: number;
  nouveauService?: string;
  description?: string;
  actes: ActeSaisi[];
}

export interface ModificationService {
  description?: string;
  actesExistants: { id: number; prix: number; description?: string }[];
  nouveauxActes: ActeSaisi[];
}

/* =========================================================
   HÔPITAL > ASSURANCES (type_assurances)
   ========================================================= */
export interface Assurance {
  id: number;
  reference: string | null;
  libelle: string;
  /** Part prise en charge par l'assurance, en % (le patient paie le reste) */
  reduction: number;
  description: string | null;
  actif: boolean;
  creeLe: string | null;
  /** Patients couverts (liste uniquement) */
  patients?: number;
}

export interface AssuranceSaisie {
  libelle: string;
  reduction: number;
  description?: string;
}

/* =========================================================
   HÔPITAL > SPÉCIALITÉS MÉDICALES (type_doctors)
   ========================================================= */
export interface Specialite {
  id: number;
  label: string;
  description: string | null;
  actif: boolean;
  creeLe: string | null;
  /** Médecins rattachés (liste uniquement) */
  medecins?: number;
}

export interface SpecialiteSaisie {
  label: string;
  description?: string;
}

/* =========================================================
   HÔPITAL > PERSONNEL DE SANTÉ (doctors, infirmiers)
   ========================================================= */
export type TypeAgent = 'medecin' | 'sage-femme' | 'infirmier' | 'regulateur';

export interface Agent {
  id: number;
  nom: string;
  email: string | null;
  matricule: string | null;
  contact: string | null;
  photo: string | null;
  actif: boolean;
  /** Service(s) d'affectation */
  service: string | null;
  /** Généraliste, spécialité, Sage-femme (médecins / sages-femmes) */
  specialite: string | null;
  /** Médecin chef */
  chef: boolean;
  /** Nombre d'actes pratiqués (médecins / sages-femmes) */
  actes: number | null;
  /** Jours de disponibilité : 0 = lundi … 6 = dimanche */
  jours: number[];
}

export interface JourDispo {
  jour: number;
  heure: string;
}

export interface AgentFiche {
  id: number;
  nom: string;
  email: string | null;
  matricule: string | null;
  contact: string;
  adresse: string;
  photo: string | null;
  actif: boolean;
  jours: JourDispo[];
  service?: number | null;
  actes?: number[];
  typeName?: 'generaliste' | 'specialiste';
  typeDoctor?: number | null;
  services?: number[];
}

export interface OptionsPersonnel {
  services: { id: number; libelle: string }[];
  actes: { id: number; serviceId: number; libelle: string; prix: number }[];
  specialites: { id: number; libelle: string }[];
}

/* =========================================================
   HÔPITAL > HOSPITALISATION (bedrooms, beds, hospitalisations, observations)
   ========================================================= */
export type TypeChambre = 'individual' | 'collective';

export interface Chambre {
  id: number;
  numero: string;
  type: TypeChambre;
  /** Prix par jour (FCFA) */
  prix: number;
  description: string | null;
  actif: boolean;
  lits: number;
  occupes: number;
}

export interface LitChambre {
  id: number;
  numero: string;
  occupe: boolean;
}

export interface ChambreDetail extends Omit<Chambre, 'lits' | 'occupes'> {
  lits: LitChambre[];
}

export interface ChambreSaisie {
  type?: TypeChambre;
  numero: string;
  prix: number;
  description?: string;
  lits: { id?: number; numero: string }[];
}

export interface PatientResume {
  code: string | null;
  nom: string;
  sexe?: string | null;
  naissance?: string | null;
}

export interface ElementSoin {
  id: number;
  libelle: string;
  date: string | null;
}

export interface SoinsSuivi {
  pathologies: ElementSoin[];
  soins: ElementSoin[];
  traitements: ElementSoin[];
}

export interface HospitalisationResume {
  id: number;
  code: string;
  patient: PatientResume;
  medecin: string | null;
  consultation: string | null;
  debut: string;
  fin: string | null;
  jours: number | null;
  enCours: boolean;
  statut: string;
  motif: string | null;
  /** Dernière chambre / lit occupé, ex. "A1 · lit 2" */
  lit: string | null;
  prix: number | null;
}

export interface JourneeHospitalisation {
  id: number;
  jour: string;
  fin: string | null;
  nombre: number;
  prix: number | null;
  statut: string;
  medecin: string | null;
  infirmier: string | null;
  lit: string | null;
}

export interface HospitalisationDetail extends SoinsSuivi {
  id: number;
  code: string;
  statut: string;
  enCours: boolean;
  debut: string;
  fin: string | null;
  jours: number | null;
  prix: number | null;
  patient: PatientResume;
  medecin: string | null;
  consultation: { code: string | null; motif: string | null };
  dossier: {
    motif: string | null;
    diagnostic: string | null;
    regime: string | null;
    analyses: string | null;
    sonde: string | null;
    oxygenotherapie: string | null;
    volume: string | null;
    remarque: string | null;
    motifSortie: string | null;
  };
  journees: JourneeHospitalisation[];
}

export interface ObservationResume {
  id: number;
  code: string;
  patient: PatientResume;
  consultation: string | null;
  debut: string;
  fin: string | null;
  duree: string | null;
  diagnostic: string | null;
}

export interface ObservationDetail extends SoinsSuivi {
  id: number;
  code: string;
  debut: string;
  fin: string | null;
  duree: string | null;
  patient: PatientResume;
  consultation: { code: string | null; motif: string | null };
  observations: string | null;
  diagnostic: string | null;
}

/* =========================================================
   HÔPITAL > PERMISSIONS (demandes d'absence du personnel — table permissions)
   ========================================================= */
export type StatutPermission = 'pending' | 'agree' | 'reject';

export interface DemandePermission {
  id: number;
  code: string;
  /** doctor | male_nurse | secreteriat | cashier | accountant | pharmacy | regulateur (Gemma FM) */
  type: string;
  /** Agent "doctor" de type sage-femme */
  sageFemme: boolean;
  agent: string;
  email: string | null;
  matricule: string | null;
  debut: string;
  fin: string;
  heureDebut: string | null;
  heureFin: string | null;
  motif: string | null;
  /** Justificatif (assets/uploads/permission/) */
  justificatif: string | null;
  statut: StatutPermission;
  demandeLe: string | null;
  traiteLe: string | null;
}

export interface ListePermissions {
  compteurs: Record<StatutPermission, number>;
  demandes: DemandePermission[];
}

/* =========================================================
   HÔPITAL > PATIENTS
   ========================================================= */
export interface PatientHopital {
  id: number;
  codePatient: string;
  nom: string;
  prenom: string;
  nomComplet: string;
  genre: string | null;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  pays: string | null;
  typePiece: string | null;
  numeroIdentite: string | null;
  telephone: string | null;
  email: string | null;
  residence: string | null;
  profession: string | null;
  assure: boolean;
  numeroAssurance: string | null;
  imgUrl: string | null;
  actif: boolean;
  nbConsultations: number;
  createdAt: string | null;
}

export interface PatientHopitalDetail {
  id: number;
  codePatient: string;
  nom: string;
  prenom: string;
  nomComplet: string;
  genre: string | null;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  pays: string | null;
  ethnie: string | null;
  typePiece: string | null;
  numeroIdentite: string | null;
  profession: string | null;
  nbreEnfants: number | null;
  telephone: string | null;
  telephone2: string | null;
  email: string | null;
  residenceActuelle: string | null;
  residenceHabituelle: string | null;
  adresse: string | null;
  assure: boolean;
  numeroAssurance: string | null;
  imgUrl: string | null;
  actif: boolean;
  urgence1: {
    nom: string | null;
    telephone: string | null;
    lien: string | null;
  };
  urgence2: {
    nom: string | null;
    telephone: string | null;
    lien: string | null;
  };
  createdAt: string | null;
  consultations: {
    id: number;
    code: string | null;
    date: string | null;
    motif: string | null;
    medecin: string | null;
    terminee: boolean;
    createdAt: string | null;
  }[];
}

/* =========================================================
   HÔPITAL > CONSULTATIONS
   ========================================================= */
export interface ConsultationHopital {
  id: number;
  code: string | null;
  date: string | null;
  createdAt: string | null;
  motif: string;
  motifDetail: string | null;
  montant: number | null;
  patient: {
    id: number | null;
    code: string;
    nom: string;
    imgUrl: string | null;
    genre: string | null;
  };
  medecin: string;
  terminee: boolean;
  nbOrdonnances?: number;
  nbArrets?: number;
  nbExamens?: number;
}

export interface ConsultationHopitalDetail {
  id: number;
  code: string | null;
  date: string | null;
  createdAt: string | null;
  terminee: boolean;
  service: string | null;
  motif: string | null;
  issue: string | null;
  montant: number | null;
  constantes: {
    temperature: string | number | null;
    tension: string | number | null;
    poids: string | number | null;
    taille: string | number | null;
    pouls: string | number | null;
    frequenceRespiratoire: string | number | null;
  };
  diagnostic: string | null;
  patient: {
    id: number | null;
    code: string;
    nom: string;
    genre: string | null;
    dateNaissance: string | null;
    telephone: string | null;
    imgUrl: string | null;
  };
  medecin: string | null;
  infirmier: string | null;
  ordonnances: {
    id: number;
    code: string | null;
    type: string | null;
    date: string | null;
  }[];
  arrets: {
    id: number;
    code: string | null;
    debut: string | null;
    fin: string | null;
    jours: number | null;
    motif: string | null;
  }[];
  examens: {
    id: number;
    code: string | null;
    nature: string | null;
    renseignement: string | null;
  }[];
}

/* =========================================================
   HÔPITAL > DÉCLARATIONS (Naissances & Décès)
   ========================================================= */
export interface DeclarationNaissanceResume {
  id: number;
  referenceCmn: string;
  referenceDn: string | null;
  dateNaissance: string | null;
  heureNaissance: string | null;
  genreEnfant: string | null;
  nombreEnfants: number;
  etatNaissance: string | null;
  lieuNaissance: string | null;
  enfant: {
    id: number | null;
    code: string | null;
  };
  mere: {
    id: number | null;
    code: string;
    nom: string;
    imgUrl: string | null;
    genre: string;
  };
  medecin: string | null;
  createdAt: string | null;
}

export interface DeclarationNaissanceDetail {
  id: number;
  /** Chaque nouveau-né (naissance multiple : dans l'ordre de naissance) */
  enfants: { id: number | null; code: string | null; prenom: string | null; genre: string | null; heure: string | null; etat: string | null }[];
  referenceCmn: string;
  referenceDn: string | null;
  numeroDeclaration: string | null;
  dateNaissance: string | null;
  heureNaissance: string | null;
  genreEnfant: string | null;
  nombreEnfants: number;
  etatNaissance: string | null;
  lieuNaissance: string | null;
  observations: string | null;
  milieuResidence: string | null;
  enfant: {
    id: number | null;
    code: string | null;
  };
  mere: {
    id: number | null;
    code: string;
    nom: string;
    imgUrl: string | null;
    genre: string;
    dateNaissance: string | null;
    telephone: string | null;
    profession: string | null;
    residenceHabituelle: string | null;
  };
  medecin: {
    nom: string;
    titre: string;
  };
  hopital: {
    nom: string;
    localite: string;
  };
  createdAt: string | null;
}

export interface DeclarationDecesResume {
  id: number;
  reference: string;
  numeroDeclaration: string | null;
  personne: 'patient' | 'enfant';
  dateDeces: string | null;
  heureDeces: string | null;
  age: string | null;
  genre: string | null;
  lieu: string | null;
  decesMaternel: boolean;
  causeInitiale: string | null;
  patient: {
    id: number | null;
    code: string;
    nom: string;
    imgUrl: string | null;
    genre: string | null;
  };
  medecin: string | null;
  createdAt: string | null;
}

export interface DeclarationDecesDetail {
  id: number;
  reference: string;
  referenceDeces: string | null;
  numeroDeclaration: string | null;
  personne: 'patient' | 'enfant';
  dateDeces: string | null;
  heureDeces: string | null;
  age: string | null;
  nombre: number;
  genre: string | null;
  lieu: string | null;
  milieuResidence: string | null;
  decesMaternel: boolean;
  causeInitiale: string | null;
  causeDirecte: string | null;
  observations: string | null;
  patient: {
    id: number | null;
    code: string;
    nom: string;
    imgUrl: string | null;
    genre: string | null;
    dateNaissance: string | null;
    lieuNaissance: string | null;
    telephone: string | null;
    profession: string | null;
    residenceHabituelle: string | null;
  };
  medecin: {
    nom: string;
    titre: string;
  };
  hopital: {
    nom: string;
    localite: string;
  };
  createdAt: string | null;
}

/* =========================================================
   INFIRMIER > TABLEAU DE BORD
   ========================================================= */
export interface PatientDashInfirmier {
  id?: number | null;
  code: string;
  nom: string;
}

export interface SoinDuJour {
  id: number;
  /** pending | payment_pending | payment_success */
  statut: string;
  heure: string | null;
  patient: PatientDashInfirmier;
  acte: string | null;
  motif: string | null;
}

export interface InfirmierDashboardSoins {
  mode: 'soins';
  compteurs: {
    enAttente: number;
    effectues: number;
    paiementsEnAttente: number;
    paiementsEffectues: number;
  };
  totalSoinsNonTermines: number;
  soins: SoinDuJour[];
}

export interface InfirmierDashboardConsultations {
  mode: 'consultations';
  totalAConsulter: number;
  aConsulter: {
    id: number;
    code: string | null;
    heure: string | null;
    patient: PatientDashInfirmier;
    typeVisite: string | null;
    motif: string | null;
    /** Consultation enregistrée (sinon en cours) */
    terminee: boolean;
  }[];
  teleconsultations: {
    id: number;
    urgence: boolean;
    patient: PatientDashInfirmier;
    medecin: string;
    date: string | null;
    heure: string | null;
    creeLe: string | null;
    motif: string;
    etatAppel: 'connecte' | 'appel' | 'attente';
  }[];
  historique: {
    id: number;
    date: string | null;
    creeLe: string | null;
    patient: PatientDashInfirmier;
    motif: string;
    terminee: boolean;
    nbOrdonnances: number;
    nbArrets: number;
    nbExamens: number;
  }[];
  hospitalises: {
    id: number;
    hospitalisationId: number;
    code: string | null;
    type: string | null;
    statut: string;
    heure: string | null;
    patient: { nom: string; code: string; imgUrl: string | null; genre: string | null };
    medecin: string | null;
    /** « A1 · lit 2 » ; null = en attente de chambre */
    lit: string | null;
    /** journée confiée à l'infirmier(ère) connecté(e) */
    confieAMoi: boolean;
  }[];
}

export type InfirmierDashboard = InfirmierDashboardSoins | InfirmierDashboardConsultations;

/* =========================================================
   INFIRMIER > CONSULTATIONS & PRISES DE CONSTANTES
   ========================================================= */
export interface InfirmierConsultationItem {
  id: number;
  code: string | null;
  date: string | null;
  createdAt: string | null;
  status: number;
  statusInf: number;
  terminee: boolean;
  /** Faite par l'infirmier·ère avec le formulaire de consultation complet (« Consulter ») */
  consultationDirecte?: boolean;
  motif: string;
  orientationInfirmier: string | null;
  patient: {
    id: number | null;
    code: string;
    nom: string;
    imgUrl: string | null;
    genre: string | null;
  };
  medecin: string;
  nbOrdonnances: number;
  nbArrets: number;
  nbExamens: number;
}

export interface InfirmierConstantesFormulaire {
  consultation: {
    id: number;
    code: string | null;
    date: string | null;
    createdAt: string | null;
    status: number;
    statusInf: number;
    terminee: boolean;
    /** Faite par l'infirmier·ère lui-même (« Consulter ») */
    consultationDirecte?: boolean;
    motif: string;
    serviceLibelle: string;
    orientationInfirmier: string | null;
    isUrgence: boolean;
    constantes: {
      tensionArterielle: string;
      temperature: string;
      taille: string;
      poids: string;
      imc: string;
      pouls: string;
    };
    observationInfirmiere: string;
    typeSoinsInfirmier: string;
    observationSoins: string;
    doctorId: number | null;
    doctorNom: string | null;
    desiredDate: string | null;
    desiredTime: string | null;
    patient: {
      id: number | null;
      code: string;
      nom: string;
      imgUrl: string | null;
      genre: string | null;
      birthDate: string | null;
      profession: string | null;
      telephone: string | null;
      numCmu: string | null;
      noAssurance: string | null;
      adresse: string | null;
      lieuNaissance: string | null;
      residence: string | null;
    };
  };
  doctors: {
    id: number;
    nom: string;
    specialite: string;
  }[];
  hopital: {
    id: number;
    nom: string;
    reference: string;
    district: string;
    teleconsultationActive: boolean;
  };
}

export interface EnregistrerConstantesPayload {
  consultation_id: number;
  tension_arterielle?: string | null;
  temperature?: string | null;
  taille?: string | null;
  poids?: string | null;
  imc?: string | null;
  pouls?: string | null;
  observation_infirmiere?: string | null;
  orientation_infirmier?: 'sortie' | 'teleconsultation' | 'urgence' | null;
  type_soins_infirmier?: string | null;
  observation_soins?: string | null;
  doctor_id?: number | null;
  desired_date?: string | null;
  desired_time?: string | null;
}

export interface TeleconsultationHospitalItem {
  id: number;
  name: string;
  reference: string;
  district: string;
  contact: string;
  availableDoctorsCount: number;
}

/** TÉLÉCONSULTATIONS INFIRMIER */
export interface InfirmierTeleconsultationItem {
  /** Téléconsultation : id de la consultation ; télé-expertise : id de la consultation d'origine */
  id: number;
  type: 'teleconsultation' | 'urgence' | 'teleexpertise';
  motif: string | null;
  /** Télé-expertise : interne / externe, urgente, heure limite de la réponse, résultat reçu (ISO UTC) */
  expertise: { externe: boolean; urgente: boolean; echeance: string | null; resultatLe: string | null } | null;
  code: string | null;
  dateConsultation: string | null;
  desiredDate: string | null;
  desiredTime: string | null;
  createdAt: string;
  status: number;
  statusInf: number;
  terminee: boolean;
  callStatus: string;
  isCallActive: boolean;
  callChannel: string | null;
  patient: {
    id: number | null;
    code: string;
    nom: string;
    imgUrl: string | null;
    genre: string | null;
    telephone: string | null;
  };
  doctor: {
    id: number | null;
    nom: string;
    specialite: string;
    hopital: string;
  };
  infirmierNom: string;
  constantes: {
    tensionArterielle: string;
    temperature: string;
    poids: string;
    taille: string;
    imc: string;
    pouls: string;
  };
  notes: string;
}

export interface InfirmierTeleconsultationsResponse {
  filter: 'all' | 'today' | 'upcoming' | 'completed';
  counts: {
    all: number;
    today: number;
    upcoming: number;
    completed: number;
  };
  teleconsultations: InfirmierTeleconsultationItem[];
}

/** HOSPITALISATIONS INFIRMIER */
export interface InfirmierHospitalisationEnCoursItem {
  id: number;
  code: string | null;
  consultationId: number;
  codeConsultation: string | null;
  patient: {
    id: number | null;
    code: string;
    nom: string;
    telephone: string | null;
    imgUrl: string | null;
    genre: string | null;
  };
  medecin: {
    nom: string;
    specialite: string;
  };
  dateDebut: string | null;
  nbJours: number;
  motif: string;
  lit: string | null;
  hasBed: boolean;
  statut: 'in_progress';
}

export interface InfirmierHospitalisationHistoriqueItem {
  id: number;
  code: string | null;
  consultationId: number;
  codeConsultation: string | null;
  patient: {
    id: number | null;
    code: string;
    nom: string;
    telephone: string | null;
    imgUrl: string | null;
    genre: string | null;
  };
  medecin: {
    nom: string;
    specialite: string;
  };
  dateDebut: string | null;
  dateFin: string | null;
  nbJours: number | null;
  motif: string;
  motSortie: string | null;
  statut: 'finished';
}

export interface SurveillanceItem {
  id: number;
  heure: string;
  ta: string;
  temperature: string;
  pouls: string;
  diurese: string;
  conscience: string;
  glycemie: string;
  sao2: string;
  poids: string;
  evolution: string;
  conduiteTenir: string;
  createdAt: string;
}

/** Fiche de suivi & surveillance (Laravel : users/infirmier/suivi/hospitalisation) */
export interface InfirmierHospitalisationSuivi {
  hospitalisation: {
    id: number;
    code: string;
    terminee: boolean;
    dateDebut: string | null;
    dateFin: string | null;
    motifSortie: string | null;
    diagnostic: string | null;
    regime: string | null;
    sonde: string | null;
    oxygenotherapie: string | null;
    volume: string | null;
    analyseMedical: string | null;
    remarque: string | null;
    operations: string[];
    medecin: { nom: string | null; specialite: string | null };
    lit: string | null;
  };
  patient: { id: number; code: string; nom: string; genre: string | null; dateNaissance: string | null; residence: string | null; telephone: string | null; assurance: string | null; imgUrl: string | null };
  motifConsultation: string | null;
  journees: {
    id: number;
    jour: string | null;
    fin: string | null;
    lit: string | null;
    infirmier: string | null;
    medecin: string | null;
    protocoles: { id: number; produit: string; unite: string | null; quantite: number; dosage: string | null; voie: string | null; heures: { id: number; heure: string; applique: boolean; appliqueA: string | null }[] }[];
    surveillances: {
      id: number;
      heure: string | null;
      ta: string | null;
      temperature: string | null;
      pouls: string | null;
      diurese: string | null;
      conscience: string | null;
      glycemie: string | null;
      sao2: string | null;
      poids: string | null;
      evolution: string | null;
      conduite: string | null;
      date: string;
    }[];
  }[];
}

export interface AjouterSurveillancePayload {
  ta?: string;
  temperature?: string;
  pouls?: string;
  diurese?: string;
  conscience?: string;
  glycemie?: string;
  sao2?: string;
  poids?: string;
  evolution?: string;
  conduite_tenir?: string;
  heure?: string;
}

/** PERMISSION INFIRMIER */
export interface InfirmierPermissionItem {
  id: number;
  code: string;
  debutDate: string;
  finDate: string;
  debutHeure: string | null;
  finHeure: string | null;
  description: string;
  pieceUrl: string | null;
  statut: 'pending' | 'agree' | 'reject';
  createdAt: string;
}

export interface CreerPermissionPayload {
  beging_date: string;
  end_date: string;
  beging_time?: string;
  end_time?: string;
  description: string;
  piece_url?: string;
}

/** PLANNING INFIRMIER */
export interface PlanningJourItem {
  index: number;
  nom: string;
  travaille: boolean;
  debut: string;
  fin: string;
  /** début 00:00 sans heure de fin = disponible toute la journée */
  journeeEntiere: boolean;
}

export interface PlanningRdvItem {
  id: number;
  date: string;
  heure: string;
  motif: string;
  patient: {
    code: string;
    nom: string;
    telephone: string;
  };
  medecin: string;
  statut: string;
}

export interface InfirmierPlanningResponse {
  hospitalNom: string;
  /** Permission accordée en cours (agent hors service jusqu'à la fin), sinon null */
  permission?: { debut: string; fin: string; heureDebut: string | null; heureFin: string | null } | null;
  jours: PlanningJourItem[];
  rendezVous: PlanningRdvItem[];
}

/** GESTION PATIENTS INFIRMIER */
export interface InfirmierPatientItem {
  id: number;
  codePatient: string;
  nom: string;
  prenom: string;
  nomComplet: string;
  genre: string | null;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  pays: string | null;
  typePiece: string | null;
  numeroIdentite: string | null;
  telephone: string | null;
  email: string | null;
  residence: string | null;
  profession: string | null;
  numCmu: string | null;
  assure: boolean;
  numeroAssurance: string | null;
  imgUrl: string | null;
  nbConsultations: number;
  createdAt: string;
}

export interface RecherchePatientFilters {
  code_patient?: string;
  telephone?: string;
  num_cmu?: string;
  fullname?: string;
  birth_date?: string;
}

export interface InfirmierPatientDetailResponse {
  patient: {
    id: number;
    codePatient: string;
    nom: string;
    prenom: string;
    nomComplet: string;
    genre: string | null;
    dateNaissance: string | null;
    lieuNaissance: string | null;
    pays: string | null;
    telephone: string | null;
    email: string | null;
    residence: string | null;
    profession: string | null;
    numCmu: string | null;
    assure: boolean;
    numeroAssurance: string | null;
    imgUrl: string | null;
  };
  consultations: Array<{
    id: number;
    code: string | null;
    date: string | null;
    motif: string;
    medecin: string;
    constantes: {
      ta?: string;
      temperature?: string;
      poids?: string;
      pouls?: string;
    };
    statut: string;
    createdAt: string;
  }>;
}

/* =========================================================
   INFIRMIER > ACCUEIL (inscription d'un patient, affectation directe sans caisse)
   ========================================================= */
export interface OptionsAccueilInfirmier {
  localites: { id: number; nom: string }[];
  /** serviceId = service_hospitals.id (sert à proposer les médecins du même service) */
  prestations: { id: number; libelle: string; service: string; serviceId: number; prix: number }[];
  /** Médecins disponibles MAINTENANT (dans leur jour et leur créneau) */
  medecins: { id: number; nom: string; service: string | null; serviceId: number; creneau: string }[];
  /** Affectation par un médecin : infirmier·ères de l'hôpital (vide pour un infirmier) */
  infirmiers: { id: number; nom: string; service: string | null }[];
  /** Jour de la semaine (ex. "jeudi") */
  jour: string;
}

export interface AffectationSaisie {
  prestationId: number;
  motif: string;
  doctorId: number;
  /** affectation par un médecin → télémédecine avec cet·te infirmier·ère */
  infirmierId?: number;
}

export interface InscriptionPatientSaisie {
  /** Inscription d'urgence (formulaire court) : seulement pour le journal d'audit */
  urgence?: boolean;
  nom: string;
  prenom: string;
  genre: 'masculin' | 'feminin';
  /** "AAAA-MM-JJ" */
  dateNaissance: string;
  lieuNaissance?: number;
  residence?: number;
  pays: string;
  situationMatrimoniale: string;
  telephone: string;
  contact2?: string;
  email?: string;
  typePiece: string;
  numeroIdentite?: string;
  profession?: string;
  numCmu?: string;
  adresse?: string;
  nbEnfants?: number;
  urgenceNom?: string;
  urgenceTelephone?: string;
  urgenceLien?: string;
  affectation?: AffectationSaisie;
}

/* =========================================================
   INFIRMIER > DOSSIER MÉDICAL D'UN PATIENT (page dédiée)
   ========================================================= */
export interface InterventionDossier {
  id: number;
  code: string;
  date: string;
  hopital: string;
  service: string;
  enLigne: boolean;
  motif: string;
  diagnostic: string | null;
  examenPhysique: string | null;
  medecin: string | null;
  infirmier: string | null;
  terminee: boolean;
  issue: string | null;
  constantes: Record<'tension' | 'temperature' | 'poids' | 'pouls' | 'saturation' | 'glycemie' | 'taille' | 'imc', string | null>;
  ordonnances: { type: string; reference: string | null; medicaments: { nom: string; posologie: string | null; quantite: string | null; duree: string | null }[] }[];
  documents: { examen: boolean; arret: boolean; hospitalisation: boolean };
  antecedents: { hta: string | null; alcool: string | null; tabac: string | null; drepanocytose: string | null; traitementsAnterieurs: string | null } | null;
}

export interface DossierMedical {
  patient: {
    id: number;
    code: string;
    nom: string;
    genre: string | null;
    dateNaissance: string | null;
    lieuNaissance: string | null;
    profession: string | null;
    telephone: string | null;
    email: string | null;
    residence: string | null;
    numCmu: string | null;
    groupeSanguin: string | null;
    allergies: string | null;
    imgUrl: string | null;
  };
  interventions: InterventionDossier[];
}

/* =========================================================
   INFIRMIER > PARCOURS COMPLET D'UNE INTERVENTION
   ========================================================= */
export interface EtapeParcours {
  cle: string;
  titre: string;
  detail: string | null;
  date: string | null;
  faite: boolean;
}

export interface ParcoursIntervention {
  id: number;
  code: string;
  date: string;
  hopital: string;
  service: string;
  /** Faite par l'infirmier·ère lui-même (« Consulter ») */
  consultationDirecte?: boolean;
  enLigne: boolean;
  urgence: boolean;
  terminee: boolean;
  patient: { id: number; nom: string; code: string | null; genre: string | null; dateNaissance: string | null; imgUrl: string | null };
  equipe: { medecin: string | null; infirmier: string };
  constantes: InterventionDossier['constantes'];
  examen: { motif: string; examenPhysique: string | null; diagnostic: string | null; observationInfirmiere: string | null };
  ordonnances: InterventionDossier['ordonnances'];
  documents: InterventionDossier['documents'];
  issue: { libelle: string; justification: string | null };
  registre: { code: string; type: string | null; antecedents: NonNullable<InterventionDossier['antecedents']> } | null;
  etapes: EtapeParcours[];
}

/* =========================================================
   MÉDECIN > TABLEAU DE BORD & CONSULTATIONS
   ========================================================= */
export interface DoctorConsultationItem {
  id: number;
  code: string;
  date: string;
  creeLe: string;
  motif: string;
  prestation: string;
  urgence: boolean;
  enLigne: boolean;
  /** Téléconsultation (programmée, en ligne ou appel d'urgence) */
  teleconsultation: boolean;
  appelEnCours: boolean;
  constantesPrises: boolean;
  terminee: boolean;
  issue: string | null;
  documents: { ordonnance: boolean; examen: boolean; arret: boolean; hospitalisation: boolean };
  patient: { id: number; code: string; nom: string; genre: string | null; dateNaissance: string | null; imgUrl: string | null };
}

export interface DoctorTelemedecineItem {
  id: number;
  code: string;
  creeLe: string;
  /** date souhaitée AAAA-MM-JJ */
  date: string | null;
  heure: string | null;
  motif: string;
  urgence: boolean;
  terminee: boolean;
  appelEnCours: boolean;
  issue: string | null;
  /** Téléconsultation (appel vidéo), télé-expertise (avis sur documents) ou appel d'urgence */
  type: 'teleconsultation' | 'teleexpertise' | 'urgence';
  /** Télé-expertise : interne / externe et consultation d'origine (documents partagés) */
  expertise: {
    externe: boolean;
    origineId: number;
    /** Urgente (synchrone, < 30 min) ou programmée (asynchrone, 24 à 48 h) */
    urgente: boolean;
    /** Formulaire de consultation pour l'expert (urgente, ou issue d'une vraie consultation) ; sinon résultat seulement */
    avecConsultation: boolean;
    /** Heure limite de la réponse (ISO UTC) */
    echeance: string | null;
    /** Résultat envoyé par l'expert (ISO UTC) */
    resultatLe: string | null;
  } | null;
  /** Demandeur : infirmier·ère qui a programmé, ou médecin qui a demandé l'avis */
  infirmier: string | null;
  hopitalDemandeur: string | null;
  note: string | null;
  constantes: { tension: string | null; temperature: string | null; pouls: string | null; poids: string | null; saturation: string | null };
  patient: DoctorConsultationItem['patient'];
}

/** Télé-expertise externe adressée à mon service, à prendre en charge */
/** Téléconsultation envoyée à mon service (aucun médecin choisi), à prendre en charge */
export interface TeleconsultationDisponible {
  consultationId: number;
  externe: boolean;
  recueLe: string;
  datePrevue: string | null;
  heurePrevue: string | null;
  motif: string | null;
  referePar: string | null;
  /** Hôpital du demandeur */
  hopital: string | null;
  service: string | null;
  patient: DoctorConsultationItem['patient'];
}

export interface ExpertiseDisponible {
  origineId: number;
  recueLe: string;
  datePrevue: string | null;
  heurePrevue: string | null;
  urgente: boolean;
  /** Interne (même hôpital) ou externe (autre hôpital de la DMHP) */
  externe: boolean;
  /** Heure limite de la réponse (ISO UTC) */
  echeance: string | null;
  motif: string | null;
  referePar: string | null;
  hopital: string | null;
  serviceReference: string | null;
  documents: number;
  patient: DoctorConsultationItem['patient'];
}

export interface DoctorTelemedecines {
  compteurs: { enAttente: number; aujourdhui: number; terminees: number; toutes: number };
  liste: DoctorTelemedecineItem[];
}

export interface DoctorDashboard {
  medecin: { nom: string; hopital: string; service: string | null; sageFemme: boolean; enService: boolean; creneau: string | null; permission?: { debut: string; fin: string; heureDebut: string | null; heureFin: string | null } | null };
  compteurs: { duJour: number; enAttente: number; termineesJour: number; terminees: number };
  file: DoctorConsultationItem[];
  /** Télémédecines programmées en attente (4 premières) */
  telemedecines: DoctorTelemedecineItem[];
  telemedecinesEnAttente: number;
}

export interface MedicamentPrescrit {
  /** null = médicament saisi (absent de la liste) */
  drugId: number | null;
  nom: string;
  unite: string | null;
  quantite: number;
  posologie: string | null;
  duree: string | null;
  voie: string | null;
  conseil: string | null;
}

/** Valeurs du formulaire de consultation curative (null = non renseigné) */
export interface ConsultationCurativeValeurs {
  motif: string;
  hta: string | null;
  alcool: string | null;
  tabac: string | null;
  drepanocytaire: string | null;
  traitementMedicamenteux: string | null;
  traitementAnterieur: string | null;
  antecedentMedical: string | null;
  autreAntecedentMedical: string | null;
  antecedentChirurgical: string | null;
  nomOperation: string | null;
  autreAntecedentChirurgical: string | null;
  grossesse: string | null;
  ddr: string | null;
  descriptionGrossesse: string | null;
  poids: string | null;
  taille: string | null;
  imc: string | null;
  temperature: string | null;
  tension: string | null;
  pouls: string | null;
  saturation: string | null;
  glycemieAJeun: string | null;
  glycemieNonAJeun: string | null;
  frequenceRespiratoire: string | null;
  perimetreBrachial: string | null;
  perimetreCranien: string | null;
  zscore: string | null;
  tuberculose: string | null;
  examenPhysique: string | null;
  diagnostic: string | null;
  autresPathologies: string | null;
  tdrPaludisme: string | null;
  goutteEpaisse: string | null;
  mildaEligible: string | null;
  mildaRemise: string | null;
  cdipPropose: string | null;
  cdipRealise: string | null;
  codeDepistage: string | null;
  medicaments: MedicamentPrescrit[];
  examens: string[];
  arret: { dateDebut: string | null; dateFin: string | null; nbJour: number } | null;
  modeSortie: string | null;
  justification: string | null;
}

/** Médecin à qui référer un patient en interne */
export interface MedecinReference {
  id: number;
  nom: string;
  service: string;
  /** service_hospitals.id du médecin */
  serviceId: number | null;
  sageFemme: boolean;
  enService: boolean;
  creneau: string | null;
}

/** Document joint à une référence (interne / externe) */
export interface DocumentReference {
  id: string;
  libelle: string;
  nom: string;
  type: string;
  taille: number;
  ajouteLe: string;
}

/** Suite donnée à une consultation terminée (télé-expertise, téléconsultation, appel d'urgence) */
export interface SuiteConsultation {
  type: 'teleexpertise' | 'teleconsultation' | 'urgence';
  externe: boolean;
  /** Télé-expertise urgente (< 30 min) */
  urgente: boolean;
  /** Résultat de l'expert reçu (ISO UTC) */
  resultatLe: string | null;
  service: string | null;
  /** AAAA-MM-JJ */
  date: string | null;
  heure: string | null;
  medecin: string | null;
  hopital: string | null;
  etat: string | null;
}

export interface DoctorConsultationFormulaire {
  /** Consultation commencée par l'infirmier·ère puis envoyée au médecin : saisie reprise */
  envoiMedecin: { par: string | null } | null;
  /** Télé-expertise reçue : saisie de la consultation du demandeur (médecin ou infirmier·ère) reprise, modifiable */
  repriseExpertise: { par: string | null } | null;
  /** Télé-expertise reçue (médecin expert) : consultation d'origine, résultat déjà envoyé ou non */
  /** urgente : consultation (synchrone) ; programmée : pas de consultation, l'expert joint directement son résultat */
  expertiseRecue: { origineId: number; resultatEnvoye: boolean; urgente: boolean; avecConsultation: boolean } | null;
  lecture: boolean;
  suite: SuiteConsultation | null;
  /** Formulaire à afficher (d'après la prestation) : consultation prénatale (CPN), postnatale ou curative */
  type: 'prenatale' | 'postnatale' | 'accouchement' | 'curative';
  /** Accouchement : déclaration de naissance faite (certificat de naissance) */
  naissance: { id: number; reference: string } | null;
  /** Registre de maternité (CPN / postnatale) : clés = colonnes Laravel, dates « JJ/MM/AAAA » */
  maternite: Record<string, string | null> | null;
  /** Antécédents repris de la visite précédente (CPN ou postnatale) */
  materniteReprise: { date: string; source: 'prenatale' | 'postnatale'; detail: string | null } | null;
  /** documents joints si la consultation a été référée */
  references: DocumentReference[];
  consultation: {
    /** Service de la consultation : « Envoyer au médecin » ne propose que ses médecins */
    serviceId: number | null;
    service: string | null;
    id: number;
    code: string;
    date: string;
    prestation: string;
    urgence: boolean;
    infirmier: string | null;
    observationInfirmiere: string | null;
    registre: string | null;
    hospitalisation: { code: string; statut: string } | null;
  };
  patient: {
    id: number;
    code: string;
    nom: string;
    genre: string | null;
    dateNaissance: string | null;
    imgUrl: string | null;
    telephone: string | null;
    profession: string | null;
    residence: string | null;
    numCmu: string | null;
    groupeSanguin: string | null;
    allergies: string | null;
  };
  historique: { id: number; date: string; motif: string; diagnostic: string | null }[];
  valeurs: ConsultationCurativeValeurs;
}

/** Envoi du formulaire (champs vides omis) */
export type ConsultationCurativePayload = Partial<Record<Exclude<keyof ConsultationCurativeValeurs, 'medicaments' | 'arret' | 'examens'>, string>> & {
  motif: string;
  modeSortie: string;
  medicaments?: { drugId?: number; nom?: string; unite?: string; quantite?: number; posologie?: string; duree?: string; voie?: string; conseil?: string }[];
  examens?: string[];
  arret?: { dateDebut: string; dateFin: string; nbJour: number };
  /** Télé-expertise : médecin destinataire (facultatif ; sans médecin → tous les médecins du service) */
  medecinReferenceId?: number;
  /** Télé-expertise interne : service de l'hôpital (service_hospitals.id) */
  referenceServiceHospitalId?: number;
  /** Télé-expertise externe : service (services.id) et hôpital facultatif */
  referenceServiceId?: number;
  referenceHopitalId?: number;
  /** Issue « hospitalisation » : chambre facultative, dossier, protocole obligatoire */
  hospitalisation?: {
    diagnostic?: string;
    analyseMedical?: string;
    sonde?: string;
    oxygenotherapie?: string;
    volume?: string;
    regime?: string;
    dateOperation?: string;
    bedId?: number;
    infirmierId?: number;
    protocole: { nom: string; unite?: string; quantite: number; posologie?: string; voie?: string; heures?: string[] }[];
  };
};

/* =========================================================
   MÉDECIN > HOSPITALISATION
   ========================================================= */
export interface DoctorHospitalisationItem {
  id: number;
  code: string;
  debut: string | null;
  fin: string | null;
  jours: number | null;
  prix: number | null;
  motif: string | null;
  diagnostic: string | null;
  motifSortie: string | null;
  lit: string | null;
  infirmier: string | null;
  surveillances: number;
  consultation: { id: number; code: string | null };
  patient: DoctorConsultationItem['patient'];
}

export interface DoctorHospitalisationOptions {
  chambres: { id: number; numero: string; type: string | null; prix: number; lits: { id: number; numero: string; prix: number }[] }[];
  infirmiers: { id: number; nom: string }[];
}

export interface DossierHospitalisation {
  motif: string | null;
  diagnostic: string | null;
  regime: string | null;
  analyseMedical: string | null;
  sonde: string | null;
  oxygenotherapie: string | null;
  volume: string | null;
  remarque: string | null;
  motifSortie: string | null;
}

export interface DoctorHospitalisationDetail {
  id: number;
  code: string;
  statut: 'en-attente' | 'en-cours' | 'terminee';
  debut: string | null;
  fin: string | null;
  jours: number | null;
  prix: number | null;
  dossier: DossierHospitalisation;
  consultation: { id: number; code: string | null; motif: string | null };
  patient: DoctorConsultationFormulaire['patient'];
  protocole: { id: number; produit: string; unite: string | null; quantite: number; posologie: string | null; voie: string | null; heures: string | null; total: number | null }[];
  operations: string[];
  journees: { id: number; jour: string | null; fin: string | null; nombre: number | null; prix: number | null; lit: string | null; medecin: string | null; infirmier: string | null }[];
  surveillances: {
    id: number;
    date: string;
    heure: string | null;
    ta: string | null;
    temperature: string | null;
    pouls: string | null;
    sao2: string | null;
    glycemie: string | null;
    diurese: string | null;
    conscience: string | null;
    poids: string | null;
    evolution: string | null;
    conduite: string | null;
  }[];
}

/* =========================================================
   MÉDECIN > DOCUMENTS IMPRIMABLES D'UNE CONSULTATION
   ========================================================= */
export interface DocumentsConsultation {
  hopital: {
    nom: string;
    logo: string | null;
    contact: string | null;
    localite: string | null;
    district: string | null;
    reference: string | null;
    direction: string | null;
    localiteNom: string | null;
    filigrane: string | null;
  };
  medecin: { nom: string | null; nomSeul: string | null; prenom: string | null; service: string | null; matricule: string | null; contact: string | null };
  patient: {
    nom: string;
    code: string;
    genre: string | null;
    dateNaissance: string | null;
    telephone: string | null;
    residence: string | null;
    nomSeul: string | null;
    prenom: string | null;
    naissanceBrute: string | null;
    lieuNaissance: string | null;
    adresse: string | null;
  };
  consultation: { code: string; date: string; motif: string | null; diagnostic: string | null; terminee: boolean };
  ordonnance: {
    reference: string | null;
    date: string | null;
    creeLe: string | null;
    medicaments: { nom: string; unite: string | null; quantite: number; posologie: string | null; duree: string | null; voie: string | null; conseil: string | null }[];
  } | null;
  examens: { code: string | null; date: string; liste: string[] } | null;
  arret: { code: string | null; debut: string | null; fin: string | null; nbJour: number; date: string } | null;
}

/* =========================================================
   MÉDECIN > RÉFÉRÉS
   ========================================================= */
export interface RefereInterneItem {
  /** consultation créée pour moi (null si introuvable) */
  consultationId: number | null;
  origineId: number;
  date: string;
  terminee: boolean;
  urgence: boolean;
  motif: string | null;
  justification: string | null;
  diagnostic: string | null;
  referePar: string | null;
  service: string | null;
  documents: number;
  patient: DoctorConsultationItem['patient'];
  /** référence externe que j'ai prise en charge */
  externe: boolean;
}

export interface RefereExterneItem {
  origineId: number;
  date: string;
  motif: string | null;
  justification: string | null;
  diagnostic: string | null;
  referePar: string | null;
  service: string | null;
  hopital: string | null;
  /** Télé-expertise externe : service destinataire (null = ancienne référence, pour tous) */
  serviceReference: string | null;
  /** Date (AAAA-MM-JJ) et heure de prise en charge demandées */
  datePrevue: string | null;
  heurePrevue: string | null;
  documents: number;
  patient: DoctorConsultationItem['patient'];
  /** médecin qui a pris le patient en charge (null = disponible) */
  priseEnChargePar: string | null;
  parMoi: boolean;
}

export interface DoctorReferes {
  internes: RefereInterneItem[];
  externes: RefereExterneItem[];
}

export interface RefereDetail {
  origineId: number;
  type: 'interne' | 'externe';
  /** Télé-expertise externe : service destinataire */
  serviceReference: string | null;
  /** Date (AAAA-MM-JJ) et heure de prise en charge demandées */
  datePrevue: string | null;
  heurePrevue: string | null;
  /** Délai de réponse : urgente (< 30 min) ou programmée (24 à 48 h), heure limite (ISO UTC) */
  urgente: boolean;
  echeance: string | null;
  /** Formulaire de consultation pour l'expert (urgente, ou issue d'une vraie consultation) ; sinon résultat seulement */
  avecConsultation: boolean;
  /** Résultat joint par l'expert */
  resultat: { le: string | null; dansDelai: boolean; avis: string | null; conduite: string | null; documents: DocumentReference[] } | null;
  /** L'expert (destinataire) peut joindre son résultat */
  peutRepondre: boolean;
  /** Médecin sollicité (expert) : peut compléter les documents d'un résultat envoyé */
  estExpert: boolean;
  /** référence interne qui m'est adressée : consultation à faire */
  consultationDestinataire: { id: number; terminee: boolean } | null;
  /** référence externe : prise en charge (premier médecin qui se l'attribue) */
  priseEnCharge: { par: string | null; le: string; parMoi: boolean } | null;
  peutPrendreEnCharge: boolean;
  date: string;
  code: string;
  motif: string | null;
  justification: string | null;
  diagnostic: string | null;
  examenPhysique: string | null;
  referePar: string | null;
  service: string | null;
  hopital: string | null;
  hopitalContact: string | null;
  constantes: Record<'tension' | 'temperature' | 'pouls' | 'poids' | 'taille' | 'saturation', string | null>;
  prescriptions: { nom: string; quantite: number; posologie: string | null; duree: string | null }[];
  examens: string[];
  patient: DoctorConsultationItem['patient'] & { telephone: string | null; groupeSanguin: string | null; allergies: string | null };
  documents: DocumentReference[];
  /** Documents prescrits par le médecin d'origine (ordonnance, bulletin d'examens, arrêt de travail), imprimables */
  documentsPrescrits: { type: 'ordonnance' | 'examens' | 'arret'; code: string | null; date: string }[];
}

/* =========================================================
   RÉSULTATS D'EXPERTISE (côté demandeur : médecin ou infirmier·ère)
   ========================================================= */
export interface ResultatExpertiseItem {
  origineId: number;
  code: string;
  externe: boolean;
  urgente: boolean;
  /** ISO UTC */
  demandeLe: string | null;
  echeance: string | null;
  service: string | null;
  expert: string | null;
  hopital: string | null;
  /** recu | termine (terminée sans résultat) | retard (échéance dépassée sans résultat) | attente */
  etat: 'recu' | 'termine' | 'retard' | 'attente';
  resultatLe: string | null;
  dansDelai: boolean | null;
  lu: boolean;
  documents: number;
  patient: DoctorConsultationItem['patient'];
}

export interface ResultatExpertiseDetail extends ResultatExpertiseItem {
  motif: string | null;
  avis: string | null;
  conduite: string | null;
  documentsResultat: DocumentReference[];
}

/* =========================================================
   TÉLÉMÉDECINE > APPEL VIDÉO (LiveKit)
   ========================================================= */
export interface AccesAppelVideo {
  url: string;
  jeton: string;
  salle: string;
  consultationId: number;
  patient: string;
  interlocuteur: string;
  rejoint: boolean;
  /** Texte d'attente (ex. urgence pas encore décrochée) */
  attente?: string;
  /** Appel d'urgence : nombre de médecins alertés */
  medecinsAlertes?: number;
}

export interface AppelEntrant {
  consultationId: number;
  statut: string;
  depuis: string | null;
  patient: string;
  appelant: string;
  /** Appel d'urgence (sonne chez tous les médecins alertés) */
  urgence?: boolean;
}

/** Page publique « Avis d'expert » (confrère invité par lien) */
export interface InvitationExpert {
  consultationId: number;
  terminee: boolean;
  appelActif: boolean;
  hopital: string | null;
  patient: { nom: string; code: string | null; genre: string | null; dateNaissance: string | null };
  motif: string | null;
  observation: string | null;
  constantes: { tension: string | null; temperature: string | null; pouls: string | null; saturation: string | null; poids: string | null; taille: string | null };
  medecin: string | null;
  infirmier: string | null;
}

/* =========================================================
   DÉCLARATIONS (hôpital / médecin)
   ========================================================= */
/** Hôpital : toutes les déclarations de l'établissement ; médecin : les siennes */
export type EspaceDeclarations = 'hopital' | 'medecin';

/** Patient trouvé pour une déclaration de décès */
export interface PatientDeclarationItem {
  id: number;
  code: string;
  nom: string;
  genre: string | null;
  dateNaissance: string | null;
  age: number | null;
  telephone: string | null;
  imgUrl: string | null;
  /** Déjà déclaré décédé : ne peut pas l'être une 2e fois */
  dejaDecede: boolean;
}

/** POST /doctor/declarations/deces (enregistrement direct) */
export interface DecesDirectSaisie {
  patientMode: 'existant' | 'nouveau';
  patientId?: number;
  nom?: string;
  prenom?: string;
  genre?: 'masculin' | 'feminin';
  dateNaissance?: string;
  ageEstime?: number;
  profession?: string;
  telephone?: string;
  lieuResidence?: string;
  date: string;
  heure: string;
  lieuType: 'hopital' | 'hors';
  service?: string;
  lieuAutre?: string;
  milieuResidence: 'Urbain' | 'Rural';
  person: 'patient' | 'enfant';
  decesMaternel: 'oui' | 'non';
  causeInitiale: string;
  causeDirecte: string;
  observation?: string;
}

/** Informations modifiables d'un patient (GET …/patients/:id/identite) */
export interface PatientIdentite {
  id: number;
  code: string | null;
  nom: string;
  prenom: string;
  genre: string | null;
  /** AAAA-MM-JJ */
  dateNaissance: string | null;
  telephone: string | null;
  contact2: string | null;
  situationMatrimoniale: string | null;
  numCmu: string | null;
  profession: string | null;
  adresse: string | null;
  residence: number | null;
  lieuNaissance: number | null;
  lieuNaissanceNom: string | null;
  urgenceNom: string | null;
  urgenceTelephone: string | null;
  urgenceLien: string | null;
  /** Nouveau-né déclaré à la naissance (« NOUVEAU-NÉ DE … ») */
  nouveauNe: boolean;
  mere: { nom: string; code: string | null } | null;
}

/** PUT …/patients/:id */
export interface MiseAJourPatientSaisie {
  nom: string;
  prenom: string;
  genre: 'masculin' | 'feminin';
  telephone?: string;
  contact2?: string;
  situationMatrimoniale?: string;
  numCmu?: string;
  profession?: string;
  adresse?: string;
  residence?: number;
  urgenceNom?: string;
  urgenceTelephone?: string;
  urgenceLien?: string;
}

/* =========================================================
   MÉDECIN / SAGE-FEMME > SUIVI MÈRE-ENFANT (PTME)
   ========================================================= */
export type TypeSuiviMereEnfant = 'prenatale' | 'postnatale';

export interface PatientSuiviItem {
  id: number;
  code: string;
  nom: string;
  dateNaissance: string | null;
  age: string | null;
  genre: string | null;
  mere: { nom: string; code: string | null } | null;
  nbSuivis: number;
}

export interface DossierSuiviMereEnfant {
  type: TypeSuiviMereEnfant;
  patient: { id: number; code: string; nom: string; prenom: string; dateNaissance: string | null; age: string | null; genre: string | null; telephone: string | null; nomProvisoire: boolean };
  mere: { nom: string; code: string | null; age: string | null } | null;
  /** Visites : champs du formulaire (postnatal : pcr[] et serologies[] en plus) */
  suivis: (Record<string, unknown> & { id: number; dateVisite: string | null })[];
}

/** Admin UCP-FM > Personnel supprimé : agent supprimé par son hôpital */
export type TypeAgentSupprime = 'medecin' | 'sage-femme' | 'infirmier';
export interface AgentSupprime {
  id: number;
  type: TypeAgentSupprime;
  typeLibelle: string;
  specialite: string | null;
  specialiste: boolean;
  nom: string;
  matricule: string | null;
  email: string | null;
  contact: string | null;
  imgUrl: string | null;
  hopital: { id: number; label: string };
  service: string | null;
  supprimeLe: string;
}

/** Formulaire « Changer d'hôpital » (services, actes et spécialités de l'hôpital choisi) */
export interface OptionsTransfert {
  hopitaux: { id: number; label: string }[];
  services?: { id: number; libelle: string }[];
  actes?: { id: number; serviceId: number; libelle: string }[];
  specialites?: { id: number; libelle: string }[];
}

/* =========================================================
   RÉGULATEUR (rôle Gemma FM) — réattribution d'un patient à un médecin disponible
   ========================================================= */
export interface ConsultationARegler {
  id: number;
  code: string;
  arrivee: string;
  patient: { nom: string; code: string | null };
  prestation: string | null;
  service: string | null;
  motif: string | null;
  medecin: { id: number; nom: string } | null;
  /** Consultation faite par l'infirmier·ère lui-même : son nom (affiché comme agent attribué) */
  infirmierAttribue: string | null;
  infirmier: string | null;
  etape: string;
  urgence: boolean;
  /** Télémédecine en cours avec le médecin : réattribution impossible */
  enAppel: boolean;
  /** Le médecin attribué peut recevoir le patient maintenant */
  disponible: boolean;
  /** Pourquoi il ne peut pas (aucun médecin, désactivé, permission, hors planning) */
  raison: string | null;
  reattributions: number;
  /** Minutes depuis l'affectation (ou la dernière réattribution) */
  attente: number;
  /** À réguler : médecin indisponible, en attente depuis au moins 30 min, ou télémédecine en retard */
  aReguler: boolean;
  /** Télémédecine : téléconsultation programmée ou télé-expertise (destination) */
  telemedecine: 'teleconsultation' | 'teleexpertise' | null;
  /** Télémédecine en retard : minutes après l'heure prévue / l'heure limite de la réponse */
  retardTelemedecine: number | null;
}

export interface TableauRegulation {
  hopital: string;
  stats: { ouvertes: number; aReguler: number; reattribueesAujourdhui: number };
  consultations: ConsultationARegler[];
}

export interface MedecinPropose {
  id: number;
  nom: string;
  service: string | null;
  specialite: string;
  disponible: boolean;
  raison: string | null;
  /** Créneau du jour ("Toute la journée", "08:00 – 23:59") */
  creneau: string | null;
  /** Consultations ouvertes aujourd'hui */
  charge: number;
  actuel: boolean;
}

export interface Reattribution {
  id: number;
  date: string;
  consultation: string;
  patient: string;
  ancienMedecin: string | null;
  nouveauMedecin: string;
  raison: string | null;
  motif: string | null;
  regulateur: string | null;
}

/** RÉGULATEUR > CALENDRIER — disponibilités des médecins sur une semaine */
export interface JourCalendrier {
  date: string;
  travaille: boolean;
  debut: string;
  fin: string;
  journeeEntiere: boolean;
  /** Permission accordée (agree) ou demandée (pending) couvrant ce jour ; heures si partielle */
  permission: { statut: 'agree' | 'pending'; heures: string | null; motif: string | null } | null;
}

export interface MedecinCalendrier {
  id: number;
  nom: string;
  service: string | null;
  specialite: string;
  actif: boolean;
  disponibleMaintenant: boolean;
  raison: string | null;
  jours: JourCalendrier[];
}

export interface CalendrierMedecins {
  hopital: string;
  semaine: { debut: string; fin: string; jours: { date: string; nom: string }[] };
  services: string[];
  medecins: MedecinCalendrier[];
}

/** MON PROFIL (tous les rôles) — champs modifiables selon le rôle (`modifiables`) */
export interface ProfilUtilisateur {
  role: 'admin' | 'hospital' | 'doctor' | 'infirmier' | 'regulateur';
  email: string;
  nom: string;
  prenom: string | null;
  contact: string | null;
  adresse: string | null;
  photo: string | null;
  /** Dossier des photos dans Laravel (uploads/<dossier>) */
  dossierPhoto: string;
  matricule: string | null;
  hopital: string | null;
  service: string | null;
  district: string | null;
  direction: string | null;
  membreDepuis: string | null;
  modifiables: ('nom' | 'prenom' | 'contact' | 'adresse' | 'district' | 'direction')[];
}
