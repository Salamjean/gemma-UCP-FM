import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Formulaire "Ajouter / Modifier une assurance".
 * Mêmes règles que Laravel (app/Http/Requests/Hospital/TypeAssuranceRequest.php) :
 *   libelle obligatoire, reduction entier entre 5 et 100 (%), description facultative.
 */
export class AssuranceDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Le libellé de l'assurance est obligatoire" })
  @MaxLength(191)
  libelle: string;

  @Type(() => Number)
  @IsInt({ message: 'Le pourcentage doit être un nombre entier' })
  @Min(5, { message: 'Le pourcentage doit être au moins 5 %' })
  @Max(100, { message: 'Le pourcentage ne peut pas dépasser 100 %' })
  reduction: number;

  /** description est un varchar(191) dans la table type_assurances */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(191, { message: 'La description ne doit pas dépasser 191 caractères' })
  description?: string;
}
