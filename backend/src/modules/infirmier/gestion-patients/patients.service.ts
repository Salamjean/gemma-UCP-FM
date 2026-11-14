import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { agentDuCompte } from '../../../common/agent-sante';

type Ligne = Record<string, unknown>;

const NOM_COMPLET = "TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, '')))";
const NOM_MEDECIN = "TRIM(CONCAT(COALESCE(du.name, ''), ' ', COALESCE(du.prenom, '')))";

export interface RecherchePatientParams {
  code_patient?: string;
  telephone?: string;
  num_cmu?: string;
  fullname?: string;
  birth_date?: string;
}

@Injectable()
export class InfirmierPatientsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Infirmier·ère OU médecin connecté (services partagés par les deux espaces) */
  private async getInfirmier(userId: number) {
    const a = await agentDuCompte(this.db, userId);
    return { infirmierId: a.infirmierId, hospitalId: a.hospitalId, hospitalNom: a.hospitalNom, typePermission: a.typePermission, role: a.role };
  }

  /** Liste des patients de l'établissement */
  async liste(userId: number) {
    const { hospitalId } = await this.getInfirmier(userId);

    const rows: Ligne[] = await this.db.query(
      `SELECT p.id, p.code_patient, p.gender, p.birth_date, p.country, p.numero_identite,
              p.type_piece, p.telephone, p.img_url, p.profession, p.num_cmu, p.assurer, p.no_assurance,
              p.status, p.created_at,
              u.name, u.prenom, u.email, ${NOM_COMPLET} AS nom_complet,
              sp_act.name AS residence_actuelle,
              sp_nais.name AS lieu_naissance,
              (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = p.id AND c.hospital_id = ?) AS nb_consultations
         FROM patients p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN sub_prefectures sp_act ON sp_act.id = p.residence_actuelle_id
         LEFT JOIN sub_prefectures sp_nais ON sp_nais.id = p.lieu_de_naissance_id
        WHERE p.deleted_at IS NULL
          AND (
            p.hospital_id = ?
            OR EXISTS (SELECT 1 FROM passage_patients pp WHERE pp.patient_id = p.id AND pp.hospital_id = ?)
            OR EXISTS (SELECT 1 FROM consultations c WHERE c.patient_id = p.id AND c.hospital_id = ?)
          )
        ORDER BY p.id DESC
        LIMIT 200`,
      [hospitalId, hospitalId, hospitalId, hospitalId],
    );

    return rows.map((r) => ({
      id: Number(r.id),
      codePatient: (r.code_patient as string) ?? '—',
      nom: (r.name as string) ?? '',
      prenom: (r.prenom as string) ?? '',
      nomComplet: (r.nom_complet as string) || '—',
      genre: (r.gender as string) ?? null,
      dateNaissance: (r.birth_date as string) ?? null,
      lieuNaissance: (r.lieu_naissance as string) ?? null,
      pays: (r.country as string) ?? null,
      typePiece: (r.type_piece as string) ?? null,
      numeroIdentite: (r.numero_identite as string) ?? null,
      telephone: (r.telephone as string) ?? null,
      email: (r.email as string) ?? null,
      residence: (r.residence_actuelle as string) ?? null,
      profession: (r.profession as string) ?? null,
      numCmu: (r.num_cmu as string) ?? null,
      assure: Boolean(r.assurer && r.assurer !== '0' && r.assurer !== 'non'),
      numeroAssurance: (r.no_assurance as string) ?? null,
      imgUrl: (r.img_url as string) ?? null,
      nbConsultations: Number(r.nb_consultations ?? 0),
      createdAt: r.created_at,
    }));
  }

  /** Recherche multicritères de patients (Vérifier / Rechercher) */
  async rechercher(userId: number, params: RecherchePatientParams) {
    const { hospitalId } = await this.getInfirmier(userId);

    const conditions: string[] = ['p.deleted_at IS NULL'];
    const sqlParams: any[] = [];

    if (params.code_patient && params.code_patient.trim()) {
      conditions.push('p.code_patient LIKE ?');
      sqlParams.push(`%${params.code_patient.trim()}%`);
    }

    if (params.telephone && params.telephone.trim()) {
      conditions.push('(p.telephone LIKE ? OR u.telephone LIKE ?)');
      const tel = `%${params.telephone.trim()}%`;
      sqlParams.push(tel, tel);
    }

    if (params.num_cmu && params.num_cmu.trim()) {
      conditions.push('p.num_cmu LIKE ?');
      sqlParams.push(`%${params.num_cmu.trim()}%`);
    }

    if (params.birth_date && params.birth_date.trim()) {
      conditions.push('p.birth_date LIKE ?');
      sqlParams.push(`%${params.birth_date.trim()}%`);
    }

    if (params.fullname && params.fullname.trim()) {
      const q = params.fullname.trim();
      const parts = q.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        // Nom + prénoms dans un sens ou dans l'autre, ou prénoms composés seuls (« Koffi Junior »)
        conditions.push(
          "((u.name LIKE ? AND u.prenom LIKE ?) OR (u.name LIKE ? AND u.prenom LIKE ?) OR CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, '')) LIKE ? OR u.prenom LIKE ?)",
        );
        sqlParams.push(`%${parts[0]}%`, `%${parts.slice(1).join(' ')}%`, `%${parts.slice(1).join(' ')}%`, `%${parts[0]}%`, `%${q}%`, `%${q}%`);
      } else {
        conditions.push('(u.name LIKE ? OR u.prenom LIKE ?)');
        sqlParams.push(`%${q}%`, `%${q}%`);
      }
    }

    // Si aucun critère n'a été saisi, renvoyer les 20 plus récents
    if (sqlParams.length === 0) {
      conditions.push(`(
        p.hospital_id = ?
        OR EXISTS (SELECT 1 FROM consultations c WHERE c.patient_id = p.id AND c.hospital_id = ?)
      )`);
      sqlParams.push(hospitalId, hospitalId);
    }

    const rows: Ligne[] = await this.db.query(
      `SELECT p.id, p.code_patient, p.gender, p.birth_date, p.country, p.numero_identite,
              p.type_piece, p.telephone, p.img_url, p.profession, p.num_cmu, p.assurer, p.no_assurance,
              p.status, p.created_at,
              u.name, u.prenom, u.email, ${NOM_COMPLET} AS nom_complet,
              sp_act.name AS residence_actuelle,
              sp_nais.name AS lieu_naissance,
              (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = p.id AND c.hospital_id = ?) AS nb_consultations
         FROM patients p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN sub_prefectures sp_act ON sp_act.id = p.residence_actuelle_id
         LEFT JOIN sub_prefectures sp_nais ON sp_nais.id = p.lieu_de_naissance_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.id DESC
        LIMIT 50`,
      [hospitalId, ...sqlParams],
    );

    return rows.map((r) => ({
      id: Number(r.id),
      codePatient: (r.code_patient as string) ?? '—',
      nom: (r.name as string) ?? '',
      prenom: (r.prenom as string) ?? '',
      nomComplet: (r.nom_complet as string) || '—',
      genre: (r.gender as string) ?? null,
      dateNaissance: (r.birth_date as string) ?? null,
      lieuNaissance: (r.lieu_naissance as string) ?? null,
      pays: (r.country as string) ?? null,
      typePiece: (r.type_piece as string) ?? null,
      numeroIdentite: (r.numero_identite as string) ?? null,
      telephone: (r.telephone as string) ?? null,
      email: (r.email as string) ?? null,
      residence: (r.residence_actuelle as string) ?? null,
      profession: (r.profession as string) ?? null,
      numCmu: (r.num_cmu as string) ?? null,
      assure: Boolean(r.assurer && r.assurer !== '0' && r.assurer !== 'non'),
      numeroAssurance: (r.no_assurance as string) ?? null,
      imgUrl: (r.img_url as string) ?? null,
      nbConsultations: Number(r.nb_consultations ?? 0),
      createdAt: r.created_at,
    }));
  }

  /** Fiche détaillée d'un patient avec historique des consultations */
  async detail(userId: number, id: number) {
    const { hospitalId } = await this.getInfirmier(userId);

    const [r]: Ligne[] = await this.db.query(
      `SELECT p.*,
              u.name, u.prenom, u.email, ${NOM_COMPLET} AS nom_complet,
              sp_act.name AS residence_actuelle,
              sp_nais.name AS lieu_naissance
         FROM patients p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN sub_prefectures sp_act ON sp_act.id = p.residence_actuelle_id
         LEFT JOIN sub_prefectures sp_nais ON sp_nais.id = p.lieu_de_naissance_id
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1`,
      [id],
    );

    if (!r) throw new NotFoundException('Patient introuvable.');

    const consultations: Ligne[] = await this.db.query(
      `SELECT c.id, c.code_consultation, c.date_consultation, c.motif_consultation AS motif,
              c.tension_arterielle, c.temperature, c.poids, c.pouls,
              c.status, c.created_at,
              ${NOM_MEDECIN} AS medecin,
              ps.libelle AS service_libelle
         FROM consultations c
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
        WHERE c.patient_id = ? AND c.hospital_id = ?
        ORDER BY c.id DESC
        LIMIT 10`,
      [id, hospitalId],
    );

    return {
      patient: {
        id: Number(r.id),
        codePatient: (r.code_patient as string) ?? '—',
        nom: (r.name as string) ?? '',
        prenom: (r.prenom as string) ?? '',
        nomComplet: (r.nom_complet as string) || '—',
        genre: (r.gender as string) ?? null,
        dateNaissance: (r.birth_date as string) ?? null,
        lieuNaissance: (r.lieu_naissance as string) ?? null,
        pays: (r.country as string) ?? null,
        telephone: (r.telephone as string) ?? null,
        email: (r.email as string) ?? null,
        residence: (r.residence_actuelle as string) ?? null,
        profession: (r.profession as string) ?? null,
        numCmu: (r.num_cmu as string) ?? null,
        assure: Boolean(r.assurer && r.assurer !== '0' && r.assurer !== 'non'),
        numeroAssurance: (r.no_assurance as string) ?? null,
        imgUrl: (r.img_url as string) ?? null,
      },
      consultations: consultations.map((c) => ({
        id: Number(c.id),
        code: (c.code_consultation as string) ?? null,
        date: (c.date_consultation as string) ?? null,
        motif: (c.motif as string) || (c.service_libelle as string) || 'Consultation générale',
        medecin: (c.medecin as string) || 'Non assigné',
        constantes: {
          ta: c.tension_arterielle,
          temperature: c.temperature,
          poids: c.poids,
          pouls: c.pouls,
        },
        statut: Number(c.status) === 1 ? 'Terminée' : 'En attente',
        createdAt: c.created_at,
      })),
    };
  }
}

