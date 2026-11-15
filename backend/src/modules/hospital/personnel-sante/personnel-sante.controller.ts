import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  PipeTransform,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { IMAGE_MAX_SIZE } from '../../../common/uploads';
import type { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ADMIN_ROLE } from '../../users/role-profiles';
import { AgentDto } from './dto/agent.dto';
import { PersonnelSanteService, TYPES_AGENT, type TypeAgent } from './personnel-sante.service';

type Req_ = Request & { user: JwtPayload };

/** :type doit être medecin, sage-femme ou infirmier */
class TypeAgentPipe implements PipeTransform<string, TypeAgent> {
  transform(value: string): TypeAgent {
    if (!TYPES_AGENT.includes(value as TypeAgent)) throw new BadRequestException("Type d'agent inconnu");
    return value as TypeAgent;
  }
}

/**
 * Routes (réservées au rôle hospital, données de SON hôpital) — :type = medecin | sage-femme | infirmier
 *   GET    /api/hospital/personnel-sante/options          → services, actes, spécialités (formulaires)
 *   GET    /api/hospital/personnel-sante/:type            → liste
 *   POST   /api/hospital/personnel-sante/:type            → ajout (multipart, photo "image" facultative)
 *   GET    /api/hospital/personnel-sante/:type/:id        → fiche (formulaire Modifier)
 *   PUT    /api/hospital/personnel-sante/:type/:id        → modification (multipart)
 *   PATCH  /api/hospital/personnel-sante/:type/:id/statut → activer / désactiver
 *   PATCH  /api/hospital/personnel-sante/medecin/:id/chef → médecin chef oui / non
 *   DELETE /api/hospital/personnel-sante/:type/:id        → suppression (delete = 1, comme Laravel)
 */
@Controller('hospital/personnel-sante')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hospital')
export class PersonnelSanteController {
  constructor(private readonly service: PersonnelSanteService) {}

  @Get('options')
  options(@Req() req: Req_) {
    return this.service.options(req.user.sub);
  }

  @Patch('medecin/:id/chef')
  basculerChef(@Req() req: Req_, @Param('id', ParseIntPipe) id: number) {
    return this.service.basculerChef(req.user.sub, id);
  }

  @Get(':type')
  liste(@Req() req: Req_, @Param('type', TypeAgentPipe) type: TypeAgent) {
    return this.service.liste(req.user.sub, type);
  }

  @Post(':type')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: IMAGE_MAX_SIZE } }))
  creer(@Req() req: Req_, @Param('type', TypeAgentPipe) type: TypeAgent, @Body() dto: AgentDto, @UploadedFile() image?: Express.Multer.File) {
    return this.service.creer(req.user.sub, type, dto, image);
  }

  @Get(':type/:id')
  detail(@Req() req: Req_, @Param('type', TypeAgentPipe) type: TypeAgent, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(req.user.sub, type, id);
  }

  @Put(':type/:id')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: IMAGE_MAX_SIZE } }))
  modifier(
    @Req() req: Req_,
    @Param('type', TypeAgentPipe) type: TypeAgent,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgentDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    // Seul l'admin DMHP (hôpital ouvert) peut changer l'email de connexion d'un agent ; pas le compte de l'hôpital
    return this.service.modifier(req.user.sub, type, id, dto, image, req.user.role === ADMIN_ROLE);
  }

  @Patch(':type/:id/statut')
  basculerStatut(@Req() req: Req_, @Param('type', TypeAgentPipe) type: TypeAgent, @Param('id', ParseIntPipe) id: number) {
    return this.service.basculerStatut(req.user.sub, type, id);
  }

  @Delete(':type/:id')
  supprimer(@Req() req: Req_, @Param('type', TypeAgentPipe) type: TypeAgent, @Param('id', ParseIntPipe) id: number) {
    return this.service.supprimer(req.user.sub, type, id);
  }
}
