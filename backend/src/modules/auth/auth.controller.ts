import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { contexteAudit } from '../../common/audit/audit.service';
import { AuthService, type JwtPayload } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { ReinitialisationService } from './reinitialisation.service';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Routes :
 *   POST /api/auth/login  → connexion (comptes de la base Laravel)
 *   GET  /api/auth/me     → utilisateur connecté (jeton requis)
 *   POST /api/auth/mot-de-passe-oublie { email }                         → code envoyé par email
 *   POST /api/auth/reinitialiser       { email, code, nouveau, confirmation } → nouveau mot de passe
 */
class DemandeReinitialisationDto {
  @IsEmail({}, { message: 'Adresse email invalide.' })
  @MaxLength(191)
  email!: string;
}

class ReinitialisationDto extends DemandeReinitialisationDto {
  @IsString() @MaxLength(10) code!: string;
  @IsString() @MaxLength(191) nouveau!: string;
  @IsString() @MaxLength(191) confirmation!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly reinitialisation: ReinitialisationService,
  ) {}

  @Post('mot-de-passe-oublie')
  @HttpCode(200)
  demanderReinitialisation(@Body() dto: DemandeReinitialisationDto, @Req() req: Request) {
    return this.reinitialisation.demander(dto.email, contexteAudit(req, null));
  }

  @Post('reinitialiser')
  @HttpCode(200)
  reinitialiser(@Body() dto: ReinitialisationDto, @Req() req: Request) {
    return this.reinitialisation.reinitialiser(dto.email, dto.code, dto.nouveau, dto.confirmation, contexteAudit(req, null));
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, contexteAudit(req));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: JwtPayload }) {
    return this.authService.me(req.user.sub);
  }
}
