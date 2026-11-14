import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { DeclarationsService } from '../../hospital/declarations/declarations.service';
import { DecesDirectDto } from './declarations.dto';
import { DoctorDeclarationsService } from './declarations.service';

type Req_ = Request & { user: JwtPayload };

/**
 * /api/doctor/declarations — MÉDECIN > DÉCLARATIONS (comme Laravel doctor.declaration.*)
 *   listes et fiches : seulement les déclarations faites par le médecin connecté ;
 *   enregistrement direct d'un décès (patient existant ou nouveau défunt).
 */
@Controller('doctor/declarations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor')
export class DoctorDeclarationsController {
  constructor(
    private readonly listes: DeclarationsService,
    private readonly service: DoctorDeclarationsService,
  ) {}

  @Get('naissances')
  naissances(@Req() req: Req_) {
    return this.listes.naissances(req.user.sub, true);
  }

  @Get('naissances/:id')
  naissanceDetail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.listes.naissanceDetail(req.user.sub, id, true);
  }

  @Get('deces')
  deces(@Req() req: Req_) {
    return this.listes.deces(req.user.sub, true);
  }

  @Get('deces/options')
  options(@Req() req: Req_) {
    return this.service.options(req.user.sub);
  }

  @Get('deces/:id')
  decesDetail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.listes.decesDetail(req.user.sub, id, true);
  }

  /** GET …/patients?q= → recherche du patient décédé */
  @Get('patients')
  patients(@Req() req: Req_, @Query('q') q: string) {
    return this.service.patients(req.user.sub, q);
  }

  /** POST …/deces → enregistrement direct d'un décès */
  @Post('deces')
  enregistrerDeces(@Req() req: Req_, @Body() dto: DecesDirectDto) {
    return this.service.enregistrerDeces(req.user.sub, dto);
  }
}
