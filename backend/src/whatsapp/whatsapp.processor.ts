import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { PgBoss } from 'pg-boss';
import { WhatsappService } from './whatsapp.service';

@Injectable()
export class WhatsappProcessor implements OnModuleInit {
  constructor(
    @Inject('PG_BOSS') private readonly boss: PgBoss,
    private readonly whatsappService: WhatsappService,
  ) {}

  async onModuleInit() {
    const queues = ['incoming-message', 'outgoing-message'] as const;
    for (const q of queues) {
      try {
        await this.boss.createQueue(q);
      } catch (err) {
        console.error(`Failed to ensure queue ${q}`, err);
      }
    }

    try {
      await this.boss.work('incoming-message', async (jobs) => {
        const arr = Array.isArray(jobs) ? jobs : [jobs];
        for (const job of arr) {
          const { accountId, message } = (job?.data ?? {}) as {
            accountId: string;
            message: unknown;
          };
          await this.whatsappService.processIncomingMessage(accountId, message);
        }
      });
    } catch (err) {
      console.error('Failed to subscribe incoming-message', err);
    }

    try {
      await this.boss.work('outgoing-message', async (jobs) => {
        const arr = Array.isArray(jobs) ? jobs : [jobs];
        for (const job of arr) {
          const { accountId, conversationId, body, replyToWamid } = (job?.data ?? {}) as {
            accountId: string;
            conversationId: string;
            body: string;
            replyToWamid?: string | null;
          };
          try {
            await this.whatsappService.executeSendOutboundMessage(
              accountId,
              conversationId,
              body,
              replyToWamid,
            );
          } catch (err) {
            console.error('Failed to send outbound message', err);
            // pg-boss retries automatically if we throw
            throw err;
          }
        }
      });
    } catch (err) {
      console.error('Failed to subscribe outgoing-message', err);
    }
  }
}
