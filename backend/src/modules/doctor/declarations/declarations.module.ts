import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { HospitalDeclarationsModule } from '../../hospital/declarations/declarations.module';
import { DoctorDeclarationsController } from './declarations.controller';
import { DoctorDeclarationsService } from './declarations.service';

@Module({
  imports: [HospitalDeclarationsModule],
  controllers: [DoctorDeclarationsController],
  providers: [DoctorDeclarationsService, RolesGuard],
})
export class DoctorDeclarationsModule {}
