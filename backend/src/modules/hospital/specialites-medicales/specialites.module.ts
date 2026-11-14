import { Module } from '@nestjs/common';
import { SpecialitesController } from './specialites.controller';
import { SpecialitesService } from './specialites.service';

@Module({
  controllers: [SpecialitesController],
  providers: [SpecialitesService],
})
export class HospitalSpecialitesModule {}
