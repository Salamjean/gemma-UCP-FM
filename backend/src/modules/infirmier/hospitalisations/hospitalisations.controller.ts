import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AjouterSurveillanceDto, InfirmierHospitalisationsService } from './hospitalisations.service';

@Controller('infirmier/hospitalisations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('infirmier')
export class InfirmierHospitalisationsController {
  constructor(private readonly service: InfirmierHospitalisationsService) {}

  @Get('en-cours')
  getEnCours(@Req() req: Request & { user: JwtPayload }) {
    return this.service.getEnCours(req.user.sub);
  }

  @Get('historique')
  getHistorique(@Req() req: Request & { user: JwtPayload }) {
    return this.service.getHistorique(req.user.sub);
  }

  @Get(':id/suivi')
  getSuivi(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getSuivi(req.user.sub, id);
  }

  /** POST /api/infirmier/hospitalisations/heures/:heureId/appliquer → protocole appliqué à cette heure */
  @Post('heures/:heureId/appliquer')
  appliquerHeure(@Req() req: Request & { user: JwtPayload }, @Param('heureId', ParseIntPipe) heureId: number) {
    return this.service.appliquerHeure(req.user.sub, heureId);
  }

  @Post(':id/surveillance')
  ajouterSurveillance(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AjouterSurveillanceDto,
  ) {
    return this.service.ajouterSurveillance(req.user.sub, id, dto);
  }
}

