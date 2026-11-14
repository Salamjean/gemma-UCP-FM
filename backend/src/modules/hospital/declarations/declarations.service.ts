import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { agentDuCompte } from '../../../common/agent-sante';
import { hopitalDuCompte } from '../../../common/hopital-courant';

type Ligne = Record<string, unknown>;

const NOM_MERE = "TRIM(CONCAT(COALESCE(um.name, ''), ' ', COALESCE(um.prenom, '')))";
const NOM_PATIENT = "TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, '')))";
const NOM_MEDECIN = "TRIM(CONCAT(COALESCE(ud.name, ''), ' ', COALESCE(ud.prenom, '')))";

/**
 * HÔPITAL > DÉCLARATIONS (Naissances & Décès)
 * Équivalent Laravel : Hospital\DeclarationController + DeclarationRepository
 *   listNaissance / showNaissance / certificatNaissance
 *   listDeces     / showDeces     / certificatDeces
 */
@Injectable()
export class DeclarationsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * Portée des déclarations :
   *   - hôpital : toutes celles de l'hôpital ;
   *   - médecin (espace médecin) : seulement celles qu'il a faites, comme Laravel Doctor\DeclarationRepository.
   */
  private async portee(userId: number, medecin: boolean): Promise<{ hospitalId: number; doctorId: number | null }> {
    if (!medecin) return { hospitalId: await hopitalDuCompte(this.db, userId), doctorId: null };
    const a = await agentDuCompte(this.db, userId);
    if (a.role !== 'doctor' || !a.doctorId) throw new ForbiddenException('Réservé aux médecins.');
    return { hospitalId: a.hospitalId, doctorId: a.doctorId };
  }

  // ============================= NAISSANCES =============================

  async naissances(userId: number, medecin = false) {
    const { hospitalId, doctorId } = await this.portee(userId, medecin);

    const rows: Ligne[] = await this.db.query(
      `SELECT d.id, d.reference AS cmn, d.patient_id, d.created_at,
              dn.reference AS dn_reference, dn.numero_declaration, dn.date AS date_naissance,
              dn.heure AS heure_naissance, dn.nombre, dn.nee, dn.lieu, dn.genre, dn.observations,
              pm.code_patient AS mere_code, pm.img_url AS mere_img, pm.gender AS mere_genre,
              ${NOM_MERE} AS mere_nom,
              pe.id AS enfant_patient_id, pe.code_patient AS enfant_code,
              ${NOM_MEDECIN} AS medecin_nom
         FROM declarations d
         LEFT JOIN declaration_naissances dn ON dn.declaration_id = d.id
         LEFT JOIN patients pm ON pm.id = d.patient_id
         LEFT JOIN users um ON um.id = pm.user_id
         LEFT JOIN patients pe ON pe.id = dn.enfant_id
         LEFT JOIN doctors doc ON doc.id = d.doctor_id
         LEFT JOIN users ud ON ud.id = doc.user_id
        WHERE d.hospital_id = ? AND d.type = 'birth' AND (? IS NULL OR d.doctor_id = ?)
        ORDER BY d.id DESC`,
      [hospitalId, doctorId, doctorId],
    );

    return rows.map((r) => ({
      id: Number(r.id),
      referenceCmn: (r.cmn as string) ?? '—',
      referenceDn: (r.dn_reference as string) ?? (r.numero_declaration as string) ?? null,
      dateNaissance: (r.date_naissance as string) ?? null,
      heureNaissance: (r.heure_naissance as string) ?? null,
      genreEnfant: (r.genre as string) ?? null,
      nombreEnfants: r.nombre != null ? Number(r.nombre) : 1,
      etatNaissance: (r.nee as string) ?? null,
      lieuNaissance: (r.lieu as string) ?? null,
      enfant: {
        id: r.enfant_patient_id != null ? Number(r.enfant_patient_id) : null,
        code: (r.enfant_code as string) ?? null,
      },
      mere: {
        id: r.patient_id != null ? Number(r.patient_id) : null,
        code: (r.mere_code as string) ?? '—',
        nom: (r.mere_nom as string) || '—',
        imgUrl: (r.mere_img as string) ?? null,
        genre: (r.mere_genre as string) ?? 'feminin',
      },
      medecin: (r.medecin_nom as string) || null,
      createdAt: r.created_at,
    }));
  }

  async naissanceDetail(userId: number, id: number, medecin = false) {
    const { hospitalId, doctorId } = await this.portee(userId, medecin);

    const [r]: Ligne[] = await this.db.query(
      `SELECT d.*,
              dn.reference AS dn_reference, dn.numero_declaration, dn.date AS dn_date,
              dn.heure AS dn_heure, dn.nombre, dn.nee, dn.lieu AS dn_lieu, dn.genre AS dn_genre,
              dn.observations AS dn_observations,
              pm.id AS mere_id, pm.code_patient AS mere_code, pm.img_url AS mere_img,
              pm.gender AS mere_genre, pm.birth_date AS mere_naissance, pm.telephone AS mere_tel,
              pm.profession AS mere_profession,
              ${NOM_MERE} AS mere_nom,
              sp_hab.name AS residence_habituelle,
              pe.id AS enfant_patient_id, pe.code_patient AS enfant_code,
              ${NOM_MEDECIN} AS medecin_nom,
              ta.libelle AS medecin_titre,
              h.label AS hopital_nom,
              sp_hosp.name AS hopital_localite
         FROM declarations d
         LEFT JOIN declaration_naissances dn ON dn.declaration_id = d.id
         LEFT JOIN patients pm ON pm.id = d.patient_id
         LEFT JOIN users um ON um.id = pm.user_id
         LEFT JOIN sub_prefectures sp_hab ON sp_hab.id = pm.residence_habituelle_id
         LEFT JOIN patients pe ON pe.id = dn.enfant_id
         LEFT JOIN doctors doc ON doc.id = d.doctor_id
         LEFT JOIN users ud ON ud.id = doc.user_id
         LEFT JOIN type_agents ta ON ta.id = doc.type_agent_id
         LEFT JOIN hospitals h ON h.id = d.hospital_id
         LEFT JOIN sub_prefectures sp_hosp ON sp_hosp.id = h.localite
        WHERE d.id = ? AND d.hospital_id = ? AND d.type = 'birth' AND (? IS NULL OR d.doctor_id = ?)
        LIMIT 1`,
      [id, hospitalId, doctorId, doctorId],
    );

    if (!r) throw new NotFoundException('Déclaration de naissance introuvable');

    // Naissance multiple : un dossier par nouveau-né (créés à la suite, à partir de enfant_id) ; heures / sexes / états dans le même ordre
    const nombre = r.nombre != null ? Number(r.nombre) : 1;
    const dossiers: Ligne[] = r.enfant_patient_id
      ? await this.db.query(
          `SELECT p.id, p.code_patient, u.name, u.prenom FROM patients p JOIN users u ON u.id = p.user_id
            WHERE p.mere_id = ? AND p.id >= ? ORDER BY p.id LIMIT ?`,
          [r.mere_id, r.enfant_patient_id, Math.max(nombre, 1)],
        )
      : [];
    const liste = (x: unknown) => String(x ?? '').split(',').map((y) => y.trim());
    const [heures, genres, etats] = [liste(r.dn_heure ?? r.heure), liste(r.dn_genre), liste(r.nee)];
    const enfants = Array.from({ length: Math.max(nombre, 1) }, (_, i) => ({
      id: dossiers[i] ? Number(dossiers[i].id) : null,
      code: dossiers[i] ? ((dossiers[i].code_patient as string) ?? null) : null,
      prenom: dossiers[i] ? ((dossiers[i].prenom as string) ?? null) : null,
      genre: genres[i] || genres[0] || null,
      heure: heures[i] || heures[0] || null,
      etat: etats[i] || etats[0] || null,
    }));

    return {
      id: Number(r.id),
      referenceCmn: (r.reference as string) ?? '—',
      referenceDn: (r.dn_reference as string) ?? (r.numero_declaration as string) ?? null,
      numeroDeclaration: (r.numero_declaration as string) ?? null,
      dateNaissance: (r.dn_date as string) ?? (r.date as string) ?? null,
      heureNaissance: (r.dn_heure as string) ?? (r.heure as string) ?? null,
      genreEnfant: (r.dn_genre as string) ?? null,
      nombreEnfants: r.nombre != null ? Number(r.nombre) : 1,
      etatNaissance: (r.nee as string) ?? null,
      lieuNaissance: (r.dn_lieu as string) ?? (r.hopital_localite as string) ?? null,
      observations: (r.dn_observations as string) ?? null,
      milieuResidence: (r.milieu_residence as string) ?? null,
      enfant: {
        id: r.enfant_patient_id != null ? Number(r.enfant_patient_id) : null,
        code: (r.enfant_code as string) ?? null,
      },
      /** Chaque nouveau-né (naissance multiple : dans l'ordre de naissance) */
      enfants,
      mere: {
        id: r.mere_id != null ? Number(r.mere_id) : null,
        code: (r.mere_code as string) ?? '—',
        nom: (r.mere_nom as string) || '—',
        imgUrl: (r.mere_img as string) ?? null,
        genre: (r.mere_genre as string) ?? 'feminin',
        dateNaissance: (r.mere_naissance as string) ?? null,
        telephone: (r.mere_tel as string) ?? null,
        profession: (r.mere_profession as string) ?? null,
        residenceHabituelle: (r.residence_habituelle as string) ?? null,
      },
      medecin: {
        nom: (r.medecin_nom as string) || '—',
        titre: (r.medecin_titre as string) ?? 'Praticien',
      },
      hopital: {
        nom: (r.hopital_nom as string) ?? 'Centre Hospitalier',
        localite: (r.hopital_localite as string) ?? '—',
      },
      createdAt: r.created_at,
    };
  }

  // ============================= DÉCÈS =============================

  async deces(userId: number, medecin = false) {
    const { hospitalId, doctorId } = await this.portee(userId, medecin);

    const rows: Ligne[] = await this.db.query(
      `SELECT d.id, d.reference, d.patient_id, d.created_at,
              dd.person, dd.numero_declaration, dd.deces_maternel, dd.date AS date_deces,
              dd.heure AS heure_deces, dd.age, dd.genre, dd.lieu, dd.cause_initiale, dd.cause_directe,
              p.code_patient, p.img_url, p.gender AS patient_genre,
              ${NOM_PATIENT} AS patient_nom,
              ${NOM_MEDECIN} AS medecin_nom
         FROM declarations d
         LEFT JOIN declaration_deces dd ON dd.declaration_id = d.id AND dd.deleted_at IS NULL
         LEFT JOIN patients p ON p.id = d.patient_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN doctors doc ON doc.id = d.doctor_id
         LEFT JOIN users ud ON ud.id = doc.user_id
        WHERE d.hospital_id = ? AND d.type = 'death' AND (? IS NULL OR d.doctor_id = ?)
        ORDER BY d.id DESC`,
      [hospitalId, doctorId, doctorId],
    );

    return rows.map((r) => {
      const dm = String(r.deces_maternel ?? '').toLowerCase();
      return {
        id: Number(r.id),
        reference: (r.reference as string) ?? '—',
        numeroDeclaration: (r.numero_declaration as string) ?? null,
        personne: (r.person as string) === 'enfant' ? 'enfant' : 'patient',
        dateDeces: (r.date_deces as string) ?? null,
        heureDeces: (r.heure_deces as string) ?? null,
        age: (r.age as string) ?? null,
        genre: (r.genre as string) ?? (r.patient_genre as string) ?? null,
        lieu: (r.lieu as string) ?? null,
        decesMaternel: dm === 'oui' || dm === '1',
        causeInitiale: (r.cause_initiale as string) ?? null,
        patient: {
          id: r.patient_id != null ? Number(r.patient_id) : null,
          code: (r.code_patient as string) ?? '—',
          nom: (r.patient_nom as string) || '—',
          imgUrl: (r.img_url as string) ?? null,
          genre: (r.patient_genre as string) ?? null,
        },
        medecin: (r.medecin_nom as string) || null,
        createdAt: r.created_at,
      };
    });
  }

  async decesDetail(userId: number, id: number, medecin = false) {
    const { hospitalId, doctorId } = await this.portee(userId, medecin);

    const [r]: Ligne[] = await this.db.query(
      `SELECT d.*,
              dd.person, dd.reference AS dd_reference, dd.numero_declaration, dd.deces_maternel,
              dd.milieu_residence, dd.date AS dd_date, dd.heure AS dd_heure, dd.age, dd.nombre,
              dd.genre AS dd_genre, dd.lieu AS dd_lieu, dd.cause_initiale, dd.cause_directe,
              dd.observations AS dd_observations,
              p.id AS pat_id, p.code_patient, p.img_url, p.gender AS patient_genre,
              p.birth_date AS patient_naissance, p.telephone AS patient_tel, p.profession AS patient_profession,
              ${NOM_PATIENT} AS patient_nom,
              sp_nais.name AS patient_lieu_naissance,
              sp_hab.name AS residence_habituelle,
              ${NOM_MEDECIN} AS medecin_nom,
              ta.libelle AS medecin_titre,
              h.label AS hopital_nom,
              sp_hosp.name AS hopital_localite
         FROM declarations d
         LEFT JOIN declaration_deces dd ON dd.declaration_id = d.id AND dd.deleted_at IS NULL
         LEFT JOIN patients p ON p.id = d.patient_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN sub_prefectures sp_nais ON sp_nais.id = p.lieu_de_naissance_id
         LEFT JOIN sub_prefectures sp_hab ON sp_hab.id = p.residence_habituelle_id
         LEFT JOIN doctors doc ON doc.id = d.doctor_id
         LEFT JOIN users ud ON ud.id = doc.user_id
         LEFT JOIN type_agents ta ON ta.id = doc.type_agent_id
         LEFT JOIN hospitals h ON h.id = d.hospital_id
         LEFT JOIN sub_prefectures sp_hosp ON sp_hosp.id = h.localite
        WHERE d.id = ? AND d.hospital_id = ? AND d.type = 'death' AND (? IS NULL OR d.doctor_id = ?)
        LIMIT 1`,
      [id, hospitalId, doctorId, doctorId],
    );

    if (!r) throw new NotFoundException('Déclaration de décès introuvable');

    const dm = String(r.deces_maternel ?? '').toLowerCase();

    return {
      id: Number(r.id),
      reference: (r.reference as string) ?? '—',
      referenceDeces: (r.dd_reference as string) ?? null,
      numeroDeclaration: (r.numero_declaration as string) ?? null,
      personne: (r.person as string) === 'enfant' ? 'enfant' : 'patient',
      dateDeces: (r.dd_date as string) ?? null,
      heureDeces: (r.dd_heure as string) ?? null,
      age: (r.age as string) ?? null,
      nombre: r.nombre != null ? Number(r.nombre) : 1,
      genre: (r.dd_genre as string) ?? (r.patient_genre as string) ?? null,
      lieu: (r.dd_lieu as string) ?? (r.hopital_localite as string) ?? null,
      milieuResidence: (r.milieu_residence as string) ?? null,
      decesMaternel: dm === 'oui' || dm === '1',
      causeInitiale: (r.cause_initiale as string) ?? null,
      causeDirecte: (r.cause_directe as string) ?? null,
      observations: (r.dd_observations as string) ?? null,
      patient: {
        id: r.pat_id != null ? Number(r.pat_id) : null,
        code: (r.code_patient as string) ?? '—',
        nom: (r.patient_nom as string) || '—',
        imgUrl: (r.img_url as string) ?? null,
        genre: (r.patient_genre as string) ?? null,
        dateNaissance: (r.patient_naissance as string) ?? null,
        lieuNaissance: (r.patient_lieu_naissance as string) ?? null,
        telephone: (r.patient_tel as string) ?? null,
        profession: (r.patient_profession as string) ?? null,
        residenceHabituelle: (r.residence_habituelle as string) ?? null,
      },
      medecin: {
        nom: (r.medecin_nom as string) || '—',
        titre: (r.medecin_titre as string) ?? 'Praticien',
      },
      hopital: {
        nom: (r.hopital_nom as string) ?? 'Centre Hospitalier',
        localite: (r.hopital_localite as string) ?? '—',
      },
      createdAt: r.created_at,
    };
  }
}

