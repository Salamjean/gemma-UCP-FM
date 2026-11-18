/**
 * APPELS AU BACKEND — toutes les requêtes HTTP sont ici.
 * En dev, /api est redirigé vers http://localhost:3000 (voir vite.config.ts).
 * Le jeton de connexion est ajouté automatiquement (en-tête Authorization).
 */
import type {
  DetailDiffusion,
  EntreeLogLaravel,
  FiltresAudit,
  JournalAudit,
  PatientCible,
  ResultatDiffusion,
  ResumeDiffusion,
  StatistiquesAppareils,
  AuthUser,
  ContactMessage,
  Hopital,
  HopitalDetail,
  HopitalSupervision,
  AgentSupprime,
  OptionsTransfert,
  TypeAgentSupprime,
  HospitalDashboard,
  IconesInfo,
  Localite,
  LoginCredentials,
  LoginResponse,
  SuperDashboard,
  ActeService,
  Assurance,
  AssuranceSaisie,
  ElementCatalogue,
  ModificationService,
  NouveauService,
  ServiceDetail,
  ServiceHopital,
  Specialite,
  SpecialiteSaisie,
  Agent,
  AgentFiche,
  OptionsPersonnel,
  TypeAgent,
  Chambre,
  ChambreDetail,
  ChambreSaisie,
  HospitalisationDetail,
  HospitalisationResume,
  ObservationDetail,
  ObservationResume,
  ListePermissions,
  StatutPermission,
  PatientHopital,
  PatientHopitalDetail,
  ConsultationHopital,
  ConsultationHopitalDetail,
  DeclarationNaissanceResume,
  DeclarationNaissanceDetail,
  DeclarationDecesResume,
  DeclarationDecesDetail,
  InfirmierDashboard,
  InfirmierConsultationItem,
  InfirmierConstantesFormulaire,
  EnregistrerConstantesPayload,
  TeleconsultationHospitalItem,
  InfirmierTeleconsultationItem,
  InfirmierTeleconsultationsResponse,
  InfirmierHospitalisationEnCoursItem,
  InfirmierHospitalisationHistoriqueItem,
  InfirmierHospitalisationSuivi,
  AjouterSurveillancePayload,
  InfirmierPermissionItem,
  CreerPermissionPayload,
  InfirmierPlanningResponse,
  InfirmierPatientItem,
  RecherchePatientFilters,
  InfirmierPatientDetailResponse,
  OptionsAccueilInfirmier,
  InscriptionPatientSaisie,
  AffectationSaisie,
  DossierMedical,
  ParcoursIntervention,
  DoctorDashboard,
  DoctorConsultationItem,
  DoctorConsultationFormulaire,
  DoctorTelemedecines,
  DocumentsConsultation,
  DocumentReference,
  MedecinReference,
  ExpertiseDisponible,
  TeleconsultationDisponible,
  DoctorReferes,
  AccesAppelVideo,
  DossierSuiviMereEnfant,
  PatientSuiviItem,
  TypeSuiviMereEnfant,
  MiseAJourPatientSaisie,
  PatientIdentite,
  DecesDirectSaisie,
  PatientDeclarationItem,
  InvitationExpert,
  AppelEntrant,
  RefereDetail,
  DoctorHospitalisationItem,
  DoctorHospitalisationOptions,
  DoctorHospitalisationDetail,
  DossierHospitalisation,
  ConsultationCurativePayload,
  CalendrierMedecins,
  ProfilUtilisateur,
  MedecinPropose,
  Reattribution,
  TableauRegulation,
  ResultatExpertiseItem,
  ResultatExpertiseDetail,
} from '../types';
import { hopitalOuvertId } from './contexteHopital';
import { tokenStorage } from './token';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/** Adresse d'une image enregistrée dans Laravel (servie par le backend) */
export const uploadUrl = (dossier: string, fichier: string) =>
  `${BASE_URL}/uploads/${dossier}/${encodeURIComponent(fichier)}`;

/** Image racine des uploads de Laravel (public/assets/uploads/<fichier>) : logos et filigranes des documents */
export const fichierUploads = (fichier: string) => `${BASE_URL}/uploads/${encodeURIComponent(fichier)}`;

/** Adresse d'un asset local (stocké dans backend/uploads) */
export const localAssetUrl = (fichier: string) =>
  `${BASE_URL}/uploads-local/${fichier}`;

/** Appelé quand le backend répond 401 (session expirée) — branché par AuthContext */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

/** Admin UCP-FM qui a ouvert un hôpital : les appels de l'espace hôpital visent cet hôpital */
const enteteHopital = (path: string): Record<string, string> => {
  const id = hopitalOuvertId();
  return id !== null && path.startsWith('/hospital/') ? { 'X-Hopital-Id': String(id) } : {};
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = tokenStorage.get();
  // Formulaire avec fichier (FormData) : le navigateur fixe lui-même le Content-Type
  const isForm = options?.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...enteteHopital(path),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
    if (res.status === 401 && token && path !== '/auth/login') onUnauthorized?.();
    if (res.status === 413) throw new Error(path.includes('/references') ? 'Document trop lourd (10 Mo maximum)' : 'Image trop lourde (3 Mo maximum)');
    throw new Error(message ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Paramètres d'URL (ignore les valeurs vides) */
const qs = (p: object) => {
  const u = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && u.set(k, String(v)));
  const t = u.toString();
  return t ? `?${t}` : '';
};

/** Télécharge un fichier protégé (jeton dans l'en-tête) et l'enregistre sur l'ordinateur */
async function telecharger(path: string, nomParDefaut: string): Promise<void> {
  const token = tokenStorage.get();
  const res = await fetch(`${BASE_URL}${path}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...enteteHopital(path) } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Erreur ${res.status}`);
  }
  const brut = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
  let nom = brut ?? nomParDefaut;
  try {
    nom = decodeURIComponent(nom);
  } catch {
    /* nom déjà lisible */
  }
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nom });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Fonctions communes aux agents de santé (infirmier·ère et médecin) :
 * inscription / recherche / affectation des patients, permissions, planning.
 */
