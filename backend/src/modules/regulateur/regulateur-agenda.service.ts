import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { laravelNow } from '../../common/laravel';
import { JOURS, planningSemaine } from '../../common/planning-medecin';
import { DISPO_MEDECIN, JOINTURE_PLANNING, LIBELLES, nom, raisonIndisponible, regulateurDuCompte, sansDr } from './regulateur.service';
import { permissionEnCours } from '../../common/permission-en-cours';

type Ligne = Record<string, any>;

/** "AAAA-MM-JJ" → lundi de sa semaine (dates en UTC pour éviter les décalages) */
function lundiDe(date?: string) {
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date();
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  base.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
  return base;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface CreerPermissionRegulateur {
  beging_date: string;
  end_date: string;
  beging_time?: string;
  end_time?: string;
  description: string;
}

/**
 * RÉGULATEUR — calendrier des médecins, planning personnel et demandes de permission.
 * Les permissions des régulateurs vont dans fm_permissions_regulateurs (l'ENUM permissions.type de Laravel
 * ne connaît pas ce rôle) ; l'hôpital les accorde / refuse dans ses pages « Permission ».
 */
@Injectable()
export class RegulateurAgendaService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * Calendrier de la semaine (lundi → dimanche) : tous les médecins de l'hôpital, leur créneau de chaque jour,
   * leurs permissions (accordées ou en attente) et leur disponibilité maintenant.
   */
  async calendrier(userId: number, semaine?: string) {
    const { hospitalId, hopital } = await regulateurDuCompte(this.db, userId);
    const lundi = lundiDe(semaine);
    const dates = JOURS.map((_, i) => {
      const d = new Date(lundi);
      d.setUTCDate(lundi.getUTCDate() + i);
      return iso(d);
    });
    const [debutSemaine, finSemaine] = [dates[0], dates[6]];

    const medecins: Ligne[] = await this.db.query(
      `SELECT d.id, d.id AS doctor_id, d.user_id, d.type_agent_id, d.type_name, u.name, u.prenom,
              s.libelle AS service, t.label AS specialite, ${DISPO_MEDECIN}
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN type_doctors t ON t.id = d.type_doctor_id
         ${JOINTURE_PLANNING}
        WHERE d.hospital_id = ? AND d.\`delete\` = 0 AND d.deleted_at IS NULL
        ORDER BY s.libelle, u.name`,
      [hospitalId],
    );
    const permissions: Ligne[] = await this.db.query(
      `SELECT p.user_id, p.status, p.description,
              DATE_FORMAT(p.beging_date, '%Y-%m-%d') AS debut, DATE_FORMAT(p.end_date, '%Y-%m-%d') AS fin,
              TIME_FORMAT(p.beging_time, '%H:%i') AS heure_debut, TIME_FORMAT(p.end_time, '%H:%i') AS heure_fin
         FROM permissions p
        WHERE p.hospital_id = ? AND p.type = 'doctor' AND p.status IN ('agree', 'pending')
          AND p.beging_date <= ? AND p.end_date >= ?`,
      [hospitalId, finSemaine, debutSemaine],
    );

    const liste = medecins.map((m) => {
      const planning = planningSemaine(m.av_days, m.av_debut, m.av_fin);
      const sesPermissions = permissions.filter((p) => Number(p.user_id) === Number(m.user_id));
      const raison = raisonIndisponible(m);
      return {
        id: Number(m.id),
        nom: Number(m.type_agent_id) === 2 ? sansDr(nom(m.name, m.prenom)) : `Dr ${sansDr(nom(m.name, m.prenom))}`,
        service: (m.service as string) ?? null,
        specialite: Number(m.type_agent_id) === 2 ? 'Sage-femme' : m.type_name === 'specialiste' ? ((m.specialite as string) ?? 'Spécialiste') : 'Généraliste',
        actif: Number(m.d_status) === 0,
        disponibleMaintenant: raison === null,
        raison: raison ? LIBELLES[raison] : null,
        jours: dates.map((date, i) => {
          const p = sesPermissions.find((x) => x.debut <= date && x.fin >= date);
          // Une permission d'un seul jour avec heures ne couvre qu'une partie de la journée
          const partielle = p && p.debut === p.fin && p.heure_debut && p.heure_fin ? `${p.heure_debut} – ${p.heure_fin}` : null;
          return {
            date,
            travaille: planning[i].travaille,
            debut: planning[i].debut,
            fin: planning[i].fin,
            journeeEntiere: planning[i].journeeEntiere,
            permission: p ? { statut: p.status as 'agree' | 'pending', heures: partielle, motif: (p.description as string) ?? null } : null,
          };
        }),
      };
    });

    return {
      hopital,
      semaine: { debut: debutSemaine, fin: finSemaine, jours: dates.map((date, i) => ({ date, nom: JOURS[i] })) },
      services: [...new Set(liste.map((m) => m.service).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'fr')),
      medecins: liste,
    };
  }

  /** Mon planning (même format que celui de l'infirmier·ère / du médecin ; pas de rendez-vous pour un régulateur) */
  async planning(userId: number) {
    const { hopital } = await regulateurDuCompte(this.db, userId);
    const [av] = await this.db.query('SELECT days, hour_start, hour_end FROM availabilities WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
    return {
      hospitalNom: hopital,
      permission: await permissionEnCours(this.db, userId),
      jours: planningSemaine(av?.days, av?.hour_start, av?.hour_end),
      rendezVous: [],
    };
  }

  /** Mes demandes de permission */
  async permissions(userId: number) {
    await regulateurDuCompte(this.db, userId);
    const rows: Ligne[] = await this.db.query(
      `SELECT id, code, description, status, created_at,
              DATE_FORMAT(beging_date, '%Y-%m-%d') AS debut, DATE_FORMAT(end_date, '%Y-%m-%d') AS fin,
              TIME_FORMAT(beging_time, '%H:%i') AS heure_debut, TIME_FORMAT(end_time, '%H:%i') AS heure_fin
         FROM fm_permissions_regulateurs WHERE user_id = ? ORDER BY id DESC`,
      [userId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      code: (r.code as string) || `PERM-${r.id}`,
      debutDate: r.debut as string,
      finDate: r.fin as string,
      debutHeure: (r.heure_debut as string) ?? null,
      finHeure: (r.heure_fin as string) ?? null,
      description: (r.description as string) ?? '',
      pieceUrl: null,
      statut: (r.status as 'pending' | 'agree' | 'reject') || 'pending',
      createdAt: r.created_at,
    }));
  }

  /** Nouvelle demande de permission (une seule en attente à la fois, comme pour les agents de santé) */
  async creerPermission(userId: number, dto: CreerPermissionRegulateur) {
    const { hospitalId } = await regulateurDuCompte(this.db, userId);
    const date = /^\d{4}-\d{2}-\d{2}$/;
    if (!date.test(dto.beging_date ?? '') || !date.test(dto.end_date ?? '')) throw new BadRequestException('Les dates de début et de fin sont obligatoires.');
    if (dto.end_date < dto.beging_date) throw new BadRequestException('La date de fin doit être après la date de début.');
    const heure = (h?: string) => (h && /^([01]\d|2[0-3]):[0-5]\d$/.test(h) ? h : null);
    if ((dto.beging_time && !heure(dto.beging_time)) || (dto.end_time && !heure(dto.end_time))) throw new BadRequestException('Heure invalide (format HH:MM).');
    const motif = dto.description?.trim();
    if (!motif) throw new BadRequestException('Veuillez renseigner le motif de la demande.');
    if (motif.length > 2000) throw new BadRequestException('Motif trop long (2000 caractères maximum).');

    const [enAttente] = await this.db.query("SELECT id FROM fm_permissions_regulateurs WHERE user_id = ? AND status = 'pending' LIMIT 1", [userId]);
    if (enAttente) throw new BadRequestException('Vous avez déjà une demande de permission en attente de validation par la direction.');

    const now = laravelNow();
    await this.db.query(
      `INSERT INTO fm_permissions_regulateurs (code, user_id, hospital_id, beging_date, end_date, beging_time, end_time, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [`PERM-${Date.now().toString().slice(-6)}`, userId, hospitalId, dto.beging_date, dto.end_date, heure(dto.beging_time), heure(dto.end_time), motif, now, now],
    );
    return { success: true, message: 'Votre demande de permission a été transmise à l’administration de l’hôpital.' };
  }
}
