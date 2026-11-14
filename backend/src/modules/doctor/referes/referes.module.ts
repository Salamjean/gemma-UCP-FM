import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { DoctorConsultationsModule } from '../consultations/consultations.module';
import { DoctorReferesController } from './referes.controller';
import { DoctorReferesService } from './referes.service';

@Module({
  imports: [DoctorConsultationsModule],
  controllers: [DoctorReferesController],
  providers: [DoctorReferesService, RolesGuard],
})
export class DoctorReferesModule {}
