import { CanActivate, ExecutionContext, Injectable, TooManyRequestsException } from '@nestjs/common'
import { RateLimitService } from './rate-limit.service'

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest()
    const path = req.path || req.url || ''

    // Skip healthchecks
    if (path.startsWith('/health')) return true

    const accountId = (req.query?.accountId as string) || (req.body?.accountId as string)
    const userId = req.user?.sub as string | undefined
    const key = accountId || userId || req.ip || 'global'

    if (!this.limiter.allow(key)) {
      throw new TooManyRequestsException('Rate limit exceeded')
    }

    return true
  }
}
