import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { compterParMois, derniersMois } from '../../../common/statistiques';
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
    const [cartes, naissances, deces, consultations] = await Promise.all([
      this.cartes(),
      compterParMois(this.db, 'declarations', mois, `type = ? AND hospital_id IN ${IDS_HOPITAUX_UCP}`, ['birth']),
      compterParMois(this.db, 'declarations', mois, `type = ? AND hospital_id IN ${IDS_HOPITAUX_UCP}`, ['death']),
      compterParMois(this.db, 'consultations', mois, `hospital_id IN ${IDS_HOPITAUX_UCP}`),
    ]);
    return { cartes, mois, naissances, deces, consultations };
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
