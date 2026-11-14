import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { compterDocuments, listerDocuments, lireDocument, type DocumentPrive } from '../../../common/documents-prives';
import { laravelNow } from '../../../common/laravel';
import { DoctorConsultationsService } from '../consultations/consultations.service';

type Ligne = Record<string, unknown>;
const texte = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const nom = (n: unknown, p: unknown) => `${(n as string) ?? ''} ${(p as string) ?? ''}`.trim() || null;

/** Colonnes communes : référence (fm_references), consultation d'origine, patient, médecin et hôpital d'origine */
const SELECT_REFERENCE = `
  SELECT fr.id AS reference_id, fr.type, fr.consultation_origine_id, fr.consultation_destination_id,
         fr.doctor_origine_id, fr.doctor_destination_id, fr.motif AS justification, fr.created_at,
         o.code_consultation, o.motif_consultation, o.tension_arterielle, o.temperature, o.pouls, o.poids, o.taille, o.saturation_oxygene,
         p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.img_url, p.telephone, p.group_sanguin, p.type_allergie_medicamenteuse,
         pu.name AS patient_nom, pu.prenom AS patient_prenom,
         ou.name AS origine_nom, ou.prenom AS origine_prenom, os.libelle AS origine_service,
         h.label AS hopital, h.contact AS hopital_contact,
         rco.diagnostic_retenu, rco.examen_physique,
         o.imc, o.patient_id AS origine_patient_id,
         dest.status AS destination_status, dest.is_urgence AS destination_urgence,
         du.name AS destination_nom, du.prenom AS destination_prenom, fr.updated_at AS pris_le
    FROM fm_references fr
    JOIN consultations o ON o.id = fr.consultation_origine_id
    JOIN patients p ON p.id = o.patient_id
    JOIN users pu ON pu.id = p.user_id
    LEFT JOIN doctors od ON od.id = fr.doctor_origine_id
    LEFT JOIN users ou ON ou.id = od.user_id
    LEFT JOIN service_hospitals osh ON osh.id = od.service_hospital_id
    LEFT JOIN services os ON os.id = osh.service_id
    LEFT JOIN hospitals h ON h.id = COALESCE(fr.hospital_id, o.hospital_id)
    LEFT JOIN registres ro ON ro.id = (SELECT MAX(id) FROM registres WHERE consultation_id = o.id)
    LEFT JOIN registre_consultation_curatives rco ON rco.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = ro.id)
    LEFT JOIN consultations dest ON dest.id = fr.consultation_destination_id
    LEFT JOIN doctors dd ON dd.id = fr.doctor_destination_id
    LEFT JOIN users du ON du.id = dd.user_id`;

/**
 * MÉDECIN > RÉFÉRÉS (table Gemma FM « fm_references »)
 *   - internes : patients qu'un collègue de l'hôpital m'a référés ;
 *   - externes : patients référés vers un autre établissement, visibles par tous les médecins.
 * Lecture seule ; les documents joints à la référence sont téléchargeables.
 */
