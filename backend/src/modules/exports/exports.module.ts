import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';

/** Traçabilité des exports Excel (journal d'audit) */
@Module({ controllers: [ExportsController] })
export class ExportsModule {}
