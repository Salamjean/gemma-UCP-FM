import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { TableauDeBordController } from './tableau-de-bord.controller';
import { TableauDeBordService } from './tableau-de-bord.service';

@Module({
  controllers: [TableauDeBordController],
  providers: [TableauDeBordService, RolesGuard],
})
export class TableauDeBordModule {}
