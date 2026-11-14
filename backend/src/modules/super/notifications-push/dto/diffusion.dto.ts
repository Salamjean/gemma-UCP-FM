import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const CIBLES = ['all', 'android', 'ios', 'specific'] as const;
export const CATEGORIES = ['general', 'alert', 'reminder', 'update', 'info'] as const;

/** Nouvelle diffusion — mêmes règles que Laravel (NotificationController@send) */
export class DiffusionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le titre de la notification est obligatoire.' })
  @MaxLength(150, { message: 'Le titre ne peut pas dépasser 150 caractères.' })
  titre: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le contenu du message est obligatoire.' })
  @MaxLength(1000, { message: 'Le message ne peut pas dépasser 1000 caractères.' })
  message: string;

  @IsIn(CIBLES, { message: 'Veuillez choisir une cible de destinataires.' })
  cible: (typeof CIBLES)[number];

  @IsIn(CATEGORIES, { message: 'Catégorie inconnue.' })
  categorie: (typeof CATEGORIES)[number];

  /** Obligatoire si cible = "specific" */
  @ValidateIf((d: DiffusionDto) => d.cible === 'specific')
  @Type(() => Number)
  @IsInt({ message: 'Veuillez sélectionner un patient spécifique.' })
  patientId?: number;

  /** Écran de l'application mobile à ouvrir (défaut : Notifications) */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ecran?: string;
}
