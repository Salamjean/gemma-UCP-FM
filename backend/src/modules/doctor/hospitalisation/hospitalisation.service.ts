import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { laravelNow } from '../../../common/laravel';
import { DoctorConsultationsService } from '../consultations/consultations.service';
import { AttribuerLitDto, DossierHospitalisationDto, SortieHospitalisationDto } from './dto/hospitalisation.dto';

type Ligne = Record<string, unknown>;
const texte = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const nom = (n: unknown, p: unknown) => `${(n as string) ?? ''} ${(p as string) ?? ''}`.trim() || null;
const dateSql = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : texte(x)?.slice(0, 10) ?? null);

/** Lit occupé : comme l'espace hôpital (status_occupied ou occupation active) */
const OCCUPE = `(b.status_occupied = 'occupied' OR EXISTS(SELECT 1 FROM occupied_beds ob WHERE ob.bed_id = b.id AND ob.status = 'active' AND ob.\`delete\` = 0))`;
/** Une journée avec un lit attribué */
const AVEC_LIT = `EXISTS (SELECT 1 FROM day_hospitalisations x WHERE x.hospitalisation_id = h.id AND x.bed_id IS NOT NULL AND x.bed_id <> '')`;

const STATUTS: Record<string, string> = {
  'en-attente': `h.status = 'in_progress' AND NOT ${AVEC_LIT}`,
  'en-cours': `h.status = 'in_progress' AND ${AVEC_LIT}`,
  historique: `h.status = 'finished'`,
};

/**
 * MÉDECIN > HOSPITALISATION
 * Repris de Laravel : Doctor\HospitalisationController + HospitalisationRepository
 *   - en attente de chambre (pas de lit), en cours (lit attribué), historique (terminées) ;
 *   - attribution / changement de lit, dossier (diagnostic, régime, sonde…), sortie du patient.
 * Pas de pharmacie ni de caisse dans ce projet : pas de protocole médicamenteux interne ni de paiement à la sortie.
 */
