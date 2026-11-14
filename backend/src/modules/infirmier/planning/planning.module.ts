import { Module } from '@nestjs/common';
import { InfirmierPlanningController } from './planning.controller';
import { InfirmierPlanningService } from './planning.service';

@Module({
  controllers: [InfirmierPlanningController],
  providers: [InfirmierPlanningService],
  exports: [InfirmierPlanningService],
})
export class InfirmierPlanningModule {}

