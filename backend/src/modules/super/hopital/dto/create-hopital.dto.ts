import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Données du formulaire "Ajouter un hôpital" (multipart, champs texte).
 * Mêmes règles que Laravel : app/Http/Requests/Super/HospitalRequest.php
 */
export class CreateHopitalDto {
  // --- Hôpital ---
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'hôpital est obligatoire" })
  @MaxLength(191)
  label: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Le code de l'établissement est obligatoire" })
  @MaxLength(191)
  reference: string;

  @Transform(trim)
  @Matches(/^[0-9]{10}$/, { message: 'Le contact doit contenir exactement 10 chiffres' })
  contact: string;

  /** Localité = id de la sous-préfecture (sub_prefectures) */
  @Type(() => Number)
  @IsInt({ message: 'Veuillez choisir une localité' })
  localite: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le district sanitaire est obligatoire' })
  @MaxLength(191)
  district: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191)
  directionGenerale?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1' || value === 'on')
  @IsBoolean()
  teleconsultation?: boolean;

  // --- Compte de connexion de l'hôpital ---
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Adresse email invalide' })
  @MaxLength(191)
  email: string;

  @IsString()
  @MinLength(4, { message: 'Le mot de passe doit contenir au moins 4 caractères' })
  password: string;

  @IsString()
  passwordConfirmation: string;
}
