import { Module } from '@nestjs/common';
import { HospitalAssurancesModule } from './assurances/assurances.module';
import { HospitalConsultationsModule } from './consultations/consultations.module';
import { HospitalDeclarationsModule } from './declarations/declarations.module';
import { HospitalHospitalisationModule } from './hospitalisation/hospitalisation.module';
import { HospitalPatientsModule } from './patients/patients.module';
import { HospitalPermissionsModule } from './permissions/permissions.module';
import { HospitalPersonnelSanteModule } from './personnel-sante/personnel-sante.module';
import { HospitalServicesModule } from './services/services.module';
import { HospitalSpecialitesModule } from './specialites-medicales/specialites.module';
import { HospitalTableauDeBordModule } from './tableau-de-bord/tableau-de-bord.module';

/**
 * ESPACE HÔPITAL (rôle Laravel "hospital").
 * Un dossier par module (même découpage que le menu) :
 *   tableau-de-bord/        ✅
 *   services/               ✅  services de l'hôpital + actes médicaux et prix
 *   assurances/             ✅  types d'assurance (taux de prise en charge)
 *   specialites-medicales/  ✅  spécialités des médecins (type_doctors)
 *   personnel-sante/        ✅  médecins, sages-femmes, infirmiers (comptes + planning)
 *   hospitalisation/        ✅  chambres & lits (gestion), hospitalisations & observations (suivi)
 *   permissions/            ✅  demandes d'absence du personnel (en attente / accordées / refusées)
 *   patients/               ✅  liste et fiche des patients
 *   consultations/          ✅  nouvelles consultations et historique
 *   declarations/           ✅  déclarations de naissances et de décès + certificats
 *   (Personnel administratif, Pharmacie, Recette et Comptabilité : retirés, hors du périmètre de ce projet)
 * Ajouter un module : créer son dossier ici, puis l'importer ci-dessous.
 * L'hôpital du compte connecté : common/hopital-courant.ts
 */
@Module({
  imports: [
    HospitalTableauDeBordModule,
    HospitalServicesModule,
    HospitalAssurancesModule,
    HospitalSpecialitesModule,
    HospitalPersonnelSanteModule,
    HospitalHospitalisationModule,
    HospitalPermissionsModule,
    HospitalPatientsModule,
    HospitalConsultationsModule,
    HospitalDeclarationsModule,
  ],
})
export class HospitalModule {}
