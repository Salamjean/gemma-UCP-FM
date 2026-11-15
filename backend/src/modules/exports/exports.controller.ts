import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { AuditService, contexteAudit } from '../../common/audit/audit.service';
import { hopitalDemande } from '../../common/contexte-requete';
import { hopitalDuCompte } from '../../common/hopital-courant';
import type { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ADMIN_ROLE } from '../users/role-profiles';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class JournalExportDto {
  /** Module du journal d'audit (ex. PATIENT, PERSONNEL) */
  @Transform(trim)
  @Matches(/^[A-Z_]{2,40}$/, { message: 'Module invalide' })
  module!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description!: string;
}

/**
 * /api/exports — les exports Excel sont générés dans le navigateur (lignes déjà affichées) ;
 * cette route les trace dans le journal d'audit (EXPORT_EXCEL), comme Laravel le fait pour ses exports.
 * Réservée à l'admin UCP-FM et aux hôpitaux.
 */
@Controller('exports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ADMIN_ROLE, 'hospital')
export class ExportsController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}

  @Post('journal')
  @HttpCode(200)
  async journal(@Req() req: Request & { user: JwtPayload }, @Body() dto: JournalExportDto) {
    // Hôpital : le sien ; admin : l'hôpital ouvert (en-tête X-Hopital-Id) s'il y en a un
    const hospitalId = req.user.role === 'hospital' ? await hopitalDuCompte(this.db, req.user.sub) : hopitalDemande(req);
    await this.audit.log(contexteAudit(req), 'EXPORT_EXCEL', dto.module, dto.description, undefined, hospitalId);
    return { success: true };
  }
}
