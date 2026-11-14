import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const texte = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

export class AttribuerLitDto {
  @Type(() => Number)
  @IsInt({ message: 'Veuillez choisir un lit.' })
  bedId: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  infirmierId?: number;
}

export class DossierHospitalisationDto {
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) diagnostic?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) regime?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) analyseMedical?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) sonde?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) oxygenotherapie?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(191) volume?: string;
  @Transform(texte) @IsOptional() @IsString() @MaxLength(5000) remarque?: string;
}

/** Motifs de sortie proposés (champ libre mot_sortie dans Laravel) */
export const MOTIFS_SORTIE = ['Guérison', 'Amélioration', 'Sortie contre avis médical', 'Transfert vers un autre établissement', 'Évasion', 'Décès'];

export class SortieHospitalisationDto {
  @Transform(texte)
  @IsString()
  @IsNotEmpty({ message: 'Veuillez indiquer le motif de sortie.' })
  @IsIn(MOTIFS_SORTIE, { message: 'Motif de sortie invalide.' })
  motifSortie: string;
}
