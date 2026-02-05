import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { WhatsappService } from './whatsapp.service';

@Injectable()
export class WhatsappProcessor implements OnModuleInit {
    constructor(
        @Inject('PG_BOSS') private readonly boss: any,
        private readonly whatsappService: WhatsappService,
    ) { }

    async onModuleInit() {
        await this.boss.subscribe('incoming-message', async (job) => {
            const { accountId, message } = job.data;
            await this.whatsappService.processIncomingMessage(accountId, message);
        });

        await this.boss.subscribe('outgoing-message', async (job) => {
            const { accountId, conversationId, body, replyToWamid } = job.data;
            try {
                await this.whatsappService.executeSendOutboundMessage(
                    accountId,
                    conversationId,
                    body,
                    replyToWamid
                );
            } catch (err) {
                console.error('Failed to send outbound message', err);
                // pg-boss retries automatically if we throw
                throw err;
            }
        });
    }
}
