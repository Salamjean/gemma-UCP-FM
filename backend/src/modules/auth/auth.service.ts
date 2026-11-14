import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService, type ContexteAudit } from '../../common/audit/audit.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: number;
  email: string | null;
  role: string;
}

const INVALID_CREDENTIALS = 'Adresse email ou mot de passe incorrect !';

/**
 * Connexion avec les comptes de la base Laravel (table users).
 * Même règles que Laravel : compte existant, profil actif, mot de passe bcrypt valide.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** @param ctx contexte de la requête (IP, navigateur) pour le journal d'audit */
  async login({ email, password, remember }: LoginDto, ctx?: ContexteAudit) {
    // Email inconnu et mauvais mot de passe donnent le MÊME message :
    // on ne révèle pas à un inconnu quels emails existent dans la base.
    const user = await this.usersService.findByEmailWithPassword(email.trim());
    if (!user) throw new UnauthorizedException(INVALID_CREDENTIALS);

    // 1) Mot de passe : Laravel hache en "$2y$", identique à "$2a$" pour bcryptjs
    const hash = user.password.replace(/^\$2y\$/, '$2a$');
    const valid = await bcrypt.compare(password, hash);
    if (!valid) throw new UnauthorizedException(INVALID_CREDENTIALS);

    // 2) Compte autorisé ? (mêmes règles que Laravel : profil actif selon le rôle)
    const account = await this.usersService.checkAccount(user);
    if (!account.ok) {
      // Journal d'audit, comme Laravel (CustomAuthController::login)
      if (ctx) {
        await this.audit.log(
          { ...ctx, userId: null },
          'ECHEC_CONNEXION',
          'AUTHENTIFICATION',
          `Tentative de connexion refusée pour l'email: ${email} (${account.message})`,
          { email },
        );
      }
      throw new UnauthorizedException(account.message);
    }

    if (ctx) {
      const nom = String(user.prenom ?? user.name ?? '').trim();
      await this.audit.log(
        { ...ctx, userId: Number(user.id) },
        'CONNEXION',
        'AUTHENTIFICATION',
        `Connexion réussie de l'utilisateur: ${nom} (${user.role.toUpperCase()})`,
        { user_id: Number(user.id), email: user.email, role: user.role },
      );
    }

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const expiresIn = remember
      ? this.config.get<string>('JWT_EXPIRES_IN_REMEMBER', '30d')
      : this.config.get<string>('JWT_EXPIRES_IN', '8h');

    return {
      accessToken: await this.jwtService.signAsync(payload, { expiresIn }),
      user: await this.toPublicUser(user),
    };
  }

  /** Utilisateur connecté (à partir du jeton) — revérifie qu'il est toujours autorisé */
  async me(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Compte introuvable');
    const account = await this.usersService.checkAccount(user);
    if (!account.ok) throw new UnauthorizedException(account.message);
    return this.toPublicUser(user);
  }

  /** Données renvoyées au frontend (jamais le mot de passe) */
  private async toPublicUser(user: User) {
    return {
      id: Number(user.id),
      email: user.email,
      name: user.name,
      prenom: user.prenom,
      role: user.role,
      profile: await this.usersService.getProfile(user),
    };
  }
}
