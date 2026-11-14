import { Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { appelsEntrants, rejoindreAppel, terminerAppel } from '../../../common/appel-video';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { InfirmierTeleconsultationsService } from './teleconsultations.service';

@Controller('infirmier/teleconsultations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('infirmier')
export class InfirmierTeleconsultationsController {
  constructor(
    private readonly service: InfirmierTeleconsultationsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** GET …/appels-entrants → appels de télémédecine lancés par l'autre participant (bandeau « Rejoindre ») */
  @Get('appels-entrants')
  appelsEntrants(@Req() req: Request & { user: JwtPayload }) {
    return appelsEntrants(this.db, req.user.sub);
  }

  /** POST …/:id/appel → démarrer l'appel vidéo ou rejoindre celui en cours (jeton LiveKit) */
  @Post(':id/appel')
  rejoindreAppel(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number) {
    return rejoindreAppel(this.db, req.user.sub, id);
  }

  /** POST …/:id/appel/terminer → raccrocher */
  @Post(':id/appel/terminer')
  terminerAppel(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number) {
    return terminerAppel(this.db, req.user.sub, id);
  }


  @Get()
  getTeleconsultations(
    @Req() req: Request & { user: JwtPayload },
    @Query('filter') filter?: 'all' | 'today' | 'upcoming' | 'completed',
  ) {
    return this.service.getTeleconsultations(req.user.sub, filter || 'all');
  }

  /** GET /api/infirmier/teleconsultations/en-attente → { enAttente } (badge "Télémédecine" de la sidebar) */
  @Get('en-attente')
  compterEnAttente(@Req() req: Request & { user: JwtPayload }) {
    return this.service.compterEnAttente(req.user.sub);
  }

  @Post(':id/lancer-appel')
  lancerAppel(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.lancerAppel(req.user.sub, id);
  }
}

