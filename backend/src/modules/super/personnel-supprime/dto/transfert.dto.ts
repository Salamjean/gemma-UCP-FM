import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Changement d'hôpital d'un agent supprimé (réintégré dans un autre hôpital UCP-FM).
 *   médecin / sage-femme : service + actes médicaux pratiqués (+ spécialité pour un spécialiste)
 *   infirmier            : un ou plusieurs services
 */
export class TransfertDto {
  @Type(() => Number)
  @IsInt({ message: "Choisissez l'hôpital d'arrivée." })
  @Min(1)
  hopitalId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  service?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  services?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @Type(() => Number)
  @IsInt({ each: true })
  actes?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  typeDoctor?: number;
}
