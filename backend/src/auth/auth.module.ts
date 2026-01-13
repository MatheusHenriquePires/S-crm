import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { MetaController } from './meta.controller'
import { MetaAuthService } from './meta.service'

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_secret_change_me',
      // use numero em segundos para evitar treta de tipos
      signOptions: { expiresIn: 60 * 60 * 24 * 7 }, // 7 dias
    }),
  ],
  controllers: [AuthController, MetaController],
  providers: [AuthService, MetaAuthService],
  exports: [JwtModule],
})
export class AuthModule {}
