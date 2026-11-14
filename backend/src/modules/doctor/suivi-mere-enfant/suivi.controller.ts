import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SuiviPostnatalDto, SuiviPrenatalDto } from './suivi.dto';
import { SuiviMereEnfantService, type TypeSuivi } from './suivi.service';

type Req_ = Request & { user: JwtPayload };

const type = (t: string): TypeSuivi => {
  if (t !== 'prenatale' && t !== 'postnatale') throw new BadRequestException('Type de suivi inconnu.');
  return t;
};

/**
 * /api/doctor/suivi-mere-enfant — MÉDECIN / SAGE-FEMME > SUIVI MÈRE-ENFANT (PTME)
 * Équivalent Laravel : doctor.suivie.* (searchprenatale, searchpostnatale, storeprenatale, storepostnatale)
 */
@Controller('doctor/suivi-mere-enfant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor')
export class SuiviMereEnfantController {
  constructor(private readonly service: SuiviMereEnfantService) {}

  /** GET …/:type/patients?q= → mères (prénatal) ou enfants (postnatal) */
  @Get(':type/patients')
  rechercher(@Req() req: Req_, @Param('type') t: string, @Query('q') q: string) {
    return this.service.rechercher(req.user.sub, type(t), q);
  }

  /** GET …/:type/:patientId → patient et historique des suivis */
  @Get(':type/:patientId')
  dossier(@Req() req: Req_, @Param('type') t: string, @Param('patientId', ParseIntPipe) id: number) {
    return this.service.dossier(req.user.sub, type(t), id);
  }

  @Post('prenatale')
  prenatal(@Req() req: Req_, @Body() dto: SuiviPrenatalDto) {
    return this.service.prenatal(req.user.sub, dto);
  }

  @Post('postnatale')
  postnatal(@Req() req: Req_, @Body() dto: SuiviPostnatalDto) {
    return this.service.postnatal(req.user.sub, dto);
  }
}
