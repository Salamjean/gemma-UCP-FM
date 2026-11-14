import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMAGE_MAX_SIZE } from '../../../common/uploads';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UpdateHopitalDto } from './dto/update-hopital.dto';
import { HopitalService } from './hopital.service';

/**
 * Routes (réservées au super admin) :
 *   GET   /api/super/hopitaux                      → liste
 *   GET   /api/super/hopitaux/localites            → sous-préfectures (formulaires)
 *   GET   /api/super/hopitaux/regions              → régions (champ "Direction régionale")
 *   POST  /api/super/hopitaux                      → ajout (multipart, "image" facultative)
 *   GET   /api/super/hopitaux/:id                  → fiche (formulaire Modifier)
 *   PUT   /api/super/hopitaux/:id                  → modification (multipart)
 *   PATCH /api/super/hopitaux/:id/statut           → activer / désactiver
 *   PATCH /api/super/hopitaux/:id/teleconsultation → activer / désactiver la téléconsultation
 *   GET   /api/super/hopitaux/:id/supervision      → portail de supervision (bouton "Ouvrir")
 */
@Controller('super/hopitaux')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class HopitalController {
  constructor(private readonly service: HopitalService) {}

  @Get()
  liste() {
    return this.service.liste();
  }

  @Get('localites')
  localites() {
    return this.service.localites();
  }

  @Get('regions')
  regions() {
    return this.service.regions();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: IMAGE_MAX_SIZE } }))
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHopitalDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.service.modifier(id, dto, image);
  }

  @Get(':id/supervision')
  supervision(@Param('id', ParseIntPipe) id: number) {
    return this.service.supervision(id);
  }
}
