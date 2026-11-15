import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hopitalDemande } from '../../common/contexte-requete';
import { ADMIN_ROLE } from '../users/role-profiles';
import type { JwtPayload } from './auth.service';
import { INTERDIT_ADMIN_KEY, ROLES_KEY } from './roles.decorator';

/** Vérifie que le rôle de l'utilisateur connecté fait partie de ceux demandés par @Roles(...) */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload; headers: Record<string, unknown> }>();
    const user = req.user;
    if (user && roles.includes(user.role)) return true;

    // Admin UCP-FM qui a ouvert un hôpital (en-tête X-Hopital-Id) : accès aux routes de l'espace hôpital,
    // sauf celles marquées @InterditAdmin (ex. répondre à une permission)
    if (user?.role === ADMIN_ROLE && roles.includes('hospital') && hopitalDemande(req as never)) {
      const interdit = this.reflector.getAllAndOverride<boolean>(INTERDIT_ADMIN_KEY, [context.getHandler(), context.getClass()]);
      if (interdit) throw new ForbiddenException('L’administration DMHP peut consulter cette information mais pas y répondre.');
      return true;
    }
    throw new ForbiddenException("Vous n'avez pas accès à cet espace.");
  }
}