/** Appels vidéo de télémédecine (LiveKit) : mêmes actions pour le médecin et l'infirmier·ère */
const appelsVideo = (base: string) => ({
  entrants: () => request<AppelEntrant[]>(`${base}/appels-entrants`),
  rejoindre: (consultationId: number) => request<AccesAppelVideo>(`${base}/${consultationId}/appel`, { method: 'POST' }),
  terminer: (consultationId: number) => request<{ success: boolean; message: string }>(`${base}/${consultationId}/appel/terminer`, { method: 'POST' }),
  /** Médecin : lien sécurisé pour inviter un confrère (chemin de la page publique) */
  invitation: (consultationId: number) => request<{ chemin: string; patient: string }>(`${base}/${consultationId}/appel/invitation`),
});

/** Page publique du confrère invité (lien d'invitation, sans connexion) */
const avisExpert = {
  infos: (id: string, code: string) => request<InvitationExpert>(`/teleconsultation/expert/${encodeURIComponent(id)}/${encodeURIComponent(code)}`),
  jeton: (id: string, code: string, corps: { nom: string; specialite?: string }) =>
    request<AccesAppelVideo>(`/teleconsultation/expert/${encodeURIComponent(id)}/${encodeURIComponent(code)}/jeton`, { method: 'POST', body: JSON.stringify(corps) }),
};

