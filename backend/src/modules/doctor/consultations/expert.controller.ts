import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { infosInvitation, jetonInvite } from '../../../common/appel-video';

class RejoindreExpertDto {
  @IsString()
  @MinLength(2, { message: 'Indiquez votre nom.' })
  @MaxLength(80)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  specialite?: string;
}

/**
 * /api/teleconsultation/expert/:id/:code — PUBLIC (lien d'invitation envoyé par le médecin, comme Laravel)
 * Le code (HMAC lié à la salle de l'appel) remplace la connexion.
 */
@Controller('teleconsultation/expert')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class TeleconsultationExpertController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** GET → dossier résumé du patient et constantes */
  @Get(':id/:code')
  infos(@Param('id', ParseIntPipe) id: number, @Param('code') code: string) {
    return infosInvitation(this.db, id, code);
  }

  /** POST …/jeton { nom, specialite } → jeton LiveKit pour rejoindre l'appel */
  @Post(':id/:code/jeton')
  jeton(@Param('id', ParseIntPipe) id: number, @Param('code') code: string, @Body() dto: RejoindreExpertDto) {
    return jetonInvite(this.db, id, code, dto.nom, dto.specialite);
  }
}
