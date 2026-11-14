import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ReglagesService } from './reglages.service';

/**
 * Routes (réservées au super admin) :
 *   GET   /api/super/reglages/icones  → consultation des icônes actuelles
 *   POST  /api/super/reglages/icones  → mise à jour (multipart : logo, loading, favicon)
 */
@Controller('super/reglages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ReglagesController {
  constructor(private readonly service: ReglagesService) {}

  @Get('icones')
  getIcones() {
    return this.service.getIcones();
  }

  @Post('icones')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'loading', maxCount: 1 },
        { name: 'favicon', maxCount: 1 },
      ],
      { limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  updateIcones(
    @UploadedFiles()
    files: {
      logo?: Express.Multer.File[];
      loading?: Express.Multer.File[];
      favicon?: Express.Multer.File[];
    },
  ) {
    if (!files || (!files.logo?.length && !files.loading?.length && !files.favicon?.length)) {
      throw new BadRequestException('Veuillez sélectionner au moins un fichier à enregistrer.');
    }
    return this.service.updateIcones(files);
  }
}

