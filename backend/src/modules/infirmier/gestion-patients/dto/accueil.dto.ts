import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const texte = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

/**
 * Affectation d'un patient (création directe de la consultation du jour, sans caisse).
 * Prestation, médecin (disponible maintenant) et motif obligatoires.
 */
export class AffectationDto {
  /** Prestation de l'hôpital (prestation_hospitals.id) */
  @Type(() => Number)
  @IsInt({ message: 'Veuillez choisir la prestation (service / acte).' })
  prestationId: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le motif de la consultation est obligatoire.' })
  @MaxLength(500)
  motif: string;

  /** Médecin obligatoire (doit être dans son jour et son créneau : vérifié par le service) */
  @Type(() => Number)
  @IsInt({ message: 'Veuillez choisir le médecin.' })
  doctorId: number;

  /** Affectation faite par un médecin : infirmier·ère choisi·e (obligatoire, vérifié par le service) → télémédecine */
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Veuillez choisir l’infirmier·ère.' })
  infirmierId?: number;
}

/**
 * Inscription d'un nouveau patient par l'infirmier.
 * Mêmes champs obligatoires que Laravel (Secretariat\PatientController@addPatient), sans empreintes ni caisse.
 */
export class InscriptionPatientDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le nom est obligatoire.' })
  @MaxLength(191)
  nom: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le prénom est obligatoire.' })
  @MaxLength(191)
  prenom: string;

  @IsIn(['masculin', 'feminin'], { message: 'Choisissez le sexe du patient.' })
  genre: 'masculin' | 'feminin';

  /** Date de naissance "AAAA-MM-JJ" (stockée en "JJ/MM/AAAA", comme Laravel) */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date de naissance invalide.' })
  dateNaissance: string;

  /** Lieu de naissance (facultatif) et résidence actuelle : sous-préfectures (sub_prefectures.id) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lieuNaissance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  residence?: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le pays est obligatoire.' })
  @MaxLength(191)
  pays: string;

  @IsIn(['celibataire', 'marie', 'divorce', 'veuf', 'concubinage'], { message: 'Choisissez la situation matrimoniale.' })
  situationMatrimoniale: string;

  @Transform(trim)
  @Matches(/^[0-9]{10}$/, { message: 'Le téléphone doit contenir exactement 10 chiffres.' })
  telephone: string;

  @IsOptional()
  @Transform(texte)
  @Matches(/^[0-9]{10}$/, { message: 'Le 2e contact doit contenir exactement 10 chiffres.' })
  contact2?: string;

  @IsOptional()
  @Transform(texte)
  @IsEmail({}, { message: 'Adresse email invalide.' })
  @MaxLength(191)
  email?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Choisissez le type de pièce d'identité." })
  @MaxLength(191)
  typePiece: string;

  @IsOptional()
  @Transform(texte)
  @IsString()
  @MaxLength(191)
  numeroIdentite?: string;

  @IsOptional()
  @Transform(texte)
  @IsString()
  @MaxLength(191)
  profession?: string;

  /** N° CMU obligatoire */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le N° CMU est obligatoire.' })
  @MaxLength(191)
  numCmu: string;

  @IsOptional()
  @Transform(texte)
  @IsString()
  @MaxLength(191)
  adresse?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  nbEnfants?: number;

  /** Personne à prévenir */
  @IsOptional()
  @Transform(texte)
  @IsString()
  @MaxLength(191)
  urgenceNom?: string;

  @IsOptional()
  @Transform(texte)
  @Matches(/^[0-9]{10}$/, { message: 'Le téléphone de la personne à prévenir doit contenir 10 chiffres.' })
  urgenceTelephone?: string;

  @IsOptional()
  @Transform(texte)
  @IsString()
  @MaxLength(191)
  urgenceLien?: string;

  /** Affectation immédiate (facultative) : crée la consultation du jour */
  @IsOptional()
  @ValidateNested()
  @Type(() => AffectationDto)
  affectation?: AffectationDto;

  /** Inscription d'urgence (formulaire court) : l'affectation devient obligatoire */
  @IsOptional()
  @IsBoolean()
  urgence?: boolean;
}

/**
 * Mise à jour des informations d'un patient (ex. nouveau-né : nom et prénoms donnés plus tard, lors d'une venue pour des soins).
 * Le numéro de dossier (DM), la date et le lieu de naissance ne changent pas.
 */
export class MiseAJourPatientDto {
  @Transform(trim)
  @IsString({ message: 'Le nom est obligatoire.' })
  @IsNotEmpty({ message: 'Le nom est obligatoire.' })
  @MaxLength(191)
  nom: string;

  @Transform(trim)
  @IsString({ message: 'Le prénom est obligatoire.' })
  @IsNotEmpty({ message: 'Le prénom est obligatoire.' })
  @MaxLength(191)
  prenom: string;

  @IsIn(['masculin', 'feminin'], { message: 'Choisissez le sexe du patient.' })
  genre: 'masculin' | 'feminin';

  @IsOptional() @Transform(texte) @Matches(/^[0-9]{10}$/, { message: 'Le téléphone doit contenir exactement 10 chiffres.' }) telephone?: string;
  @IsOptional() @Transform(texte) @Matches(/^[0-9]{10}$/, { message: 'Le 2e contact doit contenir exactement 10 chiffres.' }) contact2?: string;
  @IsOptional() @IsIn(['celibataire', 'marie', 'divorce', 'veuf', 'concubinage'], { message: 'Situation matrimoniale invalide.' }) situationMatrimoniale?: string;
  @IsOptional() @Transform(texte) @IsString() @MaxLength(191) numCmu?: string;
  @IsOptional() @Transform(texte) @IsString() @MaxLength(191) profession?: string;
  @IsOptional() @Transform(texte) @IsString() @MaxLength(191) adresse?: string;
  @IsOptional() @Type(() => Number) @IsInt() residence?: number;
  @IsOptional() @Transform(texte) @IsString() @MaxLength(191) urgenceNom?: string;
  @IsOptional() @Transform(texte) @Matches(/^[0-9]{10}$/, { message: 'Le téléphone de la personne à prévenir doit contenir 10 chiffres.' }) urgenceTelephone?: string;
  @IsOptional() @Transform(texte) @IsString() @MaxLength(191) urgenceLien?: string;
}
