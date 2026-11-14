import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';
import { laravelNow } from '../../../common/laravel';

/**
 * HÔPITAL > PERMISSIONS (demandes d'absence du personnel)
 * Équivalent Laravel : app/Http/Controllers/PermissionController.php (status, update) — routes permission/{status}
 * Table permissions :
 *   type   : doctor | male_nurse | secreteriat | cashier | accountant | pharmacy
 *   status : pending (en attente) | agree (accordée) | reject (refusée)
 *   _url   : justificatif facultatif (assets/uploads/permission/)
 * Régulateurs (rôle Gemma FM) : leurs demandes sont dans fm_permissions_regulateurs (type « regulateur »),
 * ajoutées aux mêmes listes et compteurs.
 * Les demandes sont faites par le personnel (médecins, infirmiers…) depuis leur espace ;
 * l'hôpital les consulte et les accorde ou les rejette.
 */
export type StatutPermission = 'pending' | 'agree' | 'reject';
export const STATUTS: StatutPermission[] = ['pending', 'agree', 'reject'];

@Injectable()
export class PermissionsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Demandes d'un statut (comme PermissionController@status) + nombre de demandes par statut */
  async liste(userId: number, statut: StatutPermission) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const [rows, compte, rowsReg, compteReg] = await Promise.all([
      this.db.query(
        `SELECT p.*, TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, ''))) AS agent, u.email,
                d.type_agent_id, COALESCE(d.matricule, i.matricule) AS matricule
           FROM permissions p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN doctors d ON d.user_id = p.user_id AND p.type = 'doctor'
           LEFT JOIN infirmiers i ON i.user_id = p.user_id AND p.type = 'male_nurse'
          WHERE p.hospital_id = ? AND p.status = ?
          ORDER BY p.beging_date DESC, p.id DESC`,
        [hospitalId, statut],
      ),
      this.db.query('SELECT status, COUNT(*) AS n FROM permissions WHERE hospital_id = ? GROUP BY status', [hospitalId]),
      this.db.query(
        `SELECT p.*, 'regulateur' AS type, TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, ''))) AS agent, u.email,
                NULL AS type_agent_id, r.matricule, NULL AS _url
           FROM fm_permissions_regulateurs p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN fm_regulateurs r ON r.user_id = p.user_id
          WHERE p.hospital_id = ? AND p.status = ?
          ORDER BY p.beging_date DESC, p.id DESC`,
        [hospitalId, statut],
      ),
      this.db.query('SELECT status, COUNT(*) AS n FROM fm_permissions_regulateurs WHERE hospital_id = ? GROUP BY status', [hospitalId]),
    ]);
    const compteurs = Object.fromEntries(STATUTS.map((s) => [s, 0])) as Record<StatutPermission, number>;
    for (const c of [...compte, ...compteReg]) if (STATUTS.includes(c.status)) compteurs[c.status as StatutPermission] += Number(c.n);
    // Demandes Laravel + demandes des régulateurs, les plus récentes d'abord
    const toutes = [...rows, ...rowsReg].sort(
      (a: Record<string, any>, b: Record<string, any>) => new Date(b.beging_date).getTime() - new Date(a.beging_date).getTime() || Number(b.id) - Number(a.id),
    );

    return {
      compteurs,
      demandes: toutes.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        code: r.code,
        type: r.type,
        sageFemme: Number(r.type_agent_id) === 2,
        agent: (r.agent as string) || '—',
        email: r.email ?? null,
        matricule: r.matricule ?? null,
        debut: r.beging_date,
        fin: r.end_date,
        heureDebut: r.beging_time ?? null,
        heureFin: r.end_time ?? null,
        motif: r.description ?? null,
        justificatif: r._url ?? null,
        statut: r.status,
        demandeLe: r.created_at,
        traiteLe: r.status === 'pending' ? null : r.updated_at,
      })),
    };
  }

  /**
   * Accorder / rejeter (comme PermissionController@update).
   * Comme dans l'écran Laravel, seule une demande en attente peut être traitée (et seulement celles de l'hôpital).
   */
  async traiter(userId: number, id: number, statut: 'agree' | 'reject', regulateur = false) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    // Nom de table choisi ici (jamais depuis la requête)
    const table = regulateur ? 'fm_permissions_regulateurs' : 'permissions';
    const [p] = await this.db.query(
      `SELECT p.id, p.status, TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, ''))) AS agent
         FROM ${table} p JOIN users u ON u.id = p.user_id
        WHERE p.id = ? AND p.hospital_id = ?`,
      [id, hospitalId],
    );
    if (!p) throw new NotFoundException('Demande de permission introuvable');
    if (p.status !== 'pending') throw new ConflictException('Cette demande a déjà été traitée.');
    await this.db.query(`UPDATE ${table} SET status = ?, updated_at = ? WHERE id = ?`, [statut, laravelNow(), id]);
    return {
      statut,
      message: statut === 'agree' ? `La permission de ${p.agent} a été accordée.` : `La permission de ${p.agent} a été refusée.`,
    };
  }
}
