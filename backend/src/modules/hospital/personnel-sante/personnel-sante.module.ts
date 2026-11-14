import { Module } from '@nestjs/common';
import { PersonnelSanteController } from './personnel-sante.controller';
import { PersonnelSanteService } from './personnel-sante.service';

@Module({
  controllers: [PersonnelSanteController],
  providers: [PersonnelSanteService],
})
export class HospitalPersonnelSanteModule {}
