import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AttribuerLitDto, DossierHospitalisationDto, SortieHospitalisationDto } from './dto/hospitalisation.dto';
import { DoctorHospitalisationService } from './hospitalisation.service';

type Req_ = Request & { user: JwtPayload };

/** /api/doctor/hospitalisations : hospitalisations des patients du médecin connecté */
@Controller('doctor/hospitalisations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor')
export class DoctorHospitalisationController {
  constructor(private readonly service: DoctorHospitalisationService) {}

  /** GET ?statut=en-attente|en-cours|historique */
  @Get()
  liste(@Req() req: Req_, @Query('statut') statut?: string) {
    return this.service.liste(req.user.sub, statut || 'en-cours');
  }

  @Get('compteurs')
  compteurs(@Req() req: Req_) {
    return this.service.compteurs(req.user.sub);
  }

  /** Chambres, lits libres et infirmiers pour l'attribution */
  @Get('options')
  options(@Req() req: Req_) {
    return this.service.options(req.user.sub);
  }

  @Get(':id')
  detail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(req.user.sub, id);
  }

  @Post(':id/lit')
  attribuerLit(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: AttribuerLitDto) {
    return this.service.attribuerLit(req.user.sub, id, dto);
  }

  @Put(':id/dossier')
  majDossier(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: DossierHospitalisationDto) {
    return this.service.majDossier(req.user.sub, id, dto);
  }

  @Post(':id/sortie')
  sortie(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: SortieHospitalisationDto) {
    return this.service.sortie(req.user.sub, id, dto);
  }
}
