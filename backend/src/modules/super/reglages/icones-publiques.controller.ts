import { Controller, Get } from '@nestjs/common';
import { ReglagesService } from './reglages.service';

/**
 * Route PUBLIQUE (sans connexion) :
 *   GET /api/icones → logo, icône de chargement et favicon choisis dans Super > Réglages > Icônes
 * Le site en a besoin avant toute connexion (onglet du navigateur, loader, navbar, page de connexion).
 * Lecture seule : la modification reste réservée au super admin (reglages.controller.ts).
 */
@Controller('icones')
export class IconesPubliquesController {
  constructor(private readonly service: ReglagesService) {}

  @Get()
  getIcones() {
    return this.service.getIcones();
  }
}
