import { Controller, Get, Param, ParseIntPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { DoctorReferesService } from './referes.service';

type Req_ = Request & { user: JwtPayload };

/** /api/doctor/referes : patients référés (internes reçus, externes de tous les médecins) */
@Controller('doctor/referes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor')
export class DoctorReferesController {
  constructor(private readonly service: DoctorReferesService) {}

  @Get()
  liste(@Req() req: Req_) {
    return this.service.liste(req.user.sub);
  }

  /** GET /api/doctor/referes/:origineId → fiche de la référence */
  @Get(':origineId')
  detail(@Req() req: Req_, @Param('origineId', ParseIntPipe) origineId: number) {
    return this.service.detail(req.user.sub, origineId);
  }

  /** POST /api/doctor/referes/:origineId/prendre-en-charge → référence externe attribuée au médecin connecté */
  @Post(':origineId/prendre-en-charge')
  prendreEnCharge(@Req() req: Req_, @Param('origineId', ParseIntPipe) origineId: number) {
    return this.service.prendreEnCharge(req.user.sub, origineId);
  }

  /** GET /api/doctor/referes/:origineId/documents/:docId → téléchargement (protégé) */
  @Get(':origineId/documents/:docId')
  async fichier(@Req() req: Req_, @Param('origineId', ParseIntPipe) origineId: number, @Param('docId') docId: string, @Res() res: Response) {
    const { doc, contenu } = await this.service.fichier(req.user.sub, origineId, docId);
    const ext = doc.nom.includes('.') ? doc.nom.slice(doc.nom.lastIndexOf('.')) : '';
    const nom = `${doc.libelle}${ext}`.replace(/["\\r\n]/g, '');
    res.setHeader('Content-Type', doc.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nom)}"; filename*=UTF-8''${encodeURIComponent(nom)}`);
    res.send(contenu);
  }
}
