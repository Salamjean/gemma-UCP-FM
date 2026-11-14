import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Journal d'audit (audit_logs) disponible dans tous les modules : injecter AuditService */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
