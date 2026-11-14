import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AssurancesService } from './assurances.service';
import { AssuranceDto } from './dto/assurance.dto';

type Req_ = Request & { user: JwtPayload };

/**
 * Routes (réservées au rôle hospital, données de SON hôpital) :
 *   GET    /api/hospital/assurances             → liste
 *   POST   /api/hospital/assurances             → ajout
 *   GET    /api/hospital/assurances/:id         → fiche
 *   PUT    /api/hospital/assurances/:id         → modification
 *   PATCH  /api/hospital/assurances/:id/statut  → activer / désactiver
 *   DELETE /api/hospital/assurances/:id         → suppression (delete = 1, comme Laravel)
 */
@Controller('hospital/assurances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class AssurancesController {
  constructor(private readonly service: AssurancesService) {}

  @Get()
  liste(@Req() req: Req_) {
    return this.service.liste(req.user.sub);
  }

  @Post()
  creer(@Req() req: Req_, @Body() dto: AssuranceDto) {
    return this.service.creer(req.user.sub, dto);
  }

  @Get(':id')
  detail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(req.user.sub, id);
  }

  @Put(':id')
  modifier(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: AssuranceDto) {
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
