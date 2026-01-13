import { Body, Controller, Post } from '@nestjs/common'
import { AuthService } from './auth.service'
import { SignupAccountDto } from './dto/signup-account.dto'
import { SignupUserDto } from './dto/signup-user.dto'
import { LoginDto } from './dto/login.dto'

@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}

  @Post('signup/account')
  signupAccount(@Body() dto: SignupAccountDto) {
    return this.service.signupAccount(dto)
  }

  @Post('signup/user')
  signupUser(@Body() dto: SignupUserDto) {
    return this.service.signupUser(dto)
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.service.login(dto)
  }
}
