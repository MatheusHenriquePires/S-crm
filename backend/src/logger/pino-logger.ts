import { LoggerService } from '@nestjs/common';
import pino from 'pino';

export class PinoLogger implements LoggerService {
  private readonly logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  log(message: any, ...optionalParams: any[]) {
    this.logger.info({ msg: message, extra: optionalParams });
  }

  error(message: any, trace?: string, ...optionalParams: any[]) {
    this.logger.error({ msg: message, trace, extra: optionalParams });
  }

  warn(message: any, ...optionalParams: any[]) {
    this.logger.warn({ msg: message, extra: optionalParams });
  }

  debug(message: any, ...optionalParams: any[]) {
    this.logger.debug({ msg: message, extra: optionalParams });
  }

  verbose(message: any, ...optionalParams: any[]) {
    this.logger.trace({ msg: message, extra: optionalParams });
  }
}
