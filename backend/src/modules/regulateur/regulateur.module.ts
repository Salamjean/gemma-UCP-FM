import { Module } from '@nestjs/common';
import { RegulateurController } from './regulateur.controller';
import { RegulateurAgendaService } from './regulateur-agenda.service';
import { RegulateurService } from './regulateur.service';

/** Espace du régulateur (rôle Gemma FM « regulateur ») */
@Module({
  controllers: [RegulateurController],
  providers: [RegulateurService, RegulateurAgendaService],
})
export class RegulateurModule {}
