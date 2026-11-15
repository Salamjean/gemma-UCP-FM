import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TablesFm1731400000000 } from './migrations/1731400000000-TablesFm';
import { OrdreDocumentsFm1731400000001 } from './migrations/1731400000001-OrdreDocumentsFm';
import { PersonnelSupprimeFm1731400000002 } from './migrations/1731400000002-PersonnelSupprimeFm';
import { RegulateursFm1731400000003 } from './migrations/1731400000003-RegulateursFm';
import { PermissionsRegulateursFm1731400000004 } from './migrations/1731400000004-PermissionsRegulateursFm';
import { ReinitialisationsFm1731400000005 } from './migrations/1731400000005-ReinitialisationsFm';

/** Migrations Gemma FM, dans l'ordre (ajouter ici chaque nouvelle migration) */
const MIGRATIONS_FM = [TablesFm1731400000000, OrdreDocumentsFm1731400000001, PersonnelSupprimeFm1731400000002, RegulateursFm1731400000003, PermissionsRegulateursFm1731400000004, ReinitialisationsFm1731400000005];

/**
 * CONNEXION À LA BASE MYSQL PARTAGÉE AVEC LE PROJET LARAVEL "gemma".
 * Accès : backend/.env (DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD)
 *
 * ⚠️ La structure des tables de Laravel appartient à Laravel (ses migrations) :
 *    synchronize reste désactivé, NestJS ne crée, ne modifie et ne supprime JAMAIS une table de Laravel.
 *
 * Tables propres à Gemma FM (préfixe « fm_ ») : créées au démarrage du backend par les migrations
 * de src/database/migrations (migrationsRun). Leur suivi est dans « fm_migrations »
 * (et non « migrations », qui est la table de Laravel).
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: Number(config.get('DB_PORT', 3306)),
        database: config.get<string>('DB_DATABASE', 'gemma'),
        username: config.get<string>('DB_USERNAME', 'root'),
        password: config.get<string>('DB_PASSWORD', ''),
        charset: 'utf8mb4',
        timezone: 'Z',
        autoLoadEntities: true,
        synchronize: false, // ne JAMAIS passer à true : modifierait les tables de Laravel
        // Migrations Gemma FM : uniquement les tables « fm_ », exécutées au démarrage
        migrations: MIGRATIONS_FM,
        migrationsRun: true,
        migrationsTableName: 'fm_migrations',
        migrationsTransactionMode: 'each',
        retryAttempts: 3,
      }),
    }),
  ],
})
export class DatabaseModule {}
