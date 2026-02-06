import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt.guard';

import { QueueModule } from '../queue/queue.module';
import { WhatsappProcessor } from './whatsapp.processor';

@Module({
  imports: [JwtModule.register({}), AuthModule, QueueModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, JwtAuthGuard, WhatsappProcessor],
})
export class WhatsappModule {}
