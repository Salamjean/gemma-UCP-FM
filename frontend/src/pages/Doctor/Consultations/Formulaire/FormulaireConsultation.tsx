import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import { FaPaperPlane,
  FaArrowLeft,
  FaArrowRight,
  FaBed,
  FaCheck,
  FaClipboardList,
  FaDoorOpen,
  FaFlask,
  FaHeartbeat,
  FaNotesMedical,
  FaPills,
  FaPlus,
  FaRedo,
  FaSave,
  FaSearch,
  FaShareSquare,
  FaStethoscope,
  FaTimes,
  FaUserMd,
  FaFileDownload,
  FaDownload,
  FaPhoneVolume,
  FaVideo,
} from 'react-icons/fa';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { alerte, messageErreur } from '../../../../services/alertes';
import { useEspaceConsultation } from './espace';
import c from '../../../../styles/espace.module.css';
import type { ConsultationCurativeValeurs, DoctorConsultationFormulaire, DocumentReference, MedicamentPrescrit } from '../../../../types';
import { age } from '../../../Infirmier/GestionPatients/DossierMedical/outils';
import { AvatarPatient, heure, jour } from '../ListeConsultations';
import s from './FormulaireConsultation.module.css';
import { DOCUMENTS as DOCUMENTS_IMPRIMABLES } from '../../Documents/DocumentConsultation';
import IssueHospitalisation, { hospitalisationVide, type HospitalisationSaisie } from './IssueHospitalisation';
import ChoixMedecinReference, { ChoixServiceExterne, momentReferenceValide, momentReferenceVide, type MomentReference } from './ChoixMedecinReference';

/** Télé-expertise : délai de réponse (tableaux cliniques de télémédecine) */
const URGENTE = 'Urgente · moins de 30 min';
const PROGRAMMEE = 'Programmée · 24 à 48 h';
/** Champs envoyés : urgente → le serveur prend maintenant ; programmée → date et heure choisies */
const momentPayload = (m: MomentReference) =>
  m.urgente ? { referenceUrgente: true } : { referenceUrgente: false, referenceDate: m.date, referenceHeure: m.heure };
import SuiteDonnee from './SuiteDonnee';
import EnvoiMedecin from './EnvoiMedecin';
import { FenetreQuitter, quitter, useGardeSortie } from './GardeSortie';
import IssueTelemedecine, { momentTelemedecineValide, telemedecineVide, type TelemedecineSaisie } from './IssueTelemedecine';
import { ouvrirAppelVideo } from '../../../../components/AppelVideo';
import FormulaireAccouchement, { ETAPES_ACCOUCHEMENT, naissanceVide, preparerNaissance, type NaissanceSaisie } from './FormulaireAccouchement';
import FormulairePostnatal, { ETAPES_POSTNATALES } from './FormulairePostnatal';
import FormulairePrenatal, { ETAPES_PRENATALES, type ValeursPrenatales } from './FormulairePrenatal';
import { DocumentsReference, envoyerPieces, PiecesAJoindre, type PieceEnAttente } from './PiecesJointes';
import { type ChampMasque, masquerConstante } from '../../../../services/saisieConstantes';
import { REPERES } from '../../../../services/reperesConstantes';

type Valeurs = ConsultationCurativeValeurs;
type CleTexte = Exclude<keyof Valeurs, 'medicaments' | 'examens' | 'arret'>;

const ETAPES: { titre: string; detail: string; icone: IconType }[] = [
  { titre: 'Anamnèse', detail: 'Motif & antécédents', icone: FaClipboardList },
  { titre: 'Examen clinique', detail: 'Constantes & diagnostic', icone: FaStethoscope },
  { titre: 'Prescriptions', detail: 'Ordonnance, examens, arrêt', icone: FaPills },
  { titre: 'Issue', detail: 'Sortie du patient', icone: FaDoorOpen },
];

/** Issues du formulaire curatif Laravel (mode_sortie) */
const ISSUES: { id: string; titre: string; detail: string; icone: IconType; ton: string }[] = [
  { id: 'sortie', titre: 'Sortie', detail: 'Le patient rentre chez lui', icone: FaDoorOpen, ton: 'vert' },
  // Réservé à l'infirmier·ère : la consultation continue chez un médecin (saisie reprise), elle n'est pas terminée
  { id: 'envoi-medecin', titre: 'Envoyer au médecin', detail: 'Le médecin poursuit la consultation', icone: FaUserMd, ton: 'bleu' },
  { id: 'hospitalisation', titre: 'Hospitalisation', detail: 'Chambre, dossier et protocole', icone: FaBed, ton: 'rouge' },
  // Télé-expertise = référé (en interne ou en externe, choisi dans le bouton) avec partage de documents
  { id: 'teleexpertise', titre: 'Télé-expertise', detail: 'Avis sur documents, interne ou externe', icone: FaShareSquare, ton: 'bleu' },
  { id: 'teleconsultation', titre: 'Téléconsultation', detail: 'Avec un médecin à distance', icone: FaVideo, ton: 'bleu' },
  // Réservé à l'infirmier·ère : l'appel vidéo sonne chez les médecins de garde
  { id: 'urgence', titre: 'Appel d’urgence', detail: 'Les médecins de garde sont appelés', icone: FaPhoneVolume, ton: 'rouge' },
];

type DocPrescrit = 'ordonnance' | 'examens' | 'arret';
const DOCUMENTS: { id: DocPrescrit; titre: string; detail: string; icone: IconType }[] = [
  { id: 'ordonnance', titre: 'Ordonnance', detail: 'Médicaments à prescrire', icone: FaPills },
  { id: 'examens', titre: 'Bulletin d’examens', detail: 'Analyses, imagerie', icone: FaFlask },
  { id: 'arret', titre: 'Arrêt de travail', detail: 'Repos médical', icone: FaNotesMedical },
];

const OPERATIONS = [
  'Appendicectomie',
  'Cholécystectomie (ablation de la vésicule biliaire)',
  'Hernie réparatrice',
  'Césarienne',
  'Hystérectomie',
  'Myomectomie',
  'Prostatectomie',
  'Réparation de fracture',
  'Arthroplastie',
  'Chirurgie de la cataracte',
  'Amygdalectomie',
  'Adénoïdectomie',
  'Thyroïdectomie',
  'Pontage coronarien',
  'Résection intestinale',
  'Craniotomie (ouverture du crâne)',
  'Autre',
];

const EXAMENS_COURANTS = ['NFS', 'Glycémie', 'Goutte épaisse', 'TDR paludisme', 'Créatinine', 'Urée', 'Transaminases', 'CRP', 'ECBU', 'Radiographie thoracique', 'Échographie abdominale', 'Sérologie VIH'];

const VALEURS_VIDES: Valeurs = {
  motif: '',
  hta: null,
  alcool: null,
  tabac: null,
  drepanocytaire: null,
  traitementMedicamenteux: null,
  traitementAnterieur: null,
  antecedentMedical: null,
  autreAntecedentMedical: null,
  antecedentChirurgical: null,
  nomOperation: null,
  autreAntecedentChirurgical: null,
  grossesse: null,
  ddr: null,
  descriptionGrossesse: null,
  poids: null,
  taille: null,
  imc: null,
  temperature: null,
  tension: null,
  pouls: null,
  saturation: null,
  glycemieAJeun: null,
  glycemieNonAJeun: null,
  frequenceRespiratoire: null,
  perimetreBrachial: null,
  perimetreCranien: null,
  zscore: null,
  tuberculose: null,
  examenPhysique: null,
  diagnostic: null,
  autresPathologies: null,
  tdrPaludisme: null,
  goutteEpaisse: null,
  mildaEligible: null,
  mildaRemise: null,
  cdipPropose: null,
  cdipRealise: null,
  codeDepistage: null,
  medicaments: [],
  examens: [],
  arret: null,
  modeSortie: 'sortie',
  justification: null,
};

