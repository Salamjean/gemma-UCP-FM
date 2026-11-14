import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { ADMIN_ROLE } from '../modules/users/role-profiles';
import { contexteRequete, hopitalDemande } from './contexte-requete';

/**
 * L'hôpital lié au compte connecté (hospitals.user_id), comme Auth::user()->hospital dans Laravel.
 * À utiliser dans tous les modules de l'espace hôpital : chaque donnée est limitée à CET hôpital.
 *
 * Admin UCP-FM qui a ouvert un hôpital (en-tête « X-Hopital-Id ») : c'est cet hôpital, s'il appartient au UCP-FM.
 */
export async function hopitalDuCompte(db: DataSource | EntityManager, userId: number): Promise<number> {
  const req = contexteRequete.getStore()?.req as (Express.Request & { user?: { role?: string; email?: string | null } }) | undefined;
  const user = req?.user;
  if (user?.role === ADMIN_ROLE) {
    const id = hopitalDemande(req as never);
    if (!id) throw new ForbiddenException('Ouvrez d’abord un hôpital depuis l’espace d’administration.');
    const [h] = await db.query('SELECT id FROM hospitals WHERE id = ? AND is_ucp_fm = 1 AND deleted_at IS NULL LIMIT 1', [id]);
    if (!h) throw new NotFoundException('Hôpital introuvable (seuls les hôpitaux UCP-FM sont gérés ici)');
    return Number(h.id);
  }
  const [row] = await db.query('SELECT id FROM hospitals WHERE user_id = ? AND deleted_at IS NULL LIMIT 1', [userId]);
  if (!row) throw new NotFoundException('Aucun hôpital lié à ce compte');
  return Number(row.id);
}
