import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { agentDuCompte } from '../../../common/agent-sante';
import { laravelHash, laravelNow } from '../../../common/laravel';
import { DecesDirectDto } from './declarations.dto';

type Ligne = Record<string, unknown>;
const texte = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());

/** Âge en années à partir d'une date « JJ/MM/AAAA » (format Laravel) ou « AAAA-MM-JJ » */
function ageDepuis(naissance: unknown, au: Date) {
  const s = texte(naissance);
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s) ?? null;
  const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(s);
  if (isNaN(d.getTime())) return null;
  let a = au.getFullYear() - d.getFullYear();
  if (au.getMonth() < d.getMonth() || (au.getMonth() === d.getMonth() && au.getDate() < d.getDate())) a--;
  return a >= 0 ? a : null;
}

/**
 * MÉDECIN > DÉCLARATIONS : enregistrement direct d'un décès + recherche du patient
 * Équivalent Laravel : Doctor\DeclarationController (searchPatient, directDeces, storeDirectDeces)
 * Tables MyISAM (pas d'annulation) : tout est vérifié AVANT la première écriture.
 */
@Injectable()
export class DoctorDeclarationsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private async medecin(userId: number) {
    const a = await agentDuCompte(this.db, userId);
    if (a.role !== 'doctor' || !a.doctorId) throw new ForbiddenException('Réservé aux médecins.');
    const [u] = await this.db.query('SELECT name, prenom FROM users WHERE id = ?', [userId]);
    return { ...a, nom: `${u?.name ?? ''} ${u?.prenom ?? ''}`.trim() };
  }

  /** Infos du formulaire : établissement et médecin déclarant */
  async options(userId: number) {
    const m = await this.medecin(userId);
    return { hopital: m.hospitalNom, medecin: m.nom ? `Dr ${m.nom.replace(/^dr\.?\s*/i, '')}` : 'Médecin' };
  }

  /** Recherche d'un patient (nom & prénoms, n° de dossier ou téléphone), 20 résultats maximum */
  async patients(userId: number, q: string) {
    await this.medecin(userId);
    const s = (q ?? '').trim();
    if (s.length < 2) return [];
    const mots = s.split(/\s+/).slice(0, 4);
    const conditions = mots.map(() => "(u.name LIKE ? OR u.prenom LIKE ? OR p.code_patient LIKE ? OR p.telephone LIKE ?)").join(' AND ');
    const params = mots.flatMap((m) => Array(4).fill(`%${m}%`));
    const rows: Ligne[] = await this.db.query(
      `SELECT p.id, p.code_patient, p.gender, p.birth_date, p.telephone, p.img_url, u.name, u.prenom,
              (SELECT COUNT(*) FROM declarations d JOIN declaration_deces dd ON dd.declaration_id = d.id AND dd.deleted_at IS NULL
                WHERE d.patient_id = p.id AND d.type = 'death' AND dd.person = 'patient') AS deja_decede
         FROM patients p JOIN users u ON u.id = p.user_id
        WHERE p.deleted_at IS NULL AND ${conditions}
        ORDER BY u.name, u.prenom LIMIT 20`,
      params,
    );
    const maintenant = new Date();
    return rows.map((r) => ({
      id: Number(r.id),
      code: texte(r.code_patient) ?? '—',
      nom: `${r.name ?? ''} ${r.prenom ?? ''}`.trim(),
      genre: texte(r.gender),
      dateNaissance: texte(r.birth_date),
      age: ageDepuis(r.birth_date, maintenant),
      telephone: texte(r.telephone),
      imgUrl: texte(r.img_url),
      dejaDecede: Number(r.deja_decede) > 0,
    }));
  }

  /** Enregistrement direct d'un décès */
  async enregistrerDeces(userId: number, dto: DecesDirectDto) {
    const m = await this.medecin(userId);

    // ---- Vérifications (aucune écriture avant) ----
    const dateDeces = new Date(`${dto.date}T${dto.heure}:00`);
    if (isNaN(dateDeces.getTime())) throw new BadRequestException('Date ou heure du décès invalide.');
    if (dateDeces.getTime() > Date.now() + 5 * 60 * 1000) throw new BadRequestException('La date du décès ne peut pas être dans le futur.');

    let patient: Ligne | null = null;
    if (dto.patientMode === 'existant') {
      [patient] = await this.db.query('SELECT p.id, p.code_patient, p.gender, p.birth_date FROM patients p WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1', [dto.patientId]);
      if (!patient) throw new NotFoundException('Patient introuvable.');
      if (dto.person === 'patient') {
        const [deja] = await this.db.query(
          `SELECT d.id FROM declarations d JOIN declaration_deces dd ON dd.declaration_id = d.id AND dd.deleted_at IS NULL
            WHERE d.patient_id = ? AND d.type = 'death' AND dd.person = 'patient' LIMIT 1`,
          [patient.id],
        );
        if (deja) throw new ConflictException('Ce patient a déjà été déclaré décédé.');
      }
    } else if (dto.dateNaissance && new Date(dto.dateNaissance) > dateDeces) {
      throw new BadRequestException('La date de naissance est postérieure à la date du décès.');
    }

    const lieu =
      dto.lieuType === 'hors'
        ? (dto.lieuAutre ?? '').trim()
        : `${m.hospitalNom || 'Centre hospitalier'}${dto.service?.trim() ? ` - ${dto.service.trim()}` : ''}`;
    const now = laravelNow();
    const password = dto.patientMode === 'nouveau' ? await laravelHash(randomBytes(12).toString('hex')) : null;

    // ---- Écritures ----
    if (!patient) {
      // Nouveau défunt : compte patient (comme Laravel : email technique, statut 0 = défunt)
      const nom = dto.nom!.trim().toUpperCase();
      // Chaque prénom avec une majuscule (comme ucwords de Laravel), lettres accentuées comprises
      const prenom = (dto.prenom ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())
        .join(' ');
      const email = `deces_${Date.now()}_${randomBytes(3).toString('hex')}@hopital.loc`;
      const u = await this.db.query("INSERT INTO users (name, prenom, email, role_as, password, created_at, updated_at) VALUES (?, ?, ?, 'patient', ?, ?, ?)", [nom, prenom, email, password, now, now]);
      let naissance: string | null = null;
      if (dto.dateNaissance) {
        const [a, mo, j] = dto.dateNaissance.split('-');
        naissance = `${j}/${mo}/${a}`;
      } else if (dto.ageEstime !== undefined && dto.ageEstime !== null) {
        const d = new Date();
        naissance = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() - dto.ageEstime}`;
      }
      const [{ n }] = await this.db.query('SELECT COUNT(*) AS n FROM patients');
      const d = new Date();
      const code = `DM${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${Number(n) + 1}`;
      const p = await this.db.query(
        `INSERT INTO patients (user_id, code_patient, hospital_id, doctor_id, gender, birth_date, telephone, profession, address, nbre_enfant, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        [u.insertId, code, m.hospitalId, m.doctorId, dto.genre, naissance, dto.telephone ?? null, texte(dto.profession), texte(dto.lieuResidence), now, now],
      );
      patient = { id: p.insertId, code_patient: code, gender: dto.genre, birth_date: naissance };
    }

    const age = dto.person === 'enfant' ? 0 : (dto.ageEstime ?? ageDepuis(patient.birth_date, dateDeces) ?? 0);
    const [{ n: compteur }] = await this.db.query("SELECT COUNT(*) AS n FROM declarations WHERE hospital_id = ? AND type = 'death'", [m.hospitalId]);
    const rang = Number(compteur) + 1;
    const codeSub = texte(patient.code_patient) ? String(patient.code_patient).slice(2) : `P${patient.id}`;

    const decl = await this.db.query(
      "INSERT INTO declarations (reference, type, patient_id, consultation_id, hospital_id, doctor_id, created_at, updated_at) VALUES (?, 'death', ?, NULL, ?, ?, ?, ?)",
      [`CMD${codeSub}${m.hospitalId}${rang}`, patient.id, m.hospitalId, m.doctorId, now, now],
    );
    await this.db.query(
      `INSERT INTO declaration_deces (declaration_id, person, reference, numero_declaration, deces_maternel, milieu_residence, date, heure, age, nombre,
                                      genre, lieu, cause_initiale, cause_directe, observations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        decl.insertId,
        dto.person,
        `DD${codeSub}${m.hospitalId}${rang}`,
        rang,
        dto.decesMaternel,
        dto.milieuResidence,
        dto.date,
        dto.heure,
        age,
        dto.genre ?? texte(patient.gender) ?? 'masculin',
        lieu,
        dto.causeInitiale.trim(),
        dto.causeDirecte.trim(),
        texte(dto.observation),
        now,
        now,
      ],
    );
    // Le patient lui-même est décédé : statut 0 (comme Laravel)
    if (dto.person === 'patient') await this.db.query('UPDATE patients SET status = 0, updated_at = ? WHERE id = ?', [now, patient.id]);

    return { success: true, message: 'La déclaration de décès a été enregistrée.', declarationId: Number(decl.insertId) };
  }
}