const agentSante = (prefixe: 'infirmier' | 'doctor' | 'regulateur') => ({
  patients: {
    rechercher: (params: RecherchePatientFilters) => {
      const query = new URLSearchParams();
      if (params.code_patient) query.set('code_patient', params.code_patient);
      if (params.telephone) query.set('telephone', params.telephone);
      if (params.num_cmu) query.set('num_cmu', params.num_cmu);
      if (params.fullname) query.set('fullname', params.fullname);
      if (params.birth_date) query.set('birth_date', params.birth_date);
      const q = query.toString();
      return request<InfirmierPatientItem[]>(`/${prefixe}/patients/rechercher${q ? `?${q}` : ''}`);
    },
    optionsAccueil: () => request<OptionsAccueilInfirmier>(`/${prefixe}/patients/options-accueil`),
    inscrire: (data: InscriptionPatientSaisie) =>
      request<{ patientId: number; codePatient: string; consultationId: number | null; message: string }>(`/${prefixe}/patients`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    affecter: (id: number, data: AffectationSaisie) =>
      request<{ consultationId: number; message: string }>(`/${prefixe}/patients/${id}/affecter`, { method: 'POST', body: JSON.stringify(data) }),
    /** « Consulter » : consultation du jour dans le service de l'agent connecté, à son nom */
    /** nouvelle : consultation créée maintenant (annulable en quittant sans issue) ; sinon reprise d'une consultation en cours */
    consulter: (id: number) => request<{ consultationId: number; nouvelle: boolean; message: string }>(`/${prefixe}/patients/${id}/consulter`, { method: 'POST' }),
    /** Informations modifiables (ex. nouveau-né : nom et prénoms à compléter) */
    identite: (id: number) => request<PatientIdentite>(`/${prefixe}/patients/${id}/identite`),
    /** Dossier médical complet (toutes les consultations, tous établissements) */
    dossier: (id: number) => request<DossierMedical>(`/${prefixe}/patients/${id}/dossier`),
    parcours: (id: number, consultationId: number) => request<ParcoursIntervention>(`/${prefixe}/patients/${id}/parcours/${consultationId}`),
    modifier: (id: number, data: MiseAJourPatientSaisie) =>
      request<{ success: boolean; message: string; nomComplet: string }>(`/${prefixe}/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  permissions: {
    liste: () => request<InfirmierPermissionItem[]>(`/${prefixe}/permissions`),
    creer: (payload: CreerPermissionPayload) => request<{ success: boolean; message: string }>(`/${prefixe}/permissions`, { method: 'POST', body: JSON.stringify(payload) }),
  },
  planning: {
    get: () => request<InfirmierPlanningResponse>(`/${prefixe}/planning`),
    majDisponibilites: (payload: { days: number[]; hour_start: string[]; hour_end: string[] }) =>
      request<{ success: boolean; message: string }>(`/${prefixe}/planning/disponibilites`, { method: 'POST', body: JSON.stringify(payload) }),
  },
});

/** Espace de l'agent de santé connecté (pages partagées infirmier / médecin) */
/** Espace qui utilise les pages partagées (Permissions, Planning…) ; le régulateur n'a que permissions et planning */
/**
 * Formulaire de consultation (médecin, ou infirmier·ère qui consulte lui-même) : mêmes routes sous deux préfixes
 *   /doctor/consultations  et  /infirmier/consultations-medicales
 */
const formulaireConsultation = (racine: string) => ({
  medicaments: (q: string) => request<{ id: number; nom: string; unite: string | null }[]>(`${racine}/medicaments?q=${encodeURIComponent(q)}`),
  formulaire: (id: number) => request<DoctorConsultationFormulaire>(`${racine}/${id}`),
  documents: (id: number) => request<DocumentsConsultation>(`${racine}/${id}/documents`),
  /** Télé-expertise en externe : services des autres établissements de la DMHP */
  servicesExternes: () => request<{ id: number; libelle: string; hopitaux: number }[]>(`${racine}/services-externes`),
  /** Télé-expertise en externe : hôpitaux de la DMHP qui ont ce service */
  hopitauxService: (serviceId: number) => request<{ id: number; nom: string }[]>(`${racine}/services-externes/${serviceId}/hopitaux`),
  /** Télé-expertise en externe : médecins du service dans l'hôpital, disponibilité à la date et l'heure */
  medecinsService: (serviceId: number, hospitalId: number, date?: string, heure?: string) =>
    request<MedecinReference[]>(`${racine}/services-externes/${serviceId}/hopitaux/${hospitalId}/medecins${qs({ date, heure })}`),
  /** Avec date et heure : disponibilité des médecins à ce moment (sinon maintenant) */
  medecinsReference: (date?: string, heure?: string) => request<MedecinReference[]>(`${racine}/medecins-reference${qs({ date, heure })}`),
  /** Issue « Télémédecine » : hôpitaux de la DMHP / médecins disponibles à la date et l'heure */
  teleHopitaux: (date?: string, heure?: string) => request<TeleconsultationHospitalItem[]>(`${racine}/teleconsultation-hopitaux${qs({ date, heure })}`),
  teleMedecins: (hospitalId: number, date?: string, heure?: string) =>
    request<{ id: number; nom: string; specialite: string; creneau?: string | null }[]>(`${racine}/teleconsultation-medecins/${hospitalId}${qs({ date, heure })}`),
  /** Documents joints à une référence (interne / externe) */
  references: {
    ajouter: (id: number, data: FormData) =>
      request<{ success: boolean; message: string; documents: DocumentReference[] }>(`${racine}/${id}/references`, { method: 'POST', body: data }),
    telecharger: (id: number, docId: string, nom: string) => telecharger(`${racine}/${id}/references/${docId}`, nom),
    supprimer: (id: number, docId: string) => request<{ success: boolean; message: string }>(`${racine}/${id}/references/${docId}`, { method: 'DELETE' }),
  },
  /** « Consulter » puis sortie sans issue : la consultation (vierge) est supprimée, comme si de rien n'était */
  annuler: (id: number) => request<{ success: boolean; message: string }>(`${racine}/${id}/annuler`, { method: 'DELETE' }),
  /** Infirmier·ère : « Envoyer au médecin » — consultation non terminée, passée au médecin avec la saisie */
  envoyerMedecin: (id: number, doctorId: number, valeurs: Record<string, unknown>) =>
    request<{ success: boolean; message: string; medecin: string }>(`${racine}/${id}/envoyer-medecin`, {
      method: 'POST',
      body: JSON.stringify({ doctorId, valeurs }),
    }),
  enregistrer: (id: number, payload: ConsultationCurativePayload) =>
    request<{
      success: boolean;
      message: string;
      hospitalisation: string | null;
      declarationNaissance: { id: number; reference: string } | null;
      /** Télémédecine / urgence : consultation créée pour la suite */
      consultationSuivante: number | null;
      /** Appel d'urgence : accès à l'appel vidéo */
      appel: AccesAppelVideo | null;
    }>(`${racine}/${id}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
});
export type ApiFormulaireConsultation = ReturnType<typeof formulaireConsultation>;

/** Télémédecine > Programmer : patient + issue (téléconsultation / télé-expertise), programmation directe */
export const apiProgrammationTelemedecine = (espace: 'medecin' | 'infirmier') => (payload: Record<string, unknown>) =>
  request<{ success: boolean; message: string; consultationId: number }>(
    espace === 'infirmier' ? '/infirmier/consultations-medicales/programmer' : '/doctor/telemedecines/programmer',
    { method: 'POST', body: JSON.stringify(payload) },
  );

/** Résultats d'expertise (demandeur : médecin ou infirmier·ère) */
const resultatsExpertise = (racine: string) => ({
  liste: () => request<ResultatExpertiseItem[]>(racine),
  nonLus: () => request<{ nonLus: number }>(`${racine}/non-lus`),
  /** Ouvre le résultat (le marque comme lu) */
  detail: (origineId: number) => request<ResultatExpertiseDetail>(`${racine}/${origineId}`),
  telecharger: (origineId: number, docId: string, nom: string) => telecharger(`${racine}/${origineId}/documents/${docId}`, nom),
});
export type ApiResultatsExpertise = ReturnType<typeof resultatsExpertise>;
/** API des résultats d'expertise selon l'espace */
export const apiResultatsExpertise = (espace: 'medecin' | 'infirmier'): ApiResultatsExpertise =>
  resultatsExpertise(espace === 'infirmier' ? '/infirmier/consultations-medicales/resultats-expertise' : '/doctor/resultats-expertise');
/** API du formulaire de consultation selon l'espace */
export const apiFormulaireConsultation = (espace: 'medecin' | 'infirmier'): ApiFormulaireConsultation =>
  espace === 'infirmier' ? formulaireConsultation('/infirmier/consultations-medicales') : api.doctor.consultations;

export type EspaceAgent = 'infirmier' | 'medecin' | 'regulateur';
export const apiAgent = (espace: EspaceAgent) => agentSante(espace === 'medecin' ? 'doctor' : espace === 'regulateur' ? 'regulateur' : 'infirmier');

export const api = {
  avisExpert,
  // --- Public ---
  sendContact: (data: ContactMessage) =>
    request<{ success: boolean }>('/contact', { method: 'POST', body: JSON.stringify(data) }),

  // --- Authentification ---
  login: (data: LoginCredentials) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<AuthUser>('/auth/me'),
  /** Mot de passe oublié : code à 6 chiffres envoyé par email, puis nouveau mot de passe */
  motDePasseOublie: (email: string) =>
    request<{ message: string }>('/auth/mot-de-passe-oublie', { method: 'POST', body: JSON.stringify({ email }) }),
  reinitialiser: (data: { email: string; code: string; nouveau: string; confirmation: string }) =>
    request<{ message: string }>('/auth/reinitialiser', { method: 'POST', body: JSON.stringify(data) }),

  // --- Icônes du site (public, sans connexion) — voir services/icones.ts ---
  icones: () => request<IconesInfo>('/icones'),

  // --- Médecin / sage-femme ---
  doctor: {
    /** Patients (inscription, recherche & affectation), permissions, planning : comme l'infirmier */
    ...agentSante('doctor'),
    /** Suivi mère-enfant (PTME) : prénatal de la mère, postnatal de l'enfant exposé */
    suiviMereEnfant: {
      rechercher: (type: TypeSuiviMereEnfant, q: string) => request<PatientSuiviItem[]>(`/doctor/suivi-mere-enfant/${type}/patients${qs({ q })}`),
      dossier: (type: TypeSuiviMereEnfant, patientId: number) => request<DossierSuiviMereEnfant>(`/doctor/suivi-mere-enfant/${type}/${patientId}`),
      enregistrer: (type: TypeSuiviMereEnfant, corps: Record<string, unknown>) =>
        request<{ success: boolean; message: string; id: number }>(`/doctor/suivi-mere-enfant/${type}`, { method: 'POST', body: JSON.stringify(corps) }),
    },
    /** Déclarations du médecin (listes/fiches : les siennes) + enregistrement direct d'un décès */
    declarations: {
      naissances: () => request<DeclarationNaissanceResume[]>('/doctor/declarations/naissances'),
      naissanceDetail: (id: number) => request<DeclarationNaissanceDetail>(`/doctor/declarations/naissances/${id}`),
      deces: () => request<DeclarationDecesResume[]>('/doctor/declarations/deces'),
      decesDetail: (id: number) => request<DeclarationDecesDetail>(`/doctor/declarations/deces/${id}`),
      optionsDeces: () => request<{ hopital: string; medecin: string }>('/doctor/declarations/deces/options'),
      patients: (q: string) => request<PatientDeclarationItem[]>(`/doctor/declarations/patients${qs({ q })}`),
      enregistrerDeces: (corps: DecesDirectSaisie) =>
        request<{ success: boolean; message: string; declarationId: number }>('/doctor/declarations/deces', { method: 'POST', body: JSON.stringify(corps) }),
    },
    appels: appelsVideo('/doctor/telemedecines'),
    tableauDeBord: () => request<DoctorDashboard>('/doctor/tableau-de-bord'),
    telemedecines: (filtre = 'en-attente') => request<DoctorTelemedecines>(`/doctor/telemedecines?filtre=${filtre}`),
    /** Téléconsultations envoyées à mon service (sans médecin choisi), à prendre en charge */
    teleconsultationsDisponibles: () => request<TeleconsultationDisponible[]>('/doctor/consultations/teleconsultations-disponibles'),
    prendreTeleconsultation: (consultationId: number) =>
      request<{ success: boolean; message: string; consultationId: number }>(`/doctor/consultations/${consultationId}/prendre-teleconsultation`, { method: 'POST' }),
    referes: {
      liste: () => request<DoctorReferes>('/doctor/referes'),
      /** Télé-expertises externes adressées à mon service, à prendre en charge */
      disponibles: () => request<ExpertiseDisponible[]>('/doctor/referes/disponibles'),
      detail: (origineId: number) => request<RefereDetail>(`/doctor/referes/${origineId}`),
      telecharger: (origineId: number, docId: string, nom: string) => telecharger(`/doctor/referes/${origineId}/documents/${docId}`, nom),
      prendreEnCharge: (origineId: number) =>
        request<{ success: boolean; message: string; consultationId: number }>(`/doctor/referes/${origineId}/prendre-en-charge`, { method: 'POST' }),
      /** Expert : avis, conduite à tenir et documents (multipart), envoyés une seule fois */
      envoyerResultat: (origineId: number, data: FormData) =>
        request<{ success: boolean; message: string }>(`/doctor/referes/${origineId}/resultat`, { method: 'POST', body: data }),
      /** Expert : documents ajoutés à un résultat déjà envoyé */
      ajouterDocumentsResultat: (origineId: number, data: FormData) =>
        request<{ success: boolean; message: string; documents: DocumentReference[] }>(`/doctor/referes/${origineId}/resultat/documents`, { method: 'POST', body: data }),
    },
    /** Résultats des télé-expertises que j'ai demandées */
    resultatsExpertise: resultatsExpertise('/doctor/resultats-expertise'),
    hospitalisations: {
      liste: (statut: 'en-attente' | 'en-cours' | 'historique') => request<DoctorHospitalisationItem[]>(`/doctor/hospitalisations?statut=${statut}`),
      compteurs: () => request<{ enAttente: number; enCours: number }>('/doctor/hospitalisations/compteurs'),
      options: () => request<DoctorHospitalisationOptions>('/doctor/hospitalisations/options'),
      detail: (id: number) => request<DoctorHospitalisationDetail>(`/doctor/hospitalisations/${id}`),
      attribuerLit: (id: number, bedId: number, infirmierId?: number | null) =>
        request<{ success: boolean; message: string }>(`/doctor/hospitalisations/${id}/lit`, { method: 'POST', body: JSON.stringify({ bedId, ...(infirmierId ? { infirmierId } : {}) }) }),
      majDossier: (id: number, dossier: Partial<DossierHospitalisation>) =>
        request<{ success: boolean; message: string }>(`/doctor/hospitalisations/${id}/dossier`, { method: 'PUT', body: JSON.stringify(dossier) }),
      sortie: (id: number, motifSortie: string) =>
        request<{ success: boolean; message: string }>(`/doctor/hospitalisations/${id}/sortie`, { method: 'POST', body: JSON.stringify({ motifSortie }) }),
    },
    consultations: {
      nouvelles: () => request<DoctorConsultationItem[]>('/doctor/consultations/nouvelles'),
      enAttente: () => request<DoctorConsultationItem[]>('/doctor/consultations/en-attente'),
      historique: () => request<DoctorConsultationItem[]>('/doctor/consultations/historique'),
      ...formulaireConsultation('/doctor/consultations'),
    },
  },

  // --- Infirmier ---
  infirmier: {
    appels: appelsVideo('/infirmier/teleconsultations'),
    tableauDeBord: () => request<InfirmierDashboard>('/infirmier/tableau-de-bord'),
    consultations: {
      today: () => request<InfirmierConsultationItem[]>('/infirmier/consultations/today'),
      all: () => request<InfirmierConsultationItem[]>('/infirmier/consultations/all'),
      history: () => request<InfirmierConsultationItem[]>('/infirmier/consultations/history'),
      /** Avec date et heure : nombre de médecins disponibles à ce moment dans chaque hôpital */
      teleconsultationHospitals: (date?: string, heure?: string) =>
        request<TeleconsultationHospitalItem[]>(`/infirmier/consultations/teleconsultation-hospitals${qs({ date, heure })}`),
      /** Avec date et heure : seulement les médecins disponibles à ce moment (planning + permissions) */
      teleconsultationDoctors: (hospitalId: number, date?: string, heure?: string) =>
        request<{ id: number; nom: string; specialite: string; creneau?: string | null }[]>(
          `/infirmier/consultations/teleconsultation-doctors/${hospitalId}${qs({ date, heure })}`,
        ),
      formulaire: (id: number) => request<InfirmierConstantesFormulaire>(`/infirmier/consultations/formulaire/${id}`),
      /** Appel d'urgence : constantes enregistrées + appel vidéo vers les médecins alertés */
      lancerUrgence: (id: number, corps: { tension_arterielle?: string; temperature?: string; taille?: string; poids?: string; imc?: string; pouls?: string; observation?: string }) =>
        request<AccesAppelVideo>(`/infirmier/consultations/${id}/urgence`, { method: 'POST', body: JSON.stringify(corps) }),
      enregistrerConstantes: (payload: EnregistrerConstantesPayload) =>
        request<{ success: boolean; message: string; consultationId: number }>('/infirmier/consultations/formulaire', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
    },
    teleconsultations: {
      list: (filter?: 'all' | 'today' | 'upcoming' | 'completed') =>
        request<InfirmierTeleconsultationsResponse>(`/infirmier/teleconsultations${filter ? `?filter=${filter}` : ''}`),
      /** Nombre de télémédecines en attente (badge de la sidebar) */
      enAttente: () => request<{ enAttente: number }>('/infirmier/teleconsultations/en-attente'),
      lancerAppel: (id: number) =>
        request<{ success: boolean; message: string; callChannel: string; callStatus: string; isCallActive: boolean }>(
          `/infirmier/teleconsultations/${id}/lancer-appel`,
          { method: 'POST' },
        ),
    },
    hospitalisations: {
      enCours: () => request<InfirmierHospitalisationEnCoursItem[]>('/infirmier/hospitalisations/en-cours'),
      historique: () => request<InfirmierHospitalisationHistoriqueItem[]>('/infirmier/hospitalisations/historique'),
      suivi: (id: number) => request<InfirmierHospitalisationSuivi>(`/infirmier/hospitalisations/${id}/suivi`),
      appliquerHeure: (heureId: number) => request<{ success: boolean; message: string }>(`/infirmier/hospitalisations/heures/${heureId}/appliquer`, { method: 'POST' }),
      ajouterSurveillance: (id: number, payload: AjouterSurveillancePayload) =>
        request<{ success: boolean; message: string }>(`/infirmier/hospitalisations/${id}/surveillance`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
    },
    permissions: {
      liste: () => request<InfirmierPermissionItem[]>('/infirmier/permissions'),
      creer: (payload: CreerPermissionPayload) =>
        request<{ success: boolean; message: string }>('/infirmier/permissions', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
    },
    planning: {
      get: () => request<InfirmierPlanningResponse>('/infirmier/planning'),
      majDisponibilites: (payload: { days: number[]; hour_start: string[]; hour_end: string[] }) =>
        request<{ success: boolean; message: string }>('/infirmier/planning/disponibilites', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
    },
    patients: {
      liste: () => request<InfirmierPatientItem[]>('/infirmier/patients/liste'),
      rechercher: (params: RecherchePatientFilters) => {
        const query = new URLSearchParams();
        if (params.code_patient) query.set('code_patient', params.code_patient);
        if (params.telephone) query.set('telephone', params.telephone);
        if (params.num_cmu) query.set('num_cmu', params.num_cmu);
        if (params.fullname) query.set('fullname', params.fullname);
        if (params.birth_date) query.set('birth_date', params.birth_date);
        const qs = query.toString();
        return request<InfirmierPatientItem[]>(`/infirmier/patients/rechercher${qs ? `?${qs}` : ''}`);
      },
      detail: (id: number) => request<InfirmierPatientDetailResponse>(`/infirmier/patients/${id}`),
      /** Dossier médical complet (toutes les consultations, tous établissements) */
      dossier: (id: number) => request<DossierMedical>(`/infirmier/patients/${id}/dossier`),
      parcours: (id: number, consultationId: number) =>
        request<ParcoursIntervention>(`/infirmier/patients/${id}/parcours/${consultationId}`),
      /** Listes des formulaires d'inscription / d'affectation */
      optionsAccueil: () => request<OptionsAccueilInfirmier>('/infirmier/patients/options-accueil'),
      /** Inscription d'un nouveau patient (+ affectation facultative → consultation du jour) */
      inscrire: (data: InscriptionPatientSaisie) =>
        request<{ patientId: number; codePatient: string; consultationId: number | null; message: string }>('/infirmier/patients', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      /** Affectation d'un patient existant → consultation du jour (pas de caisse) */
      affecter: (id: number, data: AffectationSaisie) =>
        request<{ consultationId: number; message: string }>(`/infirmier/patients/${id}/affecter`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },
  },
  hospital: {
    tableauDeBord: () => request<HospitalDashboard>('/hospital/tableau-de-bord'),
    services: {
      liste: () => request<ServiceHopital[]>('/hospital/services'),
      catalogue: () => request<ElementCatalogue[]>('/hospital/services/catalogue'),
      actesCatalogue: (serviceId: number) => request<ElementCatalogue[]>(`/hospital/services/catalogue/${serviceId}/actes`),
      creer: (data: NouveauService) =>
        request<{ id: number; message: string }>('/hospital/services', { method: 'POST', body: JSON.stringify(data) }),
      detail: (id: number) => request<ServiceDetail>(`/hospital/services/${id}`),
      modifier: (id: number, data: ModificationService) =>
        request<{ message: string }>(`/hospital/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      basculerStatut: (id: number) =>
        request<{ actif: boolean; message: string }>(`/hospital/services/${id}/statut`, { method: 'PATCH' }),
      supprimer: (id: number) => request<{ message: string }>(`/hospital/services/${id}`, { method: 'DELETE' }),
      supprimerActe: (id: number, acte: ActeService['id']) =>
        request<{ message: string }>(`/hospital/services/${id}/actes/${acte}`, { method: 'DELETE' }),
    },
    assurances: {
      liste: () => request<Assurance[]>('/hospital/assurances'),
      detail: (id: number) => request<Assurance>(`/hospital/assurances/${id}`),
      creer: (data: AssuranceSaisie) =>
        request<{ id: number; message: string }>('/hospital/assurances', { method: 'POST', body: JSON.stringify(data) }),
      modifier: (id: number, data: AssuranceSaisie) =>
        request<{ message: string }>(`/hospital/assurances/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      basculerStatut: (id: number) =>
        request<{ actif: boolean; message: string }>(`/hospital/assurances/${id}/statut`, { method: 'PATCH' }),
      supprimer: (id: number) => request<{ message: string }>(`/hospital/assurances/${id}`, { method: 'DELETE' }),
    },
    specialites: {
      liste: () => request<Specialite[]>('/hospital/specialites'),
      detail: (id: number) => request<Specialite>(`/hospital/specialites/${id}`),
      creer: (data: SpecialiteSaisie) =>
        request<{ id: number; message: string }>('/hospital/specialites', { method: 'POST', body: JSON.stringify(data) }),
      modifier: (id: number, data: SpecialiteSaisie) =>
        request<{ message: string }>(`/hospital/specialites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      basculerStatut: (id: number) =>
        request<{ actif: boolean; message: string }>(`/hospital/specialites/${id}/statut`, { method: 'PATCH' }),
      supprimer: (id: number) => request<{ message: string }>(`/hospital/specialites/${id}`, { method: 'DELETE' }),
    },
    chambres: {
      liste: () => request<Chambre[]>('/hospital/chambres'),
      detail: (id: number) => request<ChambreDetail>(`/hospital/chambres/${id}`),
      creer: (data: ChambreSaisie) =>
        request<{ id: number; message: string }>('/hospital/chambres', { method: 'POST', body: JSON.stringify(data) }),
      modifier: (id: number, data: ChambreSaisie) =>
        request<{ message: string }>(`/hospital/chambres/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      basculerStatut: (id: number) =>
        request<{ actif: boolean; message: string }>(`/hospital/chambres/${id}/statut`, { method: 'PATCH' }),
      supprimer: (id: number) => request<{ message: string }>(`/hospital/chambres/${id}`, { method: 'DELETE' }),
    },
    hospitalisations: {
      liste: () => request<HospitalisationResume[]>('/hospital/hospitalisations'),
      detail: (id: number) => request<HospitalisationDetail>(`/hospital/hospitalisations/${id}`),
    },
    observations: {
      liste: () => request<ObservationResume[]>('/hospital/observations'),
      detail: (id: number) => request<ObservationDetail>(`/hospital/observations/${id}`),
    },
    permissions: {
      liste: (statut: StatutPermission) => request<ListePermissions>(`/hospital/permissions?statut=${statut}`),
      /** regulateur = demande d'un régulateur (table propre à Gemma FM) */
      traiter: (id: number, statut: 'agree' | 'reject', regulateur = false) =>
        request<{ statut: StatutPermission; message: string }>(`/hospital/permissions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ statut, ...(regulateur ? { regulateur: true } : {}) }),
        }),
    },
    patients: {
      liste: () => request<PatientHopital[]>('/hospital/patients'),
      detail: (id: number) => request<PatientHopitalDetail>(`/hospital/patients/${id}`),
    },
    consultations: {
      nouvelles: () => request<ConsultationHopital[]>('/hospital/consultations/nouvelles'),
      historique: () => request<ConsultationHopital[]>('/hospital/consultations/historique'),
      detail: (id: number) => request<ConsultationHopitalDetail>(`/hospital/consultations/${id}`),
    },
    declarations: {
      naissances: () => request<DeclarationNaissanceResume[]>('/hospital/declarations/naissances'),
      naissanceDetail: (id: number) => request<DeclarationNaissanceDetail>(`/hospital/declarations/naissances/${id}`),
      deces: () => request<DeclarationDecesResume[]>('/hospital/declarations/deces'),
      decesDetail: (id: number) => request<DeclarationDecesDetail>(`/hospital/declarations/deces/${id}`),
    },
    personnel: {
      options: () => request<OptionsPersonnel>('/hospital/personnel-sante/options'),
      liste: (type: TypeAgent) => request<Agent[]>(`/hospital/personnel-sante/${type}`),
      detail: (type: TypeAgent, id: number) => request<AgentFiche>(`/hospital/personnel-sante/${type}/${id}`),
      /** Formulaire multipart (photo "image" facultative, listes en JSON) */
      creer: (type: TypeAgent, data: FormData) =>
        request<{ id: number; message: string }>(`/hospital/personnel-sante/${type}`, { method: 'POST', body: data }),
      modifier: (type: TypeAgent, id: number, data: FormData) =>
        request<{ message: string }>(`/hospital/personnel-sante/${type}/${id}`, { method: 'PUT', body: data }),
      basculerStatut: (type: TypeAgent, id: number) =>
        request<{ actif: boolean; message: string }>(`/hospital/personnel-sante/${type}/${id}/statut`, { method: 'PATCH' }),
      basculerChef: (id: number) =>
        request<{ chef: boolean; message: string }>(`/hospital/personnel-sante/medecin/${id}/chef`, { method: 'PATCH' }),
      supprimer: (type: TypeAgent, id: number) =>
        request<{ message: string }>(`/hospital/personnel-sante/${type}/${id}`, { method: 'DELETE' }),
    },
  },

  // --- Super admin ---
  /** « Mon profil » de l'utilisateur connecté (tous les rôles) */
  profil: {
    lire: () => request<ProfilUtilisateur>('/profil'),
    /** FormData : nom, prenom, contact, adresse, district, direction (selon le rôle) + image facultative */
    modifier: (data: FormData) => request<{ message: string }>('/profil', { method: 'PUT', body: data }),
    motDePasse: (data: { actuel: string; nouveau: string; confirmation: string }) =>
      request<{ message: string }>('/profil/mot-de-passe', { method: 'PUT', body: JSON.stringify(data) }),
  },
  /** Trace d'un export Excel fait dans le navigateur (journal d'audit EXPORT_EXCEL) */
  exports: {
    journal: (data: { module: string; description: string }) =>
      request<{ success: boolean }>('/exports/journal', { method: 'POST', body: JSON.stringify(data) }),
  },
  /** Espace du régulateur (réattribution des patients à un médecin disponible) */
  regulateur: {
    consultations: () => request<TableauRegulation>('/regulateur/consultations'),
    /** Médecins du service du patient : en interne (hôpital du régulateur) ou en externe (hospitalId, autre hôpital de la DMHP) */
    medecins: (consultationId: number, choix: { portee?: 'interne' | 'externe'; hospitalId?: number } = {}) =>
      request<{
        consultationId: number;
        service: string | null;
        /** Choix proposé par défaut dans la fenêtre (le service du patient n'est pas modifiable) */
        defaut: { portee: 'interne' | 'externe'; serviceId: number | null; hospitalId: number | null };
        medecins: MedecinPropose[];
      }>(`/regulateur/consultations/${consultationId}/medecins${qs(choix)}`),
    /** Autres hôpitaux de la DMHP qui ont ce service */
    hopitauxService: (serviceId: number) => request<{ id: number; nom: string }[]>(`/regulateur/services-externes/${serviceId}/hopitaux`),
    /** Externe sans médecin (hospitalId seul) : envoi à tous les médecins du service dans cet hôpital */
    reattribuer: (consultationId: number, data: { doctorId?: number; hospitalId?: number; motif?: string }) =>
      request<{ message: string }>(`/regulateur/consultations/${consultationId}/reattribuer`, { method: 'POST', body: JSON.stringify(data) }),
    historique: () => request<Reattribution[]>('/regulateur/historique'),
    /** semaine = une date "AAAA-MM-JJ" de la semaine voulue (par défaut : cette semaine) */
    calendrier: (semaine?: string) => request<CalendrierMedecins>(`/regulateur/calendrier${semaine ? `?semaine=${semaine}` : ''}`),
  },
  super: {
    logs: {
      audit: (f: FiltresAudit) => request<JournalAudit>(`/super/logs/audit${qs(f)}`),
      exporterAudit: (f: FiltresAudit) => telecharger(`/super/logs/audit/export${qs(f)}`, 'journal_audit.xls'),
      laravel: (niveau: string, recherche: string) =>
        request<{ entrees: EntreeLogLaravel[]; taille: string; octets: number }>(
          `/super/logs/laravel${qs({ niveau, recherche })}`,
        ),
      telechargerLaravel: () => telecharger('/super/logs/laravel/telecharger', 'laravel.log'),
      viderLaravel: () => request<{ message: string }>('/super/logs/laravel', { method: 'DELETE' }),
    },
    notifications: {
      liste: (recherche: string, categorie: string, page: number) =>
        request<{ statistiques: StatistiquesAppareils; total: number; page: number; pages: number; diffusions: ResumeDiffusion[] }>(
          `/super/notifications${qs({ recherche, categorie, page })}`,
        ),
      statistiques: () => request<StatistiquesAppareils>('/super/notifications/statistiques'),
      patients: () => request<PatientCible[]>('/super/notifications/patients'),
      detail: (lot: string) => request<DetailDiffusion>(`/super/notifications/${encodeURIComponent(lot)}`),
      diffuser: (data: { titre: string; message: string; cible: string; categorie: string; patientId?: number }) =>
        request<ResultatDiffusion>('/super/notifications', { method: 'POST', body: JSON.stringify(data) }),
      relancer: (lot: string) =>
        request<ResultatDiffusion>(`/super/notifications/${encodeURIComponent(lot)}/relancer`, { method: 'POST' }),
      supprimer: (lot: string) =>
        request<{ message: string }>(`/super/notifications/${encodeURIComponent(lot)}`, { method: 'DELETE' }),
    },
    tableauDeBord: () => request<SuperDashboard>('/super/tableau-de-bord'),
    hopitaux: {
      liste: () => request<Hopital[]>('/super/hopitaux'),
      localites: () => request<Localite[]>('/super/hopitaux/localites'),
      regions: () => request<Localite[]>('/super/hopitaux/regions'),
      /** FormData : champs du formulaire + "image" facultative */
      creer: (data: FormData) =>
        request<{ id: number; message: string }>('/super/hopitaux', { method: 'POST', body: data }),
      detail: (id: number) => request<HopitalDetail>(`/super/hopitaux/${id}`),
      modifier: (id: number, data: FormData) =>
        request<{ message: string }>(`/super/hopitaux/${id}`, { method: 'PUT', body: data }),
      basculerStatut: (id: number) =>
        request<{ actif: boolean; message: string }>(`/super/hopitaux/${id}/statut`, { method: 'PATCH' }),
      basculerTeleconsultation: (id: number) =>
        request<{ teleconsultation: boolean; message: string }>(`/super/hopitaux/${id}/teleconsultation`, {
          method: 'PATCH',
        }),
      supervision: (id: number) => request<HopitalSupervision>(`/super/hopitaux/${id}/supervision`),
    },
    /** Agents supprimés par les hôpitaux UCP-FM : réintégrer, changer d'hôpital, supprimer définitivement */
    personnelSupprime: {
      liste: () => request<AgentSupprime[]>('/super/personnel-supprime'),
      options: (hopital?: number) => request<OptionsTransfert>(`/super/personnel-supprime/options${hopital ? `?hopital=${hopital}` : ''}`),
      reintegrer: (type: TypeAgentSupprime, id: number) =>
        request<{ message: string }>(`/super/personnel-supprime/${type}/${id}/reintegrer`, { method: 'PATCH' }),
      transferer: (type: TypeAgentSupprime, id: number, data: { hopitalId: number; service?: number; services?: number[]; actes?: number[]; typeDoctor?: number }) =>
        request<{ message: string }>(`/super/personnel-supprime/${type}/${id}/transferer`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      supprimer: (type: TypeAgentSupprime, id: number) =>
        request<{ message: string }>(`/super/personnel-supprime/${type}/${id}`, { method: 'DELETE' }),
    },
    reglages: {
      getIcones: () => request<IconesInfo>('/super/reglages/icones'),
      updateIcones: (data: FormData) =>
        request<{ message: string; icons: IconesInfo }>('/super/reglages/icones', {
          method: 'POST',
          body: data,
        }),
    },
  },
};
