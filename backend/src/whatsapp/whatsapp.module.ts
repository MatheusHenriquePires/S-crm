import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { WhatsappController } from './whatsapp.controller'
import { WhatsappService } from './whatsapp.service'
import { AuthModule } from '../auth/auth.module'
import { JwtAuthGuard } from '../auth/jwt.guard'

@Module({
  imports: [JwtModule.register({}), AuthModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, JwtAuthGuard],
})
export class WhatsappModule {}
