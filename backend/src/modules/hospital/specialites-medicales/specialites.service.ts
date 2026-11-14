import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';
import { laravelNow } from '../../../common/laravel';
import { SpecialiteDto } from './dto/specialite.dto';

/**
 * HÔPITAL > SPÉCIALITÉS MÉDICALES
 * Équivalent Laravel : app/Http/Controllers/Hospital/TypeDoctorController.php
 * Table type_doctors (utilisée par doctors.type_doctor_id) :
 *   status : 0 = Activé, 1 = Désactivé
 *   delete : 1 = supprimée (la ligne reste, comme Laravel, pour les médecins qui y sont rattachés)
 */
@Injectable()
export class SpecialitesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Liste (comme TypeDoctorController@index) + nombre de médecins rattachés */
  async liste(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const rows = await this.db.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM doctors d WHERE d.type_doctor_id = t.id AND d.deleted_at IS NULL) AS medecins
         FROM type_doctors t
        WHERE t.hospital_id = ? AND t.\`delete\` = 0
        ORDER BY t.label`,
      [hospitalId],
    );
    return rows.map((r: Record<string, unknown>) => ({ ...this.format(r), medecins: Number(r.medecins) }));
  }

  async detail(userId: number, id: number) {
    return this.format(await this.specialiteDeLHopital(userId, id));
  }

  /**
   * Ajout (comme TypeDoctorController@store : refus si le nom existe déjà dans l'hôpital).
   * Amélioration : si une spécialité du même nom avait été supprimée, elle est restaurée au lieu d'être recréée.
   */
  async creer(userId: number, dto: SpecialiteDto) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const now = laravelNow();
    const [existante] = await this.db.query(
      'SELECT id, `delete` FROM type_doctors WHERE hospital_id = ? AND LOWER(label) = LOWER(?) LIMIT 1',
      [hospitalId, dto.label],
    );
    if (existante && Number(existante.delete) === 0) {
      throw new ConflictException(`La spécialité « ${dto.label} » existe déjà !`);
    }
    if (existante) {
      await this.db.query(
        'UPDATE type_doctors SET label = ?, description = ?, status = 0, `delete` = 0, updated_at = ? WHERE id = ?',
        [dto.label, dto.description || null, now, existante.id],
      );
      return { id: Number(existante.id), message: `La spécialité « ${dto.label} » a été restaurée.` };
    }
    const r = await this.db.query(
      'INSERT INTO type_doctors (label, hospital_id, status, description, `delete`, created_at, updated_at) VALUES (?, ?, 0, ?, 0, ?, ?)',
      [dto.label, hospitalId, dto.description || null, now, now],
    );
    return { id: Number(r.insertId), message: `La spécialité « ${dto.label} » a été enregistrée.` };
  }

  /** Modification (comme TypeDoctorController@update) */
  async modifier(userId: number, id: number, dto: SpecialiteDto) {
    const s = await this.specialiteDeLHopital(userId, id);
    const [doublon] = await this.db.query(
      'SELECT id FROM type_doctors WHERE hospital_id = ? AND LOWER(label) = LOWER(?) AND id <> ? AND `delete` = 0 LIMIT 1',
      [s.hospital_id, dto.label, id],
    );
    if (doublon) throw new ConflictException(`La spécialité « ${dto.label} » existe déjà !`);
    await this.db.query('UPDATE type_doctors SET label = ?, description = ?, updated_at = ? WHERE id = ?', [
      dto.label,
      dto.description || null,
      laravelNow(),
      id,
    ]);
    return { message: `La spécialité « ${dto.label} » a été mise à jour.` };
  }

  /** Activer / désactiver (comme TypeDoctorController@status) */
  async basculerStatut(userId: number, id: number) {
    const s = await this.specialiteDeLHopital(userId, id);
    const status = Number(s.status) === 0 ? 1 : 0;
    await this.db.query('UPDATE type_doctors SET status = ?, updated_at = ? WHERE id = ?', [status, laravelNow(), id]);
    return { actif: status === 0, message: `La spécialité « ${s.label} » est maintenant ${status === 0 ? 'activée' : 'désactivée'}.` };
  }

  /** Suppression (comme TypeDoctorController@delete : delete = 1) */
  async supprimer(userId: number, id: number) {
    const s = await this.specialiteDeLHopital(userId, id);
    await this.db.query('UPDATE type_doctors SET `delete` = 1, updated_at = ? WHERE id = ?', [laravelNow(), id]);
    return { message: `La spécialité « ${s.label} » a été supprimée.` };
  }

  // ---------------------------------------------------------------------------

  private async specialiteDeLHopital(userId: number, id: number): Promise<Record<string, unknown>> {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const [r] = await this.db.query('SELECT * FROM type_doctors WHERE id = ? AND hospital_id = ? AND `delete` = 0', [id, hospitalId]);
    if (!r) throw new NotFoundException('Spécialité introuvable');
    return r;
  }

  private format(r: Record<string, unknown>) {
    return {
      id: Number(r.id),
      label: r.label as string,
      description: (r.description ?? null) as string | null,
      actif: Number(r.status) === 0,
      creeLe: r.created_at,
    };
  }
}
