import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { laravelHash, laravelNow } from '../../../common/laravel';
import { HOPITAL_UCP, IDS_HOPITAUX_UCP } from '../../../common/ucp-fm';
import { TransfertDto } from './dto/transfert.dto';

/**
 * ADMIN UCP-FM > PERSONNEL SUPPRIMÉ
 * Agents (médecins, sages-femmes, infirmiers) supprimés par leur hôpital UCP-FM
 * (doctors / infirmiers.`delete` = 1 : la ligne et le compte restent, comme Laravel).
 * L'admin peut :
 *   - RÉINTÉGRER l'agent dans son hôpital (delete = 0) ;
 *   - le faire CHANGER D'HÔPITAL (réintégré dans un autre hôpital UCP-FM, avec ses nouveaux services / actes) ;
 *   - le SUPPRIMER DÉFINITIVEMENT :
 *       sans historique médical → la fiche, le planning, les liens et le compte sont effacés ;
 *       avec historique (consultations, hospitalisations…) → la fiche reste pour les dossiers patients,
 *       mais le compte est neutralisé (email libéré, mot de passe aléatoire) et l'agent sort de la liste
 *       (table fm_personnels_supprimes).
 */
export type TypeAgent = 'medecin' | 'sage-femme' | 'infirmier';
type Ligne = Record<string, unknown>;

/** Références médicales qui empêchent d'effacer la fiche (les dossiers patients y renvoient) */
const HISTORIQUE_MEDECIN = [
  ['consultations', 'doctor_id'],
  ['admissions', 'doctor_id'],
  ['hospitalisations', 'doctor_id'],
  ['day_hospitalisations', 'doctor_id'],
  ['declarations', 'doctor_id'],
  ['arret_travail', 'doctor_id'],
  ['rendez_vouses', 'doctor_id'],
  ['patient_calls', 'doctor_id'],
  ['patients', 'doctor_id'],
  ['plannings', 'doctor_id'],
];
const HISTORIQUE_INFIRMIER = [
  ['consultations', 'infirmier_id'],
  ['admissions', 'infirmier_id'],
  ['day_hospitalisations', 'infirmier_id'],
];
const HISTORIQUE_COMPTE = [
  ['permissions', 'user_id'],
  ['diaries', 'user_id'],
  ['patient_notifications', 'user_id'],
];

const LIBELLE: Record<TypeAgent, string> = { medecin: 'Médecin', 'sage-femme': 'Sage-femme', infirmier: 'Infirmier(e)' };

