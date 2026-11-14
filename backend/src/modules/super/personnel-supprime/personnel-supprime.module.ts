import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { PersonnelSupprimeController } from './personnel-supprime.controller';
import { PersonnelSupprimeService } from './personnel-supprime.service';

@Module({
  controllers: [PersonnelSupprimeController],
  providers: [PersonnelSupprimeService, RolesGuard],
})
export class PersonnelSupprimeModule {}
