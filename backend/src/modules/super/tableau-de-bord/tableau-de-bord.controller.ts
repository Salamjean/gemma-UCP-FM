import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { TableauDeBordService } from './tableau-de-bord.service';

/** Route : GET /api/super/tableau-de-bord  (réservée au rôle super) */
@Controller('super/tableau-de-bord')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class TableauDeBordController {
  constructor(private readonly service: TableauDeBordService) {}

  @Get()
  getDonnees() {
    return this.service.getDonnees();
  }
}
