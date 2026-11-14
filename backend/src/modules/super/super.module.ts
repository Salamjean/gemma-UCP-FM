import { Module } from '@nestjs/common';
import { HopitalModule } from './hopital/hopital.module';
import { NotificationsPushModule } from './notifications-push/notifications-push.module';
import { PersonnelSupprimeModule } from './personnel-supprime/personnel-supprime.module';
import { ReglagesModule } from './reglages/reglages.module';
import { TableauDeBordModule } from './tableau-de-bord/tableau-de-bord.module';

/**
 * ESPACE SUPER ADMIN — regroupe tous les modules du super admin.
 * Un dossier par module (même découpage que le menu) :
 *   tableau-de-bord/     ✅
 *   hopital/             ✅ liste, modification, supervision (hôpitaux UCP-FM ; pas d'ajout, de statut ni de téléconsultation)
 *   reglages/            ✅ lecture publique des icônes seulement (plus de modification)
 *   notifications-push/  ✅ diffusions push + in-app (Firebase), relance, suppression
 *   personnel-supprime/  ✅ agents supprimés par les hôpitaux : réintégrer, changer d'hôpital, supprimer définitivement
 *   logs-audit/          retiré de l'espace UCP-FM (le journal d'audit continue d'être écrit)
 * Ajouter un module : créer son dossier ici, puis l'importer ci-dessous.
 */
@Module({
  imports: [TableauDeBordModule, HopitalModule, ReglagesModule, NotificationsPushModule, PersonnelSupprimeModule],
})
export class SuperModule {}
