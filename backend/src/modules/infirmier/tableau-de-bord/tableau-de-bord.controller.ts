import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { InfirmierTableauDeBordService } from './tableau-de-bord.service';

/** Route : GET /api/infirmier/tableau-de-bord  (réservée au rôle infirmier) */
@Controller('infirmier/tableau-de-bord')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('infirmier')
export class InfirmierTableauDeBordController {
  constructor(private readonly service: InfirmierTableauDeBordService) {}

  @Get()
  getDonnees(@Req() req: Request & { user: JwtPayload }) {
    return this.service.getDonnees(req.user.sub);
  }
}

