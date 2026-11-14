import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SpecialiteDto } from './dto/specialite.dto';
import { SpecialitesService } from './specialites.service';

type Req_ = Request & { user: JwtPayload };

/**
 * Routes (réservées au rôle hospital, données de SON hôpital) :
 *   GET    /api/hospital/specialites             → liste
 *   POST   /api/hospital/specialites             → ajout
 *   GET    /api/hospital/specialites/:id         → fiche
 *   PUT    /api/hospital/specialites/:id         → modification
 *   PATCH  /api/hospital/specialites/:id/statut  → activer / désactiver
 *   DELETE /api/hospital/specialites/:id         → suppression (delete = 1, comme Laravel)
 */
@Controller('hospital/specialites')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class SpecialitesController {
  constructor(private readonly service: SpecialitesService) {}

  @Get()
  liste(@Req() req: Req_) {
    return this.service.liste(req.user.sub);
  }

  @Post()
  creer(@Req() req: Req_, @Body() dto: SpecialiteDto) {
    return this.service.creer(req.user.sub, dto);
  }

  @Get(':id')
  detail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(req.user.sub, id);
  }

  @Put(':id')
  modifier(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: SpecialiteDto) {
    return this.service.modifier(req.user.sub, id, dto);
  }

  @Patch(':id/statut')
  basculerStatut(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.basculerStatut(req.user.sub, id);
  }

  @Delete(':id')
  supprimer(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.supprimer(req.user.sub, id);
  }
}
