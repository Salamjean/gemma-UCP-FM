import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { appelsEntrants, lienInvitation, rejoindreAppel, terminerAppel } from '../../../common/appel-video';
import { DOCUMENT_MAX_SIZE, DOCUMENTS_MAX_PAR_ENVOI } from '../../../common/documents-prives';
import { contexteAudit } from '../../../common/audit/audit.service';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { DoctorConsultationsService } from './consultations.service';
import { ProgrammationTelemedecineDto, ProgrammationTelemedecineService } from './programmation.service';
import { ConsultationCurativeDto } from './dto/consultation.dto';

type Req_ = Request & { user: JwtPayload };

/** /api/doctor/... : tableau de bord et consultations du médecin connecté */
@Controller('doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor')
export class DoctorConsultationsController {
  constructor(
    private readonly service: DoctorConsultationsService,
    @InjectDataSource() private readonly db: DataSource,
    private readonly programmation: ProgrammationTelemedecineService,
  ) {}

  /** GET …/appels-entrants → appels de télémédecine lancés par l'autre participant (bandeau « Rejoindre ») */
  @Get('telemedecines/appels-entrants')
  appelsEntrants(@Req() req: Req_) {
    return appelsEntrants(this.db, req.user.sub);
  }

  /** POST /api/doctor/telemedecines/programmer → programmation directe d'une téléconsultation ou d'une télé-expertise (patient recherché) */
  @Post('telemedecines/programmer')
  programmer(@Req() req: Req_, @Body() dto: ProgrammationTelemedecineDto) {
    return this.programmation.programmer(req.user.sub, 'doctor', dto, contexteAudit(req));
  }

  /** POST …/:id/appel → démarrer l'appel vidéo ou rejoindre celui en cours (jeton LiveKit) */
  @Post('telemedecines/:id/appel')
  rejoindreAppel(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return rejoindreAppel(this.db, req.user.sub, id);
  }

  /** GET …/:id/appel/invitation → lien sécurisé pour inviter un confrère (avis d'expert) */
  @Get('telemedecines/:id/appel/invitation')
  lienInvitation(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return lienInvitation(this.db, req.user.sub, id);
  }

  /** POST …/:id/appel/terminer → raccrocher */
  @Post('telemedecines/:id/appel/terminer')
  terminerAppel(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return terminerAppel(this.db, req.user.sub, id);
  }


  // --- Résultats d'expertise : télé-expertises que j'ai demandées, avec le résultat joint par l'expert ---
  @Get('resultats-expertise')
  resultatsExpertise(@Req() req: Req_) {
    return this.service.resultatsExpertise(req.user.sub, 'doctor');
  }

  /** Badge du menu : résultats reçus non lus */
  @Get('resultats-expertise/non-lus')
  resultatsNonLus(@Req() req: Req_) {
    return this.service.resultatsNonLus(req.user.sub, 'doctor');
  }

  /** Fiche du résultat (marque le résultat comme lu) */
  @Get('resultats-expertise/:origineId')
  resultatExpertise(@Req() req: Req_, @Param('origineId', ParseIntPipe) origineId: number) {
    return this.service.resultatExpertise(req.user.sub, origineId, 'doctor');
  }

