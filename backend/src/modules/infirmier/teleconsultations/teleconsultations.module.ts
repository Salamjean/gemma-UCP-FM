import { Module } from '@nestjs/common';
import { InfirmierTeleconsultationsController } from './teleconsultations.controller';
import { InfirmierTeleconsultationsService } from './teleconsultations.service';

@Module({
  controllers: [InfirmierTeleconsultationsController],
  providers: [InfirmierTeleconsultationsService],
  exports: [InfirmierTeleconsultationsService],
})
export class InfirmierTeleconsultationsModule {}

