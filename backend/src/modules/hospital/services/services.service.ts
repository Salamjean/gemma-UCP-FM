import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';
import { laravelNow } from '../../../common/laravel';
import { ActeDto, CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

/**
 * HÔPITAL > SERVICES
 * Équivalent Laravel : app/Http/Controllers/Hospital/ServiceController.php
 *   services              : catalogue global des services (Urgence, Pédiatrie…)
 *   prestation_services   : catalogue des actes médicaux d'un service
 *   service_hospitals     : services ouverts dans un hôpital (status 0 = Activé, 1 = Désactivé)
 *   prestation_hospitals  : actes pratiqués par cet hôpital dans ce service, avec leur prix (FCFA)
 * Toutes les opérations sont limitées à l'hôpital du compte connecté.
 */
@Injectable()
export class ServicesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Liste des services de l'hôpital (comme ServiceController@index) */
  async liste(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const rows = await this.db.query(
      `SELECT sh.id, s.libelle, sh.description, sh.status, sh.created_at,
              (SELECT COUNT(*) FROM prestation_hospitals ph WHERE ph.service_hospital_id = sh.id) AS actes,
              (SELECT MIN(ph.prix) FROM prestation_hospitals ph WHERE ph.service_hospital_id = sh.id) AS prix_min,
              (SELECT MAX(ph.prix) FROM prestation_hospitals ph WHERE ph.service_hospital_id = sh.id) AS prix_max,
              (SELECT COUNT(*) FROM doctors d WHERE d.service_hospital_id = sh.id AND d.deleted_at IS NULL)
                + (SELECT COUNT(*) FROM infirmiers i WHERE i.service_hospital_id = sh.id) AS agents
         FROM service_hospitals sh
         JOIN services s ON s.id = sh.service_id
        WHERE sh.hospital_id = ?
        ORDER BY s.libelle`,
      [hospitalId],
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      libelle: r.libelle,
      description: r.description ?? null,
      actif: Number(r.status) === 0,
      actes: Number(r.actes),
      prixMin: r.prix_min === null ? null : Number(r.prix_min),
      prixMax: r.prix_max === null ? null : Number(r.prix_max),
      agents: Number(r.agents),
      creeLe: r.created_at,
    }));
  }

  /** Services du catalogue pas encore ouverts dans cet hôpital (formulaire d'ajout) */
  async catalogue(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const rows = await this.db.query(
      `SELECT s.id, s.libelle FROM services s
        WHERE s.id NOT IN (SELECT service_id FROM service_hospitals WHERE hospital_id = ?)
        ORDER BY s.libelle`,
      [hospitalId],
    );
    return rows.map((r: { id: unknown; libelle: string }) => ({ id: Number(r.id), libelle: r.libelle }));
  }

  /** Actes médicaux du catalogue d'un service (comme ServiceController@searchService) */
  async actesCatalogue(serviceId: number) {
    const rows = await this.db.query(
      'SELECT id, libelle FROM prestation_services WHERE service_id = ? AND status = 0 ORDER BY libelle',
      [serviceId],
    );
    return rows.map((r: { id: unknown; libelle: string }) => ({ id: Number(r.id), libelle: r.libelle }));
  }

  /** Ajout d'un service (comme ServiceController@store) */
  async creer(userId: number, dto: CreateServiceDto) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const now = laravelNow();

    return this.db.transaction(async (m) => {
      // 1. Le service : choisi dans le catalogue, ou nouveau (réutilisé s'il existe déjà sous ce nom)
      let serviceId: number;
      let libelle: string;
      if (dto.nouveauService) {
        const [existant] = await m.query('SELECT id, libelle FROM services WHERE LOWER(libelle) = LOWER(?) LIMIT 1', [dto.nouveauService]);
        if (existant) {
          serviceId = Number(existant.id);
          libelle = existant.libelle;
        } else {
          const r = await m.query('INSERT INTO services (libelle, status, created_at, updated_at) VALUES (?, 0, ?, ?)', [dto.nouveauService, now, now]);
          serviceId = Number(r.insertId);
          libelle = dto.nouveauService;
        }
      } else {
        const [s] = await m.query('SELECT id, libelle FROM services WHERE id = ?', [dto.serviceId]);
        if (!s) throw new NotFoundException("Ce service n'existe pas dans le catalogue.");
        serviceId = Number(s.id);
        libelle = s.libelle;
      }

      const [deja] = await m.query('SELECT id FROM service_hospitals WHERE hospital_id = ? AND service_id = ? LIMIT 1', [hospitalId, serviceId]);
      if (deja) throw new ConflictException('Ce service est déjà configuré dans votre structure hospitalière !');

      const r = await m.query(
        'INSERT INTO service_hospitals (hospital_id, service_id, description, status, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
        [hospitalId, serviceId, dto.description || null, now, now],
      );
      const serviceHospitalId = Number(r.insertId);

      // 2. Les actes et leurs prix
      let actes = 0;
      for (const a of dto.actes ?? []) {
        await this.ajouterActe(m, serviceHospitalId, serviceId, a, now);
        actes++;
      }

      // 3. Aucun acte : consultation standard par défaut (comme Laravel)
      if (actes === 0) {
        await this.ajouterActe(m, serviceHospitalId, serviceId, { libelle: `Consultation ${libelle}`, prix: 0, description: 'Consultation standard' }, now);
      }

      return { id: serviceHospitalId, message: `Le service « ${libelle} » a été enregistré avec succès.` };
    });
  }

  /** Fiche d'un service : actes pratiqués + actes du catalogue pas encore ajoutés (comme ServiceController@show) */
  async detail(userId: number, id: number) {
    const sh = await this.serviceDeLHopital(userId, id);
    const [actes, disponibles] = await Promise.all([
      this.db.query(
        `SELECT ph.id, ph.prestation_service_id, ps.libelle, ph.prix, ph.description,
                EXISTS(SELECT 1 FROM prestation_doctors pd WHERE pd.prestation_hospital_id = ph.id) AS affecte,
                EXISTS(SELECT 1 FROM consultations c WHERE c.prestation_hospital_id = ph.id) AS consulte
           FROM prestation_hospitals ph
           JOIN prestation_services ps ON ps.id = ph.prestation_service_id
          WHERE ph.service_hospital_id = ?
          ORDER BY ph.id`,
        [id],
      ),
      this.db.query(
        `SELECT ps.id, ps.libelle FROM prestation_services ps
          WHERE ps.service_id = ? AND ps.status = 0
            AND ps.id NOT IN (SELECT prestation_service_id FROM prestation_hospitals WHERE service_hospital_id = ?)
          ORDER BY ps.libelle`,
        [sh.serviceId, id],
      ),
    ]);
    return {
      id,
      libelle: sh.libelle,
      description: sh.description,
      actif: sh.actif,
      actes: actes.map((a: Record<string, unknown>) => ({
        id: Number(a.id),
        libelle: a.libelle,
        prix: Number(a.prix),
        description: a.description ?? null,
        // Suppression impossible si l'acte est affecté à un médecin ou déjà utilisé en consultation
        verrouille: Number(a.affecte) === 1 || Number(a.consulte) === 1,
      })),
      disponibles: disponibles.map((d: { id: unknown; libelle: string }) => ({ id: Number(d.id), libelle: d.libelle })),
    };
  }

  /** Modification : prix / descriptions des actes existants + nouveaux actes (comme ServiceController@update) */
  async modifier(userId: number, id: number, dto: UpdateServiceDto) {
    const sh = await this.serviceDeLHopital(userId, id);
    const now = laravelNow();

    await this.db.transaction(async (m) => {
      if (dto.description !== undefined) {
        await m.query('UPDATE service_hospitals SET description = ?, updated_at = ? WHERE id = ?', [dto.description || null, now, id]);
      }
      for (const a of dto.actesExistants ?? []) {
        // Seuls les actes de CE service sont modifiables
        await m.query(
          'UPDATE prestation_hospitals SET prix = ?, description = ?, updated_at = ? WHERE id = ? AND service_hospital_id = ?',
          [a.prix, a.description || null, now, a.id, id],
        );
      }
      for (const a of dto.nouveauxActes ?? []) {
        await this.ajouterActe(m, id, sh.serviceId, a, now);
      }
    });

    return { message: `Le service « ${sh.libelle} » a été mis à jour avec succès.` };
  }

  /** Activer / désactiver (comme ServiceController@status) */
  async basculerStatut(userId: number, id: number) {
    const sh = await this.serviceDeLHopital(userId, id);
    const status = sh.actif ? 1 : 0;
    await this.db.query('UPDATE service_hospitals SET status = ?, updated_at = ? WHERE id = ?', [status, laravelNow(), id]);
    return { actif: status === 0, message: `Le service « ${sh.libelle} » est maintenant ${status === 0 ? 'activé' : 'désactivé'}.` };
  }

  /** Suppression d'un service (comme ServiceController@delete) */
  async supprimer(userId: number, id: number) {
    const sh = await this.serviceDeLHopital(userId, id);
    const [{ agents }] = await this.db.query(
      `SELECT (SELECT COUNT(*) FROM doctors WHERE service_hospital_id = ? AND deleted_at IS NULL)
            + (SELECT COUNT(*) FROM infirmiers WHERE service_hospital_id = ?)
            + (SELECT COUNT(*) FROM service_infirmiers WHERE service_hospital_id = ?) AS agents`,
      [id, id, id],
    );
    if (Number(agents) > 0) {
      throw new ConflictException('Impossible de supprimer un service où des agents de santé sont affectés.');
    }
    // Protection en plus de Laravel : ne pas laisser des consultations pointer vers des actes supprimés
    const [{ consultations }] = await this.db.query(
      `SELECT COUNT(*) AS consultations FROM consultations
        WHERE prestation_hospital_id IN (SELECT id FROM prestation_hospitals WHERE service_hospital_id = ?)`,
      [id],
    );
    if (Number(consultations) > 0) {
      throw new ConflictException('Impossible de supprimer ce service : des consultations ont déjà été faites avec ses actes. Désactivez-le plutôt.');
    }

    await this.db.transaction(async (m) => {
      await m.query('DELETE FROM prestation_hospitals WHERE service_hospital_id = ?', [id]);
      await m.query('DELETE FROM service_hospitals WHERE id = ?', [id]);
    });
    return { message: `Le service « ${sh.libelle} » a été supprimé.` };
  }

  /** Suppression d'un acte du service (comme ServiceController@deleteService) */
  async supprimerActe(userId: number, id: number, acteId: number) {
    await this.serviceDeLHopital(userId, id);
    const [acte] = await this.db.query(
      `SELECT ph.id, ps.libelle FROM prestation_hospitals ph
         JOIN prestation_services ps ON ps.id = ph.prestation_service_id
        WHERE ph.id = ? AND ph.service_hospital_id = ?`,
      [acteId, id],
    );
    if (!acte) throw new NotFoundException('Acte médical introuvable');

    const [{ n }] = await this.db.query('SELECT COUNT(*) AS n FROM prestation_hospitals WHERE service_hospital_id = ?', [id]);
    if (Number(n) <= 1) throw new BadRequestException('Impossible de supprimer tous les actes du service : il doit en rester au moins un.');

    const [{ affecte, consulte }] = await this.db.query(
      `SELECT EXISTS(SELECT 1 FROM prestation_doctors WHERE prestation_hospital_id = ?) AS affecte,
              EXISTS(SELECT 1 FROM consultations WHERE prestation_hospital_id = ?) AS consulte`,
      [acteId, acteId],
    );
    if (Number(affecte) === 1) throw new ConflictException('Impossible de supprimer un acte où des agents de santé sont affectés.');
    if (Number(consulte) === 1) throw new ConflictException('Impossible de supprimer un acte déjà utilisé dans des consultations.');

    await this.db.query('DELETE FROM prestation_hospitals WHERE id = ?', [acteId]);
    return { message: `L'acte « ${acte.libelle} » a été supprimé.` };
  }

  // ---------------------------------------------------------------------------

  /** Le service doit appartenir à l'hôpital du compte connecté */
  private async serviceDeLHopital(userId: number, id: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const [r] = await this.db.query(
      `SELECT sh.id, sh.service_id, sh.description, sh.status, s.libelle
         FROM service_hospitals sh JOIN services s ON s.id = sh.service_id
        WHERE sh.id = ? AND sh.hospital_id = ?`,
      [id, hospitalId],
    );
    if (!r) throw new NotFoundException('Service introuvable');
    return {
      serviceId: Number(r.service_id),
      libelle: r.libelle as string,
      description: (r.description ?? null) as string | null,
      actif: Number(r.status) === 0,
    };
  }

  /**
   * Ajoute un acte (prestation_hospitals) à un service de l'hôpital.
   * Acte du catalogue : il doit appartenir au service. Nouvel acte : PrestationService::firstOrCreate comme Laravel.
   * Un acte déjà présent dans le service n'est pas ajouté deux fois.
   */
  private async ajouterActe(m: EntityManager, serviceHospitalId: number, serviceId: number, a: ActeDto, now: string) {
    let prestationServiceId: number;
    if (a.prestationServiceId) {
      const [ps] = await m.query('SELECT id FROM prestation_services WHERE id = ? AND service_id = ?', [a.prestationServiceId, serviceId]);
      if (!ps) throw new BadRequestException("Un acte médical choisi n'appartient pas à ce service.");
      prestationServiceId = Number(ps.id);
    } else {
      const [ps] = await m.query('SELECT id FROM prestation_services WHERE service_id = ? AND libelle = ? LIMIT 1', [serviceId, a.libelle]);
      if (ps) {
        prestationServiceId = Number(ps.id);
      } else {
        const r = await m.query(
          'INSERT INTO prestation_services (service_id, libelle, status, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
          [serviceId, a.libelle, now, now],
        );
        prestationServiceId = Number(r.insertId);
      }
    }

    const [deja] = await m.query(
      'SELECT id FROM prestation_hospitals WHERE service_hospital_id = ? AND prestation_service_id = ? LIMIT 1',
      [serviceHospitalId, prestationServiceId],
    );
    if (deja) return;

    await m.query(
      `INSERT INTO prestation_hospitals (service_hospital_id, prestation_service_id, description, prix, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [serviceHospitalId, prestationServiceId, a.description || null, a.prix, now, now],
    );
  }
}
