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

  // Lista de origens permitidas (CORS_ORIGINS separado por vírgula). Sem env => reflexivo.
  const envOrigins = process.env.CORS_ORIGINS || '';
  const allowedOrigins = envOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const isOriginAllowed = (origin?: string) => {
    if (!origin) return false;
    if (!allowedOrigins.length) return true; // reflexivo em dev
    return allowedOrigins.includes(origin);
  };

  // CORS fallback to ensure headers in all responses (including preflight).
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin as string | undefined;
    if (requestOrigin && isOriginAllowed(requestOrigin)) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin',
    );
    res.header(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, false);
      if (isOriginAllowed(origin)) return callback(null, origin);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    optionsSuccessStatus: 204,
    maxAge: 7200,
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
