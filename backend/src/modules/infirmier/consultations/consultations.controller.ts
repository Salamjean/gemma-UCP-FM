import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { lancerUrgence } from '../../../common/appel-video';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { EnregistrerConstantesDto, InfirmierConsultationsService } from './consultations.service';

/** Appel d'urgence : constantes (toutes obligatoires, vérifiées dans lancerUrgence) + motif de l'alerte */
class UrgenceDto {
  @IsOptional() @IsString() @MaxLength(20) tension_arterielle?: string;
  @IsOptional() @IsString() @MaxLength(20) temperature?: string;
  @IsOptional() @IsString() @MaxLength(20) taille?: string;
  @IsOptional() @IsString() @MaxLength(20) poids?: string;
  @IsOptional() @IsString() @MaxLength(20) imc?: string;
  @IsOptional() @IsString() @MaxLength(20) pouls?: string;
  @IsOptional() @IsString() @MaxLength(2000) observation?: string;
}

@Controller('infirmier/consultations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('infirmier')
export class InfirmierConsultationsController {
  constructor(
    private readonly service: InfirmierConsultationsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** POST …/:id/urgence → enregistre les constantes et lance l'appel d'urgence vers les médecins alertés */
  @Post(':id/urgence')
  urgence(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number, @Body() dto: UrgenceDto) {
    return lancerUrgence(this.db, req.user.sub, id, dto);
  }

  @Get('today')
  today(@Req() req: Request & { user: JwtPayload }) {
    return this.service.today(req.user.sub);
  }

  @Get('all')
  all(@Req() req: Request & { user: JwtPayload }) {
    return this.service.all(req.user.sub);
  }

  @Get('history')
  history(@Req() req: Request & { user: JwtPayload }) {
    return this.service.history(req.user.sub);
  }

  @Get('teleconsultation-hospitals')
  getTeleconsultationHospitals(
    @Req() req: Request & { user: JwtPayload },
    @Param('consultation_id') consultationId?: number,
  ) {
    return this.service.getTeleconsultationHospitals(Number(consultationId || 0));
  }

  @Get('teleconsultation-doctors/:hospitalId')
  getTeleconsultationDoctors(
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
  ) {
    return this.service.getTeleconsultationDoctors(hospitalId);
  }

  @Get('formulaire/:id')
  getFormulaire(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getFormulaire(req.user.sub, id);
  }

  @Post('formulaire')
  enregistrerConstantes(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: EnregistrerConstantesDto,
  ) {
    return this.service.enregistrerConstantes(req.user.sub, dto);
  }
}

