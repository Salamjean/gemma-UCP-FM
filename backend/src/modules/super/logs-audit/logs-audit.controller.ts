import { Controller, Delete, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService, contexteAudit } from '../../../common/audit/audit.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { LogsAuditService, type FiltresAudit } from './logs-audit.service';

/**
 * Routes (réservées au super admin) :
 *   GET    /api/super/logs/audit                 → journal d'audit (filtres : recherche, hopital, action, role, debut, fin, page)
 *   GET    /api/super/logs/audit/export          → export Excel (.xls) avec les mêmes filtres
 *   GET    /api/super/logs/laravel               → logs système Laravel (niveau, recherche)
 *   GET    /api/super/logs/laravel/telecharger   → fichier laravel.log brut
 *   DELETE /api/super/logs/laravel               → vider laravel.log
 * Les actions (export, téléchargement, purge) sont elles-mêmes tracées dans le journal, comme dans Laravel.
 */
@Controller('super/logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class LogsAuditController {
  constructor(
    private readonly service: LogsAuditService,
    private readonly audit: AuditService,
  ) {}

  @Get('audit')
  journal(@Query() f: FiltresAudit) {
    return this.service.journal(f);
  }

  @Get('audit/export')
  async exporter(@Query() f: FiltresAudit, @Req() req: Request, @Res() res: Response) {
    const { html, lignes, nom } = await this.service.exportExcel(f);
    await this.audit.log(contexteAudit(req), 'EXPORT_EXCEL', 'SYSTEME', `Exportation Excel du Journal d'Audit (${lignes} lignes)`);
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.send(html);
  }

  @Get('laravel')
  logsLaravel(@Query('niveau') niveau = 'ALL', @Query('recherche') recherche = '') {
    return this.service.logsLaravel(niveau, recherche);
  }

  @Get('laravel/telecharger')
  async telecharger(@Req() req: Request, @Res() res: Response) {
    const fichier = this.service.cheminLogLaravel();
    await this.audit.log(contexteAudit(req), 'TELECHARGEMENT_LOG', 'SYSTEME', 'Téléchargement du fichier brut de log Laravel (laravel.log)');
    const horodatage = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    res.download(fichier, `laravel_${horodatage}.log`);
  }

  @Delete('laravel')
  async vider(@Req() req: Request) {
    await this.service.viderLogsLaravel();
    await this.audit.log(contexteAudit(req), 'SUPPRESSION', 'SYSTEME', 'Le Super Administrateur a vidé le fichier des logs système Laravel.');
    return { message: 'Les logs Laravel ont été purgés avec succès.' };
  }
}
