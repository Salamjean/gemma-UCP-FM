import { Module } from '@nestjs/common';
import { InfirmierConsultationsModule } from './consultations/consultations.module';
import { InfirmierPatientsModule } from './gestion-patients/patients.module';
import { InfirmierHospitalisationsModule } from './hospitalisations/hospitalisations.module';
import { InfirmierPermissionsModule } from './permissions/permissions.module';
import { InfirmierPlanningModule } from './planning/planning.module';
import { InfirmierTableauDeBordModule } from './tableau-de-bord/tableau-de-bord.module';
import { InfirmierTeleconsultationsModule } from './teleconsultations/teleconsultations.module';

/**
 * ESPACE INFIRMIER (rôle Laravel "infirmier").
 * Modules :
 *   tableau-de-bord/ ✔, gestion-patients/ ✔, consultations/ ✔, teleconsultations/ ✔,
 *   hospitalisations/ ✔, permissions/ ✔, planning/ ✔, soins-infirmier/
 */
@Module({
  imports: [
    InfirmierTableauDeBordModule,
    InfirmierPatientsModule,
    InfirmierConsultationsModule,
    InfirmierTeleconsultationsModule,
    InfirmierHospitalisationsModule,
    InfirmierPermissionsModule,
    InfirmierPlanningModule,
  ],
})
export class InfirmierModule {}
