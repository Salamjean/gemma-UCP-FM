import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Formulaire "Ajouter / Modifier une spécialité".
 * Laravel (TypeDoctorRequest) : label obligatoire. La description (colonne type_doctors.description) est facultative.
 */
export class SpecialiteDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la spécialité est obligatoire' })
  @MaxLength(191)
  label: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}
