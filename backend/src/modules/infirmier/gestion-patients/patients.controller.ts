import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { contexteAudit } from '../../../common/audit/audit.service';
import { InfirmierAccueilService } from './accueil.service';
import { InfirmierDossierService } from './dossier.service';
import { AffectationDto, InscriptionPatientDto, MiseAJourPatientDto } from './dto/accueil.dto';
import { InfirmierPatientsService, RecherchePatientParams } from './patients.service';

@Controller('infirmier/patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('infirmier')
export class InfirmierPatientsController {
  constructor(
    private readonly service: InfirmierPatientsService,
    private readonly accueil: InfirmierAccueilService,
    private readonly dossiers: InfirmierDossierService,
  ) {}

  /** GET /api/infirmier/patients/:id/parcours/:consultationId → parcours complet d'une intervention */
  @Get(':id/parcours/:consultationId')
  parcours(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Param('consultationId', ParseIntPipe) consultationId: number,
  ) {
    return this.dossiers.parcours(req.user.sub, id, consultationId);
  }

  /** GET /api/infirmier/patients/:id/dossier → dossier médical complet (page dédiée) */
  @Get(':id/dossier')
  dossier(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number) {
    return this.dossiers.dossier(req.user.sub, id);
  }

  /** GET /api/infirmier/patients/options-accueil → localités, prestations, médecins (formulaires d'inscription / affectation) */
  @Get('options-accueil')
  optionsAccueil(@Req() req: Request & { user: JwtPayload }) {
    return this.accueil.options(req.user.sub);
  }

  /** POST /api/infirmier/patients → inscription d'un nouveau patient (+ affectation facultative) */
  @Post()
  inscrire(@Req() req: Request & { user: JwtPayload }, @Body() dto: InscriptionPatientDto) {
    return this.accueil.inscrire(req.user.sub, dto, contexteAudit(req));
  }

  /** POST /api/infirmier/patients/:id/affecter → consultation du jour créée directement (pas de caisse) */
  @Post(':id/affecter')
  affecter(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number, @Body() dto: AffectationDto) {
    return this.accueil.affecter(req.user.sub, id, dto, contexteAudit(req));
  }

  /** POST /api/infirmier/patients/:id/consulter → consultation du jour dans le service de l'infirmier connecté */
  @Post(':id/consulter')
  consulter(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number) {
    return this.accueil.consulter(req.user.sub, id, contexteAudit(req));
  }

  /** GET /api/infirmier/patients/:id/identite → informations modifiables (formulaire « Mettre à jour ») */
  @Get(':id/identite')
  identite(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number) {
    return this.accueil.identite(req.user.sub, id);
  }

  /** PUT /api/infirmier/patients/:id → mise à jour des informations (ex. nom et prénoms d'un nouveau-né) */
  @Put(':id')
  modifier(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number, @Body() dto: MiseAJourPatientDto) {
    return this.accueil.modifier(req.user.sub, id, dto, contexteAudit(req));
  }

  @Get('liste')
  liste(@Req() req: Request & { user: JwtPayload }) {
    return this.service.liste(req.user.sub);
  }

  @Get('rechercher')
  rechercher(
    @Req() req: Request & { user: JwtPayload },
    @Query() params: RecherchePatientParams,
  ) {
    return this.service.rechercher(req.user.sub, params);
  }

  @Get(':id')
  detail(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.detail(req.user.sub, id);
  }
}

