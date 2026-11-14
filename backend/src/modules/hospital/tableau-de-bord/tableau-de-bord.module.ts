import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { HospitalTableauDeBordController } from './tableau-de-bord.controller';
import { HospitalTableauDeBordService } from './tableau-de-bord.service';

@Module({
  controllers: [HospitalTableauDeBordController],
  providers: [HospitalTableauDeBordService, RolesGuard],
})
export class HospitalTableauDeBordModule {}
