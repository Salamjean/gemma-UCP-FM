import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

/** Enregistrement direct d'un décès (comme Laravel doctor.declaration.deces.store_direct) */
export class DecesDirectDto {
  @IsIn(['existant', 'nouveau'], { message: 'Choisissez un patient existant ou un nouveau défunt.' })
  patientMode!: 'existant' | 'nouveau';

  // Patient existant
  @ValidateIf((o: DecesDirectDto) => o.patientMode === 'existant')
  @Type(() => Number)
  @IsInt({ message: 'Choisissez le patient décédé.' })
  patientId?: number;

  // Nouveau défunt (non enregistré)
  @ValidateIf((o: DecesDirectDto) => o.patientMode === 'nouveau')
  @IsString({ message: 'Le nom du défunt est obligatoire.' })
  @MaxLength(100, { message: 'Nom trop long (100 caractères maximum).' })
  @MinLength(1, { message: 'Le nom du défunt est obligatoire.' })
  nom?: string;

  @IsOptional() @IsString() @MaxLength(100) prenom?: string;

  @ValidateIf((o: DecesDirectDto) => o.patientMode === 'nouveau')
  @IsIn(['masculin', 'feminin'], { message: 'Choisissez le sexe du défunt.' })
  genre?: 'masculin' | 'feminin';

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date de naissance invalide.' }) dateNaissance?: string;
  @IsOptional() @Type(() => Number) @IsInt({ message: 'Âge estimé invalide.' }) @Min(0, { message: 'Âge estimé invalide.' }) @Max(130, { message: 'Âge estimé invalide.' }) ageEstime?: number;
  @IsOptional() @IsString() @MaxLength(100) profession?: string;
  @IsOptional() @Matches(/^\d{10}$/, { message: 'Le contact doit contenir 10 chiffres.' }) telephone?: string;
  @IsOptional() @IsString() @MaxLength(200) lieuResidence?: string;

  // Circonstances
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date du décès est obligatoire.' }) date!: string;
  @Matches(/^\d{2}:\d{2}$/, { message: 'L’heure du décès est obligatoire.' }) heure!: string;
  @IsIn(['hopital', 'hors']) lieuType!: 'hopital' | 'hors';
  @IsOptional() @IsString() @MaxLength(150) service?: string;

  @ValidateIf((o: DecesDirectDto) => o.lieuType === 'hors')
  @IsString({ message: 'Précisez le lieu exact du décès.' })
  @MaxLength(200, { message: 'Lieu trop long (200 caractères maximum).' })
  @MinLength(2, { message: 'Précisez le lieu exact du décès.' })
  lieuAutre?: string;

  @IsIn(['Urbain', 'Rural']) milieuResidence!: 'Urbain' | 'Rural';
  @IsIn(['patient', 'enfant']) person!: 'patient' | 'enfant';
  @IsIn(['oui', 'non']) decesMaternel!: 'oui' | 'non';

  // Constat médical
  @IsString({ message: 'La cause initiale est obligatoire.' }) @MaxLength(500, { message: 'Cause initiale trop longue (500 caractères maximum).' }) @MinLength(2, { message: 'La cause initiale est obligatoire.' }) causeInitiale!: string;
  @IsString({ message: 'La cause directe est obligatoire.' }) @MaxLength(500, { message: 'Cause directe trop longue (500 caractères maximum).' }) @MinLength(2, { message: 'La cause directe est obligatoire.' }) causeDirecte!: string;
  @IsOptional() @IsString() @MaxLength(2000) observation?: string;
}
