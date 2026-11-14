import { Module } from '@nestjs/common';
import { ChambresService } from './chambres.service';
import { HospitalisationController } from './hospitalisation.controller';
import { SuiviService } from './suivi.service';

@Module({
  controllers: [HospitalisationController],
  providers: [ChambresService, SuiviService],
})
export class HospitalHospitalisationModule {}
