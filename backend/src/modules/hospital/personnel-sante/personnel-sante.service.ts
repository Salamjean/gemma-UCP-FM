import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';
import { laravelHash, laravelNow } from '../../../common/laravel';
import { deleteImage, saveImage } from '../../../common/uploads';
import { AgentDto } from './dto/agent.dto';

/**
 * HÔPITAL > PERSONNEL DE SANTÉ
 * Équivalent Laravel : DoctorController, InfirmierController + Repositories/Hospital/AgentRepository.php
 *
 *   type        table       users.role_as  matricule (préfixe)        dossier photo
 *   medecin     doctors     doctor         MG (généraliste) / MS (spécialiste)  doctor
 *   sage-femme  doctors     doctor         SG                         doctor
 *   infirmier   infirmiers  infirmier      INF                        infirmier
 *   regulateur  fm_regulateurs regulateur  REG                        regulateur   (Gemma FM uniquement : réattribue les patients)
 * (La pharmacie de Laravel n'est pas reprise : il n'y a pas de pharmacie dans ce projet.)
 *
 * Chaque agent a un compte users + un planning (availabilities : days = ["0","2"], hour_start = 7 heures, lundi → dimanche).
 * status : 0 = Activé, 1 = Désactivé ; delete : 1 = supprimé (la ligne reste, comme Laravel).
 */
export type TypeAgent = 'medecin' | 'sage-femme' | 'infirmier' | 'regulateur';

const CONFIG: Record<TypeAgent, { table: string; role: string; dossier: string; libelle: string; typeAgentId?: number }> = {
  medecin: { table: 'doctors', role: 'doctor', dossier: 'doctor', libelle: 'Médecin', typeAgentId: 1 },
  'sage-femme': { table: 'doctors', role: 'doctor', dossier: 'doctor', libelle: 'Sage-femme', typeAgentId: 2 },
  infirmier: { table: 'infirmiers', role: 'infirmier', dossier: 'infirmier', libelle: 'Infirmier(e)' },
  regulateur: { table: 'fm_regulateurs', role: 'regulateur', dossier: 'regulateur', libelle: 'Régulateur' },
};

export const TYPES_AGENT = Object.keys(CONFIG) as TypeAgent[];

type Ligne = Record<string, unknown>;

