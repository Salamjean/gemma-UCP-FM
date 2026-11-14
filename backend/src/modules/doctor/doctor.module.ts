import { Module } from '@nestjs/common';
import { DoctorAgentModule } from './agent/agent.module';
import { DoctorConsultationsModule } from './consultations/consultations.module';
import { DoctorDeclarationsModule } from './declarations/declarations.module';
import { DoctorHospitalisationModule } from './hospitalisation/hospitalisation.module';
import { DoctorReferesModule } from './referes/referes.module';
import { DoctorSuiviMereEnfantModule } from './suivi-mere-enfant/suivi.module';

/**
 * ESPACE MÉDECIN / SAGE-FEMME (rôle Laravel "doctor").
 * Un dossier par module (même découpage que le menu) :
 *   consultations/ ✔ (avec le tableau de bord : GET /api/doctor/tableau-de-bord),
 *   hospitalisation/ ✔ (en attente de chambre, en cours, historique, lits, sortie),
 *   declarations/ ✔ (listes du médecin, fiches, enregistrement direct d'un décès),
 *   suivi-mere-enfant/ ✔ (suivi PTME prénatal de la mère et postnatal de l'enfant exposé)
 */
@Module({
  imports: [DoctorConsultationsModule, DoctorHospitalisationModule, DoctorReferesModule, DoctorAgentModule, DoctorDeclarationsModule, DoctorSuiviMereEnfantModule],
})
export class DoctorModule {}
