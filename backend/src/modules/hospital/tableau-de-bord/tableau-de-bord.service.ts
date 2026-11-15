import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';
import { compterParMois, derniersMois, moisDeLAnnee } from '../../../common/statistiques';

/**
 * HÔPITAL > TABLEAU DE BORD
 * Reprend exactement les calculs de Laravel :
 *  - cartes : resources/views/partials/dashboard/hospital.blade.php
 *  - graphiques : app/Repositories/Hospital/DashboardHospitalRepository.php
 * Toutes les données sont limitées à l'hôpital de l'utilisateur connecté. Lecture seule.
 */
@Injectable()
export class HospitalTableauDeBordService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getDonnees(userId: number) {
    const hospitalId = await this.hospitalDe(userId);
    const mois = derniersMois();
    const moisAnnee = moisDeLAnnee();
    const naissancesDe = (m: string[]) => compterParMois(this.db, 'declarations', m, 'hospital_id = ? AND type = ?', [hospitalId, 'birth']);
    const decesDe = (m: string[]) => compterParMois(this.db, 'declarations', m, 'hospital_id = ? AND type = ?', [hospitalId, 'death']);
    const consultationsDe = (m: string[]) => compterParMois(this.db, 'consultations', m, 'hospital_id = ?', [hospitalId]);
    const [[h], cartes, naissances, deces, consultations, naissancesA, decesA, consultationsA] = await Promise.all([
      this.db.query('SELECT label FROM hospitals WHERE id = ? LIMIT 1', [hospitalId]) as Promise<{ label: string | null }[]>,
      this.cartes(hospitalId),
      naissancesDe(mois),
      decesDe(mois),
      consultationsDe(mois),
      naissancesDe(moisAnnee),
      decesDe(moisAnnee),
      consultationsDe(moisAnnee),
    ]);
    // `annee` : les 12 mois de l'année en cours, pour l'export Excel (les graphiques gardent les 10 derniers mois)
    return {
      /** Nom de l'hôpital (onglet « Par hôpital » de l'export : seulement cet hôpital) */
      hopital: h?.label ?? 'Hôpital',
      cartes,
      mois,
      naissances,
      deces,
      consultations,
      annee: { mois: moisAnnee, naissances: naissancesA, deces: decesA, consultations: consultationsA },
    };
  }

  private hospitalDe(userId: number): Promise<number> {
    return hopitalDuCompte(this.db, userId);
  }

  /** Les 3 cartes du haut (sans montant) */
  private async cartes(hospitalId: number) {
    const [row] = await this.db.query(
      `SELECT
         (SELECT COUNT(*) FROM consultations WHERE hospital_id = ?)                                  AS consultations,
         (SELECT COUNT(*) FROM declarations WHERE hospital_id = ? AND type = 'birth')                AS naissances,
         (SELECT COUNT(*) FROM declarations WHERE hospital_id = ? AND type = 'death')                AS deces`,
      [hospitalId, hospitalId, hospitalId],
    );
    return {
      consultations: Number(row.consultations),
      naissances: Number(row.naissances),
      deces: Number(row.deces),
    };
  }
}
