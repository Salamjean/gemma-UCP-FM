import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested, IsObject } from 'class-validator';

const texte = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);
const OUI_NON = ['Oui', 'Non'];
const OUI_NON_NA = ['Oui', 'Non', 'NA'];

/** Issues de consultation du formulaire curatif Laravel (currative.blade.php, champ mode_sortie) */
// « Mise en observation », « À revoir » et « Cas présumé de TB » retirés à la demande (restent lisibles sur les anciennes consultations)
/** « reference » : infirmier·ère → référence physique du patient (interne / externe) avec fiche de référence imprimée */
export const MODES_SORTIE = ['sortie', 'hospitalisation', 'refere-interne', 'refere-externe', 'teleconsultation', 'urgence', 'reference'] as const;

export class MedicamentDto {
  /** drugs.id (médicament choisi dans la liste) — sinon « nom » saisi librement */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Médicament invalide.' })
  drugId?: number;

  /** Médicament saisi s'il n'existe pas dans la liste */
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) nom?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) unite?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'La quantité doit être au moins 1.' })
  quantite?: number;

  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) posologie?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) duree?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) voie?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(1000) conseil?: string;
}

export class ArretDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Date de début de l'arrêt invalide." })
  dateDebut: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Date de fin de l'arrêt invalide." })
  dateFin: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: "L'arrêt de travail doit durer au moins 1 jour." })
  nbJour: number;
}

/** Une ligne du protocole thérapeutique (produit du stock de l'hôpital : drug_hospitals) */
export class ProtocoleDto {
  /** Médicament saisi par le médecin (protocole externe, comme Laravel « protocol_type external ») */
  @Transform(texte)
  @IsString()
  @IsNotEmpty({ message: 'Veuillez saisir le nom du médicament du protocole.' })
  @MaxLength(191)
  nom: string;

  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) unite?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'La quantité du protocole doit être au moins 1.' })
  quantite: number;

  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) posologie?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) voie?: string;

  /** Heures d'administration (HH:MM) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @Matches(/^\d{2}:\d{2}$/, { each: true, message: "Heure d'administration invalide." })
  heures?: string[];
}

/**
 * Issue « Hospitalisation » (Laravel : formulaire_issue/hospitalisation + IssueController@storeIssueHospitalisation) :
 * chambre / lit facultatifs, dossier, protocole thérapeutique obligatoire.
 */
export class HospitalisationIssueDto {
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) diagnostic?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) analyseMedical?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON) sonde?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON) oxygenotherapie?: string;
  @Transform(texte) @IsOptional() @IsIn(['1', '2', '3', '4', '5']) volume?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) regime?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Date de l'opération invalide." }) dateOperation?: string;

  @Type(() => Number) @IsOptional() @IsInt() bedId?: number;
  @Type(() => Number) @IsOptional() @IsInt() infirmierId?: number;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProtocoleDto)
  protocole: ProtocoleDto[];
}

/**
 * MÉDECIN > CONSULTATION CURATIVE (un seul envoi pour tout le formulaire en étapes)
 * Reprend Laravel : storeConsultationCurative + post-consultation (ordonnance externe, bulletin d'examen,
 * arrêt de travail) + issue (justification / hospitalisation).
 */
/** Accouchement : un nouveau-né à déclarer */
export class EnfantNaissanceDto {
  @IsIn(['masculin', 'feminin'], { message: 'Indiquez le sexe de chaque nouveau-né.' })
  genre: 'masculin' | 'feminin';

  @Matches(/^\d{2}:\d{2}$/, { message: 'Indiquez l’heure de naissance de chaque nouveau-né.' })
  heure: string;

  @IsString()
  @IsNotEmpty({ message: 'Indiquez l’état de chaque nouveau-né.' })
  @MaxLength(60)
  etat: string;

  /** Prénom(s) choisi(s) ; sinon « Nouveau-né de … » comme Laravel */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  prenom?: string;
}

/** Accouchement : déclaration de naissance (Laravel doctor.declaration.naissance.store), faite avec l'accouchement */
export class NaissanceDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date de naissance invalide.' })
  date: string;

  @IsString()
  @IsNotEmpty({ message: 'Indiquez le lieu de naissance.' })
  @MaxLength(191)
  lieu: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins un nouveau-né à déclarer.' })
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => EnfantNaissanceDto)
  enfants: EnfantNaissanceDto[];
}

export class ConsultationCurativeDto {
  // --- Étape 1 : anamnèse ---
  @Transform(texte)
  @IsString()
  @IsNotEmpty({ message: 'Le motif de consultation est obligatoire.' })
  @MaxLength(1000)
  motif: string;

