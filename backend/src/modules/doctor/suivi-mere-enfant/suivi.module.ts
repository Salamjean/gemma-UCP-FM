import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { SuiviMereEnfantController } from './suivi.controller';
import { SuiviMereEnfantService } from './suivi.service';

@Module({
  controllers: [SuiviMereEnfantController],
  providers: [SuiviMereEnfantService, RolesGuard],
})
export class DoctorSuiviMereEnfantModule {}
