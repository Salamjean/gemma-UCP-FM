import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { HopitalController } from './hopital.controller';
import { HopitalService } from './hopital.service';

@Module({
  controllers: [HopitalController],
  providers: [HopitalService, RolesGuard],
})
export class HopitalModule {}
