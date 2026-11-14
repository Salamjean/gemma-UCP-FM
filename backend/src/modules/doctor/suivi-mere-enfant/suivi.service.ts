import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { agentDuCompte } from '../../../common/agent-sante';
import { laravelNow } from '../../../common/laravel';
import { SuiviPostnatalDto, SuiviPrenatalDto } from './suivi.dto';

type Ligne = Record<string, unknown>;
export type TypeSuivi = 'prenatale' | 'postnatale';

const texte = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v));
/** Date SQL → « AAAA-MM-JJ » */
const jour = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : texte(v)?.slice(0, 10) ?? null);
const nom = (a: unknown, b: unknown) => `${(a as string) ?? ''} ${(b as string) ?? ''}`.trim();

/** Âge depuis « JJ/MM/AAAA » (format Laravel) : « 2 mois », « 3 ans »… */
function age(naissance: unknown) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(naissance ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const n = new Date();
  let mois = (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth();
  if (n.getDate() < d.getDate()) mois--;
  if (mois < 0) return null;
  if (mois < 1) return `${Math.max(Math.floor((n.getTime() - d.getTime()) / 86400000), 0)} jour(s)`;
  if (mois < 24) return `${mois} mois`;
  return `${Math.floor(mois / 12)} ans`;
}

/**
 * MÉDECIN / SAGE-FEMME > SUIVI MÈRE-ENFANT (PTME), comme Laravel Doctor\Maternite\SuivieController
 *   - prénatal : la mère (patiente sans mère_id, de sexe féminin) ;
 *   - postnatal : l'enfant exposé (patient rattaché à sa mère) — son nom et ses prénoms peuvent être complétés.
 * Table suivie_mere_enfants (MyISAM) : tout est vérifié avant l'écriture.
 */
@Injectable()
export class SuiviMereEnfantService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private async agent(userId: number) {
    const a = await agentDuCompte(this.db, userId);
    if (a.role !== 'doctor') throw new ForbiddenException('Réservé aux médecins et sages-femmes.');
    return a;
  }

  /** Condition SQL du type de suivi (Laravel : prénatal = femme sans mère ; postnatal = enfant rattaché à une mère) */
  private filtre(type: TypeSuivi) {
    return type === 'prenatale' ? "p.mere_id IS NULL AND p.gender = 'feminin'" : 'p.mere_id IS NOT NULL';
  }

  /** Recherche (n° de dossier, nom et prénoms ou téléphone), 10 résultats */
  async rechercher(userId: number, type: TypeSuivi, q: string) {
    await this.agent(userId);
    const s = (q ?? '').trim();
    if (s.length < 2) return [];
    const mots = s.split(/\s+/).slice(0, 4);
    const conditions = mots
      .map(() => "(p.code_patient LIKE ? OR p.telephone LIKE ? OR CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.prenom, '')) LIKE ? OR mu.name LIKE ?)")
      .join(' AND ');
    const rows: Ligne[] = await this.db.query(
      `SELECT p.id, p.code_patient, p.gender, p.birth_date, u.name, u.prenom, mu.name AS mere_nom, mu.prenom AS mere_prenom, m.code_patient AS mere_code,
              (SELECT COUNT(*) FROM suivie_mere_enfants s WHERE s.patient_id = p.id AND s.type_suivie = ?) AS nb_suivis
         FROM patients p JOIN users u ON u.id = p.user_id
         LEFT JOIN patients m ON m.id = p.mere_id LEFT JOIN users mu ON mu.id = m.user_id
        WHERE p.deleted_at IS NULL AND ${this.filtre(type)} AND ${conditions}
        ORDER BY u.name, u.prenom LIMIT 10`,
      [type, ...mots.flatMap((m) => Array(4).fill(`%${m}%`))],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      code: texte(r.code_patient) ?? '—',
      nom: nom(r.name, r.prenom),
      dateNaissance: texte(r.birth_date),
      age: age(r.birth_date),
      genre: texte(r.gender),
      mere: r.mere_code ? { nom: nom(r.mere_nom, r.mere_prenom), code: texte(r.mere_code) } : null,
      nbSuivis: Number(r.nb_suivis ?? 0),
    }));
  }

  /** Dossier du suivi : patient (+ mère pour un enfant) et historique des visites */
  async dossier(userId: number, type: TypeSuivi, patientId: number) {
    await this.agent(userId);
    const [p] = await this.db.query(
      `SELECT p.id, p.code_patient, p.gender, p.birth_date, p.telephone, u.name, u.prenom,
              mu.name AS mere_nom, mu.prenom AS mere_prenom, m.code_patient AS mere_code, m.birth_date AS mere_naissance
         FROM patients p JOIN users u ON u.id = p.user_id
         LEFT JOIN patients m ON m.id = p.mere_id LEFT JOIN users mu ON mu.id = m.user_id
        WHERE p.id = ? AND p.deleted_at IS NULL AND ${this.filtre(type)} LIMIT 1`,
      [patientId],
    );
    if (!p) {
      throw new NotFoundException(type === 'prenatale' ? 'Patiente introuvable : le suivi prénatal concerne une femme (pas un enfant).' : 'Enfant introuvable : le suivi postnatal concerne un enfant rattaché à sa mère.');
    }
    const suivis: Ligne[] = await this.db.query('SELECT * FROM suivie_mere_enfants WHERE patient_id = ? AND type_suivie = ? ORDER BY COALESCE(date_visite, date_visite_postnatale) DESC, id DESC', [
      patientId,
      type,
    ]);
    return {
      type,
      patient: {
        id: Number(p.id),
        code: texte(p.code_patient) ?? '—',
        nom: texte(p.name) ?? '',
        prenom: texte(p.prenom) ?? '',
        dateNaissance: texte(p.birth_date),
        age: age(p.birth_date),
        genre: texte(p.gender),
        telephone: texte(p.telephone),
        /** Nouveau-né enregistré à la naissance (« NOUVEAU-NÉ DE … ») : nom et prénoms à compléter */
        nomProvisoire: /^nouveau-n/i.test(String(p.name ?? '')),
      },
      mere: p.mere_code ? { nom: nom(p.mere_nom, p.mere_prenom), code: texte(p.mere_code), age: age(p.mere_naissance) } : null,
      suivis: suivis.map((s) =>
        type === 'prenatale'
          ? {
              id: Number(s.id),
              creeLe: s.created_at,
              dateVisite: jour(s.date_visite),
              ageGestationnel: texte(s.age_gestationnel),
              statutArv: texte(s.statut_arv),
              dateInitiationArv: jour(s.date_initiation_arv),
              mereSousArv: texte(s.mere_sous_arv),
              cotrimoxazole: texte(s.cotrimoxazole),
              prelevementChargeVirale: texte(s.prelevement_charge_virale),
              resultatChargeVirale: texte(s.resultat_charge_virale),
              datePrelevementVirale: jour(s.date_de_prelevement_virale),
              dateReceptionResultat: jour(s.date_de_reception_resultat),
              depistageVihConjoint: texte(s.depistage_vih_conjoint),
              resultatVihConjoint: texte(s.resultat_vih_conjoint),
              dateDepistageVihConjoint: jour(s.date_depistage_vih_conjoint),
              porteEntree: texte(s.porte_entree),
              typeVih: texte(s.type_vih),
              dateProbableAccouchement: jour(s.date_probable_accouchement),
              issueGrossesse: texte(s.issue_de_la_grossesse),
              accouchementGemellaire: texte(s.accouchement_gemellaire),
              contraceptionModerne: texte(s.methode_de_contraception_moderne),
            }
          : {
              id: Number(s.id),
              creeLe: s.created_at,
              prophylaxieArvEnfant: texte(s.prophylaxie_arv_enfant),
              dateRemise: jour(s.date_de_remise),
              dateVisite: jour(s.date_visite_postnatale),
              ageVisite: texte(s.age_au_moment_de_la_visite),
              typeAlimentation: texte(s.type_alimentation),
              pcr: [1, 2, 3].map((n) => {
                const suf = n === 1 ? '1er' : `${n}e`;
                return {
                  numero: n,
                  date: jour(s[`date_de_prelevement_${suf}_pcr`]),
                  age: texte(s[`age_au_moment_de_prelevement_${suf}_pcr`]),
                  resultat: texte(s[`resultat_${suf}_pcr`]),
                  annonce: texte(s[`annonce_resultat_parent_${suf}_pcr`]),
                  dateAnnonce: jour(s[`date_annonce_${suf}_pcr`]),
                };
              }),
              sousCtx: texte(s.enfant_sous_ctx),
              ctxDate: jour(s.date_initiation_ctx),
              ctxAge: texte(s.age_initiation_ctx),
              sousInh: texte(s.enfant_sous_inh),
              inhDate: jour(s.date_initiation_inh),
              inhAge: texte(s.age_initiation_inh),
              serologies: [
                { numero: 1, date: jour(s.date_de_prelevement_vih), age: texte(s.age_au_moment_du_test), resultat: texte(s.resultat_du_test), annonce: texte(s.annonce_du_test), dateAnnonce: jour(s.date_annonce_du_test) },
                { numero: 2, date: jour(s.date_de_prelevement_vih2), age: texte(s.age_au_moment_du_test2), resultat: texte(s.resultat_du_test2), annonce: texte(s.annonce_du_test2), dateAnnonce: jour(s.date_annonce_du_test2) },
              ],
              resultatFinal: texte(s.resultat_final_du_suivi),
              siteTransfert: texte(s.site_de_transfert),
              dateStatutFinal: jour(s.date_du_statut_final),
            },
      ),
    };
  }

  private pasDansLeFutur(...dates: (string | undefined)[]) {
    const demain = Date.now() + 86400000;
    if (dates.some((d) => d && new Date(`${d}T12:00:00`).getTime() > demain)) throw new BadRequestException('Une date ne peut pas être dans le futur.');
  }

  /** Enregistrement d'une visite de suivi prénatal */
  async prenatal(userId: number, dto: SuiviPrenatalDto) {
    await this.agent(userId);
    await this.dossier(userId, 'prenatale', dto.patientId); // la patiente existe et est bien une femme
    this.pasDansLeFutur(dto.dateVisite, dto.dateInitiationArv, dto.datePrelevementVirale, dto.dateReceptionResultat, dto.dateDepistageVihConjoint);
    const cv = dto.prelevementChargeVirale === 'Oui';
    const conjoint = dto.depistageVihConjoint === 'Oui';
    const now = laravelNow();
    const r = await this.db.query(
      `INSERT INTO suivie_mere_enfants (type_suivie, patient_id, date_visite, age_gestationnel, statut_arv, date_initiation_arv, mere_sous_arv, cotrimoxazole,
              prelevement_charge_virale, resultat_charge_virale, date_de_prelevement_virale, date_de_reception_resultat,
              depistage_vih_conjoint, resultat_vih_conjoint, date_depistage_vih_conjoint, porte_entree, type_vih, date_probable_accouchement,
              issue_de_la_grossesse, accouchement_gemellaire, methode_de_contraception_moderne, created_at, updated_at)
       VALUES ('prenatale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.patientId,
        dto.dateVisite,
        dto.ageGestationnel.trim(),
        dto.statutArv,
        dto.dateInitiationArv,
        dto.mereSousArv,
        dto.cotrimoxazole,
        dto.prelevementChargeVirale,
        cv ? dto.resultatChargeVirale?.trim() : null,
        cv ? dto.datePrelevementVirale : null,
        cv ? dto.dateReceptionResultat : null,
        dto.depistageVihConjoint,
        conjoint ? dto.resultatVihConjoint : null,
        conjoint ? dto.dateDepistageVihConjoint : null,
        dto.porteEntree,
        dto.typeVih,
        dto.dateProbableAccouchement,
        dto.issueGrossesse,
        dto.accouchementGemellaire,
        dto.contraceptionModerne,
        now,
        now,
      ],
    );
    return { success: true, message: 'Suivi prénatal enregistré avec succès.', id: Number(r.insertId) };
  }

  /** Enregistrement d'une visite de suivi postnatal (enfant exposé) */
  async postnatal(userId: number, dto: SuiviPostnatalDto) {
    await this.agent(userId);
    const { patient } = await this.dossier(userId, 'postnatale', dto.enfantId); // l'enfant existe et est rattaché à sa mère
    this.pasDansLeFutur(dto.dateVisite, dto.dateRemise, dto.pcr1Date, dto.pcr2Date, dto.pcr3Date, dto.sero1Date, dto.sero2Date, dto.ctxDate, dto.inhDate, dto.dateStatutFinal);
    const now = laravelNow();
    const si = (cond: boolean, v: string | undefined) => (cond ? (v?.trim() ?? null) : null);

    // Nom et prénoms de l'enfant : mis à jour si les deux sont renseignés (comme Laravel)
    const nomEnfant = dto.nomEnfant?.trim();
    const prenomEnfant = dto.prenomEnfant?.trim();
    if (nomEnfant && prenomEnfant) {
      const [e] = await this.db.query('SELECT user_id FROM patients WHERE id = ?', [patient.id]);
      await this.db.query('UPDATE users SET name = ?, prenom = ?, updated_at = ? WHERE id = ?', [nomEnfant, prenomEnfant, now, e.user_id]);
    }

    const r = await this.db.query(
      `INSERT INTO suivie_mere_enfants (type_suivie, patient_id, prophylaxie_arv_enfant, date_de_remise, date_visite_postnatale, age_au_moment_de_la_visite, type_alimentation,
              date_de_prelevement_1er_pcr, age_au_moment_de_prelevement_1er_pcr, resultat_1er_pcr, annonce_resultat_parent_1er_pcr, date_annonce_1er_pcr,
              date_de_prelevement_2e_pcr, age_au_moment_de_prelevement_2e_pcr, resultat_2e_pcr, annonce_resultat_parent_2e_pcr, date_annonce_2e_pcr,
              date_de_prelevement_3e_pcr, age_au_moment_de_prelevement_3e_pcr, resultat_3e_pcr, annonce_resultat_parent_3e_pcr, date_annonce_3e_pcr,
              enfant_sous_ctx, date_initiation_ctx, age_initiation_ctx, enfant_sous_inh, date_initiation_inh, age_initiation_inh,
              date_de_prelevement_vih, age_au_moment_du_test, resultat_du_test, annonce_du_test, date_annonce_du_test,
              date_de_prelevement_vih2, age_au_moment_du_test2, resultat_du_test2, annonce_du_test2, date_annonce_du_test2,
              resultat_final_du_suivi, site_de_transfert, date_du_statut_final, created_at, updated_at)
       VALUES ('postnatale', ${Array(42).fill('?').join(', ')})`,
      [
        dto.enfantId,
        dto.prophylaxieArvEnfant,
        si(dto.prophylaxieArvEnfant === 'Oui', dto.dateRemise),
        dto.dateVisite,
        dto.ageVisite.trim(),
        dto.typeAlimentation,
        dto.pcr1Date,
        dto.pcr1Age.trim(),
        dto.pcr1Resultat,
        dto.pcr1Annonce,
        si(dto.pcr1Annonce === 'Oui', dto.pcr1DateAnnonce),
        dto.pcr2Date,
        dto.pcr2Age.trim(),
        dto.pcr2Resultat,
        dto.pcr2Annonce,
        si(dto.pcr2Annonce === 'Oui', dto.pcr2DateAnnonce),
        dto.pcr3Date,
        dto.pcr3Age.trim(),
        dto.pcr3Resultat,
        dto.pcr3Annonce,
        si(dto.pcr3Annonce === 'Oui', dto.pcr3DateAnnonce),
        dto.sousCtx,
        si(dto.sousCtx === 'Oui', dto.ctxDate),
        si(dto.sousCtx === 'Oui', dto.ctxAge),
        dto.sousInh,
        si(dto.sousInh === 'Oui', dto.inhDate),
        si(dto.sousInh === 'Oui', dto.inhAge),
        dto.sero1Date,
        dto.sero1Age.trim(),
        dto.sero1Resultat,
        dto.sero1Annonce,
        si(dto.sero1Annonce === 'Oui', dto.sero1DateAnnonce),
        dto.sero2Date,
        dto.sero2Age.trim(),
        dto.sero2Resultat,
        dto.sero2Annonce,
        si(dto.sero2Annonce === 'Oui', dto.sero2DateAnnonce),
        dto.resultatFinal,
        texte(dto.siteTransfert?.trim()),
        dto.dateStatutFinal ?? null,
        now,
        now,
      ],
    );
    return {
      success: true,
      message: `Suivi postnatal enregistré avec succès${nomEnfant && prenomEnfant ? ` (enfant : ${nomEnfant} ${prenomEnfant})` : ''}.`,
      id: Number(r.insertId),
    };
  }
}
