import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  Param,
  Sse,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { interval, merge, map, of } from 'rxjs';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import { SendMessageSchema } from './whatsapp.validation';
import type { SendMessageDto } from './whatsapp.validation';

type ConnectRequest = {
  accountId: string;
};

type QrConnectRequest = {
  accountId: string;
  reset?: boolean;
};

type CloudConnectRequest = {
  accountId: string;
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  webhookUrl: string;
};

type OutboundMessageRequest = {
  accountId: string;
  body: string;
  replyToWamid?: string | null;
};

type ClassificationRequest = {
  accountId: string;
  classification?: string | null;
};

type StageRequest = {
  accountId: string;
  stage?: string | null;
};

type ValueRequest = {
  accountId: string;
  value?: string | null;
};

type CreateLeadRequest = {
  accountId: string;
  contactName: string;
  contactPhone?: string | null;
  stage?: string | null;
  value?: string | null;
  classification?: string | null;
};

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) { }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus(@Query('accountId') accountId: string) {
    this.whatsapp.ensureQrSocket(accountId);
    return this.whatsapp.getStatus(accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect/cloud')
  connectCloud(@Body() body: CloudConnectRequest) {
    return this.whatsapp.saveCloudCredentials(body.accountId, {
      accessToken: body.accessToken,
      phoneNumberId: body.phoneNumberId,
      verifyToken: body.verifyToken,
      webhookUrl: body.webhookUrl,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect/qr')
  async connectQr(@Body() body: QrConnectRequest) {
    const state = await this.whatsapp.startQr(body.accountId, {
      reset: body.reset,
    });
    return { state };
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect/confirm')
  confirm(@Body() body: ConnectRequest) {
    return this.whatsapp.markConnected(body.accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('connect/cloud/status')
  getCloudStatus(@Query('accountId') accountId: string) {
    return this.whatsapp.getCloudStatus(accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect/cloud/activate')
  activateCloud(@Body() body: ConnectRequest) {
    return this.whatsapp.activateCloud(body.accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect/cloud/auto')
  connectCloudAuto(@Body() body: ConnectRequest) {
    return this.whatsapp.connectCloudFromMeta(body.accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect/qr/disconnect')
  disconnectQr(@Body() body: ConnectRequest) {
    return this.whatsapp.disconnectQr(body.accountId);
  }

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode !== 'subscribe' || !token) {
      return res.sendStatus(403);
    }
    this.whatsapp
      .findIntegrationByVerifyToken(token)
      .then((match) => {
        if (match) {
          return res.status(200).send(challenge);
        }
        return res.sendStatus(403);
      })
      .catch(() => res.sendStatus(403));
  }

  @Post('webhook')
  async receiveWebhook(@Body() body: Record<string, any>) {
    const entry = Array.isArray(body.entry) ? body.entry[0] : null;
    const change = entry?.changes?.[0];
    const value = change?.value;
    const metadata = value?.metadata;
    const phoneNumberId = metadata?.phone_number_id;
    const messages = value?.messages;

    if (!phoneNumberId || !Array.isArray(messages) || !messages.length) {
      return { ok: true };
    }

    const match =
      await this.whatsapp.findIntegrationByPhoneNumberId(phoneNumberId);
    if (!match) {
      return { ok: true };
    }

    const message = messages[0];
    const contact = Array.isArray(value?.contacts) ? value.contacts[0] : null;
    const contactName = contact?.profile?.name ?? null;
    const contactPhone = message?.from ?? 'unknown';
    const textBody = message?.text?.body ?? '';
    const timestamp = message?.timestamp
      ? new Date(Number(message.timestamp) * 1000)
      : new Date();

    await this.whatsapp.saveInboundMessage({
      accountId: match.integration.accountId,
      contactPhone,
      contactName,
      body: textBody || '[mensagem nao suportada]',
      messageTimestamp: timestamp,
      rawPayload: JSON.stringify(message),
    });

    await this.whatsapp.activateCloud(match.integration.accountId);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversations')
  async listConversations(
    @Query('accountId') accountId: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? new Date(since) : null;
    const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : null;
    return this.whatsapp.listConversations(accountId, validSince);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pipeline')
  async listPipeline(@Query('accountId') accountId: string) {
    if (!accountId) return [];
    return this.whatsapp.listPipeline(accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversations/:conversationId/messages')
  async listMessages(
    @Query('accountId') accountId: string,
    @Param('conversationId') conversationId: string,
    @Query('since') since?: string,
  ) {
    if (!accountId || !conversationId) {
      return [];
    }
    const sinceDate = since ? new Date(since) : null;
    const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : null;
    return this.whatsapp.listMessagesForAccount(accountId, conversationId, validSince);
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversations/:conversationId/messages')
  @UsePipes(new ZodValidationPipe(SendMessageSchema))
  async sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() body: SendMessageDto,
  ) {
    return this.whatsapp.sendOutboundMessage(
      body.accountId,
      conversationId,
      body.body,
      body.replyToWamid ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversations/:conversationId/classification')
  async setClassification(
    @Param('conversationId') conversationId: string,
    @Body() body: ClassificationRequest,
  ) {
    return this.whatsapp.updateConversationClassification(
      body.accountId,
      conversationId,
      body.classification ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversations/:conversationId/stage')
  async setStage(
    @Param('conversationId') conversationId: string,
    @Body() body: StageRequest,
  ) {
    return this.whatsapp.updateConversationStage(
      body.accountId,
      conversationId,
      body.stage ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversations/:conversationId/value')
  async setValue(
    @Param('conversationId') conversationId: string,
    @Body() body: ValueRequest,
  ) {
    return this.whatsapp.updateConversationValue(
      body.accountId,
      conversationId,
      body.value ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('conversations')
  async createLead(@Body() body: CreateLeadRequest) {
    return this.whatsapp.createManualConversation({
      accountId: body.accountId,
      contactName: body.contactName,
      contactPhone: body.contactPhone,
      stage: body.stage ?? null,
      value: body.value ?? null,
      classification: body.classification ?? null,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversations/:conversationId/messages/:messageId/media')
  async getMessageMedia(
    @Query('accountId') accountId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Res() res: Response,
  ) {
    const media = await this.whatsapp.getMessageMedia(
      accountId,
      conversationId,
      messageId,
    );
    res.setHeader('Content-Type', media.mimetype || 'application/octet-stream');
    res.setHeader('Content-Length', media.buffer.length);
    res.setHeader('Content-Disposition', 'inline');
    res.send(media.buffer);
  }

  @Sse('stream')
  stream(@Query('accountId') accountId: string) {
    console.log('[sse] connect', { accountId });
    this.whatsapp.ensureQrSocket(accountId);
    const hello = of({ data: { type: 'connected', ts: Date.now() } });
    const heartbeats = interval(15000).pipe(
      map(() => ({ data: { type: 'ping', ts: Date.now() } })),
    );
    return merge(hello, this.whatsapp.stream(accountId), heartbeats);
  }
}
