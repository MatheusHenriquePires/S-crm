import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { MetaAuthService } from './meta.service';

@Controller('auth/meta')
export class MetaController {
  constructor(
    private readonly meta: MetaAuthService,
    private readonly auth: AuthService,
  ) {}

  @Get('url')
  getUrl(@Query('returnUrl') returnUrl?: string) {
    return { url: this.meta.buildLoginUrl(returnUrl) };
  }

  @Get('status')
  async getStatus() {
    return this.meta.getAppStatus();
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.status(400).send('Missing code');
    }

    const result = await this.meta.exchangeCode(code);
    const user = await this.meta.getUserProfile(result.access_token);
    const { accountId, userId } = await this.meta.upsertAccountAndUser(user);
    await this.meta.saveIntegration(accountId, user.id, result.access_token);

    const token = await this.auth.signToken(userId, accountId, 'ADMIN');
    const redirectBase = this.meta.resolveReturnUrl(state);
    const redirect = `${redirectBase}/auth/facebook/callback?token=${encodeURIComponent(
      token,
    )}&accountId=${encodeURIComponent(accountId)}`;
    return res.redirect(redirect);
  }
}
