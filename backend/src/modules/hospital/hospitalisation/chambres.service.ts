import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';
import { laravelNow } from '../../../common/laravel';
import { ChambreDto } from './dto/chambre.dto';

/**
 * HÔPITAL > HOSPITALISATION > GESTION DES CHAMBRES
 * Équivalent Laravel : app/Http/Controllers/Hospital/BedroomController.php
 *   bedrooms : type 'individual' | 'collective', number, price (par jour), status (0 = Activé), delete (1 = supprimée)
 *   beds     : number, price (= prix de la chambre), status_occupied 'occupied' | 'no_occupied', delete
 * Un lit est occupé si beds.status_occupied = 'occupied' (mis à jour par les médecins pendant l'hospitalisation)
 * ou s'il a une ligne active dans occupied_beds (ancien fonctionnement, encore vérifié par Laravel).
 */
const OCCUPE = `(b.status_occupied = 'occupied' OR EXISTS(SELECT 1 FROM occupied_beds ob WHERE ob.bed_id = b.id AND ob.status = 'active' AND ob.\`delete\` = 0))`;

@Injectable()
export class ChambresService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Liste des chambres (comme BedroomController@index) avec l'occupation des lits */
  async liste(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const rows = await this.db.query(
      `SELECT r.*,
              (SELECT COUNT(*) FROM beds b WHERE b.bedroom_id = r.id AND b.\`delete\` = 0) AS lits,
              (SELECT COUNT(*) FROM beds b WHERE b.bedroom_id = r.id AND b.\`delete\` = 0 AND ${OCCUPE}) AS occupes
         FROM bedrooms r
        WHERE r.hospital_id = ? AND r.\`delete\` = 0
        ORDER BY r.number`,
      [hospitalId],
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      numero: r.number,
      type: r.type,
      prix: Number(r.price),
      description: r.description ?? null,
      actif: Number(r.status) === 0,
      lits: Number(r.lits),
      occupes: Number(r.occupes),
    }));
  }

  /** Fiche d'une chambre et de ses lits (comme BedroomController@show) */
  async detail(userId: number, id: number) {
    const r = await this.chambreDeLHopital(userId, id);
    const lits = await this.db.query(
      `SELECT b.id, b.number, ${OCCUPE} AS occupe FROM beds b WHERE b.bedroom_id = ? AND b.\`delete\` = 0 ORDER BY b.id`,
      [id],
    );
    return {
      id,
      numero: r.number,
      type: r.type,
      prix: Number(r.price),
      description: r.description ?? null,
      actif: Number(r.status) === 0,
      lits: lits.map((b: Record<string, unknown>) => ({ id: Number(b.id), numero: b.number, occupe: Number(b.occupe) === 1 })),
    };
  }

  /** Ajout (comme BedroomController@store) */
  async creer(userId: number, dto: ChambreDto) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    if (!dto.type) throw new BadRequestException('Choisissez le type de chambre.');
    if (dto.type === 'individual' && dto.lits.length !== 1) throw new BadRequestException('Une chambre individuelle a un seul lit.');
    this.verifierLits(dto);
    await this.verifierNumeroLibre(hospitalId, dto.numero);

    const now = laravelNow();
    const id = await this.db.transaction(async (m) => {
      const r = await m.query(
        'INSERT INTO bedrooms (hospital_id, type, number, price, description, status, `delete`, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)',
        [hospitalId, dto.type, dto.numero, dto.prix, dto.description ?? null, now, now],
      );
      const chambreId = Number(r.insertId);
      for (const lit of dto.lits) {
        await m.query(
          "INSERT INTO beds (bedroom_id, number, price, status, status_occupied, `delete`, created_at, updated_at) VALUES (?, ?, ?, 0, 'no_occupied', 0, ?, ?)",
          [chambreId, lit.numero, dto.prix, now, now],
        );
      }
      return chambreId;
    });
    return { id, message: `La chambre « ${dto.numero} » a été enregistrée avec ${dto.lits.length} lit${dto.lits.length > 1 ? 's' : ''}.` };
  }

  /**
   * Modification (comme BedroomController@update + bedStore + bedDelete) :
   * numéro, prix (appliqué à tous les lits), description, numéros des lits ;
   * lits sans id = ajoutés, lits absents de la liste = supprimés (s'ils ne sont pas occupés).
   */
  async modifier(userId: number, id: number, dto: ChambreDto) {
    const r = await this.chambreDeLHopital(userId, id);
    if (r.type === 'individual' && dto.lits.length !== 1) throw new BadRequestException('Une chambre individuelle a un seul lit.');
    this.verifierLits(dto);
    if (String(r.number).toLowerCase() !== dto.numero.toLowerCase()) await this.verifierNumeroLibre(Number(r.hospital_id), dto.numero, id);

    const actuels: { id: number; number: string; occupe: number }[] = await this.db.query(
      `SELECT b.id, b.number, ${OCCUPE} AS occupe FROM beds b WHERE b.bedroom_id = ? AND b.\`delete\` = 0`,
      [id],
    );
    const gardes = new Set(dto.lits.filter((l) => l.id).map((l) => Number(l.id)));
    for (const l of dto.lits) {
      if (l.id && !actuels.some((a) => Number(a.id) === Number(l.id))) throw new BadRequestException('Un lit modifié n\'appartient pas à cette chambre.');
    }
    const aSupprimer = actuels.filter((a) => !gardes.has(Number(a.id)));
    const occupe = aSupprimer.find((a) => Number(a.occupe) === 1);
    if (occupe) throw new ConflictException(`Le lit ${occupe.number} est occupé : il ne peut pas être supprimé.`);

    const now = laravelNow();
    await this.db.transaction(async (m) => {
      await m.query('UPDATE bedrooms SET number = ?, price = ?, description = ?, updated_at = ? WHERE id = ?', [dto.numero, dto.prix, dto.description ?? null, now, id]);
      for (const l of dto.lits) {
        if (l.id) {
          await m.query('UPDATE beds SET number = ?, price = ?, updated_at = ? WHERE id = ? AND bedroom_id = ?', [l.numero, dto.prix, now, l.id, id]);
        } else {
          await m.query(
            "INSERT INTO beds (bedroom_id, number, price, status, status_occupied, `delete`, created_at, updated_at) VALUES (?, ?, ?, 0, 'no_occupied', 0, ?, ?)",
            [id, l.numero, dto.prix, now, now],
          );
        }
      }
      for (const a of aSupprimer) {
        await m.query('UPDATE beds SET `delete` = 1, updated_at = ? WHERE id = ?', [now, a.id]);
      }
    });
    return { message: `La chambre « ${dto.numero} » a été mise à jour.` };
  }

  /** Activer / désactiver (comme BedroomController@status) */
  async basculerStatut(userId: number, id: number) {
    const r = await this.chambreDeLHopital(userId, id);
    const status = Number(r.status) === 0 ? 1 : 0;
    await this.db.query('UPDATE bedrooms SET status = ?, updated_at = ? WHERE id = ?', [status, laravelNow(), id]);
    return { actif: status === 0, message: `La chambre « ${r.number} » est maintenant ${status === 0 ? 'activée' : 'désactivée'}.` };
  }

  /** Suppression (comme BedroomController@delete : refusée si un lit est occupé ; delete = 1 sur la chambre et ses lits) */
  async supprimer(userId: number, id: number) {
    const r = await this.chambreDeLHopital(userId, id);
    const [{ n }] = await this.db.query(`SELECT COUNT(*) AS n FROM beds b WHERE b.bedroom_id = ? AND b.\`delete\` = 0 AND ${OCCUPE}`, [id]);
    if (Number(n) > 0) throw new ConflictException(`Des lits de la chambre « ${r.number} » sont occupés.`);
    const now = laravelNow();
    await this.db.transaction(async (m) => {
      await m.query('UPDATE beds SET `delete` = 1, updated_at = ? WHERE bedroom_id = ?', [now, id]);
      await m.query('UPDATE bedrooms SET `delete` = 1, updated_at = ? WHERE id = ?', [now, id]);
    });
    return { message: `La chambre « ${r.number} » a été supprimée.` };
  }

  // ---------------------------------------------------------------------------

  private async chambreDeLHopital(userId: number, id: number): Promise<Record<string, unknown>> {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const [r] = await this.db.query('SELECT * FROM bedrooms WHERE id = ? AND hospital_id = ? AND `delete` = 0', [id, hospitalId]);
    if (!r) throw new NotFoundException('Chambre introuvable');
    return r;
  }

  private async verifierNumeroLibre(hospitalId: number, numero: string, sauf?: number) {
    const [r] = await this.db.query(
      `SELECT id FROM bedrooms WHERE hospital_id = ? AND LOWER(number) = LOWER(?) AND \`delete\` = 0${sauf ? ' AND id <> ?' : ''} LIMIT 1`,
      sauf ? [hospitalId, numero, sauf] : [hospitalId, numero],
    );
    if (r) throw new ConflictException(`La chambre « ${numero} » existe déjà.`);
  }

  private verifierLits(dto: ChambreDto) {
    const numeros = dto.lits.map((l) => l.numero.toLowerCase());
    const doublon = numeros.find((n, i) => numeros.indexOf(n) !== i);
    if (doublon) throw new BadRequestException(`Deux lits portent le même numéro (${doublon}).`);
  }
}
