import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { InfirmierPatientsModule } from '../../infirmier/gestion-patients/patients.module';
import { InfirmierPermissionsModule } from '../../infirmier/permissions/permissions.module';
import { InfirmierPlanningModule } from '../../infirmier/planning/planning.module';
import { DoctorAgentController } from './agent.controller';

@Module({
  imports: [InfirmierPatientsModule, InfirmierPermissionsModule, InfirmierPlanningModule],
  controllers: [DoctorAgentController],
  providers: [RolesGuard],
})
export class DoctorAgentModule {}