@Injectable()
export class PersonnelSanteService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Listes des formulaires : services, actes par service, spécialités */
  async options(userId: number) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const [services, actes, specialites] = await Promise.all([
      this.db.query(
        `SELECT sh.id, s.libelle FROM service_hospitals sh JOIN services s ON s.id = sh.service_id
          WHERE sh.hospital_id = ? AND sh.status = 0 ORDER BY s.libelle`,
        [hospitalId],
      ),
      this.db.query(
        `SELECT ph.id, ph.service_hospital_id, ps.libelle, ph.prix
           FROM prestation_hospitals ph
           JOIN prestation_services ps ON ps.id = ph.prestation_service_id
           JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
          WHERE sh.hospital_id = ? AND ph.status = 0
          ORDER BY ps.libelle`,
        [hospitalId],
      ),
      this.db.query("SELECT id, label FROM type_doctors WHERE hospital_id = ? AND `delete` = 0 AND status = 0 ORDER BY label", [hospitalId]),
    ]);
    return {
      services: services.map((s: Ligne) => ({ id: Number(s.id), libelle: s.libelle })),
      actes: actes.map((a: Ligne) => ({ id: Number(a.id), serviceId: Number(a.service_hospital_id), libelle: a.libelle, prix: Number(a.prix) })),
      specialites: specialites.map((s: Ligne) => ({ id: Number(s.id), libelle: s.label })),
    };
  }

  /** Liste d'un type d'agent (comme DoctorController@index / indexS, InfirmierController@index) */
  async liste(userId: number, type: TypeAgent) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const c = CONFIG[type];
    let rows: Ligne[];
    if (c.table === 'doctors') {
      rows = await this.db.query(
        `SELECT a.*, u.name, u.email, s.libelle AS service, t.label AS specialite,
                (SELECT COUNT(*) FROM prestation_doctors pd WHERE pd.doctor_id = a.id) AS nb_actes,
                av.days
           FROM doctors a
           JOIN users u ON u.id = a.user_id
           LEFT JOIN service_hospitals sh ON sh.id = a.service_hospital_id
           LEFT JOIN services s ON s.id = sh.service_id
           LEFT JOIN type_doctors t ON t.id = a.type_doctor_id
           LEFT JOIN availabilities av ON av.id = (SELECT MAX(id) FROM availabilities WHERE user_id = a.user_id)
          WHERE a.hospital_id = ? AND a.type_agent_id = ? AND a.\`delete\` = 0 AND a.deleted_at IS NULL
          ORDER BY u.name`,
        [hospitalId, c.typeAgentId],
      );
    } else if (c.table === 'fm_regulateurs') {
      rows = await this.db.query(
        `SELECT a.*, u.name, u.email, av.days
           FROM fm_regulateurs a
           JOIN users u ON u.id = a.user_id
           LEFT JOIN availabilities av ON av.id = (SELECT MAX(id) FROM availabilities WHERE user_id = a.user_id)
          WHERE a.hospital_id = ? AND a.\`delete\` = 0
          ORDER BY u.name`,
        [hospitalId],
      );
    } else {
      rows = await this.db.query(
        `SELECT a.*, u.name, u.email, av.days,
                (SELECT GROUP_CONCAT(s.libelle ORDER BY s.libelle SEPARATOR ', ')
                   FROM service_infirmiers si
                   JOIN service_hospitals sh ON sh.id = si.service_hospital_id
                   JOIN services s ON s.id = sh.service_id
                  WHERE si.infirmier_id = a.id) AS services_liste,
                (SELECT s.libelle FROM service_hospitals sh JOIN services s ON s.id = sh.service_id WHERE sh.id = a.service_hospital_id) AS service
           FROM infirmiers a
           JOIN users u ON u.id = a.user_id
           LEFT JOIN availabilities av ON av.id = (SELECT MAX(id) FROM availabilities WHERE user_id = a.user_id)
          WHERE a.hospital_id = ? AND a.\`delete\` = 0
          ORDER BY u.name`,
        [hospitalId],
      );
    }
    return rows.map((r) => ({
      id: Number(r.id),
      nom: r.name,
      email: r.email,
      matricule: r.matricule ?? null,
      contact: r.contact ?? null,
      photo: r.img_url ?? null,
      actif: Number(r.status) === 0,
      service: (r.services_liste as string) || (r.service as string) || null,
      specialite: this.libelleSpecialite(r),
      chef: Number(r.chief ?? 0) === 1,
      actes: r.nb_actes === undefined ? null : Number(r.nb_actes),
      jours: this.jours(r.days),
    }));
  }

  /** Fiche d'un agent pour le formulaire de modification */
  async detail(userId: number, type: TypeAgent, id: number) {
    const a = await this.agentDeLHopital(userId, type, id);
    const c = CONFIG[type];
    const [av] = await this.db.query('SELECT days, hour_start FROM availabilities WHERE user_id = ? ORDER BY id DESC LIMIT 1', [a.user_id]);
    const jours = this.jours(av?.days);
    const heures = this.parse<(string | null)[]>(av?.hour_start, []);

    const fiche: Record<string, unknown> = {
      id,
      nom: a.name,
      email: a.email,
      matricule: a.matricule ?? null,
      contact: a.contact ?? '',
      adresse: a.address ?? '',
      photo: a.img_url ?? null,
      actif: Number(a.status) === 0,
      // Heure enregistrée telle quelle ("00:00" = disponible dès minuit / toute la journée) ; 08:00 seulement si absente
      jours: jours.map((j) => ({ jour: j, heure: (heures[j] || '08:00') as string })),
    };
    if (c.table === 'doctors') {
      const actes = await this.db.query('SELECT prestation_hospital_id FROM prestation_doctors WHERE doctor_id = ?', [id]);
      Object.assign(fiche, {
        service: a.service_hospital_id ? Number(a.service_hospital_id) : null,
        actes: actes.map((x: Ligne) => Number(x.prestation_hospital_id)),
        typeName: a.type_name ?? 'generaliste',
        typeDoctor: a.type_doctor_id ? Number(a.type_doctor_id) : null,
      });
    }
    if (c.table === 'infirmiers') {
      const services = await this.db.query('SELECT service_hospital_id FROM service_infirmiers WHERE infirmier_id = ?', [id]);
      const ids = services.map((x: Ligne) => Number(x.service_hospital_id));
      fiche.services = ids.length ? ids : a.service_hospital_id ? [Number(a.service_hospital_id)] : [];
    }
    return fiche;
  }

  /** Ajout (comme AgentRepository::storeDoctor / storeSageF / storeInfirmier) */
  async creer(userId: number, type: TypeAgent, dto: AgentDto, image?: Express.Multer.File) {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const c = CONFIG[type];

    if (!dto.email) throw new BadRequestException("L'adresse email est obligatoire.");
    if (!dto.matricule) throw new BadRequestException('Le matricule est obligatoire.');
    if (!dto.password) throw new BadRequestException('Le mot de passe est obligatoire.');
    if (dto.password !== dto.passwordConfirmation) throw new BadRequestException('Les mots de passe ne correspondent pas.');
    await this.verifierChampsMetier(hospitalId, type, dto);

    // Matricule saisi en entier par l'hôpital, enregistré tel quel (plus de préfixe MG / MS / SG / INF / REG ajouté)
    const matricule = dto.matricule.trim();
    const [doublon] = await this.db.query(`SELECT id FROM \`${c.table}\` WHERE matricule = ? AND hospital_id = ? AND \`delete\` = 0 LIMIT 1`, [matricule, hospitalId]);
    if (doublon) throw new ConflictException(`Un agent avec le matricule ${matricule} existe déjà dans votre hôpital.`);
    const [emailPris] = await this.db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [dto.email]);
    if (emailPris) throw new ConflictException('Cette adresse email est déjà utilisée par un autre compte.');

    const imgUrl = image ? await saveImage(image, c.dossier) : null;
    const now = laravelNow();
    const password = await laravelHash(dto.password);

    try {
      const id = await this.db.transaction(async (m) => {
        const u = await m.query(
          'INSERT INTO users (name, prenom, email, role_as, password, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?, ?)',
          [dto.name, dto.email, c.role, password, now, now],
        );
        const nouvelUserId = Number(u.insertId);
        let agentId: number;

        if (c.table === 'doctors') {
          const specialiste = type === 'medecin' && dto.typeName === 'specialiste';
          const r = await m.query(
            `INSERT INTO doctors (user_id, hospital_id, type_agent_id, type_name, type_doctor_id, gyneco, service_hospital_id,
                                  matricule, contact, address, img_url, status, \`delete\`, chief, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
            [
              nouvelUserId,
              hospitalId,
              c.typeAgentId,
              type === 'medecin' ? dto.typeName : null,
              specialiste ? dto.typeDoctor : null,
              type === 'sage-femme' ? 1 : specialiste ? (dto.gyneco ? 1 : 0) : null,
              dto.service,
              matricule,
              dto.contact,
              dto.address ?? null,
              imgUrl,
              now,
              now,
            ],
          );
          agentId = Number(r.insertId);
          await this.enregistrerActes(m, agentId, dto.actes ?? [], now);
        } else if (c.table === 'fm_regulateurs') {
          const r = await m.query(
            `INSERT INTO fm_regulateurs (user_id, hospital_id, matricule, contact, address, img_url, status, \`delete\`, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
            [nouvelUserId, hospitalId, matricule, dto.contact, dto.address ?? null, imgUrl, now, now],
          );
          agentId = Number(r.insertId);
        } else {
          const services = [...new Set(dto.services ?? [])];
          const r = await m.query(
            `INSERT INTO infirmiers (service_hospital_id, matricule, user_id, hospital_id, contact, address, img_url, status, \`delete\`, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
            [services[0], matricule, nouvelUserId, hospitalId, dto.contact, dto.address ?? null, imgUrl, now, now],
          );
          agentId = Number(r.insertId);
          await this.enregistrerServicesInfirmier(m, agentId, services, now);
        }

        await this.enregistrerPlanning(m, nouvelUserId, dto, now, false);
        return agentId;
      });
      return { id, message: `${c.libelle} « ${dto.name} » ajouté(e) avec succès (matricule ${matricule}).` };
    } catch (e) {
      if (imgUrl) await deleteImage(c.dossier, imgUrl); // pas de photo orpheline si l'enregistrement échoue
      throw e;
    }
  }

  /** Modification (comme AgentRepository::update, InfirmierController@update) */
  async modifier(userId: number, type: TypeAgent, id: number, dto: AgentDto, image?: Express.Multer.File, parAdmin = false) {
    const a = await this.agentDeLHopital(userId, type, id);
    const c = CONFIG[type];
    if (dto.password && dto.password !== dto.passwordConfirmation) throw new BadRequestException('Les mots de passe ne correspondent pas.');
    // Email de connexion : modifiable seulement par l'admin DMHP (le compte de l'hôpital ne peut pas le changer)
    const nouvelEmail = dto.email?.trim().toLowerCase();
    const changeEmail = !!nouvelEmail && nouvelEmail !== String(a.email ?? '').toLowerCase();
    if (changeEmail && !parAdmin) throw new BadRequestException('Seule l’administration DMHP peut modifier l’adresse email d’un agent.');
    if (changeEmail) {
      const [pris] = await this.db.query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [nouvelEmail, a.user_id]);
      if (pris) throw new ConflictException('Cette adresse email est déjà utilisée par un autre compte.');
    }
    await this.verifierChampsMetier(Number(a.hospital_id), type, dto);

    const imgUrl = image ? await saveImage(image, c.dossier) : null;
    const now = laravelNow();
    const password = dto.password ? await laravelHash(dto.password) : null;

    await this.db.transaction(async (m) => {
      await m.query(`UPDATE users SET name = ?${changeEmail ? ', email = ?' : ''}${password ? ', password = ?' : ''}, updated_at = ? WHERE id = ?`, [
        dto.name,
        ...(changeEmail ? [nouvelEmail] : []),
        ...(password ? [password] : []),
        now,
        a.user_id,
      ]);

      if (c.table === 'doctors') {
        const specialiste = type === 'medecin' && dto.typeName === 'specialiste';
        await m.query(
          `UPDATE doctors SET contact = ?, address = ?, service_hospital_id = ?, type_name = ?, type_doctor_id = ?, gyneco = ?,
                  img_url = COALESCE(?, img_url), updated_at = ? WHERE id = ?`,
          [
            dto.contact,
            dto.address ?? null,
            dto.service,
            type === 'medecin' ? dto.typeName : a.type_name ?? null,
            specialiste ? dto.typeDoctor : null,
            type === 'sage-femme' ? 1 : specialiste ? (dto.gyneco ? 1 : 0) : null,
            imgUrl,
            now,
            id,
          ],
        );
        await m.query('DELETE FROM prestation_doctors WHERE doctor_id = ?', [id]);
        await this.enregistrerActes(m, id, dto.actes ?? [], now);
      } else if (c.table === 'fm_regulateurs') {
        await m.query('UPDATE fm_regulateurs SET contact = ?, address = ?, img_url = COALESCE(?, img_url), updated_at = ? WHERE id = ?', [
          dto.contact,
          dto.address ?? null,
          imgUrl,
          now,
          id,
        ]);
      } else {
        const services = [...new Set(dto.services ?? [])];
        await m.query('UPDATE infirmiers SET contact = ?, address = ?, service_hospital_id = ?, img_url = COALESCE(?, img_url), updated_at = ? WHERE id = ?', [
          dto.contact,
          dto.address ?? null,
          services[0],
          imgUrl,
          now,
          id,
        ]);
        await m.query('DELETE FROM service_infirmiers WHERE infirmier_id = ?', [id]);
        await this.enregistrerServicesInfirmier(m, id, services, now);
      }
      await this.enregistrerPlanning(m, Number(a.user_id), dto, now, true);
    });

    if (imgUrl && a.img_url) await deleteImage(c.dossier, a.img_url as string);
    return { message: `Les informations de « ${dto.name} » ont été mises à jour.` };
  }

  async basculerStatut(userId: number, type: TypeAgent, id: number) {
    const a = await this.agentDeLHopital(userId, type, id);
    const status = Number(a.status) === 0 ? 1 : 0;
    await this.db.query(`UPDATE \`${CONFIG[type].table}\` SET status = ?, updated_at = ? WHERE id = ?`, [status, laravelNow(), id]);
    return { actif: status === 0, message: `« ${a.name} » est maintenant ${status === 0 ? 'activé(e)' : 'désactivé(e)'}.` };
  }

  /** Médecin chef (comme DoctorController@chief) */
  async basculerChef(userId: number, id: number) {
    const a = await this.agentDeLHopital(userId, 'medecin', id);
    const chief = Number(a.chief) === 1 ? 0 : 1;
    await this.db.query('UPDATE doctors SET chief = ?, updated_at = ? WHERE id = ?', [chief, laravelNow(), id]);
    return { chef: chief === 1, message: chief === 1 ? `« ${a.name} » est maintenant médecin chef.` : `« ${a.name} » n'est plus médecin chef.` };
  }

  /** Suppression (delete = 1 : la ligne et le compte restent, comme Laravel) */
  async supprimer(userId: number, type: TypeAgent, id: number) {
    const a = await this.agentDeLHopital(userId, type, id);
    await this.db.query(`UPDATE \`${CONFIG[type].table}\` SET \`delete\` = 1, updated_at = ? WHERE id = ?`, [laravelNow(), id]);
    return { message: `« ${a.name} » a été supprimé(e) de la liste.` };
  }

  // ---------------------------------------------------------------------------

  private async agentDeLHopital(userId: number, type: TypeAgent, id: number): Promise<Ligne> {
    const hospitalId = await hopitalDuCompte(this.db, userId);
    const c = CONFIG[type];
    const filtreType = c.typeAgentId ? ' AND a.type_agent_id = ' + c.typeAgentId + ' AND a.deleted_at IS NULL' : '';
    const [r] = await this.db.query(
      `SELECT a.*, u.name, u.email FROM \`${c.table}\` a JOIN users u ON u.id = a.user_id
        WHERE a.id = ? AND a.hospital_id = ? AND a.\`delete\` = 0${filtreType}`,
      [id, hospitalId],
    );
    if (!r) throw new NotFoundException('Agent introuvable');
    return r;
  }

  /** Règles propres à chaque type (DoctorRequest, SageFRequest, InfirmierRequest…) + appartenance à l'hôpital */
  private async verifierChampsMetier(hospitalId: number, type: TypeAgent, dto: AgentDto) {
    if (!dto.jours?.length) throw new BadRequestException('Veuillez sélectionner au moins un jour de disponibilité.');

    if (type === 'medecin' || type === 'sage-femme') {
      if (!dto.service) throw new BadRequestException("Veuillez choisir le service d'affectation.");
      await this.verifierServices(hospitalId, [dto.service]);
      if (!dto.actes?.length) throw new BadRequestException('Veuillez choisir au moins un acte médical pratiqué.');
      const [{ n }] = await this.db.query(
        `SELECT COUNT(*) AS n FROM prestation_hospitals ph JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
          WHERE ph.id IN (?) AND sh.hospital_id = ?`,
        [dto.actes, hospitalId],
      );
      if (Number(n) !== new Set(dto.actes).size) throw new BadRequestException("Un acte médical choisi n'appartient pas à votre hôpital.");
    }
    if (type === 'medecin') {
      if (!dto.typeName) throw new BadRequestException('Choisissez généraliste ou spécialiste.');
      // Plus de case "Gynécologue" : un spécialiste choisit toujours sa spécialité.
      // doctors.gyneco (accès à l'espace maternité dans Laravel, MaterniteMiddleware) est déduit de la spécialité choisie.
      dto.gyneco = false;
      if (dto.typeName === 'specialiste') {
        if (!dto.typeDoctor) throw new BadRequestException('Veuillez choisir la spécialité du médecin.');
        const [t] = await this.db.query('SELECT id, label FROM type_doctors WHERE id = ? AND hospital_id = ? AND `delete` = 0', [dto.typeDoctor, hospitalId]);
        if (!t) throw new BadRequestException('Spécialité inconnue.');
        dto.gyneco = /gyn[eé]co/i.test(String(t.label));
      }
    }
    if (type === 'infirmier') {
      if (!dto.services?.length) throw new BadRequestException('Veuillez choisir au moins un service.');
      await this.verifierServices(hospitalId, dto.services);
    }
  }

  private async verifierServices(hospitalId: number, ids: number[]) {
    const uniques = [...new Set(ids)];
    const [{ n }] = await this.db.query('SELECT COUNT(*) AS n FROM service_hospitals WHERE id IN (?) AND hospital_id = ?', [uniques, hospitalId]);
    if (Number(n) !== uniques.length) throw new BadRequestException("Un service choisi n'appartient pas à votre hôpital.");
  }

  private async enregistrerActes(m: EntityManager, doctorId: number, actes: number[], now: string) {
    for (const acte of new Set(actes)) {
      await m.query('INSERT INTO prestation_doctors (doctor_id, prestation_hospital_id, created_at, updated_at) VALUES (?, ?, ?, ?)', [doctorId, acte, now, now]);
    }
  }

  private async enregistrerServicesInfirmier(m: EntityManager, infirmierId: number, services: number[], now: string) {
    for (const s of services) {
      await m.query('INSERT INTO service_infirmiers (infirmier_id, service_hospital_id, created_at, updated_at) VALUES (?, ?, ?, ?)', [infirmierId, s, now, now]);
    }
  }

  /** Planning : days = ["0","3"], hour_start = 7 heures (lundi → dimanche, "00:00" si non travaillé) */
  private async enregistrerPlanning(m: EntityManager, agentUserId: number, dto: AgentDto, now: string, miseAJour: boolean) {
    const jours = [...new Map(dto.jours.map((j) => [j.jour, j])).values()].sort((x, y) => x.jour - y.jour);
    const days = JSON.stringify(jours.map((j) => String(j.jour)));
    const heures = Array.from({ length: 7 }, (_, i) => jours.find((j) => j.jour === i)?.heure ?? '00:00');
    const hourStart = JSON.stringify(heures);

    const [existant] = miseAJour ? await m.query('SELECT id FROM availabilities WHERE user_id = ? ORDER BY id DESC LIMIT 1', [agentUserId]) : [];
    if (existant) {
      await m.query('UPDATE availabilities SET days = ?, hour_start = ?, updated_at = ? WHERE id = ?', [days, hourStart, now, existant.id]);
    } else {
      await m.query('INSERT INTO availabilities (user_id, days, hour_start, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [agentUserId, days, hourStart, now, now]);
    }
  }

  private libelleSpecialite(r: Ligne): string | null {
    if (r.type_agent_id === undefined) return null;
    if (Number(r.type_agent_id) === 2) return 'Sage-femme';
    if (r.type_name === 'specialiste') return (r.specialite as string) ?? (Number(r.gyneco) === 1 ? 'Gynécologue' : 'Spécialiste');
    return 'Généraliste';
  }

  private jours(days: unknown): number[] {
    return this.parse<unknown[]>(days, [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  }

  private parse<T>(valeur: unknown, defaut: T): T {
    if (typeof valeur !== 'string') return defaut;
    try {
      return JSON.parse(valeur) ?? defaut;
    } catch {
      return defaut;
    }
  }
}
