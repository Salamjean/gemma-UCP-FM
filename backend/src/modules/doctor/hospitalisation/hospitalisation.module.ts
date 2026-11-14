import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { DoctorConsultationsModule } from '../consultations/consultations.module';
import { DoctorHospitalisationController } from './hospitalisation.controller';
import { DoctorHospitalisationService } from './hospitalisation.service';

@Module({
  imports: [DoctorConsultationsModule],
  controllers: [DoctorHospitalisationController],
  providers: [DoctorHospitalisationService, RolesGuard],
})
export class DoctorHospitalisationModule {}
