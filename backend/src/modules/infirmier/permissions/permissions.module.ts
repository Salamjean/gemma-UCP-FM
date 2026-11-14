import { Module } from '@nestjs/common';
import { InfirmierPermissionsController } from './permissions.controller';
import { InfirmierPermissionsService } from './permissions.service';

@Module({
  controllers: [InfirmierPermissionsController],
  providers: [InfirmierPermissionsService],
  exports: [InfirmierPermissionsService],
})
export class InfirmierPermissionsModule {}

