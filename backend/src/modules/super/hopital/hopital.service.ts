import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { laravelHash, laravelNow } from '../../../common/laravel';
import { deleteImage, saveImage } from '../../../common/uploads';
import { CreateHopitalDto } from './dto/create-hopital.dto';
import { UpdateHopitalDto } from './dto/update-hopital.dto';

/**
 * SUPER > HÔPITAL
 * Reprend Laravel : app/Http/Controllers/Super/HospitalController.php
 *   index, add/store, show/update, status, toggleTeleconsultation, HospReport (supervision)
 * Tables : hospitals, users, sub_prefectures (structure gérée par Laravel)
 * Espace d'administration UCP-FM : seuls les hôpitaux marqués UCP-FM (is_ucp_fm = 1) sont listés et gérés ;
 * un hôpital créé ici est marqué UCP-FM d'office.
 */
@Injectable()
export class HopitalService {
  private readonly logger = new Logger(HopitalService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Liste des hôpitaux UCP-FM non supprimés */
  async liste() {
    const rows = await this.db.query(`
      SELECT h.id, h.reference, h.label, h.contact, h.img_url, h.district_sanitaire,
             h.nom_direction_generale, h.status, h.is_teleconsultation_active, h.created_at,
             sp.name AS localite, u.email
        FROM hospitals h
        LEFT JOIN sub_prefectures sp ON sp.id = h.localite
        LEFT JOIN users u ON u.id = h.user_id
       WHERE h.deleted_at IS NULL AND h.is_ucp_fm = 1
       ORDER BY h.id ASC
    `);
    return rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      reference: r.reference,
      label: r.label,
      contact: r.contact,
      imgUrl: r.img_url,
      district: r.district_sanitaire,
      directionGenerale: r.nom_direction_generale,
      localite: r.localite,
      email: r.email,
      // Dans Laravel : status 0 = Activé, 1 = Désactivé
      actif: Number(r.status) === 0,
      teleconsultation: r.is_teleconsultation_active == null ? true : Number(r.is_teleconsultation_active) === 1,
      createdAt: r.created_at,
    }));
  }

  /** Localités (sous-préfectures) pour le formulaire */
  async localites(): Promise<{ id: number; name: string }[]> {
    const rows: { id: string | number; name: string }[] = await this.db.query(
      'SELECT id, name FROM sub_prefectures ORDER BY name ASC',
    );
    // Les BIGINT arrivent en texte depuis MySQL : conversion en nombre pour le formulaire
    return rows.map((r) => ({ id: Number(r.id), name: r.name }));
  }

  /** Régions (champ "Direction régionale") */
  async regions(): Promise<{ id: number; name: string }[]> {
    const rows: { id: string | number; name: string }[] = await this.db.query(
      'SELECT id, name FROM regions ORDER BY name ASC',
    );
    return rows.map((r) => ({ id: Number(r.id), name: r.name }));
  }

  /**
   * Direction régionale : renvoie le nom exact de la région (ex. "MARAHOUE" → "Marahoué",
   * la collation MySQL ignore majuscules et accents). Vide → null. Inconnue → erreur,
   * sauf si c'est la valeur déjà enregistrée (anciennes saisies libres de Laravel).
   */
  private async regionValide(nom: string | undefined, valeurActuelle?: string | null): Promise<string | null> {
    if (!nom) return null;
    const [region] = await this.db.query('SELECT name FROM regions WHERE name = ? LIMIT 1', [nom]);
    if (region) return region.name;
    if (valeurActuelle != null && nom === valeurActuelle) return nom;
    throw new BadRequestException('Direction régionale : veuillez choisir une région de la liste');
  }

  /** Ajout : compte users (rôle hospital) + ligne hospitals, dans une transaction */
  async creer(dto: CreateHopitalDto, image?: Express.Multer.File) {
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException('Les mots de passe ne correspondent pas');
    }

    // Mêmes vérifications que Laravel + email unique (index UNIQUE sur users.email)
    const [refExiste] = await this.db.query(
      'SELECT id FROM hospitals WHERE reference = ? AND deleted_at IS NULL LIMIT 1',
      [dto.reference],
    );
    if (refExiste) throw new ConflictException('Un hôpital avec ce code existe déjà.');

    const [emailExiste] = await this.db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [dto.email]);
    if (emailExiste) throw new ConflictException('Cette adresse email est déjà utilisée par un autre compte.');

    const [localite] = await this.db.query('SELECT id FROM sub_prefectures WHERE id = ? LIMIT 1', [dto.localite]);
    if (!localite) throw new BadRequestException('Localité inconnue');

    const direction = await this.regionValide(dto.directionGenerale);
    const imgUrl = image ? await saveImage(image, 'hospital') : null;
    const now = laravelNow();
    const password = await laravelHash(dto.password);

    const hospitalId = await this.db.transaction(async (trx) => {
      const user = await trx.query(
        `INSERT INTO users (name, prenom, email, role_as, password, created_at, updated_at)
         VALUES (?, NULL, ?, 'hospital', ?, ?, ?)`,
        [dto.label, dto.email, password, now, now],
      );
      const hospital = await trx.query(
        `INSERT INTO hospitals
           (user_id, reference, contact, localite, label, district_sanitaire, nom_direction_generale,
            img_url, is_teleconsultation_active, is_ucp_fm, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          user.insertId,
          dto.reference,
          dto.contact,
          dto.localite,
          dto.label,
          dto.district,
          direction,
          imgUrl,
          dto.teleconsultation ? 1 : 0, // Laravel : décoché = désactivée
          now,
          now,
        ],
      );
      return Number(hospital.insertId);
    });

    this.logger.log(`Hôpital créé : #${hospitalId} ${dto.label}`);
    // TODO : Laravel envoie aussi un email au compte créé (HospitalCreatedNotification)
    return { id: hospitalId, message: 'Hôpital ajouté avec succès.' };
  }

  /** Hôpital UCP-FM non supprimé, ou 404 (les autres hôpitaux ne sont pas gérés par cet espace) */
  private async trouver(id: number) {
    const [h] = await this.db.query(
      `SELECT h.*, u.email, sp.name AS localite_nom
         FROM hospitals h
         LEFT JOIN users u ON u.id = h.user_id
         LEFT JOIN sub_prefectures sp ON sp.id = h.localite
        WHERE h.id = ? AND h.deleted_at IS NULL AND h.is_ucp_fm = 1 LIMIT 1`,
      [id],
    );
    if (!h) throw new NotFoundException('Hôpital introuvable (seuls les hôpitaux DMHP sont gérés ici)');
    return h;
  }

  /** Fiche pour le formulaire "Modifier" (show) */
  async detail(id: number) {
    const h = await this.trouver(id);
    return {
      id: Number(h.id),
      reference: h.reference,
      label: h.label,
      contact: h.contact,
      localiteId: h.localite != null ? Number(h.localite) : null,
      district: h.district_sanitaire,
      directionGenerale: h.nom_direction_generale,
      teleconsultation: h.is_teleconsultation_active == null ? true : Number(h.is_teleconsultation_active) === 1,
      email: h.email,
      imgUrl: h.img_url,
    };
  }

  /**
   * Modification (update). Différence voulue avec Laravel : le mot de passe changé est celui
   * du compte de l'HÔPITAL (Laravel modifiait par erreur celui du super admin connecté).
   */
  async modifier(id: number, dto: UpdateHopitalDto, image?: Express.Multer.File) {
    const h = await this.trouver(id);
    if (dto.password && dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException('Les mots de passe ne correspondent pas');
    }
    const [localite] = await this.db.query('SELECT id FROM sub_prefectures WHERE id = ? LIMIT 1', [dto.localite]);
    if (!localite) throw new BadRequestException('Localité inconnue');

    const [emailPris] = await this.db.query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [dto.email, h.user_id]);
    if (emailPris) throw new ConflictException('Cette adresse email est déjà utilisée par un autre compte.');

    const direction = await this.regionValide(dto.directionGenerale, h.nom_direction_generale);
    const nouvelleImage = image ? await saveImage(image, 'hospital') : null;
    const now = laravelNow();
    const password = dto.password ? await laravelHash(dto.password) : null;

    await this.db.transaction(async (trx) => {
      await trx.query(
        `UPDATE hospitals
            SET label = ?, contact = ?, localite = ?, district_sanitaire = ?, nom_direction_generale = ?,
                is_teleconsultation_active = ?, img_url = COALESCE(?, img_url), updated_at = ?
          WHERE id = ?`,
        [dto.label, dto.contact, dto.localite, dto.district, direction,
         dto.teleconsultation ? 1 : 0, nouvelleImage, now, id],
      );
      await trx.query(
        `UPDATE users SET email = ?, password = COALESCE(?, password), updated_at = ? WHERE id = ?`,
        [dto.email, password, now, h.user_id],
      );
    });

    // Nouvelle image enregistrée → l'ancienne est supprimée (comme Laravel)
    if (nouvelleImage) await deleteImage('hospital', h.img_url);
    return { message: 'Hôpital modifié avec succès.' };
  }

  /** Activer / désactiver (status). Laravel : 0 = Activé, 1 = Désactivé — un hôpital désactivé ne peut plus se connecter */
  async basculerStatut(id: number) {
    const h = await this.trouver(id);
    const actif = Number(h.status) !== 0; // nouvel état : l'inverse de l'actuel
    await this.db.query('UPDATE hospitals SET status = ?, updated_at = ? WHERE id = ?', [actif ? 0 : 1, laravelNow(), id]);
    return { actif, message: `Hôpital ${actif ? 'activé' : 'désactivé'} avec succès.` };
  }

  /** Activer / désactiver la téléconsultation (toggleTeleconsultation) */
  async basculerTeleconsultation(id: number) {
    const h = await this.trouver(id);
    const avant = h.is_teleconsultation_active == null ? true : Number(h.is_teleconsultation_active) === 1;
    const teleconsultation = !avant;
    await this.db.query('UPDATE hospitals SET is_teleconsultation_active = ?, updated_at = ? WHERE id = ?', [
      teleconsultation ? 1 : 0,
      laravelNow(),
      id,
    ]);
    return {
      teleconsultation,
      message: `Téléconsultation ${teleconsultation ? 'activée' : 'désactivée'} avec succès pour ${h.label ?? "l'hôpital"}.`,
    };
  }

  /**
   * Vue d'ensemble d'un hôpital UCP-FM (portail de supervision) — sans caisse, pharmacie, secrétariat,
   * comptabilité ni montants (payés ou dépensés) : activité médicale, personnel de santé, lits, services.
   */
  async supervision(id: number) {
    const h = await this.trouver(id);
    const [c] = await this.db.query(
      `SELECT
        (SELECT COUNT(*) FROM consultations WHERE hospital_id = ?)                                            AS consultations,
        (SELECT COUNT(*) FROM consultations WHERE hospital_id = ? AND DATE(created_at) = CURDATE())            AS consultationsJour,
        (SELECT COUNT(*) FROM declarations WHERE hospital_id = ? AND type = 'birth')                          AS naissances,
        (SELECT COUNT(*) FROM declarations WHERE hospital_id = ? AND type = 'death')                          AS deces,
        (SELECT COUNT(*) FROM patients WHERE hospital_id = ? AND deleted_at IS NULL)                          AS patients,
        (SELECT COUNT(*) FROM doctors WHERE hospital_id = ? AND deleted_at IS NULL AND \`delete\` = 0 AND COALESCE(type_agent_id, 0) <> 2) AS medecins,
        (SELECT COUNT(*) FROM doctors WHERE hospital_id = ? AND deleted_at IS NULL AND \`delete\` = 0 AND type_agent_id = 2)              AS sagesFemmes,
        (SELECT COUNT(*) FROM infirmiers WHERE hospital_id = ? AND \`delete\` = 0)                             AS infirmiers,
        (SELECT COUNT(*) FROM hospitalisations ho JOIN consultations hc ON hc.id = ho.consultation_id
          WHERE hc.hospital_id = ? AND ho.deleted_at IS NULL AND ho.status = 'in_progress')                   AS hospitalisationsEnCours,
        (SELECT COUNT(*) FROM beds b JOIN bedrooms r ON r.id = b.bedroom_id
          WHERE r.hospital_id = ? AND b.\`delete\` = 0 AND r.\`delete\` = 0)                                     AS lits,
        (SELECT COUNT(*) FROM beds b JOIN bedrooms r ON r.id = b.bedroom_id
          WHERE r.hospital_id = ? AND b.\`delete\` = 0 AND r.\`delete\` = 0 AND b.status_occupied = 'occupied')  AS litsOccupes,
        (SELECT COUNT(*) FROM permissions WHERE hospital_id = ? AND status = 'pending')
          + (SELECT COUNT(*) FROM fm_permissions_regulateurs WHERE hospital_id = ? AND status = 'pending')     AS permissionsEnAttente,
        (SELECT COUNT(*) FROM type_assurances WHERE hospital_id = ? AND \`delete\` = 0)                  AS assurances`,
      Array(14).fill(id),
    );
    const n = (k: string) => Number(c[k] ?? 0);
    const services = await this.db.query(
      `SELECT sh.id, s.libelle, sh.status,
              (SELECT COUNT(*) FROM doctors d WHERE d.service_hospital_id = sh.id AND d.deleted_at IS NULL AND d.\`delete\` = 0) AS medecins
         FROM service_hospitals sh LEFT JOIN services s ON s.id = sh.service_id
        WHERE sh.hospital_id = ? ORDER BY s.libelle`,
      [id],
    );
    const personnel = { medecins: n('medecins'), sagesFemmes: n('sagesFemmes'), infirmiers: n('infirmiers') };
    return {
      hopital: {
        id: Number(h.id),
        reference: h.reference,
        label: h.label,
        contact: h.contact,
        localite: h.localite_nom,
        district: h.district_sanitaire,
        directionGenerale: h.nom_direction_generale,
        email: h.email,
        imgUrl: h.img_url,
        actif: Number(h.status) === 0,
        teleconsultation: h.is_teleconsultation_active == null ? true : Number(h.is_teleconsultation_active) === 1,
        createdAt: h.created_at,
      },
      activite: {
        consultations: n('consultations'),
        consultationsJour: n('consultationsJour'),
        naissances: n('naissances'),
        deces: n('deces'),
        patients: n('patients'),
        hospitalisationsEnCours: n('hospitalisationsEnCours'),
        permissionsEnAttente: n('permissionsEnAttente'),
        assurances: n('assurances'),
      },
      lits: { total: n('lits'), occupes: n('litsOccupes'), libres: Math.max(n('lits') - n('litsOccupes'), 0) },
      personnel: { ...personnel, total: personnel.medecins + personnel.sagesFemmes + personnel.infirmiers },
      // service_hospitals.status : 0 = actif (même convention que le reste de Laravel)
      services: services.map((s: Record<string, unknown>) => ({ id: Number(s.id), libelle: s.libelle, actif: Number(s.status) === 0, medecins: Number(s.medecins ?? 0) })),
    };
  }
}
