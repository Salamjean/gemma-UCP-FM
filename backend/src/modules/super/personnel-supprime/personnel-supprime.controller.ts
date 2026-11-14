import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, type PipeTransform, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { TransfertDto } from './dto/transfert.dto';
import { PersonnelSupprimeService, type TypeAgent } from './personnel-supprime.service';

const TYPES: TypeAgent[] = ['medecin', 'sage-femme', 'infirmier'];

class TypeAgentPipe implements PipeTransform<string, TypeAgent> {
  transform(value: string): TypeAgent {
    if (!TYPES.includes(value as TypeAgent)) throw new BadRequestException("Type d'agent inconnu");
    return value as TypeAgent;
  }
}

/**
 * Routes (admin UCP-FM) — :type = medecin | sage-femme | infirmier
 *   GET    /api/super/personnel-supprime                       → agents supprimés par les hôpitaux UCP-FM
 *   GET    /api/super/personnel-supprime/options?hopital=:id   → hôpitaux UCP-FM (+ services, actes, spécialités de l'hôpital choisi)
 *   PATCH  /api/super/personnel-supprime/:type/:id/reintegrer  → réintégration dans son hôpital
 *   PATCH  /api/super/personnel-supprime/:type/:id/transferer  → changement d'hôpital
 *   DELETE /api/super/personnel-supprime/:type/:id             → suppression définitive
 */
@Controller('super/personnel-supprime')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PersonnelSupprimeController {
  constructor(private readonly service: PersonnelSupprimeService) {}

  @Get()
  liste() {
    return this.service.liste();
  }

  @Get('options')
  options(@Query('hopital') hopital?: string) {
    const id = hopital ? Number(hopital) : undefined;
    if (id !== undefined && !Number.isInteger(id)) throw new BadRequestException('Hôpital invalide');
    return this.service.options(id);
  }

  @Patch(':type/:id/reintegrer')
  reintegrer(@Param('type', TypeAgentPipe) type: TypeAgent, @Param('id', ParseIntPipe) id: number) {
    return this.service.reintegrer(type, id);
  }

  @Patch(':type/:id/transferer')
  transferer(@Param('type', TypeAgentPipe) type: TypeAgent, @Param('id', ParseIntPipe) id: number, @Body() dto: TransfertDto) {
    return this.service.transferer(type, id, dto);
  }

  @Delete(':type/:id')
  supprimer(@Req() req: Request & { user: JwtPayload }, @Param('type', TypeAgentPipe) type: TypeAgent, @Param('id', ParseIntPipe) id: number) {
    return this.service.supprimerDefinitivement(type, id, req.user.sub);
  }
}