@Injectable()
export class DoctorReferesService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly consultations: DoctorConsultationsService,
  ) {}

  private patient(r: Ligne) {
    return {
      id: Number(r.patient_id),
      code: texte(r.code_patient) ?? '—',
      nom: nom(r.patient_nom, r.patient_prenom) ?? '—',
      genre: texte(r.gender),
      dateNaissance: texte(r.birth_date),
      imgUrl: texte(r.img_url),
    };
  }

  async liste(userId: number) {
    const d = await this.consultations.medecin(userId);
    const [internes, externes]: Ligne[][] = await Promise.all([
      this.db.query(
        `${SELECT_REFERENCE}
          WHERE fr.doctor_destination_id = ? AND o.deleted_at IS NULL
          ORDER BY (dest.status = 1) ASC, fr.created_at DESC`,
        [d.id],
      ),
      this.db.query(`${SELECT_REFERENCE} WHERE fr.type = 'externe' AND o.deleted_at IS NULL ORDER BY fr.created_at DESC LIMIT 300`),
    ]);
    const docs = await compterDocuments(this.db, [...internes, ...externes].map((r) => Number(r.consultation_origine_id)));
    const commun = (r: Ligne) => ({
      origineId: Number(r.consultation_origine_id),
      date: r.created_at,
      motif: texte(r.motif_consultation),
      justification: texte(r.justification),
      diagnostic: texte(r.diagnostic_retenu),
      referePar: nom(r.origine_nom, r.origine_prenom),
      service: texte(r.origine_service),
      documents: docs.get(Number(r.consultation_origine_id)) ?? 0,
      patient: this.patient(r),
    });
    return {
      internes: internes.map((r) => ({
        ...commun(r),
        consultationId: r.consultation_destination_id ? Number(r.consultation_destination_id) : null,
        terminee: Number(r.destination_status) === 1,
        urgence: Number(r.destination_urgence) === 1,
        externe: r.type === 'externe',
      })),
      externes: externes.map((r) => ({
        ...commun(r),
        hopital: texte(r.hopital),
        priseEnChargePar: r.doctor_destination_id ? nom(r.destination_nom, r.destination_prenom) : null,
        parMoi: Number(r.doctor_destination_id) === Number(d.id),
      })),
    };
  }

  /** Accès : référence externe → tout médecin ; interne → médecin d'origine ou destinataire */
  private async referenceAccessible(userId: number, origineId: number) {
    const d = await this.consultations.medecin(userId);
    const [r] = await this.db.query(`${SELECT_REFERENCE} WHERE fr.consultation_origine_id = ? AND o.deleted_at IS NULL LIMIT 1`, [origineId]);
    if (!r) throw new NotFoundException('Référence introuvable.');
    if (r.type === 'interne' && ![Number(r.doctor_origine_id), Number(r.doctor_destination_id)].includes(Number(d.id))) {
      throw new ForbiddenException('Cette référence ne vous est pas adressée.');
    }
    return { ...(r as Ligne), pour_moi: Number(r.doctor_destination_id) === Number(d.id), moi_id: Number(d.id) } as Ligne;
  }

  private presenter(x: DocumentPrive) {
    return { id: x.id, libelle: x.libelle, nom: x.nom, type: x.type, taille: x.taille, ajouteLe: x.ajouteLe };
  }

  /** Fiche de la référence : patient, médecin d'origine, constantes, diagnostic, motif, prescriptions, documents */
  async detail(userId: number, origineId: number) {
    const o = await this.referenceAccessible(userId, origineId);
    const [prescriptions, examens, docsPrescrits] = await Promise.all([
      this.db.query(
        `SELECT dr.name, pr.quantity, pr.dosage, pr.duration FROM ordonnances ord
           JOIN prescriptions pr ON pr.ordonnance_id = ord.id LEFT JOIN drugs dr ON dr.id = pr.drug_id
          WHERE ord.consultation_id = ? AND ord.deleted_at IS NULL ORDER BY pr.id`,
        [origineId],
      ),
      this.db.query('SELECT e.nature_examen FROM bulletin_examens b JOIN examens e ON e.bulletin_examen_id = b.id WHERE b.consultation_id = ? ORDER BY e.id', [origineId]),
      // Documents prescrits par le médecin d'origine (imprimables par le nouveau médecin)
      this.db.query(
        `SELECT 'ordonnance' AS type, reference AS code, created_at FROM ordonnances WHERE consultation_id = ? AND deleted_at IS NULL AND id = (SELECT MAX(id) FROM ordonnances WHERE consultation_id = ? AND deleted_at IS NULL)
         UNION ALL
         SELECT 'examens', code_bulletin, created_at FROM bulletin_examens WHERE id = (SELECT MAX(id) FROM bulletin_examens WHERE consultation_id = ?)
         UNION ALL
         SELECT 'arret', code, created_at FROM arret_travails WHERE id = (SELECT MAX(id) FROM arret_travails WHERE consultation_id = ?)`,
        [origineId, origineId, origineId, origineId],
      ),
    ]);
    return {
      origineId,
      type: o.type === 'externe' ? 'externe' : 'interne',
      // Référence interne qui m'est adressée : la consultation à faire (bouton « Consulter » sur la fiche)
      consultationDestinataire: o.pour_moi && o.consultation_destination_id ? { id: Number(o.consultation_destination_id), terminee: Number(o.destination_status) === 1 } : null,
      // Référence externe : prise en charge par un médecin (le premier qui se l'attribue)
      priseEnCharge: o.type === 'externe' && o.doctor_destination_id ? { par: nom(o.destination_nom, o.destination_prenom), le: o.pris_le, parMoi: !!o.pour_moi } : null,
      peutPrendreEnCharge: o.type === 'externe' && !o.doctor_destination_id && Number(o.doctor_origine_id) !== Number(o.moi_id),
      date: o.created_at,
      code: texte(o.code_consultation) ?? `CONS-${origineId}`,
      motif: texte(o.motif_consultation),
      justification: texte(o.justification),
      diagnostic: texte(o.diagnostic_retenu),
      examenPhysique: texte(o.examen_physique),
      referePar: nom(o.origine_nom, o.origine_prenom),
      service: texte(o.origine_service),
      hopital: texte(o.hopital),
      hopitalContact: texte(o.hopital_contact),
      constantes: {
        tension: texte(o.tension_arterielle),
        temperature: texte(o.temperature),
        pouls: texte(o.pouls),
        poids: texte(o.poids),
        taille: texte(o.taille),
        saturation: texte(o.saturation_oxygene),
      },
      prescriptions: prescriptions.map((x: Ligne) => ({ nom: texte(x.name) ?? '—', quantite: Number(x.quantity ?? 1), posologie: texte(x.dosage), duree: texte(x.duration) })),
      examens: examens.map((x: Ligne) => String(x.nature_examen)),
      patient: {
        ...this.patient(o),
        telephone: texte(o.telephone),
        groupeSanguin: texte(o.group_sanguin),
        allergies: texte(o.type_allergie_medicamenteuse),
      },
      documents: (await listerDocuments(this.db, origineId)).map((x) => this.presenter(x)),
      documentsPrescrits: docsPrescrits.map((x: Ligne) => ({ type: String(x.type) as 'ordonnance' | 'examens' | 'arret', code: texte(x.code), date: x.created_at })),
    };
  }

  /**
   * Référence externe : un médecin (de n'importe quel établissement) s'attribue le patient.
   * Le premier qui la prend l'obtient ; une consultation du jour est créée à son nom, dans son hôpital,
   * avec les constantes de la consultation d'origine. Il la retrouve ensuite dans « Référés à moi ».
   */
  async prendreEnCharge(userId: number, origineId: number) {
    const d = await this.consultations.medecin(userId);
    const o = await this.referenceAccessible(userId, origineId);
    if (o.type !== 'externe') throw new BadRequestException('Seule une référence externe peut être prise en charge.');
    if (Number(o.doctor_origine_id) === Number(d.id)) throw new BadRequestException('Vous avez vous-même référé ce patient.');
    if (o.doctor_destination_id) {
      throw new ConflictException(`Ce patient a déjà été pris en charge par Dr ${String(nom(o.destination_nom, o.destination_prenom) ?? '').replace(/^dr\.?\s*/i, '')}.`);
    }
    const [moi] = await this.db.query(
      `SELECT dc.hospital_id,
              (SELECT ph.id FROM prestation_hospitals ph JOIN prestation_services ps ON ps.id = ph.prestation_service_id
                WHERE ph.service_hospital_id = dc.service_hospital_id AND ph.status = 0
                ORDER BY (ps.libelle LIKE 'Consultation%') DESC, ph.id LIMIT 1) AS prestation_id
         FROM doctors dc WHERE dc.id = ? LIMIT 1`,
      [d.id],
    );

    // Attribution atomique (InnoDB) : un seul médecin peut prendre la référence
    const pris = await this.db.query('UPDATE fm_references SET doctor_destination_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND doctor_destination_id IS NULL', [
      d.id,
      o.reference_id,
    ]);
    if (Number(pris.affectedRows) !== 1) throw new ConflictException('Ce patient vient d’être pris en charge par un autre médecin.');

    try {
      const now = laravelNow();
      const [{ n }] = await this.db.query('SELECT COUNT(*) AS n FROM consultations WHERE patient_id = ?', [o.origine_patient_id]);
      const code = `CONSULT${String(o.code_patient ?? '').slice(2)}${Number(n) + 1}`;
      const [presta] = moi?.prestation_id ? await this.db.query('SELECT prix FROM prestation_hospitals WHERE id = ?', [moi.prestation_id]) : [undefined];
      const motif = `Référé (externe) par Dr ${String(nom(o.origine_nom, o.origine_prenom) ?? '').replace(/^dr\.?\s*/i, '')}${o.hopital ? ` — ${o.hopital}` : ''} : ${o.justification ?? o.motif_consultation ?? ''}`.slice(0, 1000);
      const res = await this.db.query(
        `INSERT INTO consultations (code_consultation, date_consultation, hospital_id, patient_id, doctor_id, prestation_hospital_id, motif_consultation, montant,
                                    poids, taille, imc, temperature, tension_arterielle, pouls, saturation_oxygene, status, status_inf, created_at, updated_at)
         VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [
          code,
          moi?.hospital_id ?? d.hospital_id,
          o.origine_patient_id,
          d.id,
          moi?.prestation_id ?? null,
          motif,
          Number(presta?.prix ?? 0),
          texte(o.poids),
          texte(o.taille),
          texte(o.imc),
          texte(o.temperature),
          texte(o.tension_arterielle),
          texte(o.pouls),
          texte(o.saturation_oxygene),
          now,
          now,
        ],
      );
      await this.db.query(
        "INSERT INTO passage_patients (libelle, hospital_id, date, patient_id, created_at, updated_at) VALUES ('Prise en charge (référence externe)', ?, CURDATE(), ?, ?, ?)",
        [moi?.hospital_id ?? d.hospital_id, o.origine_patient_id, now, now],
      );
      await this.db.query('UPDATE fm_references SET consultation_destination_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [res.insertId, o.reference_id]);
      return { success: true, message: 'Patient pris en charge : sa consultation est prête.', consultationId: Number(res.insertId) };
    } catch (e) {
      // Échec de la création : la référence redevient disponible
      await this.db.query('UPDATE fm_references SET doctor_destination_id = NULL, consultation_destination_id = NULL WHERE id = ? AND doctor_destination_id = ?', [o.reference_id, d.id]);
      throw e;
    }
  }

  async fichier(userId: number, origineId: number, docId: string) {
    await this.referenceAccessible(userId, origineId);
    const r = await lireDocument(this.db, origineId, docId);
    if (!r) throw new NotFoundException('Document introuvable.');
    return r;
  }
}
