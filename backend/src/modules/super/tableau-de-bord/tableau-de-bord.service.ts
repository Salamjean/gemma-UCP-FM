import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { compterParMois, derniersMois, moisDeLAnnee } from '../../../common/statistiques';
import { HOPITAL_UCP, IDS_HOPITAUX_UCP } from '../../../common/ucp-fm';

/**
 * SUPER > TABLEAU DE BORD
 * Reprend exactement les calculs de Laravel :
 *  - cartes : resources/views/partials/dashboard/super.blade.php
 *  - graphiques : app/Repositories/Super/DashboardSuperRepository.php
 * Lecture seule. Espace d'administration UCP-FM : seuls les hôpitaux UCP-FM sont comptés.
 */
@Injectable()
export class TableauDeBordService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getDonnees() {
    const mois = derniersMois();
    const moisAnnee = moisDeLAnnee();
    const naissancesDe = (m: string[]) => compterParMois(this.db, 'declarations', m, `type = ? AND hospital_id IN ${IDS_HOPITAUX_UCP}`, ['birth']);
    const decesDe = (m: string[]) => compterParMois(this.db, 'declarations', m, `type = ? AND hospital_id IN ${IDS_HOPITAUX_UCP}`, ['death']);
    const consultationsDe = (m: string[]) => compterParMois(this.db, 'consultations', m, `hospital_id IN ${IDS_HOPITAUX_UCP}`);
    const [cartes, naissances, deces, consultations, naissancesA, decesA, consultationsA, parHopital] = await Promise.all([
      this.cartes(),
      naissancesDe(mois),
      decesDe(mois),
      consultationsDe(mois),
      naissancesDe(moisAnnee),
      decesDe(moisAnnee),
      consultationsDe(moisAnnee),
      this.parHopital(moisAnnee),
    ]);
    // `annee` : les 12 mois de l'année en cours, pour l'export Excel (les graphiques gardent les 10 derniers mois)
    return {
      cartes,
      mois,
      naissances,
      deces,
      consultations,
      annee: { mois: moisAnnee, naissances: naissancesA, deces: decesA, consultations: consultationsA },
      parHopital,
    };
  }

  /**
   * Export Excel : pour chaque mois de l'année, naissances et décès de CHAQUE hôpital DMHP
   * (0 si rien n'est déclaré). naissances[h][m] = hôpital h, mois m.
   */
  private async parHopital(mois: string[]) {
    const hopitaux: { id: number; label: string | null }[] = await this.db.query(
      'SELECT id, label FROM hospitals WHERE is_ucp_fm = 1 AND deleted_at IS NULL ORDER BY label',
    );
    const lignes: { hospital_id: number; mois: string; type: string; n: number }[] = await this.db.query(
      `SELECT hospital_id, DATE_FORMAT(created_at, '%Y-%m') AS mois, type, COUNT(*) AS n
         FROM declarations
        WHERE type IN ('birth', 'death') AND hospital_id IN ${IDS_HOPITAUX_UCP} AND DATE_FORMAT(created_at, '%Y-%m') IN (?)
        GROUP BY hospital_id, mois, type`,
      [mois],
    );
    const compte = (hopital: number, m: string, type: string) =>
      Number(lignes.find((l) => Number(l.hospital_id) === hopital && l.mois === m && l.type === type)?.n ?? 0);
    return {
      mois,
      hopitaux: hopitaux.map((h) => ({ id: Number(h.id), label: h.label ?? `Hôpital #${h.id}` })),
      naissances: hopitaux.map((h) => mois.map((m) => compte(Number(h.id), m, 'birth'))),
      deces: hopitaux.map((h) => mois.map((m) => compte(Number(h.id), m, 'death'))),
    };
  }

  /** Les 5 cartes du haut */
  private async cartes() {
    const [row] = await this.db.query(`
      SELECT
        (SELECT COUNT(*) FROM hospitals WHERE ${HOPITAL_UCP})                                         AS hopitaux,
        (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL AND hospital_id IN ${IDS_HOPITAUX_UCP}) AS patients,
        (SELECT COUNT(*) FROM consultations WHERE hospital_id IN ${IDS_HOPITAUX_UCP})                  AS consultations,
        (SELECT COUNT(*) FROM declarations WHERE type = 'birth' AND hospital_id IN ${IDS_HOPITAUX_UCP}) AS naissances,
        (SELECT COUNT(*) FROM declarations WHERE type = 'death' AND hospital_id IN ${IDS_HOPITAUX_UCP}) AS deces
    `);
    // Hospital et Patient utilisent SoftDeletes dans Laravel ; Consultation et Declaration non.
    return {
      hopitaux: Number(row.hopitaux),
      patients: Number(row.patients),
      consultations: Number(row.consultations),
      naissances: Number(row.naissances),
      deces: Number(row.deces),
    };
  }
}
