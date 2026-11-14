import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const texte = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

/** Un lit de la chambre : id = lit existant (modification), sans id = nouveau lit */
export class LitDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id?: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Chaque lit doit avoir un numéro' })
  @MaxLength(191)
  numero: string;
}

/**
 * Formulaire "Ajouter / Modifier une chambre".
 * Règles Laravel (BedroomController@store / update) : numéro obligatoire, prix entier, description ≥ 3 car.,
 * chambre collective : 1 à 20 lits, chacun avec un numéro ; chambre individuelle : 1 lit.
 */
export class ChambreDto {
  /** Création uniquement (le type ne change pas ensuite, comme Laravel) */
  @IsOptional()
  @IsIn(['individual', 'collective'], { message: 'Type de chambre invalide' })
  type?: 'individual' | 'collective';

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de la chambre est obligatoire' })
  @MaxLength(191)
  numero: string;

  /** Prix par jour (FCFA), appliqué à tous les lits de la chambre */
  @Type(() => Number)
  @IsInt({ message: 'Le prix doit être un nombre entier (FCFA)' })
  @Min(0, { message: 'Le prix ne peut pas être négatif' })
  prix: number;

  @IsOptional()
  @Transform(texte)
  @IsString()
  @MinLength(3, { message: 'La description doit contenir au moins 3 caractères' })
  @MaxLength(191)
  description?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La chambre doit avoir au moins un lit' })
  @ArrayMaxSize(20, { message: 'Une chambre ne peut pas avoir plus de 20 lits' })
  @ValidateNested({ each: true })
  @Type(() => LitDto)
  lits: LitDto[];
}
