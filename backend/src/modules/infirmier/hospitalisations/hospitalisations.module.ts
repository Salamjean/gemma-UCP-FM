import { Module } from '@nestjs/common';
import { InfirmierHospitalisationsController } from './hospitalisations.controller';
import { InfirmierHospitalisationsService } from './hospitalisations.service';

@Module({
  controllers: [InfirmierHospitalisationsController],
  providers: [InfirmierHospitalisationsService],
  exports: [InfirmierHospitalisationsService],
})
export class InfirmierHospitalisationsModule {}