  /** Téléchargement d'un document joint par l'expert (protégé) */
  @Get('resultats-expertise/:origineId/documents/:docId')
  async fichierResultat(@Req() req: Req_, @Param('origineId', ParseIntPipe) origineId: number, @Param('docId') docId: string, @Res() res: Response) {
    const { doc, contenu } = await this.service.fichierResultat(req.user.sub, origineId, docId, 'doctor');
    const ext = doc.nom.includes('.') ? doc.nom.slice(doc.nom.lastIndexOf('.')) : '';
    const nom = `${doc.libelle}${ext}`.replace(/["\\\r\n]/g, '');
    res.setHeader('Content-Type', doc.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nom)}"; filename*=UTF-8''${encodeURIComponent(nom)}`);
    res.send(contenu);
  }

  /** GET /api/doctor/tableau-de-bord */
  @Get('tableau-de-bord')
  tableauDeBord(@Req() req: Req_) {
    return this.service.tableauDeBord(req.user.sub);
  }

  /** GET /api/doctor/telemedecines?filtre=en-attente|aujourdhui|terminees|toutes */
  @Get('telemedecines')
  telemedecines(@Req() req: Req_, @Query('filtre') filtre?: string) {
    return this.service.telemedecines(req.user.sub, filtre || 'en-attente');
  }

  /** GET /api/doctor/consultations/nouvelles → patients du jour en attente */
  @Get('consultations/nouvelles')
  nouvelles(@Req() req: Req_) {
    return this.service.nouvelles(req.user.sub);
  }

  /** GET /api/doctor/consultations/en-attente → tous les patients en attente */
  @Get('consultations/en-attente')
  enAttente(@Req() req: Req_) {
    return this.service.enAttente(req.user.sub);
  }

  /** GET /api/doctor/consultations/historique */
  @Get('consultations/historique')
  historique(@Req() req: Req_) {
    return this.service.historique(req.user.sub);
  }

  /** GET /api/doctor/consultations/medicaments?q= → recherche pour l'ordonnance */
  @Get('consultations/medicaments')
  medicaments(@Query('q') q: string) {
    return this.service.medicaments(q);
  }

  /** GET /api/doctor/consultations/:id/documents → ordonnance, bulletin d'examens, arrêt de travail à imprimer */
  @Get('consultations/:id/documents')
  documents(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.documents(req.user.sub, id);
  }

  /** Issue « Télémédecine » : hôpitaux et médecins disponibles */
  @Get('consultations/teleconsultation-hopitaux')
  teleHopitaux(@Query('date') date?: string, @Query('heure') heure?: string) {
    return this.service.teleHopitaux(date, heure);
  }

  @Get('consultations/teleconsultation-medecins/:hospitalId')
  teleMedecins(@Param('hospitalId', ParseIntPipe) hospitalId: number, @Query('date') date?: string, @Query('heure') heure?: string) {
    return this.service.teleMedecins(hospitalId, date, heure);
  }

  /** Télé-expertise en externe : services des autres établissements de la DMHP */
  @Get('consultations/services-externes')
  servicesExternes(@Req() req: Req_) {
    return this.service.servicesExternes(req.user.sub);
  }

  /** Téléconsultations envoyées à mon service (sans médecin choisi), à prendre en charge */
  @Get('consultations/teleconsultations-disponibles')
  teleconsultationsDisponibles(@Req() req: Req_) {
    return this.service.teleconsultationsDisponibles(req.user.sub);
  }

  /** Prise en charge d'une téléconsultation envoyée au service : le premier qui la prend l'obtient */
  @Post('consultations/:id/prendre-teleconsultation')
  prendreTeleconsultation(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.prendreTeleconsultation(req.user.sub, id);
  }

  /** Télé-expertise en externe : hôpitaux de la DMHP qui ont ce service */
  @Get('consultations/services-externes/:serviceId/hopitaux')
  hopitauxService(@Req() req: Req_, @Param('serviceId', ParseIntPipe) serviceId: number) {
    return this.service.hopitauxService(req.user.sub, serviceId);
  }

  /** Télé-expertise en externe : médecins de ce service dans cet hôpital, disponibilité à la date / l'heure */
  @Get('consultations/services-externes/:serviceId/hopitaux/:hospitalId/medecins')
  medecinsService(
    @Req() req: Req_,
    @Param('serviceId', ParseIntPipe) serviceId: number,
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
    @Query('date') date?: string,
    @Query('heure') heure?: string,
  ) {
    return this.service.medecinsService(req.user.sub, serviceId, hospitalId, 'doctor', date, heure);
  }

  /** GET /api/doctor/consultations/medecins-reference → médecins de l'hôpital pour une référence interne */
  @Get('consultations/medecins-reference')
  medecinsReference(@Req() req: Req_, @Query('date') date?: string, @Query('heure') heure?: string) {
    return this.service.medecinsReference(req.user.sub, 'doctor', date, heure);
  }

  /** GET /api/doctor/consultations/:id/references → documents joints à la référence */
  @Get('consultations/:id/references')
  references(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.references(req.user.sub, id);
  }

  /** POST /api/doctor/consultations/:id/references (multipart : fichiers[] + libelles[]) */
  @Post('consultations/:id/references')
  @UseInterceptors(FilesInterceptor('fichiers', DOCUMENTS_MAX_PAR_ENVOI, { limits: { fileSize: DOCUMENT_MAX_SIZE } }))
  ajouterReferences(
    @Req() req: Req_,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() fichiers: Express.Multer.File[],
    @Body('libelles') libelles: string | string[],
  ) {
    return this.service.ajouterReferences(req.user.sub, id, fichiers ?? [], Array.isArray(libelles) ? libelles : libelles ? [libelles] : []);
  }

  /** GET /api/doctor/consultations/:id/references/:docId → téléchargement (protégé) */
  @Get('consultations/:id/references/:docId')
  async fichierReference(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Param('docId') docId: string, @Res() res: Response) {
    const { doc, contenu } = await this.service.fichierReference(req.user.sub, id, docId);
    const ext = doc.nom.includes('.') ? doc.nom.slice(doc.nom.lastIndexOf('.')) : '';
    const nom = `${doc.libelle}${ext}`.replace(/["\\\r\n]/g, '');
    res.setHeader('Content-Type', doc.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nom)}"; filename*=UTF-8''${encodeURIComponent(nom)}`);
    res.send(contenu);
  }

  /** DELETE /api/doctor/consultations/:id/annuler → consultation ouverte par « Consulter » annulée (quitter sans issue) */
  @Delete('consultations/:id/annuler')
  annulerConsultation(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.annulerConsultationOuverte(req.user.sub, id, 'doctor');
  }

  /** DELETE /api/doctor/consultations/:id/references/:docId */
  @Delete('consultations/:id/references/:docId')
  supprimerReference(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Param('docId') docId: string) {
    return this.service.supprimerReference(req.user.sub, id, docId);
  }

  /** GET /api/doctor/consultations/:id → formulaire (ou fiche en lecture si terminée) */
  @Get('consultations/:id')
  formulaire(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.formulaire(req.user.sub, id);
  }

  /** POST /api/doctor/consultations/:id → enregistrement de la consultation curative */
  @Post('consultations/:id')
  enregistrer(@Req() req: Req_, @Param('id', ParseIntPipe) id: number, @Body() dto: ConsultationCurativeDto) {
    return this.service.enregistrer(req.user.sub, id, dto);
  }
}
