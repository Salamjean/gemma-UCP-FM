import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { ServicesService } from './services.service';

type Req_ = Request & { user: JwtPayload };

/**
 * Routes (réservées au rôle hospital, données de SON hôpital) :
 *   GET    /api/hospital/services                         → liste
 *   GET    /api/hospital/services/catalogue               → services pas encore ouverts (formulaire d'ajout)
 *   GET    /api/hospital/services/catalogue/:serviceId/actes → actes médicaux du catalogue d'un service
 *   POST   /api/hospital/services                         → ajout
 *   GET    /api/hospital/services/:id                     → fiche (actes + actes disponibles)
 *   PUT    /api/hospital/services/:id                     → modification des actes / prix
 *   PATCH  /api/hospital/services/:id/statut              → activer / désactiver
 *   DELETE /api/hospital/services/:id                     → suppression
 *   DELETE /api/hospital/services/:id/actes/:acteId       → suppression d'un acte
 */
@Controller('hospital/services')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @Get()
  liste(@Req() req: Req_) {
    return this.service.liste(req.user.sub);
  }

  @Get('catalogue')
  catalogue(@Req() req: Req_) {
    return this.service.catalogue(req.user.sub);
  }

  @Get('catalogue/:serviceId/actes')
  actesCatalogue(@Param('serviceId', ParseIntPipe) serviceId: number) {
    return this.service.actesCatalogue(serviceId);
  }

  @Post()
  creer(@Req() req: Req_, @Body() dto: CreateServiceDto) {
    return this.service.creer(req.user.sub, dto);
  }

  @Get(':id')
  detail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(req.user.sub, id);
  }

  @Put(':id')
  modifier(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceDto) {
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

  @Delete(':id/actes/:acteId')
  supprimerActe(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Param('acteId', ParseIntPipe) acteId: number) {
    return this.service.supprimerActe(req.user.sub, id, acteId);
  }
}
