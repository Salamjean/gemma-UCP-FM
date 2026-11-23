import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ALLOWED_ROLES } from '../users/role-profiles';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from './auth.service';

/**
 * Comptes déjà vérifiés : on ne relit la base qu'une fois par minute et par utilisateur
 * (les écrans interrogent l'API toutes les quelques secondes).
 */
const DUREE_CACHE_MS = 60_000;
const verifies = new Map<string, { jusqua: number; message: string | null }>();

/**
 * Protège une route : exige l'en-tête "Authorization: Bearer <jeton>".
 * Utilisation : @UseGuards(JwtAuthGuard) sur un contrôleur ou une route.
 * Le contenu du jeton est ensuite disponible dans req.user.
 *
 * Un jeton valide ne suffit pas : le compte doit TOUJOURS être actif (même règles qu'à la connexion).
 * Un compte désactivé, supprimé ou dont l'hôpital a quitté la DMHP perd l'accès en une minute au plus.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private users: UsersService | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Non connecté');

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expirée, reconnectez-vous');
    }
    // Rôle qui n'a plus accès (ex. session « super » ouverte avant le passage au rôle « admin ») : reconnexion
    if (!ALLOWED_ROLES.includes(payload.role)) throw new UnauthorizedException('Session expirée, reconnectez-vous');

    const refus = await this.compteRefuse(payload);
    if (refus) throw new UnauthorizedException(refus);

    req.user = payload;
    return true;
  }

  /** Message de refus si le compte n'est plus autorisé, sinon null */
  private async compteRefuse(payload: JwtPayload): Promise<string | null> {
    const id = Number(payload.sub);
    const maintenant = Date.now();
    const cle = `${id}:${payload.role}`;
    const connu = verifies.get(cle);
    if (connu && connu.jusqua > maintenant) return connu.message;

    const users: UsersService = (this.users ??= this.moduleRef.get(UsersService, { strict: false })!);
    const user = await users.findById(id);
    let message: string | null = null;
    if (!user) message = 'Compte introuvable';
    // Rôle changé dans Laravel depuis l'ouverture de la session : reconnexion
    else if (user.role !== payload.role) message = 'Session expirée, reconnectez-vous';
    else {
      const compte = await users.checkAccount(user);
      if (!compte.ok) message = compte.message;
    }

    if (verifies.size > 5000) verifies.clear();
    verifies.set(cle, { jusqua: maintenant + DUREE_CACHE_MS, message });
    return message;
  }
}
