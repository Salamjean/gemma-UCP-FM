import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hopitalDuCompte } from '../../../common/hopital-courant';
import { compterParMois, derniersMois } from '../../../common/statistiques';

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
    const [cartes, naissances, deces, consultations] = await Promise.all([
      this.cartes(hospitalId),
      compterParMois(this.db, 'declarations', mois, 'hospital_id = ? AND type = ?', [hospitalId, 'birth']),
      compterParMois(this.db, 'declarations', mois, 'hospital_id = ? AND type = ?', [hospitalId, 'death']),
      compterParMois(this.db, 'consultations', mois, 'hospital_id = ?', [hospitalId]),
    ]);
    return { cartes, mois, naissances, deces, consultations };
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
