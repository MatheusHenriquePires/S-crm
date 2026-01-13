import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { RateLimitService } from './common/rate-limit.service';
import { RateLimitGuard } from './common/rate-limit.guard';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule, WhatsappModule],
  controllers: [HealthController],
  providers: [
    RateLimitService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
