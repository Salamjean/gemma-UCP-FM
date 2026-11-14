import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { HospitalTableauDeBordService } from './tableau-de-bord.service';

/** Route : GET /api/hospital/tableau-de-bord  (réservée au rôle hospital, données de SON hôpital) */
@Controller('hospital/tableau-de-bord')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class HospitalTableauDeBordController {
  constructor(private readonly service: HospitalTableauDeBordService) {}

  @Get()
  getDonnees(@Req() req: Request & { user: JwtPayload }) {
    return this.service.getDonnees(req.user.sub);
  }
}
