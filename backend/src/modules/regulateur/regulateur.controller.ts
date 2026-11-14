import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { contexteAudit } from '../../common/audit/audit.service';
import type { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { type CreerPermissionRegulateur, RegulateurAgendaService } from './regulateur-agenda.service';
import { RegulateurService } from './regulateur.service';

class ReattributionDto {
  @Type(() => Number)
  @IsInt({ message: 'Choisissez le nouveau médecin.' })
  doctorId!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(500)
  motif?: string;
}

type Req_ = Request & { user: JwtPayload };

/** /api/regulateur — espace du régulateur (réattribution des patients à un médecin disponible) */
@Controller('regulateur')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('regulateur')
export class RegulateurController {
  constructor(
    private readonly service: RegulateurService,
    private readonly agenda: RegulateurAgendaService,
  ) {}

  /** GET …/consultations → consultations ouvertes du jour + état du médecin attribué */
  @Get('consultations')
  consultations(@Req() req: Req_) {
    return this.service.consultations(req.user.sub);
  }

  /** GET …/consultations/:id/medecins → médecins proposés pour la réattribution */
  @Get('consultations/:id/medecins')
  medecins(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.medecins(req.user.sub, id);
  }

  /** POST …/consultations/:id/reattribuer { doctorId, motif? } */
  @Post('consultations/:id/reattribuer')
  reattribuer(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: ReattributionDto) {
    return this.service.reattribuer(req.user.sub, id, dto.doctorId, dto.motif, contexteAudit(req));
  }

  /** GET …/calendrier?semaine=AAAA-MM-JJ → médecins de l'hôpital et leurs disponibilités de la semaine */
  @Get('calendrier')
  calendrier(@Req() req: Req_, @Query('semaine') semaine?: string) {
    return this.agenda.calendrier(req.user.sub, semaine);
  }

  /** GET …/planning → mon planning (mêmes données que l'écran « Mon planning » des agents) */
  @Get('planning')
  planning(@Req() req: Req_) {
    return this.agenda.planning(req.user.sub);
  }

  /** GET / POST …/permissions → mes demandes de permission / nouvelle demande */
  @Get('permissions')
  permissions(@Req() req: Req_) {
    return this.agenda.permissions(req.user.sub);
  }

  @Post('permissions')
  creerPermission(@Req() req: Req_, @Body() dto: CreerPermissionRegulateur) {
    return this.agenda.creerPermission(req.user.sub, dto);
  }

  /** GET …/historique → réattributions de l'hôpital */
  @Get('historique')
  historique(@Req() req: Req_) {
    return this.service.historique(req.user.sub);
  }
}
