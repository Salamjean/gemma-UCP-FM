import { Module } from '@nestjs/common';
import { InfirmierConsultationsModule } from '../../infirmier/consultations/consultations.module';
import { InfirmierPatientsModule } from '../../infirmier/gestion-patients/patients.module';
import { RolesGuard } from '../../auth/roles.guard';
import { DoctorConsultationsController } from './consultations.controller';
import { DoctorConsultationsService } from './consultations.service';
import { ProgrammationTelemedecineService } from './programmation.service';
import { TeleconsultationExpertController } from './expert.controller';
import { InfirmierConsultationMedicaleController } from './infirmier-consultation.controller';

@Module({
  // Télémédecine : hôpitaux et médecins disponibles (même recherche que la prise de constantes)
  // + ouverture de la consultation (« Consulter ») pour la programmation directe de télémédecine
  imports: [InfirmierConsultationsModule, InfirmierPatientsModule],
  controllers: [DoctorConsultationsController, TeleconsultationExpertController, InfirmierConsultationMedicaleController],
  providers: [DoctorConsultationsService, ProgrammationTelemedecineService, RolesGuard],
  exports: [DoctorConsultationsService],
})
export class DoctorConsultationsModule {}
