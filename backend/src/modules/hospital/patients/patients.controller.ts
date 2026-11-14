import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtPayload } from '../../auth/auth.service';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { PatientsService } from './patients.service';

type Req_ = Request & { user: JwtPayload };

/**
 * Routes (réservées à l'hôpital connecté) :
 *   GET /api/hospital/patients      → liste des patients
 *   GET /api/hospital/patients/:id  → fiche détaillée d'un patient
 */
@Controller('hospital/patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class PatientsController {
  constructor(private readonly service: PatientsService) {}

  @Get()
  liste(@Req() req: Req_) {
    return this.service.liste(req.user.sub);
  }

  @Get(':id')
  detail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(req.user.sub, id);
  }
}
