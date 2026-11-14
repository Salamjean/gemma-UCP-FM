import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { DoctorConsultationsController } from './consultations.controller';
import { DoctorConsultationsService } from './consultations.service';
import { TeleconsultationExpertController } from './expert.controller';

@Module({
  controllers: [DoctorConsultationsController, TeleconsultationExpertController],
  providers: [DoctorConsultationsService, RolesGuard],
  exports: [DoctorConsultationsService],
})
export class DoctorConsultationsModule {}
