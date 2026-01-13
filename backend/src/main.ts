import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PinoLogger } from './logger/pino-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new PinoLogger(),
  });

  app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', '1');
    next();
  });

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 7200,
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
