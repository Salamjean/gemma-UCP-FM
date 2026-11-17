import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards, Put } from '@nestjs/common';
import type { Request } from 'express';
import { contexteAudit } from '../../../common/audit/audit.service';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { InfirmierAccueilService } from '../../infirmier/gestion-patients/accueil.service';
import { InfirmierDossierService } from '../../infirmier/gestion-patients/dossier.service';
import { AffectationDto, InscriptionPatientDto, MiseAJourPatientDto } from '../../infirmier/gestion-patients/dto/accueil.dto';
import { InfirmierPatientsService, RecherchePatientParams } from '../../infirmier/gestion-patients/patients.service';
import { CreerPermissionDto, InfirmierPermissionsService } from '../../infirmier/permissions/permissions.service';
import { InfirmierPlanningService, MajDisponibilitesDto } from '../../infirmier/planning/planning.service';

type Req_ = Request & { user: JwtPayload };

/**
 * MÉDECIN / SAGE-FEMME : patients (inscription, recherche & affectation), permissions, planning.
 * Mêmes services que l'espace infirmier (agent de santé connecté : infirmier·ère OU médecin).
 */
@Controller('doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor')
export class DoctorAgentController {
  constructor(
    private readonly accueil: InfirmierAccueilService,
    private readonly patients: InfirmierPatientsService,
    private readonly permissions: InfirmierPermissionsService,
    private readonly planning: InfirmierPlanningService,
    private readonly dossiers: InfirmierDossierService,
  ) {}

  // --- Patients ---
  @Get('patients/options-accueil')
  optionsAccueil(@Req() req: Req_) {
    return this.accueil.options(req.user.sub);
  }

  @Post('patients')
  inscrire(@Req() req: Req_, @Body() dto: InscriptionPatientDto) {
    return this.accueil.inscrire(req.user.sub, dto, contexteAudit(req));
  }

  @Post('patients/:id/affecter')
  affecter(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: AffectationDto) {
    return this.accueil.affecter(req.user.sub, id, dto, contexteAudit(req));
  }

  /** Consultation du jour dans le service du médecin connecté, à son nom */
  @Post('patients/:id/consulter')
  consulter(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.accueil.consulter(req.user.sub, id, contexteAudit(req));
  }

  @Get('patients/rechercher')
  rechercher(@Req() req: Req_, @Query() params: RecherchePatientParams) {
    return this.patients.rechercher(req.user.sub, params);
  }

  /** Dossier médical complet du patient (toutes ses consultations), en lecture seule */
  @Get('patients/:id/dossier')
  dossier(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.dossiers.dossier(req.user.sub, id, 'doctor');
  }

  /** Parcours complet d'une intervention du dossier */
  @Get('patients/:id/parcours/:consultationId')
  parcours(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Param('consultationId', ParseIntPipe) consultationId: number) {
    return this.dossiers.parcours(req.user.sub, id, consultationId, 'doctor');
  }

  @Get('patients/:id/identite')
  identite(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.accueil.identite(req.user.sub, id);
  }

  @Put('patients/:id')
  modifierPatient(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: MiseAJourPatientDto) {
    return this.accueil.modifier(req.user.sub, id, dto, contexteAudit(req));
  }

  // --- Permissions ---
  @Get('permissions')
  getPermissions(@Req() req: Req_) {
    return this.permissions.getPermissions(req.user.sub);
  }

  @Post('permissions')
  creerPermission(@Req() req: Req_, @Body() dto: CreerPermissionDto) {
    return this.permissions.creerPermission(req.user.sub, dto);
  }

  // --- Planning ---
  @Get('planning')
  getPlanning(@Req() req: Req_) {
    return this.planning.getPlanning(req.user.sub);
  }

  @Post('planning/disponibilites')
  majDisponibilites(@Req() req: Req_, @Body() dto: MajDisponibilitesDto) {
    return this.planning.majDisponibilites(req.user.sub, dto);
  }
}
