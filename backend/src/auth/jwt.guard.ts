import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers?.authorization || '';
    const headerToken = header.startsWith('Bearer ')
      ? header.split(' ')[1]
      : null;
    const queryToken = req.query?.token as string | undefined;
    const token = headerToken || queryToken;
    if (!token) throw new UnauthorizedException('Token ausente.');

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'dev_secret_change_me',
      });
      req.user = payload;

      // Se a rota tiver accountId (query/body), valida que é o mesmo do token
      const requestAccount =
        req.query?.accountId ||
        req.body?.accountId ||
        req.params?.accountId ||
        req.body?.account_id ||
        null;
      if (
        requestAccount &&
        String(requestAccount) !== String(payload.accountId)
      ) {
        throw new UnauthorizedException('Conta invalida para este token.');
      }

      return true;
    } catch {
      throw new UnauthorizedException('Token invalido.');
    }
  }
}
