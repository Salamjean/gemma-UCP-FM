import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';
import { laravelNow } from '../../../common/laravel';
import { AssuranceDto } from './dto/assurance.dto';

/**
 * HÔPITAL > ASSURANCES
 * Équivalent Laravel : TypeAssuranceController + app/Repositories/Hospital/TypeAssuranceRepository.php
 * Table type_assurances :
 *   reduction  : stockée en fraction (0.3 = 30 %), saisie en pourcentage
 *   status     : 0 = Activé, 1 = Désactivé
 *   delete     : 1 = supprimée (suppression "douce" de Laravel, la ligne reste pour l'historique)
 */
@Injectable()
export class AssurancesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Liste (comme TypeAssuranceRepository::index) + nombre de patients couverts */
  async liste(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const rows = await this.db.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM patients p WHERE p.type_assurance_id = t.id) AS patients
         FROM type_assurances t
        WHERE t.hospital_id = ? AND t.\`delete\` = 0
        ORDER BY t.libelle`,
      [hospitalId],
    );
    return rows.map((r: Record<string, unknown>) => ({ ...this.format(r), patients: Number(r.patients) }));
  }

  async detail(userId: number, id: number) {
    return this.format(await this.assuranceDeLHopital(userId, id));
  }

  /** Ajout (comme TypeAssuranceRepository::store) */
  async creer(userId: number, dto: AssuranceDto) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const now = laravelNow();
    const reference = `TA-${Math.floor(Math.random() * 100000)}`; // 'TA-' . rand(00000, 99999)
    const r = await this.db.query(
      `INSERT INTO type_assurances (reference, hospital_id, libelle, reduction, description, status, \`delete\`, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [reference, hospitalId, dto.libelle, dto.reduction / 100, dto.description || null, now, now],
    );
    return { id: Number(r.insertId), message: `L'assurance « ${dto.libelle} » a été ajoutée avec succès.` };
  }

  /** Modification (comme TypeAssuranceRepository::update) */
  async modifier(userId: number, id: number, dto: AssuranceDto) {
    await this.assuranceDeLHopital(userId, id);
    await this.db.query(
      'UPDATE type_assurances SET libelle = ?, reduction = ?, description = ?, updated_at = ? WHERE id = ?',
      [dto.libelle, dto.reduction / 100, dto.description || null, laravelNow(), id],
    );
    return { message: `L'assurance « ${dto.libelle} » a été modifiée avec succès.` };
  }

  /** Activer / désactiver (comme TypeAssuranceRepository::status) */
  async basculerStatut(userId: number, id: number) {
    const a = await this.assuranceDeLHopital(userId, id);
    const status = Number(a.status) === 0 ? 1 : 0;
    await this.db.query('UPDATE type_assurances SET status = ?, updated_at = ? WHERE id = ?', [status, laravelNow(), id]);
    return { actif: status === 0, message: `L'assurance « ${a.libelle} » est maintenant ${status === 0 ? 'activée' : 'désactivée'}.` };
  }

  /** Suppression (comme TypeAssuranceController@delete : delete = 1, la ligne est conservée) */
  async supprimer(userId: number, id: number) {
    const a = await this.assuranceDeLHopital(userId, id);
    await this.db.query('UPDATE type_assurances SET `delete` = 1, updated_at = ? WHERE id = ?', [laravelNow(), id]);
    return { message: `L'assurance « ${a.libelle} » a été supprimée.` };
  }

  // ---------------------------------------------------------------------------

  private async assuranceDeLHopital(userId: number, id: number): Promise<Record<string, unknown>> {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const [r] = await this.db.query('SELECT * FROM type_assurances WHERE id = ? AND hospital_id = ? AND `delete` = 0', [id, hospitalId]);
    if (!r) throw new NotFoundException('Assurance introuvable');
    return r;
  }

  private format(r: Record<string, unknown>) {
    return {
      id: Number(r.id),
      reference: r.reference,
      libelle: r.libelle,
      // 0.3 → 30 (arrondi pour éviter 30.000000000000004)
      reduction: Math.round(Number(r.reduction) * 10000) / 100,
      description: r.description ?? null,
      actif: Number(r.status) === 0,
      creeLe: r.created_at,
    };
  }
}
