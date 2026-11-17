import { Module } from '@nestjs/common';
import { InfirmierAccueilService } from './accueil.service';
import { InfirmierDossierService } from './dossier.service';
import { InfirmierPatientsController } from './patients.controller';
import { InfirmierPatientsService } from './patients.service';

@Module({
  controllers: [InfirmierPatientsController],
  providers: [InfirmierPatientsService, InfirmierAccueilService, InfirmierDossierService],
  exports: [InfirmierPatientsService, InfirmierAccueilService, InfirmierDossierService],
})
export class InfirmierPatientsModule {}

