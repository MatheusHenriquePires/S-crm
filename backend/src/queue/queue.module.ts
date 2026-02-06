import { Module, Global } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PgBoss } = require('pg-boss');

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

        return boss;
      },
    },
  ],
  exports: ['PG_BOSS'],
})
export class QueueModule { }
