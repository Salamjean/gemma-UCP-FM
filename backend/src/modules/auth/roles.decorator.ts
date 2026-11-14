import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Réserve une route (ou un contrôleur) à certains rôles Laravel.
 * Exemple : @Roles('admin')  ou  @Roles('doctor', 'infirmier')
 * À utiliser avec @UseGuards(JwtAuthGuard, RolesGuard).
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const INTERDIT_ADMIN_KEY = 'interditAdminUcp';

/**
 * Route de l'espace hôpital interdite à l'admin UCP-FM même quand il a ouvert l'hôpital
 * (ex. répondre aux demandes de permission : il peut les voir, pas y répondre).
 */
export const InterditAdmin = () => SetMetadata(INTERDIT_ADMIN_KEY, true);
