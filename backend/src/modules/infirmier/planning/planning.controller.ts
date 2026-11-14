import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { InfirmierPlanningService, MajDisponibilitesDto } from './planning.service';

@Controller('infirmier/planning')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('infirmier')
export class InfirmierPlanningController {
  constructor(private readonly service: InfirmierPlanningService) {}

  @Get()
  getPlanning(@Req() req: Request & { user: JwtPayload }) {
    return this.service.getPlanning(req.user.sub);
  }

  @Post('disponibilites')
  majDisponibilites(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: MajDisponibilitesDto,
  ) {
    return this.service.majDisponibilites(req.user.sub, dto);
  }
}