@Injectable()
export class PersonnelSupprimeService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Liste des agents supprimés des hôpitaux UCP-FM (plus récents d'abord) */
  async liste() {
    const [medecins, infirmiers] = await Promise.all([
      this.db.query(
        `SELECT d.id, d.type_agent_id, d.type_name, d.matricule, d.contact, d.img_url, d.updated_at, d.hospital_id,
                u.name, u.prenom, u.email, h.label AS hopital, s.libelle AS service, t.label AS specialite
           FROM doctors d
           JOIN users u ON u.id = d.user_id
           JOIN hospitals h ON h.id = d.hospital_id
           LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
           LEFT JOIN services s ON s.id = sh.service_id
           LEFT JOIN type_doctors t ON t.id = d.type_doctor_id
          WHERE (d.\`delete\` = 1 OR d.deleted_at IS NOT NULL)
            AND d.hospital_id IN ${IDS_HOPITAUX_UCP}
            AND NOT EXISTS (SELECT 1 FROM fm_personnels_supprimes f WHERE f.type_agent = 'doctor' AND f.agent_id = d.id)`,
      ),
      this.db.query(
        `SELECT i.id, i.matricule, i.contact, i.img_url, i.updated_at, i.hospital_id,
                u.name, u.prenom, u.email, h.label AS hopital,
                (SELECT GROUP_CONCAT(s.libelle ORDER BY s.libelle SEPARATOR ', ')
                   FROM service_infirmiers si JOIN service_hospitals sh ON sh.id = si.service_hospital_id
                   JOIN services s ON s.id = sh.service_id WHERE si.infirmier_id = i.id) AS services,
                (SELECT s.libelle FROM service_hospitals sh JOIN services s ON s.id = sh.service_id
                  WHERE sh.id = i.service_hospital_id) AS service
           FROM infirmiers i
           JOIN users u ON u.id = i.user_id
           JOIN hospitals h ON h.id = i.hospital_id
          WHERE i.\`delete\` = 1
            AND i.hospital_id IN ${IDS_HOPITAUX_UCP}
            AND NOT EXISTS (SELECT 1 FROM fm_personnels_supprimes f WHERE f.type_agent = 'infirmier' AND f.agent_id = i.id)`,
      ),
    ]);

    const ligne = (r: Ligne, type: TypeAgent) => ({
      id: Number(r.id),
      type,
      typeLibelle: LIBELLE[type],
      specialite: type === 'medecin' ? (r.type_name === 'specialiste' ? (r.specialite ?? 'Spécialiste') : 'Généraliste') : null,
      /** Spécialiste : sa spécialité est à choisir dans le nouvel hôpital en cas de changement */
      specialiste: type === 'medecin' && r.type_name === 'specialiste',
      nom: [r.name, r.prenom].filter(Boolean).join(' '),
      matricule: r.matricule ?? null,
      email: r.email ?? null,
      contact: r.contact ?? null,
      imgUrl: r.img_url ?? null,
      hopital: { id: Number(r.hospital_id), label: r.hopital },
      service: r.services ?? r.service ?? null,
      supprimeLe: r.updated_at,
    });

    return [
      ...medecins.map((r: Ligne) => ligne(r, Number(r.type_agent_id) === 2 ? 'sage-femme' : 'medecin')),
      ...infirmiers.map((r: Ligne) => ligne(r, 'infirmier')),
    ].sort((a, b) => String(b.supprimeLe).localeCompare(String(a.supprimeLe)));
  }

  /** Formulaire « Changer d'hôpital » : hôpitaux UCP-FM, et pour l'hôpital choisi ses services, actes et spécialités */
  async options(hopitalId?: number) {
    const hopitaux = await this.db.query(`SELECT id, label FROM hospitals WHERE ${HOPITAL_UCP} ORDER BY label`);
    if (!hopitalId) return { hopitaux: hopitaux.map((h: Ligne) => ({ id: Number(h.id), label: h.label })) };

    await this.hopitalUcp(hopitalId);
    const [services, actes, specialites] = await Promise.all([
      this.db.query(
        `SELECT sh.id, s.libelle FROM service_hospitals sh JOIN services s ON s.id = sh.service_id
          WHERE sh.hospital_id = ? AND sh.status = 0 ORDER BY s.libelle`,
        [hopitalId],
      ),
      this.db.query(
        `SELECT ph.id, ph.service_hospital_id, ps.libelle, ph.prix
           FROM prestation_hospitals ph
           JOIN prestation_services ps ON ps.id = ph.prestation_service_id
           JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
          WHERE sh.hospital_id = ? AND ph.status = 0 ORDER BY ps.libelle`,
        [hopitalId],
      ),
      this.db.query('SELECT id, label FROM type_doctors WHERE hospital_id = ? AND `delete` = 0 AND status = 0 ORDER BY label', [hopitalId]),
    ]);
    return {
      hopitaux: hopitaux.map((h: Ligne) => ({ id: Number(h.id), label: h.label })),
      services: services.map((s: Ligne) => ({ id: Number(s.id), libelle: s.libelle })),
      actes: actes.map((a: Ligne) => ({ id: Number(a.id), serviceId: Number(a.service_hospital_id), libelle: a.libelle })),
      specialites: specialites.map((s: Ligne) => ({ id: Number(s.id), libelle: s.label })),
    };
  }

  /** Réintégration dans son hôpital */
  async reintegrer(type: TypeAgent, id: number) {
    const a = await this.agentSupprime(type, id);
    await this.verifierMatricule(type, a, Number(a.hospital_id));
    const table = this.table(type);
    await this.db.query(
      `UPDATE \`${table}\` SET \`delete\` = 0${table === 'doctors' ? ', deleted_at = NULL' : ''}, updated_at = ? WHERE id = ?`,
      [laravelNow(), id],
    );
    return { message: `« ${a.name} » a été réintégré(e) à ${a.hopital}.` };
  }

  /** Changement d'hôpital : l'agent est réintégré dans un autre hôpital UCP-FM */
  async transferer(type: TypeAgent, id: number, dto: TransfertDto) {
    const a = await this.agentSupprime(type, id);
    if (Number(a.hospital_id) === dto.hopitalId) {
      throw new BadRequestException("Choisissez un autre hôpital, ou utilisez « Réintégrer » pour le garder dans le même.");
    }
    const arrivee = await this.hopitalUcp(dto.hopitalId);
    await this.verifierMatricule(type, a, dto.hopitalId);

    // --- Toutes les vérifications avant la première écriture (tables MyISAM : pas de retour arrière) ---
    let services: number[] = [];
    let specialite: Ligne | null = null;
    if (type === 'infirmier') {
      services = [...new Set(dto.services ?? [])];
      if (!services.length) throw new BadRequestException('Choisissez au moins un service.');
      await this.verifierServices(dto.hopitalId, services);
    } else {
      if (!dto.service) throw new BadRequestException("Choisissez le service d'affectation.");
      await this.verifierServices(dto.hopitalId, [dto.service]);
      const actes = [...new Set(dto.actes ?? [])];
      if (!actes.length) throw new BadRequestException('Choisissez au moins un acte médical pratiqué.');
      const [{ n }] = await this.db.query(
        `SELECT COUNT(*) AS n FROM prestation_hospitals ph JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
          WHERE ph.id IN (?) AND sh.hospital_id = ?`,
        [actes, dto.hopitalId],
      );
      if (Number(n) !== actes.length) throw new BadRequestException("Un acte médical choisi n'appartient pas à l'hôpital d'arrivée.");
      dto.actes = actes;
      if (type === 'medecin' && a.type_name === 'specialiste') {
        if (!dto.typeDoctor) throw new BadRequestException('Choisissez la spécialité du médecin dans le nouvel hôpital.');
        [specialite] = await this.db.query('SELECT id, label FROM type_doctors WHERE id = ? AND hospital_id = ? AND `delete` = 0', [dto.typeDoctor, dto.hopitalId]);
        if (!specialite) throw new BadRequestException('Spécialité inconnue dans cet hôpital.');
      }
    }

    // --- Écritures ---
    const now = laravelNow();
    if (type === 'infirmier') {
      await this.db.query('UPDATE infirmiers SET hospital_id = ?, service_hospital_id = ?, `delete` = 0, updated_at = ? WHERE id = ?', [
        dto.hopitalId,
        services[0],
        now,
        id,
      ]);
      await this.db.query('DELETE FROM service_infirmiers WHERE infirmier_id = ?', [id]);
      for (const s of services) {
        await this.db.query('INSERT INTO service_infirmiers (infirmier_id, service_hospital_id, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, s, now, now]);
      }
    } else {
      const gyneco = type === 'sage-femme' ? 1 : specialite ? (/gyn[eé]co/i.test(String(specialite.label)) ? 1 : 0) : a.gyneco;
      await this.db.query(
        `UPDATE doctors SET hospital_id = ?, service_hospital_id = ?, type_doctor_id = ?, gyneco = ?, chief = 0,
                \`delete\` = 0, deleted_at = NULL, updated_at = ? WHERE id = ?`,
        [dto.hopitalId, dto.service, specialite ? specialite.id : null, gyneco, now, id],
      );
      await this.db.query('DELETE FROM prestation_doctors WHERE doctor_id = ?', [id]);
      for (const acte of dto.actes ?? []) {
        await this.db.query('INSERT INTO prestation_doctors (doctor_id, prestation_hospital_id, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, acte, now, now]);
      }
    }
    return { message: `« ${a.name} » travaille maintenant à ${arrivee.label}.` };
  }

  /** Suppression définitive (voir l'en-tête du fichier) */
  async supprimerDefinitivement(type: TypeAgent, id: number, adminId: number) {
    const a = await this.agentSupprime(type, id);
    const userId = Number(a.user_id);
    const references = [
      ...(type === 'infirmier' ? HISTORIQUE_INFIRMIER : HISTORIQUE_MEDECIN).map(([t, c]) => [t, c, id] as const),
      ...HISTORIQUE_COMPTE.map(([t, c]) => [t, c, userId] as const),
    ];
    let historique = 0;
    for (const [t, c, v] of references) {
      const [{ n }] = await this.db.query(`SELECT COUNT(*) AS n FROM \`${t}\` WHERE \`${c}\` = ?`, [v]);
      historique += Number(n);
    }
    const table = this.table(type);

    if (historique === 0) {
      if (table === 'doctors') {
        await this.db.query('DELETE FROM prestation_doctors WHERE doctor_id = ?', [id]);
        await this.db.query('DELETE FROM service_doctors WHERE doctor_id = ?', [id]);
      } else {
        await this.db.query('DELETE FROM service_infirmiers WHERE infirmier_id = ?', [id]);
      }
      await this.db.query('DELETE FROM availabilities WHERE user_id = ?', [userId]);
      await this.db.query(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);
      // Le compte n'est effacé que s'il ne sert à aucun autre profil
      const [autre] = await this.db.query(
        'SELECT 1 FROM doctors WHERE user_id = ? UNION SELECT 1 FROM infirmiers WHERE user_id = ? UNION SELECT 1 FROM hospitals WHERE user_id = ? LIMIT 1',
        [userId, userId, userId],
      );
      if (!autre) await this.db.query('DELETE FROM users WHERE id = ?', [userId]);
      return { message: `« ${a.name} » a été supprimé(e) définitivement.` };
    }

    // Historique médical : fiche gardée, compte neutralisé, agent retiré de la liste
    const motDePasse = await laravelHash(randomBytes(24).toString('hex'));
    await this.db.query(
      'INSERT INTO fm_personnels_supprimes (type_agent, agent_id, user_id, nom, email_origine, hospital_id, supprime_par, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [table === 'doctors' ? 'doctor' : 'infirmier', id, userId, a.name, a.email, a.hospital_id, adminId, laravelNow()],
    );
    await this.db.query('UPDATE users SET email = ?, password = ?, remember_token = NULL, fcm_token = NULL, updated_at = ? WHERE id = ?', [
      `supprime-${userId}@gemma-fm.invalid`,
      motDePasse,
      laravelNow(),
      userId,
    ]);
    await this.db.query(`UPDATE \`${table}\` SET status = 1, updated_at = ? WHERE id = ?`, [laravelNow(), id]);
    return {
      message: `« ${a.name} » a été supprimé(e) définitivement : son compte est fermé et son adresse email libérée. Sa fiche reste attachée aux ${historique} élément(s) des dossiers patients.`,
    };
  }

  // ---------------------------------------------------------------------------

  private table(type: TypeAgent) {
    return type === 'infirmier' ? 'infirmiers' : 'doctors';
  }

  /** Agent supprimé d'un hôpital UCP-FM, pas encore supprimé définitivement */
  private async agentSupprime(type: TypeAgent, id: number): Promise<Ligne> {
    const table = this.table(type);
    const filtre =
      table === 'doctors'
        ? `(a.\`delete\` = 1 OR a.deleted_at IS NOT NULL) AND a.type_agent_id = ${type === 'sage-femme' ? 2 : 1}`
        : 'a.`delete` = 1';
    const [r] = await this.db.query(
      `SELECT a.*, TRIM(CONCAT_WS(' ', u.name, u.prenom)) AS name, u.email, h.label AS hopital FROM \`${table}\` a
         JOIN users u ON u.id = a.user_id JOIN hospitals h ON h.id = a.hospital_id
        WHERE a.id = ? AND ${filtre} AND a.hospital_id IN ${IDS_HOPITAUX_UCP}
          AND NOT EXISTS (SELECT 1 FROM fm_personnels_supprimes f WHERE f.type_agent = ? AND f.agent_id = a.id)`,
      [id, table === 'doctors' ? 'doctor' : 'infirmier'],
    );
    if (!r) throw new NotFoundException('Agent supprimé introuvable.');
    return r;
  }

  private async hopitalUcp(id: number): Promise<Ligne> {
    const [h] = await this.db.query(`SELECT id, label FROM hospitals WHERE id = ? AND ${HOPITAL_UCP}`, [id]);
    if (!h) throw new NotFoundException('Hôpital introuvable (seuls les hôpitaux DMHP sont gérés ici).');
    return h;
  }

  /** Le matricule ne doit pas être déjà porté par un agent actif de l'hôpital d'arrivée */
  private async verifierMatricule(type: TypeAgent, a: Ligne, hopitalId: number) {
    const table = this.table(type);
    const [doublon] = await this.db.query(
      `SELECT id FROM \`${table}\` WHERE matricule = ? AND hospital_id = ? AND \`delete\` = 0 AND id <> ? LIMIT 1`,
      [a.matricule, hopitalId, a.id],
    );
    if (doublon) throw new ConflictException(`Le matricule ${a.matricule} est déjà porté par un agent actif de cet hôpital.`);
  }

  private async verifierServices(hopitalId: number, ids: number[]) {
    const [{ n }] = await this.db.query('SELECT COUNT(*) AS n FROM service_hospitals WHERE id IN (?) AND hospital_id = ? AND status = 0', [ids, hopitalId]);
    if (Number(n) !== ids.length) throw new BadRequestException("Un service choisi n'appartient pas à l'hôpital d'arrivée.");
  }
}
