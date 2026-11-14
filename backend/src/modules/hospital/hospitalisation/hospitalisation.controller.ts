import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ChambresService } from './chambres.service';
import { ChambreDto } from './dto/chambre.dto';
import { SuiviService } from './suivi.service';

type Req_ = Request & { user: JwtPayload };

/**
 * Routes (réservées au rôle hospital, données de SON hôpital) :
 *   Chambres & lits
 *     GET    /api/hospital/chambres             → liste (+ occupation des lits)
 *     POST   /api/hospital/chambres             → ajout (chambre + lits)
 *     GET    /api/hospital/chambres/:id         → fiche (lits)
 *     PUT    /api/hospital/chambres/:id         → modification (chambre + lits ajoutés / renommés / retirés)
 *     PATCH  /api/hospital/chambres/:id/statut  → activer / désactiver
 *     DELETE /api/hospital/chambres/:id         → suppression (refusée si un lit est occupé)
 *   Suivi (lecture)
 *     GET    /api/hospital/hospitalisations(/:id)
 *     GET    /api/hospital/observations(/:id)
 */
@Controller('hospital')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class HospitalisationController {
  constructor(
    private readonly chambres: ChambresService,
    private readonly suivi: SuiviService,
  ) {}

  // --- Chambres ---
  @Get('chambres')
  listeChambres(@Req() req: Req_) {
    return this.chambres.liste(req.user.sub);
  }

  @Post('chambres')
  creerChambre(@Req() req: Req_, @Body() dto: ChambreDto) {
    return this.chambres.creer(req.user.sub, dto);
  }

  @Get('chambres/:id')
  chambre(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.chambres.detail(req.user.sub, id);
  }

  @Put('chambres/:id')
  modifierChambre(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: ChambreDto) {
    return this.chambres.modifier(req.user.sub, id, dto);
  }

  @Patch('chambres/:id/statut')
  statutChambre(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.chambres.basculerStatut(req.user.sub, id);
  }

  @Delete('chambres/:id')
  supprimerChambre(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.chambres.supprimer(req.user.sub, id);
  }

  // --- Hospitalisations & observations ---
  @Get('hospitalisations')
  hospitalisations(@Req() req: Req_) {
    return this.suivi.hospitalisations(req.user.sub);
  }

  @Get('hospitalisations/:id')
  hospitalisation(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.suivi.hospitalisation(req.user.sub, id);
  }

  @Get('observations')
  observations(@Req() req: Req_) {
    return this.suivi.observations(req.user.sub);
  }

  @Get('observations/:id')
  observation(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.suivi.observation(req.user.sub, id);
  }
}
