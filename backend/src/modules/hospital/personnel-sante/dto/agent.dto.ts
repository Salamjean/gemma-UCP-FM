import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Texte facultatif : espaces retirés, champ vide → absent */
const texte = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);
/** Champs vides du formulaire (multipart) → absents */
const videEnUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
/** Les listes arrivent en JSON dans le formulaire multipart */
const json = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/** Un jour de disponibilité : 0 = lundi … 6 = dimanche, heure "HH:MM" (planning.blade.php de Laravel) */
export class JourDto {
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5, 6])
  jour: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Heure invalide (format HH:MM)' })
  heure: string;
}

/**
 * Formulaire d'ajout / de modification d'un agent de santé (multipart : photo facultative "image").
 * Règles Laravel : DoctorRequest, SageFRequest, InfirmierRequest et leurs Update*.
 * Les champs propres à un type d'agent sont vérifiés dans le service.
 */
export class AgentDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Le nom doit contenir au moins 3 caractères' })
  @MaxLength(191)
  name: string;

  /** Création uniquement (l'email et le matricule ne changent pas ensuite, comme Laravel) */
  @IsOptional()
  @Transform(texte)
  @IsEmail({}, { message: 'Adresse email invalide' })
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @Transform(texte)
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,30}$/, { message: 'Le matricule ne doit contenir que des lettres et des chiffres (30 max.)' })
  matricule?: string;

  /** Obligatoire à la création, facultatif en modification (vide = inchangé) */
  @IsOptional()
  @Transform(videEnUndefined)
  @IsString()
  @MinLength(4, { message: 'Le mot de passe doit contenir au moins 4 caractères' })
  @MaxLength(191)
  password?: string;

  @IsOptional()
  @Transform(videEnUndefined)
  @IsString()
  passwordConfirmation?: string;

  @Transform(trim)
  @Matches(/^[0-9]{10}$/, { message: 'Le contact doit contenir exactement 10 chiffres' })
  contact: string;

  @IsOptional()
  @Transform(texte)
  @IsString()
  @MinLength(3, { message: "L'adresse doit contenir au moins 3 caractères" })
  @MaxLength(191)
  address?: string;

  /** Médecin / sage-femme : service d'affectation (service_hospitals.id) */
  @IsOptional()
  @Transform(videEnUndefined)
  @Type(() => Number)
  @IsInt()
  service?: number;

  /** Infirmier : un ou plusieurs services */
  @IsOptional()
  @Transform(json)
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  services?: number[];

  /** Médecin / sage-femme : actes pratiqués (prestation_hospitals.id) */
  @IsOptional()
  @Transform(json)
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  actes?: number[];

  /** Médecin : généraliste / spécialiste */
  @IsOptional()
  @Transform(videEnUndefined)
  @IsIn(['generaliste', 'specialiste'], { message: 'Choisissez généraliste ou spécialiste' })
  typeName?: 'generaliste' | 'specialiste';

  /** Calculé par le service (spécialité gynéco → accès maternité), jamais envoyé par le formulaire */
  gyneco?: boolean;

  /** Médecin spécialiste : spécialité (type_doctors.id) */
  @IsOptional()
  @Transform(videEnUndefined)
  @Type(() => Number)
  @IsInt()
  typeDoctor?: number;

  /** JSON lu d'abord, puis chaque jour converti en JourDto (un @Type ici s'appliquerait au texte JSON brut) */
  @Transform(({ value }) => {
    const v = json({ value });
    return Array.isArray(v) ? v.map((j) => plainToInstance(JourDto, j)) : v;
  })
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  jours: JourDto[];
}
