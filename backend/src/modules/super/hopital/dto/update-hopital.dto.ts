import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Données du formulaire "Modifier les coordonnées" (multipart).
 * Base Laravel : app/Http/Requests/Super/UpdateHospitalRequest.php
 * Le code (reference) n'est pas modifiable, comme dans Laravel.
 */
export class UpdateHopitalDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'hôpital est obligatoire" })
  @MaxLength(191)
  label: string;

  @Transform(trim)
  @Matches(/^[0-9]{10}$/, { message: 'Le contact doit contenir exactement 10 chiffres' })
  contact: string;

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

  /** Email du compte de connexion de l'hôpital */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Adresse email invalide' })
  @MaxLength(191)
  email: string;

  /** Facultatif : seulement pour changer le mot de passe de l'hôpital */
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'Le mot de passe doit contenir au moins 4 caractères' })
  password?: string;

  @IsOptional()
  @IsString()
  passwordConfirmation?: string;
}
