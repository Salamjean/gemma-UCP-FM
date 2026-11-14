import { Module } from '@nestjs/common';
import { AdminSeeder } from './admin.seeder';

/** Seeders exécutés au lancement du backend (données indispensables, idempotentes) */
@Module({ providers: [AdminSeeder] })
export class SeedersModule {}
