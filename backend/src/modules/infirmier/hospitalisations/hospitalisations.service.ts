import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { laravelNow } from '../../../common/laravel';

const texte_ = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

/** Surveillance (Laravel : SuiviController@makeSuveillance — TA, T°, pouls, diurèse, conscience, glycémie, SaO2, poids obligatoires) */
export class AjouterSurveillanceDto {
  @Transform(texte_) @IsString() @IsNotEmpty({ message: 'Le TA est obligatoire.' }) @MaxLength(50) ta: string;
  @Transform(texte_) @IsString() @IsNotEmpty({ message: 'La température est obligatoire.' }) @MaxLength(50) temperature: string;
  @Transform(texte_) @IsString() @IsNotEmpty({ message: 'Le pouls est obligatoire.' }) @MaxLength(50) pouls: string;
  @Transform(texte_) @IsString() @IsNotEmpty({ message: 'La diurèse est obligatoire.' }) @MaxLength(50) diurese: string;
  @Transform(texte_) @IsString() @IsNotEmpty({ message: 'La conscience est obligatoire.' }) @MaxLength(100) conscience: string;
  @Transform(texte_) @IsString() @IsNotEmpty({ message: 'La glycémie est obligatoire.' }) @MaxLength(50) glycemie: string;
  @Transform(texte_) @IsString() @IsNotEmpty({ message: 'La SaO2 est obligatoire.' }) @MaxLength(50) sao2: string;
  @Transform(texte_) @IsString() @IsNotEmpty({ message: 'Le poids est obligatoire.' }) @MaxLength(50) poids: string;
  @Transform(texte_) @IsOptional() @Matches(/^\d{2}:\d{2}$/, { message: 'Heure invalide.' }) heure?: string;
  @Transform(texte_) @IsOptional() @IsString() @MaxLength(5000) evolution?: string;
  @Transform(texte_) @IsOptional() @IsString() @MaxLength(5000) conduite_tenir?: string;
}

type Ligne = Record<string, unknown>;

