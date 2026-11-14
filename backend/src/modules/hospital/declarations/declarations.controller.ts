import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { DeclarationsService } from './declarations.service';

type Req_ = Request & { user: JwtPayload };

/**
 * Routes (réservées à l'hôpital connecté) :
 *   GET /api/hospital/declarations/naissances     → liste des naissances
 *   GET /api/hospital/declarations/naissances/:id → détail + certificat de naissance
 *   GET /api/hospital/declarations/deces          → liste des décès
 *   GET /api/hospital/declarations/deces/:id      → détail + certificat de décès
 */
@Controller('hospital/declarations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class DeclarationsController {
  constructor(private readonly service: DeclarationsService) {}

  @Get('naissances')
  naissances(@Req() req: Req_) {
    return this.service.naissances(req.user.sub);
  }

  @Get('naissances/:id')
  naissanceDetail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.naissanceDetail(req.user.sub, id);
  }

  @Get('deces')
  deces(@Req() req: Req_) {
    return this.service.deces(req.user.sub);
  }

  @Get('deces/:id')
  decesDetail(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.decesDetail(req.user.sub, id);
  }
}

