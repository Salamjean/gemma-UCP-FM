import { Body, Controller, Get, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { contexteAudit } from '../../common/audit/audit.service';
import { IMAGE_MAX_SIZE } from '../../common/uploads';
import type { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProfilService, ROLES_PROFIL } from './profil.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Formulaire multipart (photo facultative « image ») ; les champs autorisés dépendent du rôle (service) */
class MajProfilDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) nom?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) prenom?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) contact?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) adresse?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) district?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(191) direction?: string;
}

class MotDePasseDto {
  @IsString() @MaxLength(191) actuel!: string;
  @IsString() @MaxLength(191) nouveau!: string;
  @IsString() @MaxLength(191) confirmation!: string;
}

type Req_ = Request & { user: JwtPayload };

/** /api/profil — « Mon profil » de l'utilisateur connecté (admin, hôpital, médecin, infirmier·ère, régulateur) */
@Controller('profil')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_PROFIL)
export class ProfilController {
  constructor(private readonly service: ProfilService) {}

  @Get()
  lire(@Req() req: Req_) {
    return this.service.lire(req.user.sub, req.user.role);
  }

  @Put()
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: IMAGE_MAX_SIZE } }))
  modifier(@Req() req: Req_, @Body() dto: MajProfilDto, @UploadedFile() image?: Express.Multer.File) {
    return this.service.modifier(req.user.sub, req.user.role, dto, contexteAudit(req), image);
  }

  @Put('mot-de-passe')
  motDePasse(@Req() req: Req_, @Body() dto: MotDePasseDto) {
    return this.service.motDePasse(req.user.sub, dto.actuel, dto.nouveau, dto.confirmation, contexteAudit(req));
  }
}
