import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ALLOWED_ROLES } from '../users/role-profiles';
import type { JwtPayload } from './auth.service';

/**
 * Protège une route : exige l'en-tête "Authorization: Bearer <jeton>".
 * Utilisation : @UseGuards(JwtAuthGuard) sur un contrôleur ou une route.
 * Le contenu du jeton est ensuite disponible dans req.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

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
    req.user = payload;
    return true;
  }
}
