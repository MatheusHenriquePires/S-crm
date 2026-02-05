import { Module, Global } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PgBoss } = require('pg-boss');

@Global()
@Module({
  providers: [
    {
      provide: 'PG_BOSS',
      useFactory: async () => {
        const boss = new PgBoss(process.env.DATABASE_URL!);
        await boss.start();
        return boss;
      },
    },
  ],
  exports: ['PG_BOSS'],
})
export class QueueModule { }