const ajouterJours = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(n, 1) - 1);
  return d.toISOString().slice(0, 10);
};
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Choix segmenté (Oui / Non / NA, Positif / Négatif…) */
function Choix({ valeur, options, onChange, nom }: { valeur: string | null; options: string[]; onChange: (v: string | null) => void; nom: string }) {
  return (
    <div className={s.segments} role="radiogroup" aria-label={nom}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={valeur === o} className={valeur === o ? s.segmentActif : ''} onClick={() => onChange(valeur === o ? null : o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Constantes avec masque de saisie */
const MASQUES_CONSTANTES: Partial<Record<string, ChampMasque>> = {
  tension: 'tension',
  temperature: 'temperature',
  poids: 'poids',
  glycemieAJeun: 'glycemie',
  glycemieNonAJeun: 'glycemie',
};

/**
 * MÉDECIN > CONSULTATIONS > FORMULAIRE DE CONSULTATION (curative)
 * Repris de Laravel : users/doctor/consultation/formulaire (currative.blade.php + post-consultation + issue),
 * en 4 étapes. Consultation terminée → fiche en consultation seule.
 */
export default function FormulaireConsultation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { api, espace, racine } = useEspaceConsultation();
  const infirmier = espace === 'infirmier';
  const [fiche, setFiche] = useState<DoctorConsultationFormulaire | null>(null);
  // Télé-expertise programmée DIRECTEMENT (sans consultation préalable) : l'expert joint seulement son résultat (page dédiée)
  useEffect(() => {
    const e = fiche?.expertiseRecue;
    if (e && !e.avecConsultation && !fiche.lecture) navigate(`/medecin/referes/${e.origineId}/resultat`, { replace: true });
  }, [fiche, navigate]);
  const [erreur, setErreur] = useState(false);
  const [v, setV] = useState<Valeurs>(VALEURS_VIDES);
  const [etape, setEtape] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  // Infirmier·ère : « Envoyer au médecin » → fenêtre de choix du médecin (service + créneau)
  const [choixMedecin, setChoixMedecin] = useState(false);
  // Ouverte par « Consulter » (consultation toute neuve) : quitter sans issue propose de l'annuler
  const location = useLocation();
  const annulable = (location.state as { annulable?: boolean } | null)?.annulable === true;
  const [annulation, setAnnulation] = useState(false);
  // Télé-expertise reçue : l'expert indique, avant de terminer, s'il fournit un résultat au requérant
  const [fournirResultat, setFournirResultat] = useState<boolean | null>(null);
  // Rechargement de la fiche après enregistrement (pour afficher les documents à télécharger)
  const [rechargement, setRechargement] = useState(0);
  // Référence (interne / externe) : documents à joindre, puis documents déjà joints sur la fiche
  const [pieces, setPieces] = useState<PieceEnAttente[]>([]);
  const [references, setReferences] = useState<DocumentReference[]>([]);
  // Référé en interne : médecin destinataire (obligatoire)
  const [medecinReference, setMedecinReference] = useState<number | null>(null);
  // Télé-expertise en interne : date et heure de la prise en charge (avant le choix du médecin)
  const [momentReference, setMomentReference] = useState<MomentReference>(momentReferenceVide());
  // Télé-expertise en externe : service destinataire (autres établissements de la DMHP)
  const [serviceExterne, setServiceExterne] = useState<number | null>(null);
  // Issue « hospitalisation » : chambre, dossier et protocole (comme Laravel)
  const [hosp, setHosp] = useState<HospitalisationSaisie>(hospitalisationVide(null));
  // Issue « Téléconsultation » : date, heure, hôpital et médecin distant
  const [tele, setTele] = useState<TelemedecineSaisie>(telemedecineVide());

  // Ordonnance : recherche de médicaments
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<{ id: number; nom: string; unite: string | null }[]>([]);
  const [chercheEnCours, setChercheEnCours] = useState(false);
  const [examenSaisi, setExamenSaisi] = useState('');
  // Étape 3 : pour chaque document, Oui / Non avant de le remplir (null = pas encore répondu)
  const [prescrire, setPrescrire] = useState<Record<DocPrescrit, boolean | null>>({ ordonnance: null, examens: null, arret: null });
  const haut = useRef<HTMLDivElement>(null);
  // Consultation prénatale (CPN) ou postnatale : 3 étapes propres au registre de maternité, puis Prescriptions et Issue communes
  const [pn, setPn] = useState<ValeursPrenatales>({});
  const majPn = (k: string, val: string | null) => setPn((x) => ({ ...x, [k]: val }));
  const prenatal = fiche?.type === 'prenatale';
  const postnatal = fiche?.type === 'postnatale';
  const accouchement = fiche?.type === 'accouchement';
  const maternite = prenatal || postnatal || accouchement;
  const etapes = prenatal
    ? [...ETAPES_PRENATALES, ...ETAPES.slice(2)]
    : postnatal
      ? [...ETAPES_POSTNATALES, ...ETAPES.slice(2)]
      : accouchement
        ? [...ETAPES_ACCOUCHEMENT, ...ETAPES.slice(2)]
        : ETAPES;
  const E_PRESC = accouchement ? 5 : maternite ? 3 : 2;
  // Accouchement : déclaration de naissance (pré-remplie depuis le nouveau-né en arrivant sur l'étape)
  const [naissance, setNaissance] = useState<NaissanceSaisie>(naissanceVide());
  useEffect(() => {
    if (accouchement && etape === 4) setNaissance((n) => preparerNaissance(pn, n));
  }, [accouchement, etape, pn]);
  const E_ISSUE = E_PRESC + 1;

  useEffect(() => {
    let actif = true;
    api
      .formulaire(Number(id))
      .then((f) => {
        if (!actif) return;
        setFiche(f);
        setReferences(f.references ?? []);
        setPn(f.maternite ?? {});
        setNaissance(naissanceVide());
        setV({ ...VALEURS_VIDES, ...f.valeurs, modeSortie: f.valeurs.modeSortie ?? 'sortie' });
        // Déjà renseigné → Oui ; fiche terminée sans le document → Non ; sinon à choisir
        const deja = (present: boolean) => (present ? true : f.lecture ? false : null);
        setPrescrire({ ordonnance: deja(f.valeurs.medicaments.length > 0), examens: deja(f.valeurs.examens.length > 0), arret: deja(!!f.valeurs.arret) });
      })
      .catch((e) => {
        if (!actif) return;
        setErreur(true);
        alerte.echec(`Impossible d'ouvrir la consultation : ${messageErreur(e)}`);
      });
    return () => {
      actif = false;
    };
  }, [id, rechargement]);

  // IMC toujours calculé à partir du poids et de la taille (taille en cm ou en m)
  const imcCalcule = useMemo(() => {
    const p = parseFloat(v.poids ?? '');
    const t = parseFloat(v.taille ?? '');
    return !isNaN(p) && !isNaN(t) && t > 0 ? (p / (t > 3 ? t / 100 : t) ** 2).toFixed(1) : v.imc;
  }, [v.poids, v.taille, v.imc]);

  // Recherche de médicaments (différée)
  useEffect(() => {
    const q = recherche.trim();
    if (q.length < 2) {
      setResultats([]);
      return;
    }
    setChercheEnCours(true);
    const t = setTimeout(() => {
      api
        .medicaments(q)
        .then(setResultats)
        .catch(() => setResultats([]))
        .finally(() => setChercheEnCours(false));
    }, 300);
    return () => clearTimeout(t);
  }, [recherche]);

  const lecture = !!fiche?.lecture;
  const maj = (k: CleTexte) => (val: string | null) => setV((x) => ({ ...x, [k]: val === '' ? null : val }));
  const champ = (k: CleTexte) => ({
    value: (k === 'imc' ? imcCalcule : (v[k] as string | null)) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      // Constantes : séparateur « / » (tension 12/8) ou « . » (37.2, 72.5, 1.05) ajouté automatiquement
      const masque = MASQUES_CONSTANTES[k];
      maj(k)(masque ? masquerConstante(masque, e.target.value, (v[k] as string | null) ?? '') : e.target.value);
    },
  });
  const feminin = (fiche?.patient.genre ?? '').toLowerCase().startsWith('f');

  /** Message bloquant si l'étape 3 n'est pas complète (null = tout est bon) */
  const prescriptionsIncompletes = () => {
    if (DOCUMENTS.some((d) => prescrire[d.id] === null)) return 'Indiquez d’abord pour chaque document (ordonnance, examens, arrêt de travail) s’il faut le prescrire : Oui ou Non.';
    if (prescrire.ordonnance && v.medicaments.length === 0) return 'Ajoutez au moins un médicament à l’ordonnance, ou répondez « Non ».';
    if (prescrire.examens && v.examens.length === 0) return 'Ajoutez au moins un examen au bulletin, ou répondez « Non ».';
    return null;
  };

  /** Oui / Non pour un document ; « Non » efface ce qui avait été saisi */
  const choisirDocument = (doc: DocPrescrit, oui: boolean | null) => {
    setPrescrire((x) => ({ ...x, [doc]: oui }));
    if (oui) {
      if (doc === 'arret') setV((x) => ({ ...x, arret: x.arret ?? { dateDebut: aujourdhui(), dateFin: ajouterJours(aujourdhui(), 3), nbJour: 3 } }));
      return;
    }
    setV((x) => ({ ...x, ...(doc === 'ordonnance' ? { medicaments: [] } : doc === 'examens' ? { examens: [] } : { arret: null }) }));
    if (doc === 'ordonnance') {
      setRecherche('');
      setResultats([]);
    }
  };

  const allerA = (n: number) => {
    if (!lecture && n > etape && etape === 0 && !v.motif.trim()) {
      alerte.attention('Veuillez renseigner le motif de consultation.');
      return;
    }
    if (!lecture && n > E_PRESC && etape >= E_PRESC) {
      const message = prescriptionsIncompletes();
      if (message) {
        setEtape(E_PRESC);
        alerte.attention(message);
        return;
      }
    }
    setEtape(n);
    haut.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /** Ajout d'un médicament de la liste, ou saisi (id null) s'il n'existe pas dans la liste */
  const ajouterMedicament = (m: { id: number | null; nom: string; unite: string | null }) => {
    if (v.medicaments.some((x) => (m.id ? x.drugId === m.id : x.nom.trim().toLowerCase() === m.nom.trim().toLowerCase()))) {
      alerte.attention('Ce médicament est déjà sur l’ordonnance.');
      return;
    }
    setV((x) => ({ ...x, medicaments: [...x.medicaments, { drugId: m.id, nom: m.nom, unite: m.unite, quantite: 1, posologie: null, duree: null, voie: null, conseil: null }] }));
    setRecherche('');
    setResultats([]);
  };
  const majMedicament = (i: number, patch: Partial<MedicamentPrescrit>) => setV((x) => ({ ...x, medicaments: x.medicaments.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));

  const ajouterExamen = (nature: string) => {
    const n = nature.trim();
    if (!n || v.examens.some((e) => e.toLowerCase() === n.toLowerCase())) return;
    setV((x) => ({ ...x, examens: [...x.examens, n] }));
    setExamenSaisi('');
  };

  // Appel d'urgence : les 5 constantes sont exigées par le serveur ; étape où elles se saisissent
  const constantesUrgenceManquantes = () =>
    (
      [
        ['poids', v.poids],
        ['taille', v.taille],
        ['température', v.temperature],
        ['tension artérielle', v.tension],
        ['pouls', v.pouls],
      ] as [string, string | null][]
    )
      .filter(([, val]) => !val?.trim())
      .map(([libelle]) => libelle);
  const constantesEtape = maternite ? 0 : 1;

  // Télé-expertise : « teleexpertise » tant que interne / externe n'est pas choisi, puis refere-interne / refere-externe
  const expertise = v.modeSortie === 'teleexpertise' || v.modeSortie === 'refere-interne' || v.modeSortie === 'refere-externe';
  const issueBase = ISSUES.find((i) => i.id === (expertise ? 'teleexpertise' : v.modeSortie));
  const issueActive = issueBase && expertise && v.modeSortie !== 'teleexpertise' ? { ...issueBase, titre: `Télé-expertise (${v.modeSortie === 'refere-interne' ? 'interne' : 'externe'})` } : issueBase;
  const justificationRequise = v.modeSortie !== 'sortie' && v.modeSortie !== 'hospitalisation';

  const resume = useMemo(
    () => [
      { libelle: 'Motif', valeur: v.motif || '—' },
      prenatal
        ? { libelle: 'Résultat CPN', valeur: pn.resultat_consultation === 'grossesse-risque' ? 'Grossesse à risque' : pn.resultat_consultation === 'grossesse-normale' ? 'Grossesse normale' : 'Non renseigné' }
        : postnatal
          ? { libelle: 'Résultat', valeur: pn.resultat_consultation === 'visite post natale avec complication' ? 'Avec complication' : pn.resultat_consultation ? 'Visite postnatale normale' : 'Non renseigné' }
          : accouchement
            ? {
                libelle: 'Naissance',
                valeur: pn.mort_ne ? `Mort-né (${pn.mort_ne})` : naissance.declarer ? `Déclarée (${naissance.enfants.length || 1} enfant${naissance.enfants.length > 1 ? 's' : ''})` : naissance.declarer === false ? 'Non déclarée' : 'À préciser',
              }
          : { libelle: 'Diagnostic', valeur: v.diagnostic || 'Non renseigné' },
      { libelle: 'Ordonnance', valeur: v.medicaments.length ? `${v.medicaments.length} médicament(s)` : 'Aucune' },
      { libelle: 'Examens', valeur: v.examens.length ? v.examens.join(', ') : 'Aucun' },
      { libelle: 'Arrêt de travail', valeur: v.arret ? `${v.arret.nbJour} jour(s)` : 'Non' },
    ],
    [v, prenatal, postnatal, accouchement, pn, naissance],
  );

  /** Vérifie le formulaire puis demande confirmation */
  const demanderFin = () => {
    if (!v.motif.trim()) {
      setEtape(0);
      alerte.attention('Veuillez renseigner le motif de consultation.');
      return;
    }
    // Envoyer au médecin : la consultation n'est pas terminée, pas de contrôle des autres étapes
    if (v.modeSortie === 'envoi-medecin') {
      setChoixMedecin(true);
      return;
    }
    if (!v.modeSortie) {
      alerte.attention("Veuillez choisir l'issue de la consultation.");
      return;
    }
    if (accouchement && !fiche?.naissance && !pn.mort_ne) {
      const n = preparerNaissance(pn, naissance);
      if (infirmier && n.declarer) {
        setNaissance(n);
        setEtape(4);
        alerte.attention('La déclaration de naissance doit être faite par un médecin ou une sage-femme : répondez « Non ».');
        return;
      }
      if (n.declarer === null) {
        setNaissance(n);
        setEtape(4);
        alerte.attention('Indiquez si la naissance est déclarée maintenant (certificat de naissance).');
        return;
      }
      if (n.declarer) {
        const manque = !n.date ? 'la date de naissance' : !n.lieu ? 'le lieu de naissance' : n.enfants.some((e) => !e.genre) ? 'le sexe de chaque enfant' : n.enfants.some((e) => !e.heure) ? 'l’heure de naissance de chaque enfant' : null;
        if (manque) {
          setNaissance(n);
          setEtape(4);
          alerte.attention(`Déclaration de naissance : indiquez ${manque}.`);
          return;
        }
      }
    }
    const incomplet = prescriptionsIncompletes();
    if (incomplet) {
      setEtape(E_PRESC);
      alerte.attention(incomplet);
      return;
    }
    if (v.modeSortie === 'hospitalisation' && hosp.protocole.length === 0) {
      setEtape(E_ISSUE);
      alerte.attention("Ajoutez au moins un produit au protocole thérapeutique avant d'hospitaliser le patient.");
      return;
    }
    if (v.modeSortie === 'hospitalisation' && hosp.operationActive && !hosp.dateOperation) {
      setEtape(E_ISSUE);
      alerte.attention("Indiquez la date de l'opération prévue.");
      return;
    }
    if (v.modeSortie === 'teleexpertise') {
      setEtape(E_ISSUE);
      alerte.attention('Télé-expertise : précisez si elle est en interne ou en externe.');
      return;
    }
    if (expertise && pieces.length === 0) {
      setEtape(E_ISSUE);
      alerte.attention('Télé-expertise : ajoutez au moins un document à partager.');
      return;
    }
    if (v.modeSortie === 'refere-externe' && !serviceExterne) {
      setEtape(E_ISSUE);
      alerte.attention('Télé-expertise en externe : choisissez le service auquel vous l’adressez.');
      return;
    }
    if (expertise && momentReference.urgente === null) {
      setEtape(E_ISSUE);
      alerte.attention('Télé-expertise : choisissez le type de demande (urgente ou programmée).');
      return;
    }
    if (expertise && !momentReferenceValide(momentReference)) {
      setEtape(E_ISSUE);
      alerte.attention('Télé-expertise programmée : choisissez une date et une heure à venir, dans les 48 heures.');
      return;
    }
    if (v.modeSortie === 'refere-interne' && !medecinReference) {
      setEtape(E_ISSUE);
      alerte.attention('Choisissez d’abord le médecin à qui vous référez le patient.');
      return;
    }
    if (v.modeSortie === 'teleconsultation' && (!momentTelemedecineValide(tele) || !tele.medecinId)) {
      setEtape(E_ISSUE);
      alerte.attention(!momentTelemedecineValide(tele) ? 'Choisissez une date et une heure de téléconsultation à venir.' : 'Choisissez le médecin de la téléconsultation.');
      return;
    }
    if (v.modeSortie === 'urgence') {
      const manque = constantesUrgenceManquantes();
      if (manque.length) {
        setEtape(constantesEtape);
        alerte.attention(`Renseignez toutes les constantes avant l’appel d’urgence (manque : ${manque.join(', ')}).`);
        return;
      }
    }
    if (justificationRequise && !v.justification?.trim()) {
      alerte.attention("Veuillez justifier l'issue de la consultation.");
      return;
    }
    setFournirResultat(null);
    setConfirmation(true);
  };

  const terminer = async () => {
    if (!fiche) return;
    const { medicaments, examens, arret, ...textes } = v;
    const payload: Record<string, unknown> = {};
    for (const [k, val] of Object.entries({ ...textes, imc: imcCalcule })) if (val !== null && val !== '') payload[k] = val;
    payload.medicaments = medicaments.map((m) => ({
      ...(m.drugId ? { drugId: m.drugId } : { nom: m.nom, ...(m.unite ? { unite: m.unite } : {}) }),
      quantite: m.quantite || 1,
      ...(m.posologie ? { posologie: m.posologie } : {}),
      ...(m.duree ? { duree: m.duree } : {}),
      ...(m.voie ? { voie: m.voie } : {}),
      ...(m.conseil ? { conseil: m.conseil } : {}),
    }));
    payload.examens = examens;
    if (arret?.dateDebut && arret.dateFin) payload.arret = { dateDebut: arret.dateDebut, dateFin: arret.dateFin, nbJour: arret.nbJour };
    if (v.modeSortie === 'refere-interne' && medecinReference) {
      payload.medecinReferenceId = medecinReference;
      Object.assign(payload, momentPayload(momentReference));
    }
    if (v.modeSortie === 'refere-externe' && serviceExterne) {
      payload.referenceServiceId = serviceExterne;
      Object.assign(payload, momentPayload(momentReference));
    }
    if (v.modeSortie === 'teleconsultation') Object.assign(payload, { teleMedecinId: tele.medecinId, teleDate: tele.date, teleHeure: tele.heure });
    if (maternite) payload.maternite = pn;
    if (accouchement && !fiche.naissance && naissance.declarer && !pn.mort_ne) {
      payload.naissance = {
        date: naissance.date,
        lieu: naissance.lieu,
        ...(naissance.observations.trim() ? { observations: naissance.observations.trim() } : {}),
        enfants: naissance.enfants.map((e) => ({ genre: e.genre, heure: e.heure, etat: e.etat, ...(e.prenom.trim() ? { prenom: e.prenom.trim() } : {}) })),
      };
      payload.maternite = { ...pn, fiche_renseignee: 'Oui', fiche_rens_complet: 'Oui' };
    }
    if (v.modeSortie === 'hospitalisation') {
      const nonVide = (x: string | null | undefined) => (x && x.trim() ? x.trim() : undefined);
      payload.hospitalisation = {
        diagnostic: nonVide(hosp.diagnostic),
        analyseMedical: nonVide(hosp.analyseMedical),
        sonde: hosp.sonde ?? undefined,
        oxygenotherapie: hosp.oxygenotherapie ?? undefined,
        volume: nonVide(hosp.volume),
        regime: hosp.regimeActif ? nonVide(hosp.regime) : undefined,
        dateOperation: hosp.operationActive ? nonVide(hosp.dateOperation) : undefined,
        bedId: hosp.bedId ?? undefined,
        infirmierId: hosp.infirmierId ?? undefined,
        protocole: hosp.protocole.map((l) => ({
          nom: l.nom,
          unite: l.unite,
          quantite: l.quantite,
          posologie: nonVide(l.posologie),
          voie: nonVide(l.voie),
          heures: l.heures,
        })),
      };
    }

    setEnvoi(true);
    try {
      const res = await api.enregistrer(fiche.consultation.id, payload as never);
      garde.liberer();
      alerte.succes(res.message);
      // Appel d'urgence : l'appel vidéo s'ouvre, puis la fiche de l'urgence (rejoindre / relancer l'appel)
      if (res.appel && res.consultationSuivante) {
        ouvrirAppelVideo(res.appel);
        navigate(`/infirmier/consultations/formulaire/${res.consultationSuivante}`);
        return;
      }
      // Accouchement avec déclaration : le certificat de naissance s'ouvre, prêt à imprimer
      if (res.declarationNaissance) {
        navigate(`/medecin/declarations/naissances/${res.declarationNaissance.id}?imprimer=1`);
        return;
      }
      // Télé-expertise reçue, résultat à fournir : page dédiée pour joindre le résultat et les consignes au requérant
      if (fiche.expertiseRecue && !fiche.expertiseRecue.resultatEnvoye && fournirResultat) {
        alerte.succes('Consultation terminée. Joignez maintenant le résultat, avec vos consignes au requérant.');
        navigate(`/medecin/referes/${fiche.expertiseRecue.origineId}/resultat`);
        return;
      }
      const reference = v.modeSortie === 'refere-interne' || v.modeSortie === 'refere-externe';
      if (reference && pieces.length) {
        try {
          const r = await envoyerPieces(api, fiche.consultation.id, pieces);
          alerte.succes(`Consultation enregistrée. ${r.message}`);
          setPieces([]);
        } catch (err) {
          alerte.echec(`La consultation est enregistrée, mais les documents n’ont pas pu être joints : ${messageErreur(err)}. Vous pouvez les ajouter depuis la fiche.`);
        }
      }
      if (reference || v.medicaments.length || v.examens.length || v.arret) {
        // Des documents ont été prescrits : la fiche se recharge en lecture avec les boutons de téléchargement
        setEtape(0);
        setRechargement((x) => x + 1);
        haut.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        navigate(infirmier ? '/infirmier/consultations/historique' : v.modeSortie === 'hospitalisation' ? '/medecin/hospitalisation/en-attente' : '/medecin/consultations/nouvelles');
      }
    } catch (e) {
      alerte.echec(`Enregistrement impossible : ${messageErreur(e)}`);
    } finally {
      setEnvoi(false);
      setConfirmation(false);
    }
  };

  // Garde de sortie : consultation neuve (« Consulter »), pas encore terminée ni envoyée au médecin
  // (l'issue « Sortie » est présélectionnée : seule la fin réelle de la consultation lève la garde)
  const gardeActive = annulable && !!fiche && !fiche.lecture && !envoi;
  const gardeSortie = useGardeSortie(gardeActive);
  const garde = { ...gardeSortie, actif: gardeActive };

  const entete = (
    <header className={c.entete}>
      <div>
        <p className={c.surtitre}>Consultations · {lecture ? 'Fiche' : 'Consultation en cours'}</p>
        <h1 className={c.titre}>{prenatal ? 'Consultation prénatale (CPN)' : postnatal ? 'Consultation postnatale' : accouchement ? 'Accouchement' : 'Consultation curative'}</h1>
      </div>
      <button type="button" className={c.secondaire} onClick={() => (garde.actif ? garde.demanderSortie() : navigate(-1))}>
        <FaArrowLeft aria-hidden="true" /> Retour
      </button>
    </header>
  );

  if (!fiche) {
    return (
      <div className={c.page}>
        {entete}
        <section className={c.bloc}>
          <p className={c.vide}>{erreur ? 'Consultation introuvable.' : 'Chargement de la consultation…'}</p>
        </section>
      </div>
    );
  }

  const { patient, consultation } = fiche;
  const constantes: { k: CleTexte; libelle: string; unite: string; auto?: boolean }[] = [
    { k: 'tension', libelle: 'Tension artérielle', unite: 'mmHg' },
    { k: 'temperature', libelle: 'Température', unite: '°C' },
    { k: 'pouls', libelle: 'Pouls', unite: 'bpm' },
    { k: 'saturation', libelle: 'Saturation O₂', unite: '%' },
    { k: 'poids', libelle: 'Poids', unite: 'kg' },
    { k: 'taille', libelle: 'Taille', unite: 'cm' },
    { k: 'imc', libelle: 'IMC (calculé)', unite: 'kg/m²', auto: true },
    { k: 'frequenceRespiratoire', libelle: 'Fréq. respiratoire', unite: 'c/min' },
    { k: 'glycemieAJeun', libelle: 'Glycémie à jeun', unite: 'g/l' },
    { k: 'glycemieNonAJeun', libelle: 'Glycémie non à jeun', unite: 'g/l' },
    { k: 'perimetreBrachial', libelle: 'Périmètre brachial', unite: 'cm' },
    { k: 'perimetreCranien', libelle: 'Périmètre crânien', unite: 'cm' },
  ];

  return (
    <div className={c.page} ref={haut}>
      {entete}

      {lecture && (
        <p className={s.bandeauLecture}>
          <FaCheck aria-hidden="true" /> Consultation terminée : cette fiche est en consultation seule.
          {consultation.hospitalisation && ` Hospitalisation ${consultation.hospitalisation.code}.`}
          {fiche.naissance && (
            <Link to={`/medecin/declarations/naissances/${fiche.naissance.id}?imprimer=1`} className={s.lienCertificat}>
              Certificat de naissance {fiche.naissance.reference}
            </Link>
          )}
        </p>
      )}

      <div className={s.grille}>
        <div className={s.principal}>
          {/* --- Étapes --- */}
          <nav className={`${c.bloc} ${s.etapes} ${accouchement ? s.etapesSept : maternite ? s.etapesCinq : ''}`} aria-label="Étapes de la consultation">
            {etapes.map((e, i) => (
              <button key={e.titre} type="button" className={`${s.etape} ${i === etape ? s.etapeActive : ''} ${i < etape ? s.etapeFaite : ''}`} onClick={() => allerA(i)} aria-current={i === etape ? 'step' : undefined}>
                <span className={s.etapeNumero}>{i < etape ? <FaCheck aria-hidden="true" /> : i + 1}</span>
                <span>
                  <strong>{e.titre}</strong>
                  <small>{e.detail}</small>
                </span>
              </button>
            ))}
          </nav>

          <fieldset className={s.verrou} disabled={lecture}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.section key={etape} className={c.bloc} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                {/* ================= 1. ANAMNÈSE ================= */}
                {prenatal && etape < E_PRESC && <FormulairePrenatal partie={etape} v={pn} onChange={majPn} reprise={fiche.materniteReprise} />}
                {postnatal && etape < E_PRESC && (
                  <FormulairePostnatal
                    partie={etape}
                    v={pn}
                    onChange={majPn}
                    reprise={fiche.materniteReprise}
                    constantes={v as unknown as Record<string, string | null>}
                    onConstante={(k, val) => setV((x) => ({ ...x, [k]: val }))}
                  />
                )}
                {accouchement && etape < E_PRESC && (
                  <FormulaireAccouchement
                    partie={etape}
                    v={pn}
                    onChange={majPn}
                    reprise={fiche.materniteReprise}
                    naissance={naissance}
                    onNaissance={setNaissance}
                    mere={patient.nom}
                    declaration={fiche.naissance}
                  />
                )}
                {!maternite && etape === 0 && (
                  <div className={s.sections}>
                    <div className={s.titreEtape}>
                      <FaClipboardList aria-hidden="true" />
                      <div>
                        <h2>Anamnèse</h2>
                        <p>Motif de la visite et antécédents du patient.</p>
                      </div>
                    </div>

                    <label className={s.champ}>
                      <span>
                        Motif de consultation <em>*</em>
                      </span>
                      <textarea rows={3} placeholder="Plaintes du patient, depuis quand…" {...champ('motif')} />
                    </label>

                    <div>
                      <h3 className={s.sousTitre}>Antécédents médicaux</h3>
                      <div className={s.grilleChoix}>
                        {(
                          [
                            ['hta', 'HTA'],
                            ['alcool', 'Alcool'],
                            ['tabac', 'Tabac'],
                            ['drepanocytaire', 'Drépanocytaire'],
                            ['traitementMedicamenteux', 'Traitement en cours'],
                            ['antecedentMedical', 'Autres antécédents'],
                          ] as [CleTexte, string][]
                        ).map(([k, l]) => (
                          <div key={k} className={s.ligneChoix}>
                            <span>{l}</span>
                            <Choix nom={l} valeur={v[k] as string | null} options={['Oui', 'Non']} onChange={maj(k)} />
                          </div>
                        ))}
                      </div>
                      <div className={s.deuxColonnes}>
                        {v.traitementMedicamenteux === 'Oui' && (
                          <label className={s.champ}>
                            <span>Traitements antérieurs / en cours</span>
                            <textarea rows={2} {...champ('traitementAnterieur')} />
                          </label>
                        )}
                        {v.antecedentMedical === 'Oui' && (
                          <label className={s.champ}>
                            <span>Précisez les antécédents médicaux</span>
                            <textarea rows={2} {...champ('autreAntecedentMedical')} />
                          </label>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className={s.sousTitre}>Antécédents chirurgicaux</h3>
                      <div className={s.ligneChoix}>
                        <span>Opération déjà subie ?</span>
                        <Choix nom="Opération" valeur={v.antecedentChirurgical} options={['Oui', 'Non']} onChange={maj('antecedentChirurgical')} />
                      </div>
                      {v.antecedentChirurgical === 'Oui' && (
                        <div className={s.deuxColonnes}>
                          <label className={s.champ}>
                            <span>Opération effectuée</span>
                            <select {...champ('nomOperation')}>
                              <option value="">— Sélectionner —</option>
                              {OPERATIONS.map((o) => (
                                <option key={o}>{o}</option>
                              ))}
                              {v.nomOperation && !OPERATIONS.includes(v.nomOperation) && <option>{v.nomOperation}</option>}
                            </select>
                          </label>
                          <label className={s.champ}>
                            <span>Autres antécédents chirurgicaux</span>
                            <input {...champ('autreAntecedentChirurgical')} />
                          </label>
                        </div>
                      )}
                    </div>

                    {feminin && (
                      <div>
                        <h3 className={s.sousTitre}>Grossesse</h3>
                        <div className={s.ligneChoix}>
                          <span>Grossesse en cours ?</span>
                          <Choix nom="Grossesse" valeur={v.grossesse} options={['Oui', 'Non']} onChange={maj('grossesse')} />
                        </div>
                        {v.grossesse === 'Oui' && (
                          <div className={s.deuxColonnes}>
                            <label className={s.champ}>
                              <span>Date des dernières règles (DDR)</span>
                              <input type="date" {...champ('ddr')} />
                            </label>
                            <label className={s.champ}>
                              <span>Description</span>
                              <input placeholder="Terme, suivi…" {...champ('descriptionGrossesse')} />
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ================= 2. EXAMEN CLINIQUE ================= */}
                {!maternite && etape === 1 && (
                  <div className={s.sections}>
                    <div className={s.titreEtape}>
                      <FaStethoscope aria-hidden="true" />
                      <div>
                        <h2>Examen clinique</h2>
                        <p>Les constantes prises par l’infirmier sont déjà reportées ; complétez si besoin.</p>
                      </div>
                    </div>

                    <div className={s.constantes}>
                      {constantes.map((k) => {
                        // État de la constante (Normal(e), Fièvre, Élevée…) ; l'IMC est celui calculé
                        const repere = REPERES[k.k]?.(k.k === 'imc' ? imcCalcule : (v[k.k] as string | null));
                        return (
                          <label key={k.k} className={`${s.constante} ${v[k.k] ? s.constanteRemplie : ''}`}>
                            <small>{k.libelle}</small>
                            <span>
                              <input inputMode={k.k === 'tension' ? 'text' : 'decimal'} readOnly={k.auto} placeholder="—" {...champ(k.k)} />
                              <em>{k.unite}</em>
                            </span>
                            {REPERES[k.k] && (
                              <span className={s.repere}>
                                {repere ? <span className={`${s.repereBadge} ${s[`repere_${repere.ton}`]}`}>{repere.libelle}</span> : <span className={s.repereVide}>—</span>}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    <p className={s.note}>Les états (normale, fièvre, élevée…) sont des repères indicatifs, pour un adulte.</p>

                    <div className={s.deuxColonnes}>
                      <label className={s.champ}>
                        <span>Examen physique</span>
                        <textarea rows={4} placeholder="Observations à l’examen…" {...champ('examenPhysique')} />
                      </label>
                      <label className={s.champ}>
                        <span>Diagnostic retenu</span>
                        <textarea rows={4} placeholder="Diagnostic principal…" {...champ('diagnostic')} />
                      </label>
                    </div>
                    <label className={s.champ}>
                      <span>Autres pathologies associées</span>
                      <input {...champ('autresPathologies')} />
                    </label>

                    <div>
                      <h3 className={s.sousTitre}>Examens complémentaires & dépistages</h3>
                      <div className={s.grilleChoix}>
                        <div className={s.ligneChoix}>
                          <span>TDR paludisme</span>
                          <Choix nom="TDR paludisme" valeur={v.tdrPaludisme} options={['Positif', 'Négatif', 'Non réalisé']} onChange={maj('tdrPaludisme')} />
                        </div>
                        <div className={s.ligneChoix}>
                          <span>Goutte épaisse</span>
                          <Choix nom="Goutte épaisse" valeur={v.goutteEpaisse} options={['Positive', 'Négative', 'Non réalisé']} onChange={maj('goutteEpaisse')} />
                        </div>
                        <div className={s.ligneChoix}>
                          <span>Recherche de tuberculose</span>
                          <Choix nom="Tuberculose" valeur={v.tuberculose} options={['Oui', 'Non', 'NA']} onChange={maj('tuberculose')} />
                        </div>
                        <div className={s.ligneChoix}>
                          <span>CDIP proposé</span>
                          <Choix nom="CDIP proposé" valeur={v.cdipPropose} options={['Oui', 'Non', 'NA']} onChange={maj('cdipPropose')} />
                        </div>
                        <div className={s.ligneChoix}>
                          <span>CDIP réalisé</span>
                          <Choix nom="CDIP réalisé" valeur={v.cdipRealise} options={['Oui', 'Non', 'NA']} onChange={maj('cdipRealise')} />
                        </div>
                        <div className={s.ligneChoix}>
                          <span>MILDA (12–59 mois) éligible</span>
                          <Choix nom="MILDA éligible" valeur={v.mildaEligible} options={['Oui', 'Non', 'NA']} onChange={maj('mildaEligible')} />
                        </div>
                        <div className={s.ligneChoix}>
                          <span>MILDA remise</span>
                          <Choix nom="MILDA remise" valeur={v.mildaRemise} options={['Oui', 'Non', 'NA']} onChange={maj('mildaRemise')} />
                        </div>
                        <label className={`${s.ligneChoix} ${s.ligneSaisie}`}>
                          <span>Code dépistage client</span>
                          <input {...champ('codeDepistage')} />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* ================= 3. PRESCRIPTIONS ================= */}
                {etape === E_PRESC && (
                  <div className={s.sections}>
                    <div className={s.titreEtape}>
                      <FaPills aria-hidden="true" />
                      <div>
                        <h2>Prescriptions</h2>
                        <p>Indiquez d’abord, pour chaque document, s’il faut le prescrire.</p>
                      </div>
                    </div>

                    {/* Les trois questions, sur la même ligne */}
                    <div className={s.questionsDocs}>
                      {DOCUMENTS.map((d) => (
                        <div key={d.id} className={`${s.questionDoc} ${prescrire[d.id] ? s.questionOui : ''} ${prescrire[d.id] === null ? s.questionAttente : ''}`}>
                          <span className={s.questionTitre}>
                            <span className={s.questionIcone}>
                              <d.icone aria-hidden="true" />
                            </span>
                            <span>
                              <strong>{d.titre}</strong>
                              <small>{d.detail}</small>
                            </span>
                          </span>
                          <span className={s.questionChoix}>
                            <small>Prescrire ?</small>
                            <Choix
                              nom={`Prescrire : ${d.titre}`}
                              valeur={prescrire[d.id] === null ? null : prescrire[d.id] ? 'Oui' : 'Non'}
                              options={['Oui', 'Non']}
                              onChange={(o) => choisirDocument(d.id, o === null ? null : o === 'Oui')}
                            />
                          </span>
                        </div>
                      ))}
                    </div>

                    {DOCUMENTS.every((d) => prescrire[d.id] === false) && <p className={s.note}>Aucun document prescrit pour cette consultation.</p>}

                    {/* Ordonnance */}
                    {prescrire.ordonnance && (
                      <div>
                        <h3 className={s.sousTitre}>
                          <FaPills aria-hidden="true" /> Ordonnance
                        </h3>
                        {!lecture && (
                          <div className={s.rechercheMedicament}>
                            <label className={s.recherche}>
                              <FaSearch aria-hidden="true" />
                              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un médicament (2 lettres minimum)…" aria-label="Rechercher un médicament" />
                              {chercheEnCours && <small>…</small>}
                            </label>
                            {recherche.trim().length >= 2 && !chercheEnCours && (
                              <ul className={s.resultats}>
                                {resultats.map((r) => (
                                  <li key={r.id}>
                                    <button type="button" onClick={() => ajouterMedicament(r)}>
                                      <span>{r.nom}</span>
                                      {r.unite && <small>{r.unite}</small>}
                                      <FaPlus aria-hidden="true" />
                                    </button>
                                  </li>
                                ))}
                                {/* Médicament absent de la liste : on l'ajoute tel que saisi */}
                                {!resultats.some((r) => r.nom.trim().toLowerCase() === recherche.trim().toLowerCase()) && (
                                  <li>
                                    <button type="button" className={s.saisieLibre} onClick={() => ajouterMedicament({ id: null, nom: recherche.trim(), unite: null })}>
                                      <FaPlus aria-hidden="true" />
                                      <span>
                                        Ajouter « <strong>{recherche.trim()}</strong> »
                                      </span>
                                      <small>{resultats.length ? 'absent de la liste' : 'aucun résultat dans la liste'}</small>
                                    </button>
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        )}
                        {v.medicaments.length === 0 ? (
                          <p className={s.note}>Aucun médicament prescrit.</p>
                        ) : (
                          <ul className={s.medicaments}>
                            {v.medicaments.map((m, i) => (
                              <li key={`${m.drugId ?? 'saisi'}-${m.nom}`}>
                                <div className={s.medicamentNom}>
                                  <strong>{m.nom}</strong>
                                  {!lecture && (
                                    <button type="button" className={s.retirer} onClick={() => setV((x) => ({ ...x, medicaments: x.medicaments.filter((_, j) => j !== i) }))} aria-label={`Retirer ${m.nom}`}>
                                      <FaTimes />
                                    </button>
                                  )}
                                </div>
                                <div className={s.medicamentChamps}>
                                  <label>
                                    <small>Posologie</small>
                                    <input value={m.posologie ?? ''} onChange={(e) => majMedicament(i, { posologie: e.target.value || null })} placeholder="1 cp × 3 / jour" />
                                  </label>
                                  <label>
                                    <small>Quantité</small>
                                    <input type="number" min={1} value={m.quantite} onChange={(e) => majMedicament(i, { quantite: Math.max(1, Number(e.target.value) || 1) })} />
                                  </label>
                                  <label>
                                    <small>Durée</small>
                                    <input value={m.duree ?? ''} onChange={(e) => majMedicament(i, { duree: e.target.value || null })} placeholder="5 jours" />
                                  </label>
                                  <label>
                                    <small>Voie</small>
                                    <select value={m.voie ?? ''} onChange={(e) => majMedicament(i, { voie: e.target.value || null })}>
                                      <option value="">—</option>
                                      {['Orale', 'Injectable (IV)', 'Injectable (IM)', 'Cutanée', 'Rectale', 'Inhalée', 'Oculaire'].map((o) => (
                                        <option key={o}>{o}</option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Examens */}
                    {prescrire.examens && (
                      <div>
                        <h3 className={s.sousTitre}>
                          <FaFlask aria-hidden="true" /> Bulletin d’examens
                        </h3>
                        {!lecture && (
                          <>
                            <div className={s.ajoutExamen}>
                              <input
                                value={examenSaisi}
                                onChange={(e) => setExamenSaisi(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    ajouterExamen(examenSaisi);
                                  }
                                }}
                                placeholder="Nature de l’examen…"
                                aria-label="Nature de l'examen"
                              />
                              <button type="button" className={c.secondaire} onClick={() => ajouterExamen(examenSaisi)}>
                                <FaPlus aria-hidden="true" /> Ajouter
                              </button>
                            </div>
                            <div className={s.suggestions}>
                              {EXAMENS_COURANTS.filter((e) => !v.examens.includes(e)).map((e) => (
                                <button key={e} type="button" onClick={() => ajouterExamen(e)}>
                                  + {e}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        {v.examens.length === 0 ? (
                          <p className={s.note}>Aucun examen demandé.</p>
                        ) : (
                          <div className={s.puces}>
                            {v.examens.map((e) => (
                              <span key={e} className={s.puce}>
                                {e}
                                {!lecture && (
                                  <button type="button" onClick={() => setV((x) => ({ ...x, examens: x.examens.filter((y) => y !== e) }))} aria-label={`Retirer ${e}`}>
                                    <FaTimes />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Arrêt de travail */}
                    {prescrire.arret && v.arret && (
                      <div>
                        <h3 className={s.sousTitre}>
                          <FaNotesMedical aria-hidden="true" /> Arrêt de travail
                        </h3>
                        {v.arret && (
                          <div className={s.troisColonnes}>
                            <label className={s.champ}>
                              <span>Début</span>
                              <input
                                type="date"
                                value={v.arret.dateDebut ?? ''}
                                onChange={(e) => setV((x) => ({ ...x, arret: { ...x.arret!, dateDebut: e.target.value, dateFin: ajouterJours(e.target.value, x.arret!.nbJour) } }))}
                              />
                            </label>
                            <label className={s.champ}>
                              <span>Nombre de jours</span>
                              <input
                                type="number"
                                min={1}
                                value={v.arret.nbJour}
                                onChange={(e) => {
                                  const n = Math.max(1, Number(e.target.value) || 1);
                                  setV((x) => ({ ...x, arret: { ...x.arret!, nbJour: n, dateFin: ajouterJours(x.arret!.dateDebut ?? aujourdhui(), n) } }));
                                }}
                              />
                            </label>
                            <label className={s.champ}>
                              <span>Fin (calculée)</span>
                              <input type="date" value={v.arret.dateFin ?? ''} readOnly />
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ================= 4. ISSUE ================= */}
                {etape === E_ISSUE && (
                  <div className={s.sections}>
                    <div className={s.titreEtape}>
                      <FaDoorOpen aria-hidden="true" />
                      <div>
                        <h2>Issue de la consultation</h2>
                        <p>Que devient le patient à la fin de la consultation ?</p>
                      </div>
                    </div>

                    <div className={s.issues} role="radiogroup" aria-label="Issue de la consultation">
                      {/* « Hospitalisation » retirée des issues (médecin comme infirmier·ère) ; appel d'urgence réservé à l'infirmier·ère */}
                      {/* Fiche en lecture : l'issue choisie reste toujours visible (ex. anciennes consultations avec hospitalisation) */}
                      {ISSUES.filter((i) => (lecture && v.modeSortie === i.id) || (i.id !== 'hospitalisation' && (infirmier || (i.id !== 'urgence' && i.id !== 'envoi-medecin')))).map((i) => {
                        const actif = i.id === 'teleexpertise' ? expertise : v.modeSortie === i.id;
                        return (
                          <button
                            key={i.id}
                            type="button"
                            role="radio"
                            aria-checked={actif}
                            className={`${s.issue} ${s[`ton_${i.ton}`]} ${actif ? s.issueActive : ''}`}
                            // Télé-expertise déjà choisie : on garde interne / externe
                            onClick={() => setV((x) => (i.id === 'teleexpertise' && expertise ? x : { ...x, modeSortie: i.id }))}
                          >
                            <span className={s.issueTitre}>
                              <span className={s.issueIcone}>
                                <i.icone aria-hidden="true" />
                              </span>
                              <strong>{i.titre}</strong>
                            </span>
                            <small>{i.detail}</small>
                            {actif && (
                              <span className={s.coche}>
                                <FaCheck />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Fiche terminée : détails de l'issue choisie */}
                    {lecture && fiche.suite && <SuiteDonnee suite={fiche.suite} consultationId={Number(id)} />}

                    {v.modeSortie === 'teleconsultation' && !lecture && <IssueTelemedecine valeur={tele} onChange={setTele} />}

                    {v.modeSortie === 'urgence' && !lecture && (
                      <p className={s.alerteUrgence}>
                        <FaPhoneVolume aria-hidden="true" />
                        <span>
                          L’appel vidéo sonne chez les médecins du même service et chez les médecins généralistes de tous les hôpitaux de la DMHP : le premier qui décroche prend le patient.
                          {constantesUrgenceManquantes().length > 0 && ` Constantes à renseigner d’abord : ${constantesUrgenceManquantes().join(', ')}.`}
                        </span>
                      </p>
                    )}

                    {v.modeSortie === 'hospitalisation' && !lecture && <IssueHospitalisation valeur={hosp.diagnostic || !v.diagnostic ? hosp : { ...hosp, diagnostic: v.diagnostic }} onChange={setHosp} />}

                    {/* Télé-expertise : en interne (médecin de l'hôpital) ou en externe (autre établissement), documents partagés */}
                    {expertise && !lecture && (
                      <>
                        {/* Télé-expertise (interne / externe) et type de demande (urgente / programmée) sur la même ligne */}
                        <div className={s.ligneChoixDouble}>
                        <div className={s.ligneChoix}>
                          <span className={s.sousTitre}>
                            Télé-expertise <em className={s.requis}>*</em>
                          </span>
                          <Choix
                            nom="Télé-expertise en interne ou en externe"
                            valeur={v.modeSortie === 'refere-interne' ? 'En interne' : v.modeSortie === 'refere-externe' ? 'En externe' : null}
                            options={['En interne', 'En externe']}
                            onChange={(x) => setV((y) => ({ ...y, modeSortie: x === 'En interne' ? 'refere-interne' : x === 'En externe' ? 'refere-externe' : 'teleexpertise' }))}
                          />
                        </div>
                        {/* Délai de réponse (tableaux cliniques de télémédecine) : urgente < 30 min, programmée 24 à 48 h */}
                        <div className={s.ligneChoix}>
                          <span className={s.sousTitre}>
                            Type de demande <em className={s.requis}>*</em>
                          </span>
                          <Choix
                            nom="Type de télé-expertise"
                            valeur={momentReference.urgente === true ? URGENTE : momentReference.urgente === false ? PROGRAMMEE : null}
                            options={[URGENTE, PROGRAMMEE]}
                            onChange={(x) => setMomentReference((m) => ({ ...m, urgente: x === URGENTE ? true : x === PROGRAMMEE ? false : null }))}
                          />
                        </div>
                        </div>
                        <p className={s.note}>
                          {v.modeSortie === 'refere-interne'
                            ? 'En interne : un médecin de l’hôpital donne son avis à partir des documents partagés.'
                            : v.modeSortie === 'refere-externe'
                              ? 'En externe : un médecin d’un autre établissement de la DMHP donne son avis à partir des documents partagés.'
                              : 'Précisez si l’avis est demandé en interne (médecin de l’hôpital) ou en externe (autre établissement).'}
                        </p>
                        {v.modeSortie !== 'teleexpertise' && (
                          <>
                            {v.modeSortie === 'refere-interne' ? (
                              <ChoixMedecinReference
                                valeur={medecinReference}
                                onChange={setMedecinReference}
                                moment={momentReference}
                                onMoment={setMomentReference}
                                documents={<PiecesAJoindre compact pieces={pieces} onChange={setPieces} />}
                              />
                            ) : (
                              <ChoixServiceExterne valeur={serviceExterne} onChange={setServiceExterne} moment={momentReference} onMoment={setMomentReference} documents={<PiecesAJoindre compact pieces={pieces} onChange={setPieces} />} />
                            )}
                          </>
                        )}
                      </>
                    )}

                    <label className={s.champ}>
                      <span>Justification / résumé de l’issue {justificationRequise && <em>*</em>}</span>
                      <textarea
                        rows={3}
                        placeholder={
                          v.modeSortie === 'hospitalisation' ? 'Motif de l’hospitalisation, consignes…' : v.modeSortie === 'sortie' ? 'Conseils donnés au patient (facultatif)…' : 'Précisez le motif et la destination…'
                        }
                        {...champ('justification')}
                      />
                    </label>

                    <dl className={s.recap}>
                      {resume.map((r) => (
                        <div key={r.libelle}>
                          <dt>{r.libelle}</dt>
                          <dd>{r.valeur}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </motion.section>
            </AnimatePresence>
          </fieldset>

          {/* --- Navigation --- */}
          <footer className={s.navigation}>
            <button type="button" className={c.secondaire} onClick={() => allerA(etape - 1)} disabled={etape === 0}>
              <FaArrowLeft aria-hidden="true" /> Précédent
            </button>
            <span className={s.progression}>
              Étape {etape + 1} sur {etapes.length}
            </span>
            {etape < etapes.length - 1 ? (
              <button type="button" className={c.principal} onClick={() => allerA(etape + 1)}>
                Suivant <FaArrowRight aria-hidden="true" />
              </button>
            ) : lecture ? (
              <button type="button" className={c.secondaire} onClick={() => navigate(-1)}>
                Retour
              </button>
            ) : (
              <button type="button" className={c.principal} onClick={demanderFin} disabled={envoi}>
                {v.modeSortie === 'envoi-medecin' ? <FaPaperPlane aria-hidden="true" /> : <FaSave aria-hidden="true" />}{' '}
                {envoi ? 'Enregistrement…' : v.modeSortie === 'envoi-medecin' ? 'Envoyer au médecin' : 'Terminer la consultation'}
              </button>
            )}
          </footer>
        </div>

        {/* ================= FICHE PATIENT ================= */}
        <aside className={`${c.bloc} ${s.fiche}`} aria-label="Fiche du patient">
          <div className={s.ficheHaut}>
            <AvatarPatient patient={patient} />
            <div>
              <strong>{patient.nom}</strong>
              <small>
                {feminin ? 'Féminin' : patient.genre ? 'Masculin' : '—'} · {age(patient.dateNaissance) ?? 'Âge inconnu'}
              </small>
              <code>{patient.code}</code>
            </div>
          </div>
          {consultation.urgence && <span className={`${c.badge} ${s.badgeUrgence}`}>Urgence</span>}

          <dl className={s.ficheInfos}>
            <div>
              <dt>Prestation</dt>
              <dd>{consultation.prestation}</dd>
            </div>
            <div>
              <dt>Arrivée</dt>
              <dd>
                {jour(consultation.date)} à {heure(consultation.date)}
              </dd>
            </div>
            <div>
              <dt>Groupe sanguin</dt>
              <dd>{patient.groupeSanguin ?? '—'}</dd>
            </div>
            <div>
              <dt>Allergies</dt>
              <dd className={patient.allergies ? s.alerteTexte : ''}>{patient.allergies ?? 'Aucune connue'}</dd>
            </div>
            <div>
              <dt>Téléphone</dt>
              <dd>{patient.telephone ?? '—'}</dd>
            </div>
          </dl>

          {(consultation.infirmier || consultation.observationInfirmiere) && (
            <div className={s.noteInfirmier}>
              <span>
                <FaHeartbeat aria-hidden="true" /> Prise en charge infirmière
              </span>
              {consultation.infirmier && <small>par {consultation.infirmier}</small>}
              {consultation.observationInfirmiere && <p>{consultation.observationInfirmiere}</p>}
            </div>
          )}

          <div className={s.antecedentsVisites}>
            <span className={s.sousTitre}>
              <FaRedo aria-hidden="true" /> Consultations précédentes
            </span>
            {fiche.historique.length === 0 ? (
              <p className={s.note}>Première consultation du patient.</p>
            ) : (
              <ul>
                {fiche.historique.map((h) => (
                  <li key={h.id}>
                    <small>{jour(h.date)}</small>
                    <strong>{h.motif}</strong>
                    {h.diagnostic && <span>{h.diagnostic}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Consultation terminée : suite donnée (à qui, quand, état) */}
          {/* Consultation commencée par l'infirmier·ère puis envoyée au médecin */}
          {!lecture && fiche.envoiMedecin && (
            <div className={s.noteInfirmier}>
              <span>
                <FaUserMd aria-hidden="true" /> Envoyée par {fiche.envoiMedecin.par ?? 'l’infirmier·ère'}
              </span>
              <p>Sa saisie (anamnèse, examen, prescriptions…) est reprise dans le formulaire : complétez puis terminez la consultation.</p>
            </div>
          )}
          {lecture && fiche.suite && <SuiteDonnee suite={fiche.suite} consultationId={Number(id)} />}


          {/* Documents joints à la référence (interne / externe) */}
          {lecture && (fiche.valeurs.modeSortie === 'refere-interne' || fiche.valeurs.modeSortie === 'refere-externe') && (
            <DocumentsReference consultationId={fiche.consultation.id} documents={references} onChange={setReferences} />
          )}

          {/* Documents à télécharger (consultation terminée) */}
          {lecture && (
            <div className={s.documentsFiche}>
              <span className={s.sousTitre}>
                <FaFileDownload aria-hidden="true" /> Documents
              </span>
              {!fiche.valeurs.medicaments.length && !fiche.valeurs.examens.length && !fiche.valeurs.arret ? (
                <p className={s.note}>Aucun document prescrit lors de cette consultation.</p>
              ) : (
                DOCUMENTS_IMPRIMABLES.filter((d) => (d.id === 'ordonnance' ? fiche.valeurs.medicaments.length : d.id === 'examens' ? fiche.valeurs.examens.length : fiche.valeurs.arret)).map((d) => (
                  <Link key={d.id} to={`${racine}/${fiche.consultation.id}/document/${d.id}`} className={s.documentLien}>
                    <d.icone aria-hidden="true" />
                    <span>{d.titre}</span>
                    <FaDownload aria-hidden="true" />
                  </Link>
                ))
              )}
            </div>
          )}

          {issueActive && etape === E_ISSUE && (
            <p className={s.ficheIssue}>
              <FaUserMd aria-hidden="true" /> Issue : <strong>{issueActive.titre}</strong>
            </p>
          )}
        </aside>
      </div>

      {/* « Consulter » puis sortie sans issue : annuler la consultation, la garder, ou rester */}
      <FenetreQuitter
        ouvert={!!garde.sortie}
        enCours={annulation}
        onRester={garde.fermer}
        onGarder={() => {
          const s2 = garde.sortie;
          garde.liberer();
          garde.fermer();
          if (s2) quitter(s2, navigate);
        }}
        onAnnulerConsultation={async () => {
          const s2 = garde.sortie;
          if (!fiche || !s2) return;
          setAnnulation(true);
          try {
            await api.annuler(fiche.consultation.id);
            alerte.succes('Consultation annulée : le patient est comme avant.');
            garde.liberer();
            garde.fermer();
            quitter(s2, navigate);
          } catch (e) {
            alerte.echec(`Annulation impossible : ${messageErreur(e)}`);
          } finally {
            setAnnulation(false);
          }
        }}
      />

      {/* Infirmier·ère : choix du médecin (service + créneau) ; la consultation passe chez lui, non terminée */}
      <EnvoiMedecin
        ouvert={choixMedecin}
        enCours={envoi}
        serviceId={fiche?.consultation.serviceId ?? null}
        service={fiche?.consultation.service ?? null}
        onFermer={() => setChoixMedecin(false)}
        onEnvoyer={async (doctorId) => {
          if (!fiche) return;
          setEnvoi(true);
          try {
            const { modeSortie: _issue, justification: _j, ...saisie } = v;
            const r = await api.envoyerMedecin(fiche.consultation.id, doctorId, { ...saisie, imc: imcCalcule });
            garde.liberer();
            alerte.succes(r.message);
            setChoixMedecin(false);
            navigate('/infirmier');
          } catch (e) {
            alerte.echec(`Envoi impossible : ${messageErreur(e)}`);
          } finally {
            setEnvoi(false);
          }
        }}
      />

      <ConfirmDialog
        ouvert={confirmation}
        titre="Terminer la consultation ?"
        message={`Issue : ${issueActive?.titre ?? v.modeSortie}. La consultation ne pourra plus être modifiée ensuite.`}
        confirmer="Terminer"
        enCours={envoi}
        confirmerDesactive={!!fiche?.expertiseRecue && !fiche.expertiseRecue.resultatEnvoye && fournirResultat === null}
        onConfirmer={terminer}
        onAnnuler={() => setConfirmation(false)}
      >
        {/* Télé-expertise reçue : fournir un résultat au requérant ? Oui → page du résultat ; Non → terminer simplement */}
        {fiche?.expertiseRecue && !fiche.expertiseRecue.resultatEnvoye && (
          <div className={s.questionResultat} role="radiogroup" aria-label="Fournir un résultat au requérant">
            <strong>Devez-vous fournir un résultat au requérant ?</strong>
            <div>
              <button type="button" role="radio" aria-checked={fournirResultat === true} className={fournirResultat === true ? s.reponseActive : ''} onClick={() => setFournirResultat(true)}>
                Oui, joindre un résultat
              </button>
              <button type="button" role="radio" aria-checked={fournirResultat === false} className={fournirResultat === false ? s.reponseActive : ''} onClick={() => setFournirResultat(false)}>
                Non, terminer simplement
              </button>
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
