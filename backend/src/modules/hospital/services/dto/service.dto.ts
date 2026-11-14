import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Un acte médical (prestation) avec son prix pour cet hôpital.
 *   - acte du catalogue : prestationServiceId (prestation_services.id)
 *   - nouvel acte saisi librement : libelle (créé dans prestation_services s'il n'existe pas, comme Laravel)
 */
export class ActeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  prestationServiceId?: number;

  @ValidateIf((o: ActeDto) => !o.prestationServiceId)
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "L'intitulé de l'acte médical est obligatoire" })
  @MaxLength(191)
  libelle?: string;

  @Type(() => Number)
  @IsInt({ message: 'Le prix doit être un nombre entier (FCFA)' })
  @Min(0, { message: 'Le prix ne peut pas être négatif' })
  prix: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}

/** Acte déjà rattaché au service (prestation_hospitals.id) : prix / description modifiables */
export class ActeExistantDto {
  @Type(() => Number)
  @IsInt()
  id: number;

  @Type(() => Number)
  @IsInt({ message: 'Le prix doit être un nombre entier (FCFA)' })
  @Min(0, { message: 'Le prix ne peut pas être négatif' })
  prix: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}

/**
 * Formulaire "Ajouter un service" — mêmes règles que Laravel (ServiceRequest) :
 * un service du catalogue (serviceId) OU le nom d'un nouveau service (nouveauService).
 */
export class CreateServiceDto {
  @ValidateIf((o: CreateServiceDto) => !o.nouveauService)
  @Type(() => Number)
  @IsInt({ message: "Veuillez sélectionner un service existant ou renseigner le nom d'un nouveau service." })
  serviceId?: number;

  @ValidateIf((o: CreateServiceDto) => !o.serviceId)
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Veuillez indiquer le nom du nouveau service à créer.' })
  @MaxLength(191)
  nouveauService?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ActeDto)
  actes: ActeDto[] = [];
}

/** Page "Détail / Modifier" d'un service : actes existants modifiés + nouveaux actes */
export class UpdateServiceDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ActeExistantDto)
  actesExistants: ActeExistantDto[] = [];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ActeDto)
  nouveauxActes: ActeDto[] = [];
}