@Injectable()
export class DoctorHospitalisationService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly consultations: DoctorConsultationsService,
  ) {}

  async liste(userId: number, statut = 'en-cours') {
    const d = await this.consultations.medecin(userId);
    const rows: Ligne[] = await this.db.query(
      `SELECT h.id, h.code, h.date, h.end_date, h.number_days, h.price, h.motif, h.diagnostic, h.mot_sortie, h.created_at,
              c.id AS consultation_id, c.code_consultation, COALESCE(NULLIF(c.motif_consultation, ''), 'Consultation') AS motif_consultation,
              p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.img_url, pu.name AS patient_nom, pu.prenom AS patient_prenom,
              (SELECT CONCAT(r.number, ' · lit ', b.number) FROM day_hospitalisations dh
                 JOIN beds b ON b.id = dh.bed_id JOIN bedrooms r ON r.id = b.bedroom_id
                WHERE dh.hospitalisation_id = h.id ORDER BY dh.day DESC, dh.id DESC LIMIT 1) AS lit,
              (SELECT TRIM(CONCAT(COALESCE(iu.name, ''), ' ', COALESCE(iu.prenom, ''))) FROM day_hospitalisations dh
                 JOIN infirmiers i ON i.id = dh.infirmier_id JOIN users iu ON iu.id = i.user_id
                WHERE dh.hospitalisation_id = h.id ORDER BY dh.day DESC, dh.id DESC LIMIT 1) AS infirmier,
              (SELECT COUNT(*) FROM surveillances sv JOIN day_hospitalisations dh ON dh.id = sv.day_hospitalisation_id
                WHERE dh.hospitalisation_id = h.id) AS nb_surveillances
         FROM hospitalisations h
         JOIN consultations c ON c.id = h.consultation_id
         JOIN patients p ON p.id = c.patient_id
         JOIN users pu ON pu.id = p.user_id
        WHERE (h.doctor_id = ? OR c.doctor_id = ?) AND h.deleted_at IS NULL AND ${STATUTS[statut] ?? STATUTS['en-cours']}
        ORDER BY ${statut === 'historique' ? 'h.end_date DESC,' : ''} h.id DESC`,
      [d.id, d.id],
    );
    const auj = new Date();
    return rows.map((r) => {
      const debut = dateSql(r.date) ?? dateSql(r.created_at);
      const jours = debut ? Math.max(1, Math.floor((auj.getTime() - new Date(`${debut}T00:00:00Z`).getTime()) / 86400000) + 1) : null;
      return {
        id: Number(r.id),
        code: String(r.code),
        debut,
        fin: dateSql(r.end_date),
        jours: r.number_days !== null && r.number_days !== undefined && statut === 'historique' ? Number(r.number_days) : jours,
        prix: r.price === null || r.price === '' || r.price === undefined ? null : Number(r.price),
        motif: texte(r.motif) ?? texte(r.motif_consultation),
        diagnostic: texte(r.diagnostic),
        motifSortie: texte(r.mot_sortie),
        lit: texte(r.lit),
        infirmier: texte(r.infirmier),
        surveillances: Number(r.nb_surveillances ?? 0),
        consultation: { id: Number(r.consultation_id), code: texte(r.code_consultation) },
        patient: {
          id: Number(r.patient_id),
          code: texte(r.code_patient) ?? '—',
          nom: nom(r.patient_nom, r.patient_prenom) ?? '—',
          genre: texte(r.gender),
          dateNaissance: texte(r.birth_date),
          imgUrl: texte(r.img_url),
        },
      };
    });
  }

  /** Compteurs pour les badges du menu */
  async compteurs(userId: number) {
    const d = await this.consultations.medecin(userId);
    const [r] = await this.db.query(
      `SELECT SUM(${STATUTS['en-attente']}) AS en_attente, SUM(${STATUTS['en-cours']}) AS en_cours
         FROM hospitalisations h JOIN consultations c ON c.id = h.consultation_id
        WHERE (h.doctor_id = ? OR c.doctor_id = ?) AND h.deleted_at IS NULL`,
      [d.id, d.id],
    );
    return { enAttente: Number(r?.en_attente ?? 0), enCours: Number(r?.en_cours ?? 0) };
  }

  /** Chambres de l'hôpital du médecin avec leurs lits libres + infirmiers (pour l'attribution) */
  async options(userId: number) {
    const d = await this.consultations.medecin(userId);
    const [chambres, lits, infirmiers] = await Promise.all([
      this.db.query(
        `SELECT r.id, r.number, r.type, r.price FROM bedrooms r
          WHERE r.hospital_id = ? AND r.\`delete\` = 0 AND r.status = 0 ORDER BY r.number`,
        [d.hospital_id],
      ),
      this.db.query(
        `SELECT b.id, b.bedroom_id, b.number, b.price FROM beds b
           JOIN bedrooms r ON r.id = b.bedroom_id
          WHERE r.hospital_id = ? AND r.\`delete\` = 0 AND r.status = 0 AND b.\`delete\` = 0 AND b.status = 0 AND NOT ${OCCUPE}
          ORDER BY b.bedroom_id, b.id`,
        [d.hospital_id],
      ),
      this.db.query(
        `SELECT i.id, u.name, u.prenom FROM infirmiers i JOIN users u ON u.id = i.user_id
          WHERE i.hospital_id = ? AND i.status = 0 AND i.\`delete\` = 0 ORDER BY u.name`,
        [d.hospital_id],
      ),
    ]);
    return {
      chambres: chambres.map((c: Ligne) => ({
        id: Number(c.id),
        numero: String(c.number),
        type: c.type === 'individual' ? 'Individuelle' : c.type === 'collective' ? 'Collective' : texte(c.type),
        prix: Number(c.price ?? 0),
        lits: lits
          .filter((b: Ligne) => Number(b.bedroom_id) === Number(c.id))
          .map((b: Ligne) => ({ id: Number(b.id), numero: String(b.number), prix: Number(b.price ?? 0) })),
      })),
      infirmiers: infirmiers.map((i: Ligne) => ({ id: Number(i.id), nom: nom(i.name, i.prenom) ?? '—' })),
    };
  }

  private async hospitalisationDuMedecin(userId: number, id: number) {
    const d = await this.consultations.medecin(userId);
    const [h] = await this.db.query(
      `SELECT h.*, c.doctor_id AS consultation_doctor_id, c.hospital_id AS consultation_hospital_id
         FROM hospitalisations h JOIN consultations c ON c.id = h.consultation_id
        WHERE h.id = ? AND h.deleted_at IS NULL LIMIT 1`,
      [id],
    );
    if (!h || (Number(h.doctor_id) !== Number(d.id) && Number(h.consultation_doctor_id) !== Number(d.id))) {
      throw new NotFoundException('Hospitalisation introuvable.');
    }
    return { h: h as Ligne, d };
  }

  /** Fiche de suivi : dossier, journées (lits), surveillances de l'infirmier */
  async detail(userId: number, id: number) {
    const { h } = await this.hospitalisationDuMedecin(userId, id);
    const [[c], journees, surveillances, protocoles, operations] = await Promise.all([
      this.db.query(
        `SELECT c.id, c.code_consultation, COALESCE(NULLIF(c.motif_consultation, ''), 'Consultation') AS motif, rc.diagnostic_retenu,
                p.id AS patient_id, p.code_patient, p.gender, p.birth_date, p.img_url, p.telephone, p.group_sanguin, p.type_allergie_medicamenteuse,
                pu.name AS patient_nom, pu.prenom AS patient_prenom
           FROM consultations c
           JOIN patients p ON p.id = c.patient_id
           JOIN users pu ON pu.id = p.user_id
           LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
           LEFT JOIN registre_consultation_curatives rc ON rc.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = r.id)
          WHERE c.id = ?`,
        [h.consultation_id],
      ),
      this.db.query(
        `SELECT dh.id, dh.day, dh.end_date, dh.number_days, dh.price, dh.status, r.number AS chambre, b.number AS lit,
                du.name AS medecin_nom, du.prenom AS medecin_prenom, iu.name AS infirmier_nom, iu.prenom AS infirmier_prenom
           FROM day_hospitalisations dh
           LEFT JOIN beds b ON b.id = dh.bed_id
           LEFT JOIN bedrooms r ON r.id = b.bedroom_id
           LEFT JOIN doctors d ON d.id = dh.doctor_id
           LEFT JOIN users du ON du.id = d.user_id
           LEFT JOIN infirmiers i ON i.id = dh.infirmier_id
           LEFT JOIN users iu ON iu.id = i.user_id
          WHERE dh.hospitalisation_id = ?
          ORDER BY dh.day DESC, dh.id DESC`,
        [id],
      ),
      this.db.query(
        `SELECT s.* FROM surveillances s JOIN day_hospitalisations dh ON dh.id = s.day_hospitalisation_id
          WHERE dh.hospitalisation_id = ? ORDER BY s.id DESC`,
        [id],
      ),
      this.db.query(
        `SELECT tp.id, tp.quantity, tp.dosage, tp.voie_admission, tp.total, tp.created_at, dr.name AS produit, dr.unite,
                (SELECT GROUP_CONCAT(DATE_FORMAT(pa.hour, '%H:%i') ORDER BY pa.hour SEPARATOR ', ') FROM protocol_hour_applications pa WHERE pa.therapeutique_protocol_id = tp.id) AS heures
           FROM therapeutique_protocols tp
           JOIN day_hospitalisations dh ON dh.id = tp.day_hospitalisation_id
           LEFT JOIN drug_hospitals dho ON dho.id = tp.drug_hospital_id AND tp.protocol_type = 'internal'
           LEFT JOIN drugs dr ON dr.id = IF(tp.protocol_type = 'external', tp.drug_hospital_id, dho.drug_id)
          WHERE dh.hospitalisation_id = ?
          ORDER BY tp.id`,
        [id],
      ),
      this.db.query('SELECT date FROM operations WHERE hospitalisation_id = ? ORDER BY date', [id]),
    ]);
    const enCours = h.status === 'in_progress';
    const avecLit = journees.some((j: Ligne) => j.chambre);
    return {
      id: Number(h.id),
      code: String(h.code),
      statut: enCours ? (avecLit ? 'en-cours' : 'en-attente') : 'terminee',
      debut: dateSql(h.date),
      fin: dateSql(h.end_date),
      jours: h.number_days !== null && h.number_days !== undefined ? Number(h.number_days) : null,
      prix: h.price === null || h.price === '' || h.price === undefined ? null : Number(h.price),
      dossier: {
        motif: texte(h.motif),
        diagnostic: texte(h.diagnostic) ?? texte(c?.diagnostic_retenu),
        regime: texte(h.regime),
        analyseMedical: texte(h.analyse_medical),
        sonde: texte(h.sonde),
        oxygenotherapie: texte(h.oxygenotherapie),
        volume: texte(h.volume),
        remarque: texte(h.remark),
        motifSortie: texte(h.mot_sortie),
      },
      consultation: { id: Number(c?.id), code: texte(c?.code_consultation), motif: texte(c?.motif) },
      patient: {
        id: Number(c?.patient_id),
        code: texte(c?.code_patient) ?? '—',
        nom: nom(c?.patient_nom, c?.patient_prenom) ?? '—',
        genre: texte(c?.gender),
        dateNaissance: texte(c?.birth_date),
        imgUrl: texte(c?.img_url),
        telephone: texte(c?.telephone),
        groupeSanguin: texte(c?.group_sanguin),
        allergies: texte(c?.type_allergie_medicamenteuse),
      },
      journees: journees.map((j: Ligne) => ({
        id: Number(j.id),
        jour: dateSql(j.day),
        fin: dateSql(j.end_date),
        nombre: j.number_days !== null && j.number_days !== undefined ? Number(j.number_days) : null,
        prix: j.price === null || j.price === undefined ? null : Number(j.price),
        lit: j.chambre ? `Chambre ${j.chambre} · lit ${j.lit}` : null,
        medecin: nom(j.medecin_nom, j.medecin_prenom),
        infirmier: nom(j.infirmier_nom, j.infirmier_prenom),
      })),
      protocole: protocoles.map((p: Ligne) => ({
        id: Number(p.id),
        produit: texte(p.produit) ?? 'Produit',
        unite: texte(p.unite),
        quantite: Number(p.quantity ?? 1),
        posologie: texte(p.dosage),
        voie: texte(p.voie_admission),
        heures: texte(p.heures),
        total: p.total === null || p.total === undefined ? null : Number(p.total),
      })),
      operations: operations.map((o: Ligne) => dateSql(o.date)).filter(Boolean),
      surveillances: surveillances.map((s: Ligne) => ({
        id: Number(s.id),
        date: s.created_at,
        heure: texte(s.hour),
        ta: texte(s.ta),
        temperature: texte(s.t),
        pouls: texte(s.pouls),
        sao2: texte(s.sao2),
        glycemie: texte(s.glycemie),
        diurese: texte(s.diurese),
        conscience: texte(s.conscience),
        poids: texte(s.poids),
        evolution: texte(s.evolution),
        conduite: texte(s.conduite_tenir),
      })),
    };
  }

  /**
   * Attribution (ou changement) du lit — comme Laravel (bedcheck / store) :
   * le lit est posé sur la journée en cours, l'ancien lit éventuel est libéré.
   */
  async attribuerLit(userId: number, id: number, dto: AttribuerLitDto) {
    const { h, d } = await this.hospitalisationDuMedecin(userId, id);
    if (h.status !== 'in_progress') throw new BadRequestException('Cette hospitalisation est terminée.');
    const [lit] = await this.db.query(
      `SELECT b.id, b.price, r.price AS prix_chambre, ${OCCUPE} AS occupe
         FROM beds b JOIN bedrooms r ON r.id = b.bedroom_id
        WHERE b.id = ? AND r.hospital_id = ? AND b.\`delete\` = 0 AND r.\`delete\` = 0 AND b.status = 0 AND r.status = 0 LIMIT 1`,
      [dto.bedId, d.hospital_id],
    );
    if (!lit) throw new BadRequestException('Lit introuvable dans votre établissement.');
    if (Number(lit.occupe) === 1) throw new BadRequestException('Ce lit est déjà occupé.');
    if (dto.infirmierId) {
      const [inf] = await this.db.query('SELECT id FROM infirmiers WHERE id = ? AND hospital_id = ? AND `delete` = 0 LIMIT 1', [dto.infirmierId, d.hospital_id]);
      if (!inf) throw new BadRequestException('Infirmier(ère) introuvable dans votre établissement.');
    }

    const now = laravelNow();
    const prix = Number(lit.price ?? lit.prix_chambre ?? 0);
    const [jour] = await this.db.query('SELECT id, bed_id FROM day_hospitalisations WHERE hospitalisation_id = ? ORDER BY day DESC, id DESC LIMIT 1', [id]);
    if (jour) {
      if (texte(jour.bed_id) && Number(jour.bed_id) !== Number(dto.bedId)) {
        await this.db.query("UPDATE beds SET status_occupied = 'no_occupied', updated_at = ? WHERE id = ?", [now, jour.bed_id]);
      }
      await this.db.query('UPDATE day_hospitalisations SET bed_id = ?, price = ?, infirmier_id = COALESCE(?, infirmier_id), updated_at = ? WHERE id = ?', [
        String(dto.bedId),
        prix,
        dto.infirmierId ? String(dto.infirmierId) : null,
        now,
        jour.id,
      ]);
    } else {
      await this.db.query(
        'INSERT INTO day_hospitalisations (hospitalisation_id, doctor_id, infirmier_id, day, bed_id, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, String(d.id), dto.infirmierId ? String(dto.infirmierId) : null, now.slice(0, 10), String(dto.bedId), prix, now, now],
      );
    }
    await this.db.query("UPDATE beds SET status_occupied = 'occupied', updated_at = ? WHERE id = ?", [now, dto.bedId]);
    return { success: true, message: jour?.bed_id ? 'Le patient a changé de lit.' : 'Lit attribué : le patient est maintenant hospitalisé en chambre.' };
  }

  /** Mise à jour du dossier d'hospitalisation (diagnostic, régime, sonde…) */
  async majDossier(userId: number, id: number, dto: DossierHospitalisationDto) {
    const { h } = await this.hospitalisationDuMedecin(userId, id);
    if (h.status !== 'in_progress') throw new BadRequestException('Cette hospitalisation est terminée.');
    await this.db.query(
      `UPDATE hospitalisations SET diagnostic = ?, regime = ?, analyse_medical = ?, sonde = ?, oxygenotherapie = ?, volume = ?, remark = ?, updated_at = ?
        WHERE id = ?`,
      [dto.diagnostic ?? null, dto.regime ?? null, dto.analyseMedical ?? null, dto.sonde ?? null, dto.oxygenotherapie ?? null, dto.volume ?? null, dto.remarque ?? null, laravelNow(), id],
    );
    return { success: true, message: 'Dossier d’hospitalisation mis à jour.' };
  }

  /**
   * Sortie du patient (Laravel : HospitalisationRepository@validated, sans paiement : pas de caisse ici).
   * Journées clôturées, lits libérés, durée et coût calculés.
   */
  async sortie(userId: number, id: number, dto: SortieHospitalisationDto) {
    const { h } = await this.hospitalisationDuMedecin(userId, id);
    if (h.status !== 'in_progress') throw new BadRequestException('Cette hospitalisation est déjà terminée.');

    const now = laravelNow();
    const aujourdhui = now.slice(0, 10);
    const journees: Ligne[] = await this.db.query('SELECT id, day, end_date, number_days, bed_id, created_at FROM day_hospitalisations WHERE hospitalisation_id = ? ORDER BY day ASC, id ASC', [id]);
    const lits: Ligne[] = journees.some((j) => texte(j.bed_id))
      ? await this.db.query('SELECT id, price FROM beds WHERE id IN (?)', [journees.filter((j) => texte(j.bed_id)).map((j) => Number(j.bed_id))])
      : [];

    let total = 0;
    let nbJours = 0;
    for (const [i, j] of journees.entries()) {
      const derniere = i === journees.length - 1;
      let n = j.number_days !== null && j.number_days !== undefined ? Number(j.number_days) : 0;
      if (derniere || !n) {
        const debut = new Date(`${dateSql(j.day) ?? aujourdhui}T00:00:00Z`).getTime();
        n = Math.max(1, Math.round((new Date(`${aujourdhui}T00:00:00Z`).getTime() - debut) / 86400000));
      }
      const lit = lits.find((b) => Number(b.id) === Number(j.bed_id));
      const prix = lit ? Number(lit.price ?? 0) * n : 0;
      total += prix;
      nbJours += n;
      await this.db.query("UPDATE day_hospitalisations SET end_date = COALESCE(end_date, ?), number_days = ?, price = ?, status = 'terminé', updated_at = ? WHERE id = ?", [
        aujourdhui,
        n,
        prix,
        now,
        j.id,
      ]);
    }
    if (lits.length) await this.db.query("UPDATE beds SET status_occupied = 'no_occupied', updated_at = ? WHERE id IN (?)", [now, lits.map((b) => b.id)]);
    await this.db.query("UPDATE hospitalisations SET status = 'finished', end_date = ?, number_days = ?, price = ?, mot_sortie = ?, updated_at = ? WHERE id = ?", [
      aujourdhui,
      nbJours,
      total,
      dto.motifSortie,
      now,
      id,
    ]);
    return { success: true, message: `Sortie enregistrée : ${nbJours} jour(s) d’hospitalisation.` };
  }
}
