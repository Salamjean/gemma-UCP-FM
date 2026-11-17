import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type Ligne = Record<string, unknown>;
const nom = (n: unknown, p: unknown) => `${(n as string) ?? ''} ${(p as string) ?? ''}`.trim() || null;
const texte = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
/** Date SQL ("AAAA-MM-JJ HH:MM:SS" texte ou Date) → ISO, heure telle qu'enregistrée */
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/.exec(String(v));
  return m ? `${m[1]}T${m[2] ?? '00:00:00'}Z`.replace(/T(\d{2}:\d{2})Z$/, 'T$1:00Z') : null;
};

/**
 * INFIRMIER > DOSSIER MÉDICAL D'UN PATIENT (page dédiée)
 * Repris de Laravel : Hospital\PatientController@dossierMedical + partials/patient_interventions_table.blade.php
 *   - en-tête : identité, âge, profession, téléphone, résidence ;
 *   - historique de TOUTES ses consultations, dans tous les établissements (comme Laravel) :
 *     hôpital, service, présentiel / en ligne, motif, diagnostic, intervenants, statut, issue,
 *     constantes, examen physique, ordonnances (médicaments), documents, antécédents du registre.
 * Lecture seule.
 */
@Injectable()
export class InfirmierDossierService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Agent connecté : infirmier·ère ou médecin (même dossier, en lecture seule) */
  private async agent(userId: number, role: 'infirmier' | 'doctor') {
    const table = role === 'doctor' ? 'doctors' : 'infirmiers';
    const [a] = await this.db.query(`SELECT id FROM ${table} WHERE user_id = ? LIMIT 1`, [userId]);
    if (!a) throw new NotFoundException(role === 'doctor' ? 'Profil médecin introuvable.' : 'Profil infirmier introuvable.');
    return { id: Number(a.id), role };
  }

  async dossier(userId: number, patientId: number, role: 'infirmier' | 'doctor' = 'infirmier') {
    await this.agent(userId, role);

    const [p] = await this.db.query(
      `SELECT p.*, u.name, u.prenom, u.email, sa.name AS residence, sn.name AS lieu_naissance
         FROM patients p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN sub_prefectures sa ON sa.id = p.residence_actuelle_id
         LEFT JOIN sub_prefectures sn ON sn.id = p.lieu_de_naissance_id
        WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1`,
      [patientId],
    );
    if (!p) throw new NotFoundException('Patient introuvable.');

    const consultations: Ligne[] = await this.db.query(
      `SELECT c.*,
              COALESCE(h.label, 'Hôpital') AS hopital,
              ps.libelle AS prestation, s.libelle AS service,
              du.name AS medecin_nom, du.prenom AS medecin_prenom,
              iu.name AS infirmier_nom, iu.prenom AS infirmier_prenom,
              a.motif_consultation AS motif_admission,
              r.issue_consultation, r.issue_consultation_justification,
              rc.motif_consultation AS motif_registre, rc.diagnostic_retenu, rc.examen_physique,
              rc.ta AS r_ta, rc.temperature AS r_temperature, rc.poids AS r_poids, rc.pouls AS r_pouls,
              rc.saturation_oxygene AS r_sat, rc.glycemie_a_jeun AS r_gly, rc.taille AS r_taille, rc.imc AS r_imc,
              rc.hta, rc.alcool, rc.tabac, rc.drepanocytaire, rc.traitement_medicamenteux_anterieur,
              (SELECT COUNT(*) FROM bulletin_examens b WHERE b.consultation_id = c.id) AS nb_examens,
              (SELECT COUNT(*) FROM arret_travails t WHERE t.consultation_id = c.id) AS nb_arrets,
              (SELECT COUNT(*) FROM hospitalisations ho WHERE ho.consultation_id = c.id AND ho.deleted_at IS NULL) AS nb_hosp
         FROM consultations c
         LEFT JOIN hospitals h ON h.id = c.hospital_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
         LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN infirmiers i ON i.id = c.infirmier_id
         LEFT JOIN users iu ON iu.id = i.user_id
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
         LEFT JOIN registre_consultation_curatives rc ON rc.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = r.id)
        WHERE c.patient_id = ? AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC, c.id DESC`,
      [patientId],
    );

    // Ordonnances et médicaments de toutes ces consultations
    const ids = consultations.map((c) => Number(c.id));
    const ordonnances: Ligne[] = ids.length
      ? await this.db.query(
          `SELECT o.id, o.consultation_id, o.type, o.reference,
                  pr.dosage, pr.quantity, pr.duration, dr.name AS medicament
             FROM ordonnances o
             LEFT JOIN prescriptions pr ON pr.ordonnance_id = o.id
             LEFT JOIN drugs dr ON dr.id = pr.drug_id
            WHERE o.consultation_id IN (?) AND o.deleted_at IS NULL
            ORDER BY o.id, pr.id`,
          [ids],
        )
      : [];

    return {
      patient: {
        id: Number(p.id),
        code: p.code_patient,
        nom: nom(p.name, p.prenom) ?? '—',
        genre: texte(p.gender),
        dateNaissance: texte(p.birth_date),
        lieuNaissance: texte(p.lieu_naissance),
        profession: texte(p.profession),
        telephone: texte(p.telephone),
        email: texte(p.email),
        residence: texte(p.residence),
        numCmu: texte(p.num_cmu),
        groupeSanguin: texte(p.group_sanguin),
        allergies: texte(p.type_allergie_medicamenteuse),
        imgUrl: texte(p.img_url),
      },
      interventions: consultations.map((c) => {
        const ords = new Map<number, { type: string; reference: string | null; medicaments: { nom: string; posologie: string | null; quantite: string | null; duree: string | null }[] }>();
        for (const o of ordonnances.filter((x) => Number(x.consultation_id) === Number(c.id))) {
          const id = Number(o.id);
          if (!ords.has(id)) ords.set(id, { type: String(o.type ?? ''), reference: texte(o.reference), medicaments: [] });
          if (o.medicament) {
            ords.get(id)!.medicaments.push({ nom: String(o.medicament), posologie: texte(o.dosage), quantite: texte(o.quantity), duree: texte(o.duration) });
          }
        }
        const issue = texte(c.issue_consultation);
        const terminee =
          Number(c.status) === 1 ||
          ['completed', 'ended', 'complete'].includes(String(c.call_status)) ||
          (issue !== null && issue !== 'En cours') ||
          !!c.issue_consultation_justification ||
          ords.size > 0 ||
          Number(c.nb_examens) > 0 ||
          Number(c.nb_arrets) > 0 ||
          Number(c.nb_hosp) > 0;
        const val = (a: unknown, b: unknown) => texte(a) ?? texte(b);
        return {
          id: Number(c.id),
          code: texte(c.code_consultation) ?? `CONS-${c.id}`,
          date: c.created_at,
          hopital: String(c.hopital),
          service: texte(c.prestation) ?? texte(c.service) ?? 'Consultation générale',
          enLigne: !!c.call_channel,
          motif: texte(c.motif_consultation) ?? texte(c.motif_admission) ?? texte(c.motif_registre) ?? 'Non renseigné',
          diagnostic: texte(c.diagnostic_retenu),
          examenPhysique: texte(c.examen_physique),
          medecin: nom(c.medecin_nom, c.medecin_prenom),
          infirmier: nom(c.infirmier_nom, c.infirmier_prenom),
          terminee,
          issue: issue && issue !== 'En cours' ? issue : null,
          constantes: {
            tension: val(c.tension_arterielle, c.r_ta),
            temperature: val(c.temperature, c.r_temperature),
            poids: val(c.poids, c.r_poids),
            pouls: val(c.pouls, c.r_pouls),
            saturation: val(c.saturation_oxygene, c.r_sat),
            glycemie: val(c.gly_a_jeun, c.r_gly),
            taille: val(c.taille, c.r_taille),
            imc: val(c.imc, c.r_imc),
          },
          ordonnances: [...ords.values()],
          documents: {
            examen: Number(c.nb_examens) > 0,
            arret: Number(c.nb_arrets) > 0,
            hospitalisation: Number(c.nb_hosp) > 0,
          },
          antecedents:
            c.hta !== null || c.alcool !== null || c.tabac !== null || c.drepanocytaire !== null || c.traitement_medicamenteux_anterieur
              ? {
                  hta: texte(c.hta),
                  alcool: texte(c.alcool),
                  tabac: texte(c.tabac),
                  drepanocytose: texte(c.drepanocytaire),
                  traitementsAnterieurs: texte(c.traitement_medicamenteux_anterieur),
                }
              : null,
        };
      }),
    };
  }

  /**
   * PARCOURS D'UNE INTERVENTION, du début à la fin
   * Repris de Laravel : Hospital\PatientController@parcoursIntervention + parcours_intervention.blade.php
   * (équipe, constantes, examen & diagnostic, prescriptions, issue, registre) + une frise chronologique datée.
   */
  async parcours(userId: number, patientId: number, consultationId: number, role: 'infirmier' | 'doctor' = 'infirmier') {
    const agent = await this.agent(userId, role);

    const [c] = await this.db.query(
      `SELECT c.*,
              COALESCE(h.label, 'Hôpital') AS hopital,
              ps.libelle AS prestation, s.libelle AS service,
              pu.name AS patient_nom, pu.prenom AS patient_prenom, p.code_patient, p.gender, p.birth_date, p.img_url,
              du.name AS medecin_nom, du.prenom AS medecin_prenom,
              iu.name AS infirmier_nom, iu.prenom AS infirmier_prenom,
              cu.name AS caissiere_nom, cu.prenom AS caissiere_prenom,
              su.name AS secretaire_nom, su.prenom AS secretaire_prenom,
              a.code_admission, a.date_admission, a.created_at AS admission_creee, a.mode_entree, a.type_admission,
              a.motif_consultation AS motif_admission, a.montant AS admission_montant, a.statut_paiement,
              r.code AS registre_code, r.type_consultation, r.created_at AS registre_cree,
              r.issue_consultation, r.issue_consultation_justification,
              rc.motif_consultation AS motif_registre, rc.diagnostic_retenu, rc.examen_physique,
              rc.ta AS r_ta, rc.temperature AS r_temperature, rc.poids AS r_poids, rc.pouls AS r_pouls,
              rc.saturation_oxygene AS r_sat, rc.glycemie_a_jeun AS r_gly, rc.taille AS r_taille, rc.imc AS r_imc,
              rc.hta, rc.alcool, rc.tabac, rc.drepanocytaire, rc.traitement_medicamenteux_anterieur
         FROM consultations c
         JOIN patients p ON p.id = c.patient_id
         JOIN users pu ON pu.id = p.user_id
         LEFT JOIN hospitals h ON h.id = c.hospital_id
         LEFT JOIN prestation_hospitals ph ON ph.id = c.prestation_hospital_id
         LEFT JOIN prestation_services ps ON ps.id = ph.prestation_service_id
         LEFT JOIN service_hospitals sh ON sh.id = ph.service_hospital_id
         LEFT JOIN services s ON s.id = sh.service_id
         LEFT JOIN doctors d ON d.id = c.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         LEFT JOIN infirmiers i ON i.id = c.infirmier_id
         LEFT JOIN users iu ON iu.id = i.user_id
         LEFT JOIN admissions a ON a.id = c.admission_id
         LEFT JOIN caissieres ca ON ca.id = a.caissiere_id
         LEFT JOIN users cu ON cu.id = ca.user_id
         LEFT JOIN secretaires se ON se.id = a.secretaire_id
         LEFT JOIN users su ON su.id = se.user_id
         LEFT JOIN registres r ON r.id = (SELECT MAX(id) FROM registres WHERE consultation_id = c.id)
         LEFT JOIN registre_consultation_curatives rc ON rc.id = (SELECT MAX(id) FROM registre_consultation_curatives WHERE registre_id = r.id)
        WHERE c.id = ? AND c.patient_id = ? AND c.deleted_at IS NULL
        LIMIT 1`,
      [consultationId, patientId],
    );
    if (!c) throw new NotFoundException('Intervention introuvable.');

    const [ordonnances, examens, arrets, hospitalisations]: Ligne[][] = await Promise.all([
      this.db.query(
        `SELECT o.id, o.type, o.reference, o.created_at, pr.dosage, pr.quantity, pr.duration, dr.name AS medicament
           FROM ordonnances o
           LEFT JOIN prescriptions pr ON pr.ordonnance_id = o.id
           LEFT JOIN drugs dr ON dr.id = pr.drug_id
          WHERE o.consultation_id = ? AND o.deleted_at IS NULL
          ORDER BY o.id, pr.id`,
        [consultationId],
      ),
      this.db.query('SELECT code_bulletin, created_at FROM bulletin_examens WHERE consultation_id = ? ORDER BY id', [consultationId]),
      this.db.query('SELECT code, date_debut, date_fin, nb_jour, created_at FROM arret_travails WHERE consultation_id = ? ORDER BY id', [consultationId]),
      this.db.query(
        `SELECT code, date, end_date, number_days, motif, diagnostic, remark, mot_sortie, type, status, created_at
           FROM hospitalisations WHERE consultation_id = ? AND deleted_at IS NULL ORDER BY id`,
        [consultationId],
      ),
    ]);

    const ords = new Map<number, { type: string; reference: string | null; date: unknown; medicaments: { nom: string; posologie: string | null; quantite: string | null; duree: string | null }[] }>();
    for (const o of ordonnances) {
      const id = Number(o.id);
      if (!ords.has(id)) ords.set(id, { type: String(o.type ?? ''), reference: texte(o.reference), date: o.created_at, medicaments: [] });
      if (o.medicament) ords.get(id)!.medicaments.push({ nom: String(o.medicament), posologie: texte(o.dosage), quantite: texte(o.quantity), duree: texte(o.duration) });
    }

    const val = (a: unknown, b: unknown) => texte(a) ?? texte(b);
    // Laravel déduit aussi « en ligne » d'une absence d'admission ; ici il n'y a pas de caisse
    // (l'infirmier crée la consultation sans admission), on ne retient donc que le canal d'appel.
    const enLigne = !!c.call_channel;
    const medecin = nom(c.medecin_nom, c.medecin_prenom);
    const infirmier = nom(c.infirmier_nom, c.infirmier_prenom);
    const constantes = {
      poids: val(c.poids, c.r_poids),
      taille: val(c.taille, c.r_taille),
      imc: val(c.imc, c.r_imc),
      temperature: val(c.temperature, c.r_temperature),
      tension: val(c.tension_arterielle, c.r_ta),
      pouls: val(c.pouls, c.r_pouls),
      saturation: val(c.saturation_oxygene, c.r_sat),
      glycemie: val(c.gly_a_jeun, c.r_gly),
    };
    const constantesPrises = Object.values(constantes).some((v) => v !== null);
    const hosp = hospitalisations[0];
    const issueBrute = texte(c.issue_consultation);
    const issue = issueBrute && issueBrute !== 'En cours' ? issueBrute : null;
    const terminee =
      Number(c.status) === 1 || ['completed', 'ended', 'complete'].includes(String(c.call_status)) ||
      issue !== null || !!c.issue_consultation_justification ||
      ords.size > 0 || examens.length > 0 || arrets.length > 0 || hospitalisations.length > 0;

    // Frise chronologique : chaque étape, datée quand la base le permet
    type Etape = { cle: string; titre: string; detail: string | null; date: string | null; faite: boolean };
    const etapes: Etape[] = [];
    if (c.admission_id) {
      etapes.push({
        cle: 'admission',
        titre: 'Admission',
        detail: [texte(c.code_admission), texte(c.type_admission), texte(c.mode_entree)].filter(Boolean).join(' · ') || null,
        date: iso(c.date_admission) ?? iso(c.admission_creee),
        faite: true,
      });
    }
    etapes.push({
      cle: 'ouverture',
      titre: enLigne ? 'Demande de consultation en ligne' : 'Ouverture de la consultation',
      detail: [texte(c.prestation) ?? texte(c.service), texte(c.motif_consultation) ?? texte(c.motif_admission)].filter(Boolean).join(' · ') || null,
      date: iso(c.created_at),
      faite: true,
    });
    if (!enLigne || constantesPrises) {
      etapes.push({
        cle: 'constantes',
        titre: 'Prise des constantes',
        detail: constantesPrises ? (infirmier ? `par ${infirmier}` : null) : 'En attente',
        date: null,
        faite: constantesPrises,
      });
    }
    if (texte(c.orientation_infirmier)) {
      etapes.push({
        cle: 'orientation',
        titre: 'Orientation infirmière',
        detail: [texte(c.orientation_infirmier), texte(c.type_soins_infirmier)].filter(Boolean).join(' · '),
        date: null,
        faite: true,
      });
    }
    etapes.push({
      cle: 'medecin',
      titre: 'Consultation médicale',
      detail: medecin ? `Dr ${medecin.replace(/^dr\.?\s*/i, '')}` : 'En attente d’attribution',
      date: iso(c.registre_cree),
      faite: !!c.registre_cree || terminee,
    });
    for (const o of ords.values()) {
      etapes.push({ cle: 'ordonnance', titre: 'Ordonnance', detail: `${o.medicaments.length} médicament(s)${o.reference ? ` · ${o.reference}` : ''}`, date: iso(o.date), faite: true });
    }
    for (const b of examens) etapes.push({ cle: 'examen', titre: 'Bulletin d’examen', detail: texte(b.code_bulletin), date: iso(b.created_at), faite: true });
    for (const a of arrets) {
      etapes.push({ cle: 'arret', titre: 'Arrêt de travail', detail: [texte(a.code), a.nb_jour ? `${a.nb_jour} jour(s)` : null].filter(Boolean).join(' · ') || null, date: iso(a.created_at), faite: true });
    }
    for (const h of hospitalisations) {
      etapes.push({ cle: 'hospitalisation', titre: 'Hospitalisation', detail: [texte(h.code), texte(h.motif)].filter(Boolean).join(' · ') || null, date: iso(h.date) ?? iso(h.created_at), faite: true });
      if (h.end_date) etapes.push({ cle: 'sortie', titre: 'Sortie d’hospitalisation', detail: texte(h.mot_sortie), date: iso(h.end_date), faite: true });
    }
    etapes.push({
      cle: 'fin',
      titre: terminee ? 'Fin de l’intervention' : 'Intervention en cours',
      detail: issue ?? (terminee ? 'Standard' : 'En attente de clôture'),
      date: null,
      faite: terminee,
    });

    return {
      id: Number(c.id),
      code: texte(c.code_consultation) ?? `CONS-${c.id}`,
      date: c.created_at,
      hopital: String(c.hopital),
      service: texte(c.prestation) ?? texte(c.service) ?? 'Consultation générale',
      // Faite par l'infirmier·ère lui-même (« Consulter ») : lien vers le formulaire de consultation en lecture
      // Consultation de l'agent connecté : lien vers son formulaire de consultation (lecture)
      consultationDirecte: Number(role === 'doctor' ? c.doctor_id : c.infirmier_id) === agent.id,
      enLigne,
      urgence: Number(c.is_urgence) === 1,
      terminee,
      patient: {
        id: patientId,
        nom: nom(c.patient_nom, c.patient_prenom) ?? '—',
        code: texte(c.code_patient),
        genre: texte(c.gender),
        dateNaissance: texte(c.birth_date),
        imgUrl: texte(c.img_url),
      },
      equipe: {
        medecin,
        infirmier: infirmier ?? (enLigne ? 'Non applicable (consultation en ligne)' : 'Non attribué lors du tri'),
      },
      constantes,
      examen: {
        motif: texte(c.motif_consultation) ?? texte(c.motif_admission) ?? texte(c.motif_registre) ?? 'Non renseigné',
        examenPhysique: texte(c.examen_physique),
        diagnostic: texte(c.diagnostic_retenu) ?? texte(hosp?.diagnostic),
        observationInfirmiere: texte(c.observation_infirmiere),
      },
      ordonnances: [...ords.values()].map(({ date: _d, ...o }) => o),
      documents: { examen: examens.length > 0, arret: arrets.length > 0, hospitalisation: hospitalisations.length > 0 },
      issue: {
        libelle: issue ?? 'Standard',
        justification: texte(c.issue_consultation_justification) ?? texte(hosp?.remark),
      },
      registre: c.registre_code
        ? {
            code: String(c.registre_code),
            type: texte(c.type_consultation),
            antecedents: {
              hta: texte(c.hta),
              alcool: texte(c.alcool),
              tabac: texte(c.tabac),
              drepanocytose: texte(c.drepanocytaire),
              traitementsAnterieurs: texte(c.traitement_medicamenteux_anterieur),
            },
          }
        : null,
      etapes,
    };
  }
}
