import { Module } from '@nestjs/common';
import { IconesPubliquesController } from './icones-publiques.controller';
import { ReglagesService } from './reglages.service';

@Module({
  // Espace UCP-FM : plus de modification des icônes ; seule la lecture publique (logo, loader, favicon) reste
  controllers: [IconesPubliquesController],
  providers: [ReglagesService],
  exports: [ReglagesService],
})
export class ReglagesModule {}

