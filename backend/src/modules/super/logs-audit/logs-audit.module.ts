import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { LogsAuditController } from './logs-audit.controller';
import { LogsAuditService } from './logs-audit.service';

@Module({
  controllers: [LogsAuditController],
  providers: [LogsAuditService, RolesGuard],
})
export class LogsAuditModule {}