  @Transform(texte) @IsOptional() @IsIn(OUI_NON) hta?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON) alcool?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON) tabac?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON) drepanocytaire?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON) traitementMedicamenteux?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(2000) traitementAnterieur?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON) antecedentMedical?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(2000) autreAntecedentMedical?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON) antecedentChirurgical?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) nomOperation?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(2000) autreAntecedentChirurgical?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON) grossesse?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) ddr?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(2000) descriptionGrossesse?: string;

  // --- Étape 2 : examen clinique ---
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) poids?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) taille?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) imc?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) temperature?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) tension?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) pouls?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) saturation?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) glycemieAJeun?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) glycemieNonAJeun?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) frequenceRespiratoire?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) perimetreBrachial?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) perimetreCranien?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(50) zscore?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON_NA) tuberculose?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) examenPhysique?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) diagnostic?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) autresPathologies?: string;
  @Transform(texte) @IsOptional() @IsIn(['Positif', 'Négatif', 'Non réalisé', 'NA']) tdrPaludisme?: string;
  @Transform(texte) @IsOptional() @IsIn(['Positive', 'Négative', 'Non réalisé', 'NA']) goutteEpaisse?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON_NA) mildaEligible?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON_NA) mildaRemise?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON_NA) cdipPropose?: string;
  @Transform(texte) @IsOptional() @IsIn(OUI_NON_NA) cdipRealise?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) codeDepistage?: string;

  // --- Étape 3 : prescriptions ---
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MedicamentDto)
  medicaments?: MedicamentDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(191, { each: true })
  examens?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ArretDto)
  arret?: ArretDto;

  /** Consultation prénatale / postnatale : champs du registre de maternité (clés = colonnes de la table Laravel, filtrées au serveur) */
  @IsOptional()
  @IsObject()
  maternite?: Record<string, unknown>;

  /** Accouchement : déclaration de naissance des nouveau-nés vivants (certificat de naissance) */
  @IsOptional()
  @ValidateNested()
  @Type(() => NaissanceDto)
  naissance?: NaissanceDto;

  // --- Étape 4 : issue ---
  @IsIn(MODES_SORTIE as unknown as string[], { message: "Veuillez choisir l'issue de la consultation." })
  modeSortie: string;

  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) justification?: string;

  /**
   * Télé-expertise : médecin à qui elle est adressée (FACULTATIF).
   * Sans médecin, elle est envoyée à tous les médecins du service (et de l'hôpital choisi) : le premier qui la prend en charge l'obtient.
   */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Médecin de la référence invalide.' })
  medecinReferenceId?: number;

  /**
   * Référence du patient (issue « reference », infirmier·ère) : en interne ou en externe.
   * Mêmes champs que la télé-expertise : referenceServiceHospitalId (interne) / referenceServiceId + referenceHopitalId (externe),
   * medecinReferenceId facultatif (sans médecin : tous les médecins du service).
   */
  @IsOptional()
  @IsIn(['interne', 'externe'], { message: 'Précisez si la référence est en interne ou en externe.' })
  referencePortee?: 'interne' | 'externe';

  /** Télé-expertise en interne : service de l'hôpital (service_hospitals.id) — obligatoire */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Service de la référence invalide.' })
  referenceServiceHospitalId?: number;

  /** Télé-expertise en externe : service (table services) des hôpitaux de la DMHP — obligatoire */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Service de la référence invalide.' })
  referenceServiceId?: number;

  /**
   * Envoi EN EXTERNE (télé-expertise, téléconsultation, référence) : false / absent → hôpitaux du MÊME district sanitaire
   * que le demandeur ; true → hôpitaux des AUTRES districts (bouton « Hors du district »).
   */
  @IsOptional()
  @IsBoolean({ message: 'Choix « hors du district » invalide.' })
  externeHorsDistrict?: boolean;

  /** Télé-expertise en externe : hôpital de la DMHP (facultatif ; sans hôpital → tous les hôpitaux du district, ou hors du district) */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Hôpital de la référence invalide.' })
  referenceHopitalId?: number;

  /** Télé-expertise urgente (synchrone, réponse < 30 min) ; sinon programmée (asynchrone, 24 à 48 h) */
  @IsOptional()
  @IsBoolean({ message: 'Type de télé-expertise invalide.' })
  referenceUrgente?: boolean;

  /** Télé-expertise (interne ou externe) : date (AAAA-MM-JJ) et heure (HH:MM) de la prise en charge */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date de la prise en charge invalide.' }) referenceDate?: string;

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Heure de la prise en charge invalide.' }) referenceHeure?: string;

  /**
   * Téléconsultation, comme la télé-expertise : en interne (service de l'hôpital) ou en externe (service de la DMHP,
   * hôpital facultatif). Médecin FACULTATIF : sans médecin, tous les médecins visés la reçoivent, le premier qui la prend l'obtient.
   */
  @IsOptional()
  @IsIn(['interne', 'externe'], { message: 'Précisez si la téléconsultation est en interne ou en externe.' })
  telePortee?: 'interne' | 'externe';

  /** Interne : service de l'hôpital (service_hospitals.id) */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Service de la téléconsultation invalide.' })
  teleServiceHospitalId?: number;

  /** Externe : service (services.id) */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Service de la téléconsultation invalide.' })
  teleServiceId?: number;

  /** Externe : hôpital de la DMHP (facultatif) */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Hôpital de la téléconsultation invalide.' })
  teleHopitalId?: number;

  /** Appel d'urgence : service appelé (services.id) ; absent → les médecins de TOUS les services du réseau */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Service appelé invalide.' })
  urgenceServiceId?: number;

  /** Téléconsultation : médecin (facultatif), date AAAA-MM-JJ et heure HH:MM */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Médecin de la téléconsultation invalide.' })
  teleMedecinId?: number;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date de la téléconsultation invalide.' }) teleDate?: string;

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Heure de la téléconsultation invalide.' }) teleHeure?: string;

  /** Obligatoire quand modeSortie = hospitalisation */
  @IsOptional()
  @ValidateNested()
  @Type(() => HospitalisationIssueDto)
  hospitalisation?: HospitalisationIssueDto;
}

/** Infirmier·ère : « Envoyer au médecin » — la consultation reste ouverte et passe au médecin choisi */
export class EnvoiMedecinDto {
  @Type(() => Number)
  @IsInt({ message: 'Choisissez le médecin.' })
  doctorId: number;

  /** Valeurs déjà saisies dans le formulaire (reprises par le médecin) */
  @IsOptional()
  @IsObject({ message: 'Saisie invalide.' })
  valeurs?: Record<string, unknown>;
}
