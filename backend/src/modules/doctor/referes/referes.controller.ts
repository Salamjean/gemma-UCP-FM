import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DOCUMENT_MAX_SIZE, DOCUMENTS_MAX_PAR_ENVOI } from '../../../common/documents-prives';
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

  /** GET /api/doctor/referes/disponibles → télé-expertises externes à prendre en charge (mon service) — avant « :origineId » */
  @Get('disponibles')
  disponibles(@Req() req: Req_) {
    return this.service.disponibles(req.user.sub);
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

  /** POST /api/doctor/referes/:origineId/resultat (multipart : avis, conduite, fichiers[] + libelles[]) → résultat de l'expert */
  @Post(':origineId/resultat')
  @UseInterceptors(FilesInterceptor('fichiers', DOCUMENTS_MAX_PAR_ENVOI, { limits: { fileSize: DOCUMENT_MAX_SIZE } }))
  envoyerResultat(
    @Req() req: Req_,
    @Param('origineId', ParseIntPipe) origineId: number,
    @UploadedFiles() fichiers: Express.Multer.File[],
    @Body('avis') avis: string,
    @Body('conduite') conduite: string,
    @Body('libelles') libelles: string | string[],
  ) {
    return this.service.envoyerResultat(req.user.sub, origineId, avis, conduite, fichiers ?? [], Array.isArray(libelles) ? libelles : libelles ? [libelles] : []);
  }

  /** POST /api/doctor/referes/:origineId/resultat/documents (multipart) → documents ajoutés à un résultat déjà envoyé */
  @Post(':origineId/resultat/documents')
  @UseInterceptors(FilesInterceptor('fichiers', DOCUMENTS_MAX_PAR_ENVOI, { limits: { fileSize: DOCUMENT_MAX_SIZE } }))
  ajouterDocumentsResultat(
    @Req() req: Req_,
    @Param('origineId', ParseIntPipe) origineId: number,
    @UploadedFiles() fichiers: Express.Multer.File[],
    @Body('libelles') libelles: string | string[],
  ) {
    return this.service.ajouterDocumentsResultat(req.user.sub, origineId, fichiers ?? [], Array.isArray(libelles) ? libelles : libelles ? [libelles] : []);
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
