import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService, contexteAudit } from '../../../common/audit/audit.service';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { DiffusionDto } from './dto/diffusion.dto';
import { NotificationsPushService } from './notifications-push.service';

type Req2 = Request & { user: JwtPayload };

/**
 * Routes (réservées au super admin) :
 *   GET    /api/super/notifications                 → liste des diffusions (recherche, categorie, page) + statistiques
 *   GET    /api/super/notifications/statistiques    → appareils (pour le formulaire)
 *   GET    /api/super/notifications/patients        → patients (cible "Patient spécifique")
 *   GET    /api/super/notifications/:lot            → détail d'une diffusion et ses destinataires
 *   POST   /api/super/notifications                 → nouvelle diffusion
 *   POST   /api/super/notifications/:lot/relancer   → relancer à l'identique
 *   DELETE /api/super/notifications/:lot            → supprimer la campagne de l'historique
 * Chaque action est tracée dans le journal d'audit (comme Laravel).
 */
@Controller('super/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NotificationsPushController {
  constructor(
    private readonly service: NotificationsPushService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  liste(@Query('recherche') recherche = '', @Query('categorie') categorie = '', @Query('page') page = '1') {
    return this.service.liste(recherche, categorie, Number(page));
  }

  @Get('statistiques')
  statistiques() {
    return this.service.statistiques();
  }

  @Get('patients')
  patients() {
    return this.service.patients();
  }

  @Get(':lot')
  detail(@Param('lot') lot: string) {
    return this.service.detail(lot);
  }

  @Post()
  async diffuser(@Body() dto: DiffusionDto, @Req() req: Req2) {
    const auteur = await this.service.auteur(req.user.sub);
    const r = await this.service.diffuser(dto, auteur);
    await this.audit.log(
      contexteAudit(req),
      'DIFFUSION_PUSH',
      'NOTIFICATION',
      `Diffusion Push envoyée : '${dto.titre}' (${r.push} push envoyés, ${r.inApp} patients ciblés) - Lot ${r.lot}`,
      { batch_id: r.lot, target: dto.cible, category: dto.categorie, title: dto.titre, push_sent: r.push, in_app_created: r.inApp, user_id: auteur.id },
    );
    return { lot: r.lot, ...this.service.messageResultat(r, dto.titre) };
  }

  @Post(':lot/relancer')
  async relancer(@Param('lot') lot: string, @Req() req: Req2) {
    const auteur = await this.service.auteur(req.user.sub);
    const r = await this.service.relancer(lot, auteur);
    await this.audit.log(
      contexteAudit(req),
      'RELANCE_PUSH',
      'NOTIFICATION',
      `Relance de la notification Push : '${r.titre}' (${r.push} push envoyés, ${r.inApp} patients ciblés) - Nouveau Lot ${r.lot}`,
      { original_batch: lot, new_batch_id: r.lot, target: r.cible, title: r.titre, push_sent: r.push, in_app_created: r.inApp, user_id: auteur.id },
    );
    return { lot: r.lot, ...this.service.messageResultat(r, r.titre, true) };
  }

  @Delete(':lot')
  async supprimer(@Param('lot') lot: string, @Req() req: Req2) {
    const n = await this.service.supprimer(lot);
    await this.audit.log(
      contexteAudit(req),
      'SUPPRESSION_NOTIFICATION',
      'NOTIFICATION',
      `Suppression de la campagne de notification : ${lot} (${n} entrées supprimées)`,
      { identifier: lot, user_id: req.user.sub },
    );
    return { message: "Campagne de notification supprimée de l'historique." };
  }
}
