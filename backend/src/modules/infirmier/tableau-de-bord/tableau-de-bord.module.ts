import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { InfirmierTableauDeBordController } from './tableau-de-bord.controller';
import { InfirmierTableauDeBordService } from './tableau-de-bord.service';

@Module({
  controllers: [InfirmierTableauDeBordController],
  providers: [InfirmierTableauDeBordService, RolesGuard],
})
export class InfirmierTableauDeBordModule {}

