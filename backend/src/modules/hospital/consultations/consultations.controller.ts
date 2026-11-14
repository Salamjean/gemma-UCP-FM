import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtPayload } from '../../auth/auth.service';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ConsultationsService } from './consultations.service';

type Req_ = Request & { user: JwtPayload };

/**
 * Routes (réservées à l'hôpital connecté) :
 *   GET /api/hospital/consultations/nouvelles  → consultations en cours (today)
 *   GET /api/hospital/consultations/historique → historique complet des consultations
 *   GET /api/hospital/consultations/:id        → fiche détaillée d'une consultation
 */
@Controller('hospital/consultations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class ConsultationsController {
  constructor(private readonly service: ConsultationsService) {}

  @Get('nouvelles')
  nouvelles(@Req() req: Req_) {
    return this.service.nouvelles(req.user.sub);
  }

  @Get('historique')
  historique(@Req() req: Req_) {
    return this.service.historique(req.user.sub);
  }

  @Get(':id')
  detail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(req.user.sub, id);
  }
}
