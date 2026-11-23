import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './common/audit/audit.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContactModule } from './modules/contact/contact.module';
import { DoctorModule } from './modules/doctor/doctor.module';
import { HospitalModule } from './modules/hospital/hospital.module';
import { InfirmierModule } from './modules/infirmier/infirmier.module';
import { RegulateurModule } from './modules/regulateur/regulateur.module';
import { ExportsModule } from './modules/exports/exports.module';
import { ProfilModule } from './modules/profil/profil.module';
import { SuperModule } from './modules/super/super.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Module racine.
 * - modules communs : auth, users, contact
 * - un module par utilisateur : super/, hospital/, doctor/, infirmier/ (chacun regroupe ses propres modules)
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // lit backend/.env
    // Limite de requêtes par IP, appliquée UNIQUEMENT aux routes publiques sensibles (@UseGuards(ThrottlerGuard)) :
    // connexion, mot de passe oublié, contact, lien d'invitation. Valeur par défaut : 20 requêtes / minute.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 20 }],
      errorMessage: 'Trop de tentatives. Veuillez patienter une minute avant de réessayer.',
    }),
    DatabaseModule, // base MySQL partagée avec Laravel
    AuditModule, // journal d'audit (audit_logs), disponible partout
    UsersModule,
    AuthModule,
    ContactModule,
    // Espaces par utilisateur
    SuperModule,
    HospitalModule,
    DoctorModule,
    InfirmierModule,
    RegulateurModule, // espace du régulateur (réattribution des patients)
    ExportsModule, // traçabilité des exports Excel
    ProfilModule, // « Mon profil » de chaque utilisateur
  ],
})
export class AppModule {}
