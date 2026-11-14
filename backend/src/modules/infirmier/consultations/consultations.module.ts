import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { InfirmierConsultationsController } from './consultations.controller';
import { InfirmierConsultationsService } from './consultations.service';

@Module({
  controllers: [InfirmierConsultationsController],
  providers: [InfirmierConsultationsService, RolesGuard],
  exports: [InfirmierConsultationsService],
})
export class InfirmierConsultationsModule {}

