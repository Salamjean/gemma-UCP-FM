import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { DOCUMENT_MAX_SIZE, DOCUMENTS_MAX_PAR_ENVOI } from '../../../common/documents-prives';
import { contexteAudit } from '../../../common/audit/audit.service';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { DoctorConsultationsService } from './consultations.service';
import { ProgrammationTelemedecineDto, ProgrammationTelemedecineService } from './programmation.service';
import { ConsultationCurativeDto, EnvoiMedecinDto } from './dto/consultation.dto';

type Req_ = Request & { user: JwtPayload };

/**
 * /api/infirmier/consultations-medicales/... : le MÊME formulaire de consultation que le médecin,
 * pour l'infirmier·ère qui consulte lui-même un patient (bouton « Consulter » de Vérifier / Rechercher).
 * Seules les consultations à son nom et sans médecin lui sont accessibles.
 */
@Controller('infirmier/consultations-medicales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('infirmier')
export class InfirmierConsultationMedicaleController {
  constructor(
    private readonly service: DoctorConsultationsService,
    private readonly programmation: ProgrammationTelemedecineService,
  ) {}

  @Get('medicaments')
  medicaments(@Query('q') q: string) {
    return this.service.medicaments(q);
  }

  /** Issue « Télémédecine » : hôpitaux et médecins disponibles */
  @Get('teleconsultation-hopitaux')
  teleHopitaux(@Query('date') date?: string, @Query('heure') heure?: string) {
    return this.service.teleHopitaux(date, heure);
  }

  @Get('teleconsultation-medecins/:hospitalId')
  teleMedecins(@Param('hospitalId', ParseIntPipe) hospitalId: number, @Query('date') date?: string, @Query('heure') heure?: string) {
    return this.service.teleMedecins(hospitalId, date, heure);
  }

  /** Télé-expertise en externe : services des autres établissements de la DMHP */
  @Get('services-externes')
  servicesExternes(@Req() req: Req_) {
    return this.service.servicesExternes(req.user.sub, 'infirmier');
  }

  @Get('medecins-reference')
  medecinsReference(@Req() req: Req_, @Query('date') date?: string, @Query('heure') heure?: string) {
    return this.service.medecinsReference(req.user.sub, 'infirmier', date, heure);
  }

  /** POST …/consultations-medicales/programmer → programmation directe d'une téléconsultation ou d'une télé-expertise (patient recherché) */
  @Post('programmer')
  programmer(@Req() req: Req_, @Body() dto: ProgrammationTelemedecineDto) {
    return this.programmation.programmer(req.user.sub, 'infirmier', dto, contexteAudit(req));
  }

  // --- Résultats d'expertise : télé-expertises que j'ai demandées, avec le résultat joint par l'expert ---
  @Get('resultats-expertise')
  resultatsExpertise(@Req() req: Req_) {
    return this.service.resultatsExpertise(req.user.sub, 'infirmier');
  }

  /** Badge du menu : résultats reçus non lus */
  @Get('resultats-expertise/non-lus')
  resultatsNonLus(@Req() req: Req_) {
    return this.service.resultatsNonLus(req.user.sub, 'infirmier');
  }

  /** Fiche du résultat (marque le résultat comme lu) */
  @Get('resultats-expertise/:origineId')
  resultatExpertise(@Req() req: Req_, @Param('origineId', ParseIntPipe) origineId: number) {
    return this.service.resultatExpertise(req.user.sub, origineId, 'infirmier');
  }

  /** Téléchargement d'un document joint par l'expert (protégé) */
  @Get('resultats-expertise/:origineId/documents/:docId')
  async fichierResultat(@Req() req: Req_, @Param('origineId', ParseIntPipe) origineId: number, @Param('docId') docId: string, @Res() res: Response) {
    const { doc, contenu } = await this.service.fichierResultat(req.user.sub, origineId, docId, 'infirmier');
    const ext = doc.nom.includes('.') ? doc.nom.slice(doc.nom.lastIndexOf('.')) : '';
    const nom = `${doc.libelle}${ext}`.replace(/["\\\r\n]/g, '');
    res.setHeader('Content-Type', doc.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nom)}"; filename*=UTF-8''${encodeURIComponent(nom)}`);
    res.send(contenu);
  }

  /** POST …/consultations-medicales/:id/envoyer-medecin → la consultation (non terminée) passe au médecin choisi */
  @Post(':id/envoyer-medecin')
  envoyerAuMedecin(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: EnvoiMedecinDto) {
    return this.service.envoyerAuMedecin(req.user.sub, id, dto.doctorId, dto.valeurs);
  }

  /** DELETE …/consultations-medicales/:id/annuler → consultation ouverte par « Consulter » annulée (quitter sans issue) */
  @Delete(':id/annuler')
  annulerConsultation(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.annulerConsultationOuverte(req.user.sub, id, 'infirmier');
  }

  @Get(':id/documents')
  documents(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.documents(req.user.sub, id, 'infirmier');
  }

  @Get(':id/references')
  references(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.references(req.user.sub, id, 'infirmier');
  }

  @Post(':id/references')
  @UseInterceptors(FilesInterceptor('fichiers', DOCUMENTS_MAX_PAR_ENVOI, { limits: { fileSize: DOCUMENT_MAX_SIZE } }))
  ajouterReferences(
    @Req() req: Req_,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() fichiers: Express.Multer.File[],
    @Body('libelles') libelles: string | string[],
  ) {
    return this.service.ajouterReferences(req.user.sub, id, fichiers ?? [], Array.isArray(libelles) ? libelles : libelles ? [libelles] : [], 'infirmier');
  }

  @Get(':id/references/:docId')
  async fichierReference(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Param('docId') docId: string, @Res() res: Response) {
    const { doc, contenu } = await this.service.fichierReference(req.user.sub, id, docId, 'infirmier');
    const ext = doc.nom.includes('.') ? doc.nom.slice(doc.nom.lastIndexOf('.')) : '';
    const nom = `${doc.libelle}${ext}`.replace(/["\\\r\n]/g, '');
    res.setHeader('Content-Type', doc.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nom)}"; filename*=UTF-8''${encodeURIComponent(nom)}`);
    res.send(contenu);
  }

  @Delete(':id/references/:docId')
  supprimerReference(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Param('docId') docId: string) {
    return this.service.supprimerReference(req.user.sub, id, docId, 'infirmier');
  }

  @Get(':id')
  formulaire(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.formulaire(req.user.sub, id, 'infirmier');
  }

  @Post(':id')
  enregistrer(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: ConsultationCurativeDto) {
    return this.service.enregistrer(req.user.sub, id, dto, 'infirmier');
  }
}
