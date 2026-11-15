import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ReinitialisationService } from './reinitialisation.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      global: true, // JwtAuthGuard utilisable dans tous les modules
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, ReinitialisationService],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
