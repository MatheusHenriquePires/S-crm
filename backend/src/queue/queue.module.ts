import { Module, Global } from '@nestjs/common';
import { PgBoss } from 'pg-boss';

@Global()
@Module({
  providers: [
    {
      provide: 'PG_BOSS',
      useFactory: async () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error('DATABASE_URL is not set');
        }

        const boss = new PgBoss({
          connectionString,
          // Isola tabelas do boss para não colidir com schemas existentes
          schema: process.env.PG_BOSS_SCHEMA || 'pgboss',
        });

        try {
          await boss.start();
        } catch (err) {
          console.error('Falha ao iniciar PgBoss', err);
          throw err;
        }

        return boss as PgBoss;
      },
    },
  ],
  exports: ['PG_BOSS'],
})
export class QueueModule {}