@Injectable()
export class InfirmierHospitalisationsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private async getInfirmier(userId: number) {
    const [inf] = await this.db.query(
      `SELECT i.id, i.hospital_id
         FROM infirmiers i
        WHERE i.user_id = ?
        LIMIT 1`,
      [userId],
    );
    if (!inf) {
      throw new NotFoundException('Profil infirmier introuvable.');
    }
    return {
      infirmierId: Number(inf.id),
      hospitalId: Number(inf.hospital_id),
    };
  }

  /** Liste des patients en hospitalisation en cours */
  async getEnCours(userId: number) {
    const { hospitalId } = await this.getInfirmier(userId);

    const rows = await this.db.query(
      `SELECT h.id, h.code, h.date, h.end_date, h.status, h.motif, h.number_days, h.price,
              c.id AS consultation_id, c.code_consultation,
              p.id AS patient_id, p.code_patient, p.gender AS patient_genre, p.telephone AS patient_telephone,
              p.img_url AS patient_img,
              TRIM(CONCAT(pu.name, ' ', COALESCE(pu.prenom, ''))) AS patient_nom,
              TRIM(CONCAT(du.name, ' ', COALESCE(du.prenom, ''))) AS medecin_nom,
              s.libelle AS medecin_specialite,
              (SELECT CONCAT('Chambre ', r.number, ' · Lit ', b.number)
                 FROM day_hospitalisations dh
                 JOIN beds b ON b.id = dh.bed_id
                 JOIN bedrooms r ON r.id = b.bedroom_id
                WHERE dh.hospitalisation_id = h.id AND dh.bed_id IS NOT NULL AND dh.bed_id <> ''
                ORDER BY dh.day DESC, dh.id DESC LIMIT 1) AS lit_occupe,
              (SELECT COUNT(*)
                 FROM day_hospitalisations dh
                WHERE dh.hospitalisation_id = h.id AND dh.bed_id IS NOT NULL AND dh.bed_id <> '') AS has_bed
         FROM hospitalisations h
         JOIN consultations c ON c.id = h.consultation_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = h.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
        WHERE c.hospital_id = ?
          AND h.status = 'in_progress'
          AND h.deleted_at IS NULL
        ORDER BY h.id DESC`,
      [hospitalId],
    );

    return rows.map((r: Ligne) => {
      const dateDebut = (r.date as string) || (r.created_at as string);
      let nbJours = 0;
      if (dateDebut) {
        const d = new Date(dateDebut);
        const auj = new Date();
        const diff = auj.getTime() - d.getTime();
        nbJours = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
      }

      return {
        id: Number(r.id),
        code: (r.code as string) ?? null,
        consultationId: Number(r.consultation_id),
        codeConsultation: (r.code_consultation as string) ?? null,
        patient: {
          id: r.patient_id != null ? Number(r.patient_id) : null,
          code: (r.code_patient as string) ?? '—',
          nom: (r.patient_nom as string) || 'Patient',
          telephone: (r.patient_telephone as string) ?? null,
          imgUrl: (r.patient_img as string) ?? null,
          genre: (r.patient_genre as string) ?? null,
        },
        medecin: {
          nom: (r.medecin_nom as string) || 'Médecin traitant',
          specialite: (r.medecin_specialite as string) || 'Médecine générale',
        },
        dateDebut: (r.date as string) ?? null,
        nbJours,
        motif: (r.motif as string) || 'Hospitalisation générale',
        lit: (r.lit_occupe as string) || null,
        hasBed: Number(r.has_bed || 0) > 0,
        statut: 'in_progress',
      };
    });
  }

  /** Historique des hospitalisations terminées */
  async getHistorique(userId: number) {
    const { hospitalId } = await this.getInfirmier(userId);

    const rows = await this.db.query(
      `SELECT h.id, h.code, h.date, h.end_date, h.status, h.motif, h.number_days, h.mot_sortie,
              c.id AS consultation_id, c.code_consultation,
              p.id AS patient_id, p.code_patient, p.gender AS patient_genre, p.telephone AS patient_telephone,
              p.img_url AS patient_img,
              TRIM(CONCAT(pu.name, ' ', COALESCE(pu.prenom, ''))) AS patient_nom,
              TRIM(CONCAT(du.name, ' ', COALESCE(du.prenom, ''))) AS medecin_nom,
              s.libelle AS medecin_specialite
         FROM hospitalisations h
         JOIN consultations c ON c.id = h.consultation_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN doctors d ON d.id = h.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
        WHERE c.hospital_id = ?
          AND h.status = 'finished'
          AND h.deleted_at IS NULL
        ORDER BY h.end_date DESC, h.id DESC`,
      [hospitalId],
    );

    return rows.map((r: Ligne) => ({
      id: Number(r.id),
      code: (r.code as string) ?? null,
      consultationId: Number(r.consultation_id),
      codeConsultation: (r.code_consultation as string) ?? null,
      patient: {
        id: r.patient_id != null ? Number(r.patient_id) : null,
        code: (r.code_patient as string) ?? '—',
        nom: (r.patient_nom as string) || 'Patient',
        telephone: (r.patient_telephone as string) ?? null,
        imgUrl: (r.patient_img as string) ?? null,
        genre: (r.patient_genre as string) ?? null,
      },
      medecin: {
        nom: (r.medecin_nom as string) || 'Médecin traitant',
        specialite: (r.medecin_specialite as string) || 'Médecine générale',
      },
      dateDebut: (r.date as string) ?? null,
      dateFin: (r.end_date as string) ?? null,
      nbJours: r.number_days != null ? Number(r.number_days) : null,
      motif: (r.motif as string) || 'Hospitalisation générale',
      motSortie: (r.mot_sortie as string) ?? null,
      statut: 'finished',
    }));
  }

  /** Hospitalisation de l'hôpital de l'infirmier(ère) */
  private async hospitalisationDeLHopital(userId: number, hospitalisationId: number) {
    const { infirmierId, hospitalId } = await this.getInfirmier(userId);
    const [h] = await this.db.query(
      `SELECT h.id, h.status FROM hospitalisations h JOIN consultations c ON c.id = h.consultation_id
        WHERE h.id = ? AND c.hospital_id = ? AND h.deleted_at IS NULL LIMIT 1`,
      [hospitalisationId, hospitalId],
    );
    if (!h) throw new NotFoundException('Hospitalisation introuvable dans votre établissement.');
    return { h: h as Ligne, infirmierId, hospitalId };
  }

  /**
   * Fiche de suivi & surveillance (Laravel : SuiviController@suiviePatient, users/infirmier/suivi/hospitalisation)
   *   patient, puis une journée par onglet : protocole thérapeutique (heures à appliquer) + surveillances.
   */
  async getSuivi(userId: number, hospitalisationId: number) {
    const { hospitalId } = await this.getInfirmier(userId);
    const [h] = await this.db.query(
      `SELECT h.*, c.code_consultation, COALESCE(NULLIF(c.motif_consultation, ''), a.motif_consultation) AS motif_consultation,
              p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.telephone, p.img_url, p.num_cmu, p.no_assurance,
              sr.name AS residence, pu.name AS patient_nom, pu.prenom AS patient_prenom,
              du.name AS medecin_nom, du.prenom AS medecin_prenom, s.libelle AS medecin_specialite
         FROM hospitalisations h
         JOIN consultations c ON c.id = h.consultation_id
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN sub_prefectures sr ON sr.id = p.residence_actuelle_id
         LEFT JOIN doctors d ON d.id = h.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN service_hospitals sh ON sh.id = d.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
        WHERE h.id = ? AND c.hospital_id = ? AND h.deleted_at IS NULL
        LIMIT 1`,
      [hospitalisationId, hospitalId],
    );
    if (!h) throw new NotFoundException('Hospitalisation introuvable dans votre établissement.');

    const [jours, protocoles, heures, surveillances, operations] = await Promise.all([
      this.db.query(
        `SELECT dh.id, dh.day, dh.end_date, dh.status, r.number AS chambre, b.number AS lit,
                iu.name AS inf_nom, iu.prenom AS inf_prenom, du.name AS doc_nom, du.prenom AS doc_prenom
           FROM day_hospitalisations dh
           LEFT JOIN beds b ON b.id = dh.bed_id
           LEFT JOIN bedrooms r ON r.id = b.bedroom_id
           LEFT JOIN infirmiers i ON i.id = dh.infirmier_id
           LEFT JOIN users iu ON iu.id = i.user_id
           LEFT JOIN doctors d ON d.id = dh.doctor_id
           LEFT JOIN users du ON du.id = d.user_id
          WHERE dh.hospitalisation_id = ?
          ORDER BY dh.day ASC, dh.id ASC`,
        [hospitalisationId],
      ),
      this.db.query(
        `SELECT tp.id, tp.day_hospitalisation_id, tp.protocol_type, tp.quantity, tp.dosage, tp.voie_admission, dr.name AS produit, dr.unite
           FROM therapeutique_protocols tp
           JOIN day_hospitalisations dh ON dh.id = tp.day_hospitalisation_id
           LEFT JOIN drug_hospitals dho ON dho.id = tp.drug_hospital_id AND tp.protocol_type = 'internal'
           LEFT JOIN drugs dr ON dr.id = IF(tp.protocol_type = 'external', tp.drug_hospital_id, dho.drug_id)
          WHERE dh.hospitalisation_id = ?
          ORDER BY tp.id`,
        [hospitalisationId],
      ),
      this.db.query(
        `SELECT pa.id, pa.therapeutique_protocol_id, DATE_FORMAT(pa.hour, '%H:%i') AS heure, pa.status,
                DATE_FORMAT(pa.hour_applique, '%H:%i') AS applique_a
           FROM protocol_hour_applications pa
           JOIN therapeutique_protocols tp ON tp.id = pa.therapeutique_protocol_id
           JOIN day_hospitalisations dh ON dh.id = tp.day_hospitalisation_id
          WHERE dh.hospitalisation_id = ?
          ORDER BY pa.hour, pa.id`,
        [hospitalisationId],
      ),
      this.db.query(
        `SELECT s.* FROM surveillances s JOIN day_hospitalisations dh ON dh.id = s.day_hospitalisation_id
          WHERE dh.hospitalisation_id = ? ORDER BY s.id ASC`,
        [hospitalisationId],
      ),
      this.db.query('SELECT date FROM operations WHERE hospitalisation_id = ? ORDER BY date', [hospitalisationId]),
    ]);

    const t = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
    const nom2 = (n: unknown, p: unknown) => `${(n as string) ?? ''} ${(p as string) ?? ''}`.trim() || null;
    const d10 = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : t(x)?.slice(0, 10) ?? null);
    const terminee = h.status === 'finished';
    const dernier = jours[jours.length - 1];

    return {
      hospitalisation: {
        id: Number(h.id),
        code: String(h.code),
        terminee,
        dateDebut: d10(h.date) ?? d10(h.created_at),
        dateFin: d10(h.end_date),
        motifSortie: t(h.mot_sortie),
        diagnostic: t(h.diagnostic),
        regime: t(h.regime),
        sonde: t(h.sonde),
        oxygenotherapie: t(h.oxygenotherapie),
        volume: t(h.volume),
        analyseMedical: t(h.analyse_medical),
        remarque: t(h.remark),
        operations: operations.map((o: Ligne) => d10(o.date)).filter(Boolean),
        medecin: { nom: nom2(h.medecin_nom, h.medecin_prenom), specialite: t(h.medecin_specialite) },
        lit: dernier?.chambre ? `Chambre ${dernier.chambre} · lit ${dernier.lit}` : null,
      },
      patient: {
        id: Number(h.patient_id),
        code: t(h.code_patient) ?? '—',
        nom: nom2(h.patient_nom, h.patient_prenom) ?? '—',
        genre: t(h.gender),
        dateNaissance: t(h.birth_date),
        residence: t(h.residence),
        telephone: t(h.telephone),
        assurance: t(h.no_assurance) ?? t(h.num_cmu),
        imgUrl: t(h.img_url),
      },
      motifConsultation: t(h.motif_consultation),
      journees: jours.map((j: Ligne) => ({
        id: Number(j.id),
        jour: d10(j.day),
        fin: d10(j.end_date),
        lit: j.chambre ? `Chambre ${j.chambre} · lit ${j.lit}` : null,
        infirmier: nom2(j.inf_nom, j.inf_prenom),
        medecin: nom2(j.doc_nom, j.doc_prenom),
        protocoles: protocoles
          .filter((p: Ligne) => Number(p.day_hospitalisation_id) === Number(j.id))
          .map((p: Ligne) => ({
            id: Number(p.id),
            produit: t(p.produit) ?? 'Produit',
            unite: t(p.unite),
            quantite: Number(p.quantity ?? 1),
            dosage: t(p.dosage),
            voie: t(p.voie_admission),
            heures: heures
              .filter((x: Ligne) => Number(x.therapeutique_protocol_id) === Number(p.id))
              .map((x: Ligne) => ({ id: Number(x.id), heure: String(x.heure), applique: !!t(x.status) && String(x.status).toLowerCase().startsWith('appliqu'), appliqueA: t(x.applique_a) })),
          })),
        surveillances: surveillances
          .filter((s: Ligne) => Number(s.day_hospitalisation_id) === Number(j.id))
          .map((s: Ligne) => ({
            id: Number(s.id),
            heure: t(s.hour)?.slice(0, 5) ?? null,
            ta: t(s.ta),
            temperature: t(s.t),
            pouls: t(s.pouls),
            diurese: t(s.diurese),
            conscience: t(s.conscience),
            glycemie: t(s.glycemie),
            sao2: t(s.sao2),
            poids: t(s.poids),
            evolution: t(s.evolution),
            conduite: t(s.conduite_tenir),
            date: s.created_at,
          })),
      })),
    };
  }

  /**
   * Protocole appliqué à une heure donnée (Laravel : SuiviController@appliqueProtocol)
   * status = « appliqué », hour_applique = heure actuelle ; refusé si l'hospitalisation est terminée.
   */
  async appliquerHeure(userId: number, heureId: number) {
    const { hospitalId } = await this.getInfirmier(userId);
    const [x] = await this.db.query(
      `SELECT pa.id, pa.status, h.status AS hosp_status
         FROM protocol_hour_applications pa
         JOIN therapeutique_protocols tp ON tp.id = pa.therapeutique_protocol_id
         JOIN day_hospitalisations dh ON dh.id = tp.day_hospitalisation_id
         JOIN hospitalisations h ON h.id = dh.hospitalisation_id
         JOIN consultations c ON c.id = h.consultation_id
        WHERE pa.id = ? AND c.hospital_id = ? AND h.deleted_at IS NULL LIMIT 1`,
      [heureId, hospitalId],
    );
    if (!x) throw new NotFoundException('Heure du protocole introuvable.');
    if (x.hosp_status === 'finished') throw new BadRequestException("L'hospitalisation est terminée. Impossible de modifier le protocole.");
    if (String(x.status ?? '').toLowerCase().startsWith('appliqu')) throw new BadRequestException('Ce protocole a déjà été appliqué à cette heure.');
    const now = laravelNow();
    await this.db.query("UPDATE protocol_hour_applications SET status = 'appliqué', hour_applique = ?, updated_at = ? WHERE id = ?", [now.slice(11), now, heureId]);
    return { success: true, message: 'Protocole appliqué avec succès !' };
  }

  /** Surveillance de l'infirmier(ère) sur la journée en cours (Laravel : SuiviController@makeSuveillance) */
  async ajouterSurveillance(userId: number, hospitalisationId: number, dto: AjouterSurveillanceDto) {
    const { h } = await this.hospitalisationDeLHopital(userId, hospitalisationId);
    if (h.status === 'finished') throw new BadRequestException("L'hospitalisation est terminée. Impossible d'ajouter une surveillance.");
    const [jour] = await this.db.query('SELECT id FROM day_hospitalisations WHERE hospitalisation_id = ? ORDER BY day DESC, id DESC LIMIT 1', [hospitalisationId]);
    if (!jour) throw new BadRequestException("Aucune journée d'hospitalisation : le médecin doit d'abord hospitaliser le patient.");
    const now = laravelNow();
    await this.db.query(
      `INSERT INTO surveillances (day_hospitalisation_id, hour, ta, t, pouls, diurese, conscience, glycemie, sao2, poids, evolution, conduite_tenir, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jour.id,
        dto.heure ?? now.slice(11, 16),
        dto.ta,
        dto.temperature,
        dto.pouls,
        dto.diurese,
        dto.conscience,
        dto.glycemie,
        dto.sao2,
        dto.poids,
        dto.evolution ?? null,
        dto.conduite_tenir ?? null,
        now,
        now,
      ],
    );
    return { success: true, message: 'Donnée de surveillance enregistrée avec succès.' };
  }
}
