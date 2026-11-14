import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { InterditAdmin, Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { PermissionsService, STATUTS, type StatutPermission } from './permissions.service';

type Req_ = Request & { user: JwtPayload };

class DecisionDto {
  @IsIn(['agree', 'reject'], { message: 'Décision invalide' })
  statut: 'agree' | 'reject';

  /** Demande d'un régulateur (table fm_permissions_regulateurs) */
  @IsOptional()
  @IsBoolean()
  regulateur?: boolean;
}

/**
 * Routes (réservées au rôle hospital, données de SON hôpital) :
 *   GET   /api/hospital/permissions?statut=pending|agree|reject → demandes + nombre par statut
 *   PATCH /api/hospital/permissions/:id   { statut: 'agree' | 'reject' } → accorder / rejeter une demande en attente
 */
@Controller('hospital/permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get()
  liste(@Req() req: Req_, @Query('statut') statut = 'pending') {
    if (!STATUTS.includes(statut as StatutPermission)) throw new BadRequestException('Statut inconnu');
    return this.service.liste(req.user.sub, statut as StatutPermission);
  }

  /** Réservé au compte de l'hôpital : l'admin UCP-FM voit les demandes mais n'y répond pas */
  @Patch(':id')
  @InterditAdmin()
  traiter(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: DecisionDto) {
    return this.service.traiter(req.user.sub, id, dto.statut, dto.regulateur === true);
  }
}
