import { Module } from '@nestjs/common';
import { RolesGuard } from '../../auth/roles.guard';
import { FcmService } from './fcm.service';
import { NotificationsPushController } from './notifications-push.controller';
import { NotificationsPushService } from './notifications-push.service';

@Module({
  controllers: [NotificationsPushController],
  providers: [NotificationsPushService, FcmService, RolesGuard],
})
export class NotificationsPushModule {}
