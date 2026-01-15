import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import wppconnect = require('@wppconnect-team/wppconnect');
import pino from 'pino';
import { and, desc, eq, gt, lt } from 'drizzle-orm';
import { Subject } from 'rxjs';
import { db } from '../db/db';
import {
  getConversationsTable,
  getMessagesTable,
  getWhatsappIntegrationsTable,
} from '../db/tables';
import { decryptPayload, encryptPayload } from './crypto';
import { createId } from '@paralleldrive/cuid2';
import { metaIntegrations } from '../db/schema';

type ConnectionType = 'cloud' | 'qr';
type ConnectionStatus = 'disconnected' | 'pending' | 'connected';

type ConnectionState = {
  status: ConnectionStatus;
  type: ConnectionType | null;
  lastUpdatedAt: number;
  qrCode?: string;
  lastError?: string;
};

type CloudCredentials = {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  webhookUrl: string;
};

@Injectable()
export class WhatsappService {
  private readonly connections = new Map<string, ConnectionState>();
  private readonly sockets = new Map<string, any>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly streams = new Map<string, Subject<MessageEvent>>();
  private readonly decryptFailures = new Map<
    string,
    { count: number; lastAt: number }
  >();
  private readonly resetInFlight = new Set<string>();
  private readonly historyProcessed = new Set<string>();
  private readonly startPromises = new Map<string, Promise<ConnectionState>>();
  private readonly recentMessageIds = new Map<string, Map<string, number>>();
  private readonly historyProcessing = new Set<string>();
  private tablesPromise:
    | Promise<{
        conversations: any;
        messages: any;
        integrations: any;
      }>
    | null = null;

  private async getTables() {
    if (!this.tablesPromise) {
      this.tablesPromise = Promise.all([
        getConversationsTable(),
        getMessagesTable(),
        getWhatsappIntegrationsTable(),
      ]).then(([conversations, messages, integrations]) => ({
        conversations,
        messages,
        integrations,
      }));
    }
    return this.tablesPromise;
  }

  private mapAckToStatus(ack: number) {
    if (ack >= 4) return 'played';
    if (ack >= 3) return 'read';
    if (ack >= 2) return 'delivered';
    if (ack >= 1) return 'sent';
    return 'pending';
  }

  private cleanupSocket(accountId: string) {
    const sock = this.sockets.get(accountId);
    if (sock) {
      try {
        if (typeof sock.logout === 'function') {
          sock.logout();
        }
        if (typeof sock.close === 'function') {
          sock.close();
        }
      } catch {
        // ignore cleanup errors
      }
      this.sockets.delete(accountId);
    }
  }

  private registerDecryptFailure(accountId: string) {
    const now = Date.now();
    const existing = this.decryptFailures.get(accountId);
    if (!existing) {
      this.decryptFailures.set(accountId, { count: 1, lastAt: now });
      return;
    }
    const withinWindow = now - existing.lastAt < 30000;
    const nextCount = withinWindow ? existing.count + 1 : 1;
    this.decryptFailures.set(accountId, { count: nextCount, lastAt: now });
    if (nextCount >= 5 && !this.resetInFlight.has(accountId)) {
      this.resetInFlight.add(accountId);
      this.emitEvent(accountId, {
        type: 'qr_required',
        reason: 'decrypt_failed',
      });
      this.startQr(accountId, { reset: true })
        .catch(() => {
          // ignore auto-reset errors
        })
        .finally(() => {
          this.resetInFlight.delete(accountId);
        });
    }
  }

  ensureQrSocket(accountId: string) {
    if (this.sockets.has(accountId)) return;
    if (this.resetInFlight.has(accountId)) return;
    if (this.startPromises.has(accountId)) return;
    const sessionDir = path.join(process.cwd(), '.wppconnect', accountId);
    if (!fs.existsSync(sessionDir)) return;
    this.startQr(accountId).catch(() => {
      // ignore auto-connect errors
    });
  }

  private ensureStream(accountId: string) {
    const existing = this.streams.get(accountId);
    if (existing) return existing;
    const next = new Subject<MessageEvent>();
    this.streams.set(accountId, next);
    return next;
  }

  stream(accountId: string) {
    return this.ensureStream(accountId).asObservable();
  }

  private emitEvent(accountId: string, data: Record<string, any>) {
    const stream = this.streams.get(accountId);
    if (!stream) return;
    stream.next({ data });
  }

  private safeStringify(value: unknown) {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'bigint') return val.toString();
      if (
        val &&
        typeof val === 'object' &&
        typeof (val as { toNumber?: () => number }).toNumber === 'function'
      ) {
        const asNumber = (val as { toNumber: () => number }).toNumber();
        if (!Number.isNaN(asNumber)) return asNumber;
      }
      return val;
    });
  }

  private normalizeContact(value: string) {
    return value.replace(/@.+$/, '').replace(/\D/g, '');
  }

  private buildContactJid(contactPhone: string) {
    if (contactPhone.includes('@')) return contactPhone;
    const normalized = this.normalizeContact(contactPhone);
    return normalized ? `${normalized}@c.us` : contactPhone;
  }

  private sanitizeContactPhone(value: string) {
    const normalized = this.normalizeContact(value);
    return normalized || value;
  }

  private async fetchContactPhoto(accountId: string, contactJid: string) {
    const sock = this.sockets.get(accountId);
    if (!sock || typeof sock.getProfilePicFromServer !== 'function') {
      return null;
    }
    try {
      const photo = await sock.getProfilePicFromServer(contactJid);
      if (typeof photo === 'string' && photo) return photo;
    } catch {
      // ignore missing photo errors
    }
    return null;
  }

  private extractWamid(message: any) {
    return (
      message?.id?._serialized ??
      message?.id?.id ??
      message?.id ??
      message?.messageId ??
      message?.key?.id ??
      null
    );
  }

  private shouldPersistMessage(accountId: string, message: any) {
    const rawId = this.extractWamid(message);
    if (!rawId) return true;
    const id = String(rawId);
    const now = Date.now();
    let bucket = this.recentMessageIds.get(accountId);
    if (!bucket) {
      bucket = new Map();
      this.recentMessageIds.set(accountId, bucket);
    }
    if (bucket.has(id)) return false;
    bucket.set(id, now);
    if (bucket.size > 2000) {
      for (const [key, ts] of bucket) {
        if (now - ts > 10 * 60 * 1000) {
          bucket.delete(key);
        }
      }
      if (bucket.size > 3000) {
        const keys = bucket.keys();
        for (let i = 0; i < 500; i += 1) {
          const next = keys.next();
          if (next.done) break;
          bucket.delete(next.value);
        }
      }
    }
    return true;
  }

  private async persistWppMessage(accountId: string, message: any) {
    if (!this.shouldPersistMessage(accountId, message)) return;
    const wamid = this.extractWamid(message);
    const from = typeof message?.from === 'string' ? message.from : '';
    const to = typeof message?.to === 'string' ? message.to : '';
    const chatId = typeof message?.chatId === 'string' ? message.chatId : '';
    const fromMe = Boolean(message?.fromMe);
    const target = fromMe ? to || chatId || from : from || chatId || to;
    if (!target) return;
    const contactPhone = this.sanitizeContactPhone(target);
    if (!contactPhone) return;
    const contactJid = target.includes('@')
      ? target
      : `${this.normalizeContact(target)}@c.us`;
    const messageType =
      typeof message?.type === 'string' ? message.type.toLowerCase() : '';
    const isBase64ImageBody = (val: string) => {
      const trimmed = val.trim();
      if (!trimmed) return false;
      if (trimmed.startsWith('data:image')) return true;
      if (trimmed.startsWith('/9j/')) return true; // jpeg
      if (trimmed.length > 200 && /^[A-Za-z0-9+/=]+$/.test(trimmed))
        return true;
      return false;
    };
    const caption =
      typeof message?.caption === 'string' && message.caption.trim()
        ? message.caption.trim()
        : '';
    const replyToWamid =
      typeof message?.quotedMsgId === 'string'
        ? message.quotedMsgId
        : message?.quotedMsg?._serialized || message?.quotedMsg?.id || null;
    let body =
      typeof message?.body === 'string' && message.body.trim()
        ? message.body.trim()
        : '';
    if (messageType === 'image' && isBase64ImageBody(body)) {
      body = '';
    }
    if (!body) {
      if (messageType === 'image' && caption) {
        body = caption;
      } else if (messageType === 'sticker') {
        body = '[sticker]';
      } else if (messageType === 'image') {
        body = '[imagem]';
      } else {
        body = '[mensagem nao suportada]';
      }
    }
    const timestamp =
      typeof message?.timestamp === 'number'
        ? new Date(message.timestamp * 1000)
        : new Date();
    const direction = message?.fromMe ? 'OUTBOUND' : 'INBOUND';
    const contactName =
      direction === 'INBOUND'
        ? message?.sender?.pushname ||
          message?.sender?.name ||
          message?.notifyName ||
          null
        : null;
    const status =
      direction === 'INBOUND'
        ? 'delivered'
        : this.mapAckToStatus(
            typeof message?.ack === 'number' ? message.ack : 1,
          );
    await this.saveMessage({
      accountId,
      contactPhone,
      contactName,
      contactJid,
      direction,
      body,
      messageTimestamp: timestamp,
      rawPayload: this.safeStringify(message),
      wamid: wamid ? String(wamid) : null,
      status,
      replyToWamid: replyToWamid ? String(replyToWamid) : null,
    });
  }

  getStatus(accountId: string): ConnectionState {
    return (
      this.connections.get(accountId) ?? {
        status: 'disconnected',
        type: null,
        lastUpdatedAt: Date.now(),
      }
    );
  }

  startCloud(accountId: string) {
    const state: ConnectionState = {
      status: 'pending',
      type: 'cloud',
      lastUpdatedAt: Date.now(),
    };
    this.connections.set(accountId, state);
    return state;
  }

  async startQr(accountId: string, options?: { reset?: boolean }) {
    const existing = this.connections.get(accountId);
    if (existing?.status === 'pending') {
      return existing;
    }
    if (
      existing &&
      existing.status === 'connected' &&
      this.sockets.has(accountId)
    ) {
      return existing;
    }
    if (this.startPromises.has(accountId)) {
      return this.getStatus(accountId);
    }

    const sessionDir = path.join(process.cwd(), '.wppconnect', accountId);
    if (options?.reset) {
      this.cleanupSocket(accountId);
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    fs.mkdirSync(sessionDir, { recursive: true });

    const logger = pino({ level: 'info' });
    const executablePath =
      process.env.CHROMIUM_PATH ||
      process.env.CHROME_PATH ||
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      undefined;
    const waitForQr = new Promise<ConnectionState>((resolve) => {
      wppconnect
        .create({
          session: accountId,
          folderNameToken: '.wppconnect',
          headless: true,
          autoClose: 0,
          disableWelcome: true,
          logQR: false,
          puppeteerOptions: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            executablePath,
          },
          catchQR: (base64Qr) => {
            const qrCode = base64Qr.startsWith('data:image')
              ? base64Qr
              : `data:image/png;base64,${base64Qr}`;
            const next = {
              ...this.getStatus(accountId),
              type: 'qr' as const,
              status: 'pending' as const,
              qrCode,
              lastUpdatedAt: Date.now(),
            };
            this.connections.set(accountId, next);
            resolve(next);
          },
          statusFind: (statusSession) => {
            if (
              statusSession === 'isLogged' ||
              statusSession === 'qrReadSuccess'
            ) {
              const next = {
                ...this.getStatus(accountId),
                type: 'qr' as const,
                status: 'connected' as const,
                qrCode: undefined,
                lastUpdatedAt: Date.now(),
              };
              this.connections.set(accountId, next);
              resolve(next);
            }
          },
        })
        .then((client) => {
          this.cleanupSocket(accountId);
          this.sockets.set(accountId, client);
          client.onStateChange((state: string) => {
            const current = this.getStatus(accountId);
            if (state === 'CONNECTED') {
              this.connections.set(accountId, {
                ...current,
                type: 'qr',
                status: 'connected',
                qrCode: undefined,
                lastUpdatedAt: Date.now(),
              });
            }
            if (state === 'DISCONNECTED' || state === 'UNPAIRED') {
              this.connections.set(accountId, {
                ...current,
                type: 'qr',
                status: 'disconnected',
                lastError: state,
                lastUpdatedAt: Date.now(),
              });
            }
          });
          const handleMessage = (message: any) => {
            if (message?.isGroupMsg) return;
            if (message?.isStatus) return;
            if (!message?.from && !message?.to) return;
            this.persistWppMessage(accountId, message).catch((error) => {
              console.error('[wpp] persist message failed', {
                accountId,
                error,
                messageId:
                  message?.id?._serialized ??
                  message?.id?.id ??
                  message?.id ??
                  null,
              });
            });
          };
          client.onMessage(handleMessage);
          // Capture messages sent from the phone as well as received ones
          if (typeof client.onAnyMessage === 'function') {
            client.onAnyMessage(handleMessage);
          }
          if (typeof (client as any).onAck === 'function') {
            (client as any).onAck((...args: any[]) => {
              const ack = args?.[0];
              const messageId = args?.[1];
              const ackNumber = typeof ack === 'number' ? ack : 1;
              const wamid =
                typeof messageId === 'string'
                  ? messageId
                  : this.extractWamid(messageId) || null;
              if (wamid) {
                this.updateMessageStatusByWamid(
                  accountId,
                  String(wamid),
                  ackNumber,
                ).catch(() => {
                  // ignore ack update errors
                });
              }
            });
          }
          this.syncRecentHistory(accountId, client).catch(() => {
            // ignore history sync errors
          });
        })
        .catch((error) => {
          const msg =
            (error && typeof (error as any).message === 'string'
              ? (error as any).message
              : '') || '';
          const reason = /chromium|chrome/i.test(msg)
            ? 'chromium_not_found'
            : 'create_failed';
          logger.error({ error, reason }, 'wppconnect create failed');
          const next = {
            ...this.getStatus(accountId),
            type: 'qr' as const,
            status: 'disconnected' as const,
            lastError: reason || 'create_failed',
            lastUpdatedAt: Date.now(),
          };
          this.connections.set(accountId, next);
          resolve(next);
        });
    });

    this.startPromises.set(
      accountId,
      waitForQr.finally(() => {
        this.startPromises.delete(accountId);
      }),
    );

    this.connections.set(accountId, {
      status: 'pending',
      type: 'qr',
      lastUpdatedAt: Date.now(),
    });

    const resolved = await Promise.race([
      waitForQr,
      new Promise<ConnectionState>((resolve) =>
        setTimeout(() => resolve(this.getStatus(accountId)), 12000),
      ),
    ]);
    return resolved;
  }

  private async syncRecentHistory(accountId: string, client: any) {
    if (this.historyProcessing.has(accountId)) return;
    this.historyProcessing.add(accountId);
    try {
      if (
        typeof client.getAllChats !== 'function' ||
        typeof client.getAllMessagesInChat !== 'function'
      ) {
        return;
      }
      const chats = await client.getAllChats();
      const list = Array.isArray(chats)
        ? chats
            .filter((chat: any) => {
              const serialized =
                typeof chat?.id?._serialized === 'string'
                  ? chat.id._serialized
                  : typeof chat?.id === 'string'
                    ? chat.id
                    : '';
              const isGroup =
                Boolean(chat?.isGroup) ||
                serialized.endsWith('@g.us') ||
                serialized.endsWith('g.us');
              return !isGroup;
            })
            .slice(0, 30)
        : [];
      for (const chat of list) {
        const chatId =
          typeof chat?.id?._serialized === 'string'
            ? chat.id._serialized
            : typeof chat?.id === 'string'
              ? chat.id
              : null;
        if (!chatId) continue;
        const isGroup =
          Boolean(chat?.isGroup) ||
          chatId.endsWith('@g.us') ||
          chatId.endsWith('g.us');
        if (isGroup) continue;
        let messages: any[] = [];
        try {
          messages = await client.getAllMessagesInChat(chatId, true, true);
        } catch {
          continue;
        }
        if (!Array.isArray(messages) || !messages.length) continue;
        const recent = messages.slice(-50);
        const contactPhone = this.sanitizeContactPhone(chatId);
        const lastSaved = contactPhone
          ? await this.getLastMessageTimestampForPhone(accountId, contactPhone)
          : null;
        for (const msg of recent) {
          if (msg?.isGroupMsg) continue;
          const ts =
            typeof msg?.timestamp === 'number'
              ? new Date(msg.timestamp * 1000)
              : new Date();
          if (lastSaved && ts <= lastSaved) continue;
          await this.persistWppMessage(accountId, msg);
        }
      }
    } finally {
      this.historyProcessing.delete(accountId);
    }
  }

  markConnected(accountId: string) {
    const current = this.getStatus(accountId);
    const updated: ConnectionState = {
      ...current,
      status: 'connected',
      lastUpdatedAt: Date.now(),
    };
    this.connections.set(accountId, updated);
    return updated;
  }

  async saveCloudCredentials(accountId: string, creds: CloudCredentials) {
    const { integrations } = await this.getTables();
    const encryptedPayload = encryptPayload({
      accessToken: creds.accessToken,
      phoneNumberId: creds.phoneNumberId,
      verifyToken: creds.verifyToken,
      webhookUrl: creds.webhookUrl,
    });

    const existing = await db
      .select()
      .from(integrations)
      .where(eq(integrations.accountId, accountId))
      .limit(1);

    if (existing.length) {
      await db
        .update(integrations)
        .set({
          provider: 'CLOUD',
          status: 'PENDING',
          encryptedPayload,
          updatedAt: new Date(),
        })
        .where(eq(integrations.accountId, accountId));
      return { status: 'PENDING' };
    }

    await db.insert(integrations).values({
      id: createId(),
      accountId,
      provider: 'CLOUD',
      status: 'PENDING',
      encryptedPayload,
    });

    return { status: 'PENDING' };
  }

  async updateMessageStatusByWamid(
    accountId: string,
    wamid: string,
    ack: number,
  ) {
    const { messages, conversations } = await this.getTables();
    if (!wamid) return;
    const status = this.mapAckToStatus(ack);
    await db
      .update(messages)
      .set({ status })
      .where(
        and(
          eq(messages.wamid, wamid),
          eq(conversations.accountId, accountId),
        ),
      )
      .from(messages)
      .innerJoin(
        conversations,
        eq(messages.conversationId, conversations.id),
      );
  }

  async getCloudStatus(accountId: string) {
    const { integrations } = await this.getTables();
    const existing = await db
      .select()
      .from(integrations)
      .where(eq(integrations.accountId, accountId))
      .limit(1);

    if (!existing.length) {
      return { status: 'PENDING' };
    }

    return { status: existing[0].status };
  }

  async activateCloud(accountId: string) {
    const { integrations } = await this.getTables();
    await db
      .update(integrations)
      .set({ status: 'CONNECTED', updatedAt: new Date() })
      .where(eq(integrations.accountId, accountId));

    return { status: 'CONNECTED' };
  }

  async findIntegrationByPhoneNumberId(phoneNumberId: string) {
    const { integrations } = await this.getTables();
    const list = await db.select().from(integrations);
    for (const integration of list) {
      try {
        const payload = decryptPayload(
          integration.encryptedPayload,
        ) as CloudCredentials;
        if (payload.phoneNumberId === phoneNumberId) {
          return { integration, payload };
        }
      } catch {
        // ignore invalid payloads
      }
    }
    return null;
  }

  async findIntegrationByVerifyToken(token: string) {
    const { integrations } = await this.getTables();
    const list = await db.select().from(integrations);
    for (const integration of list) {
      try {
        const payload = decryptPayload(
          integration.encryptedPayload,
        ) as CloudCredentials;
        if (payload.verifyToken === token) {
          return { integration, payload };
        }
      } catch {
        // ignore invalid payloads
      }
    }
    return null;
  }

  async getMetaAccessToken(accountId: string) {
    const existing = await db
      .select()
      .from(metaIntegrations)
      .where(eq(metaIntegrations.accountId, accountId))
      .limit(1);

    if (!existing.length) return null;
    try {
      const payload = decryptPayload(existing[0].encryptedPayload) as {
        accessToken?: string;
      };
      return payload.accessToken ?? null;
    } catch {
      return null;
    }
  }

  async connectCloudFromMeta(accountId: string) {
    const { integrations } = await this.getTables();
    const accessToken = await this.getMetaAccessToken(accountId);
    if (!accessToken) {
      return { error: 'META_TOKEN_NOT_FOUND' };
    }

    const params = new URLSearchParams({
      fields:
        'businesses{owned_whatsapp_business_accounts{name,phone_numbers{id,display_phone_number}}}',
      access_token: accessToken,
    });
    const response = await fetch(
      `https://graph.facebook.com/v20.0/me?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error('Failed to fetch WhatsApp business accounts');
    }
    const data = await response.json();
    const businesses = data?.businesses?.data ?? [];
    let phoneNumberId = '';
    let displayPhone = '';
    for (const business of businesses) {
      const wabas = business?.owned_whatsapp_business_accounts?.data ?? [];
      for (const waba of wabas) {
        const numbers = waba?.phone_numbers?.data ?? [];
        if (numbers.length) {
          phoneNumberId = numbers[0].id;
          displayPhone = numbers[0].display_phone_number || '';
          break;
        }
      }
      if (phoneNumberId) break;
    }

    if (!phoneNumberId) {
      throw new Error('No phone_number_id available');
    }

    const verifyToken = createId();
    const webhookUrl =
      process.env.APP_WEBHOOK_URL || 'http://localhost:3001/whatsapp/webhook';

    await this.saveCloudCredentials(accountId, {
      accessToken,
      phoneNumberId,
      verifyToken,
      webhookUrl,
    });

    return {
      status: 'PENDING',
      phoneNumberId,
      displayPhone,
      verifyToken,
      webhookUrl,
    };
  }

  async upsertConversation(
    accountId: string,
    contactPhone: string,
    contactName?: string | null,
    lastMessageAt?: Date,
    contactJid?: string | null,
    contactPhotoUrl?: string | null,
    stage?: string | null,
    source?: string | null,
    value?: string | null,
    classification?: string | null,
  ) {
    const { conversations } = await this.getTables();
    const existing = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.contactPhone, contactPhone),
          eq(conversations.accountId, accountId),
        ),
      )
      .limit(1);

    if (existing.length) {
      const currentLast = existing[0].lastMessageAt;
      const nextLast =
        lastMessageAt && currentLast
          ? lastMessageAt > currentLast
            ? lastMessageAt
            : currentLast
          : currentLast;
      const storedPhoto = existing[0].contactPhotoUrl;
      let nextPhoto = storedPhoto ?? contactPhotoUrl ?? null;
      if (!nextPhoto && contactJid) {
        nextPhoto = await this.fetchContactPhoto(accountId, contactJid);
      }
      await db
        .update(conversations)
        .set({
          lastMessageAt: nextLast ?? new Date(),
          contactName: contactName ?? existing[0].contactName,
          contactPhotoUrl: nextPhoto ?? storedPhoto ?? null,
          stage: existing[0].stage ?? stage ?? 'entrando',
          source: existing[0].source ?? source ?? null,
          value: existing[0].value ?? value ?? null,
          classification: classification ?? existing[0].classification ?? null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, existing[0].id));
      return existing[0].id;
    }

    const conversationId = createId();
    let resolvedPhoto = contactPhotoUrl ?? null;
    if (!resolvedPhoto && contactJid) {
      resolvedPhoto = await this.fetchContactPhoto(accountId, contactJid);
    }
    await db.insert(conversations).values({
      id: conversationId,
      accountId,
      contactPhone,
      contactName: contactName ?? null,
      contactPhotoUrl: resolvedPhoto,
      stage: stage ?? 'entrando',
      source: source ?? null,
      value: value ?? null,
      classification: classification ?? null,
      lastMessageAt: lastMessageAt ?? new Date(),
    });
    return conversationId;
  }

  async updateConversationName(
    accountId: string,
    contactPhone: string,
    contactName: string,
  ) {
    const { conversations } = await this.getTables();
    await db
      .update(conversations)
      .set({ contactName, updatedAt: new Date() })
      .where(
        and(
          eq(conversations.accountId, accountId),
          eq(conversations.contactPhone, contactPhone),
        ),
      );
  }

  async updateConversationClassification(
    accountId: string,
    conversationId: string,
    classification: string | null,
  ) {
    const { conversations } = await this.getTables();
    const exists = await this.getConversationById(accountId, conversationId);
    if (!exists) throw new Error('Conversation not found');
    await db
      .update(conversations)
      .set({
        classification:
          classification && classification.trim()
            ? classification.trim()
            : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.accountId, accountId),
        ),
      );
    return { ok: true };
  }

  async updateConversationStage(
    accountId: string,
    conversationId: string,
    stage: string | null,
    source?: string | null,
    value?: string | null,
  ) {
    const { conversations } = await this.getTables();
    const exists = await this.getConversationById(accountId, conversationId);
    if (!exists) throw new Error('Conversation not found');
    await db
      .update(conversations)
      .set({
        stage: stage || 'entrando',
        source: source ?? exists.source ?? null,
        value: value ?? exists.value ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.accountId, accountId),
        ),
      );
    return { ok: true };
  }

  async updateConversationValue(
    accountId: string,
    conversationId: string,
    value: string | null,
    source?: string | null,
  ) {
    const { conversations } = await this.getTables();
    const exists = await this.getConversationById(accountId, conversationId);
    if (!exists) throw new Error('Conversation not found');
    await db
      .update(conversations)
      .set({
        value: value ?? null,
        source: source ?? exists.source ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.accountId, accountId),
        ),
      );
    return { ok: true };
  }

  async createManualConversation(params: {
    accountId: string;
    contactName: string;
    contactPhone?: string | null;
    stage?: string | null;
    source?: string | null;
    value?: string | null;
    classification?: string | null;
  }) {
    const phone = this.sanitizeContactPhone(params.contactPhone || createId());
    const { conversations } = await this.getTables();
    const conversationId = await this.upsertConversation(
      params.accountId,
      phone,
      params.contactName,
      new Date(),
      null,
      null,
      params.stage ?? 'entrando',
      params.source ?? null,
      params.value ?? null,
      params.classification ?? null,
    );
    return { conversationId };
  }

  async listPipeline(accountId: string) {
    const { conversations } = await this.getTables();
    let rows: typeof conversations.$inferSelect[] = [];
    try {
      rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.accountId, accountId))
        .orderBy(desc(conversations.lastMessageAt));
    } catch (err) {
      console.error('[whatsapp] listPipeline failed', err);
      return [];
    }

    const defaultStages = [
      'entrando',
      'qualificacao',
      'proposta',
      'fechamento',
    ];
    const stageSet = new Set<string>();
    defaultStages.forEach((s) => stageSet.add(s));
    rows.forEach((r) => stageSet.add(r.stage || 'entrando'));

    const stageKeys = Array.from(stageSet);
    const sortedKeys = [
      ...stageKeys.filter((s) => defaultStages.includes(s)),
      ...stageKeys.filter((s) => !defaultStages.includes(s)).sort(),
    ];

    const grouped = sortedKeys.map((stage) => {
      const leads = rows
        .filter((r) => (r.stage || 'entrando') === stage)
        .map((r) => ({
          id: r.id,
          name: r.contactName || this.sanitizeContactPhone(r.contactPhone),
          source: r.source,
          value: r.value,
          classification: r.classification,
          lastMessageAt: r.lastMessageAt,
        }));
      const total = leads.reduce((acc, l) => {
        const num = l.value
          ? Number(String(l.value).replace(/[^0-9.-]/g, ''))
          : 0;
        return acc + (Number.isFinite(num) ? num : 0);
      }, 0);
      const label =
        stage
          .split(/[\s_-]+/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ') || 'Etapa';
      return {
        key: stage,
        label,
        count: leads.length,
        total,
        leads,
      };
    });

    return grouped;
  }

  async saveMessage(params: {
    accountId: string;
    contactPhone: string;
    contactName?: string | null;
    contactJid?: string | null;
    contactPhotoUrl?: string | null;
    direction: 'INBOUND' | 'OUTBOUND';
    body: string;
    messageTimestamp: Date;
    rawPayload: string;
    wamid?: string | null;
    status?: string | null;
    replyToWamid?: string | null;
    classification?: string | null;
  }) {
    const { conversations, messages } = await this.getTables();
    const contactPhone = this.sanitizeContactPhone(params.contactPhone);
    const conversationId = await this.upsertConversation(
      params.accountId,
      contactPhone,
      params.contactName,
      params.messageTimestamp,
      params.contactJid ?? null,
      params.contactPhotoUrl ?? null,
      null,
      null,
      null,
      params.classification ?? null,
    );

    if (params.wamid) {
      const existingByWamid = await db
        .select({ id: whatsappMessages.id })
        .from(messages)
        .where(eq(messages.wamid, params.wamid))
        .limit(1);
      if (existingByWamid.length) {
        return { conversationId, duplicated: true };
      }
    }

    const windowStart = new Date(params.messageTimestamp.getTime() - 5000);
    const windowEnd = new Date(params.messageTimestamp.getTime() + 5000);
    const existing = await db
      .select({ id: whatsappMessages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.direction, params.direction),
          eq(messages.body, params.body),
          gt(messages.messageTimestamp, windowStart),
          lt(messages.messageTimestamp, windowEnd),
        ),
      )
      .limit(1);
    if (existing.length) {
      return { conversationId, duplicated: true };
    }

    const messageId = createId();
    await db.insert(messages).values({
      id: messageId,
      conversationId,
      direction: params.direction,
      body: params.body,
      messageTimestamp: params.messageTimestamp,
      rawPayload: params.rawPayload,
      wamid: params.wamid ?? null,
      status: params.status ?? 'sent',
      replyToWamid: params.replyToWamid ?? null,
    });

    this.emitEvent(params.accountId, {
      type: 'message',
      conversationId,
      messageId,
      direction: params.direction,
    });

    return { conversationId };
  }

  async saveInboundMessage(params: {
    accountId: string;
    contactPhone: string;
    contactName?: string | null;
    body: string;
    messageTimestamp: Date;
    rawPayload: string;
    replyToWamid?: string | null;
    classification?: string | null;
  }) {
    return this.saveMessage({
      accountId: params.accountId,
      contactPhone: params.contactPhone,
      contactName: params.contactName,
      direction: 'INBOUND',
      body: params.body,
      messageTimestamp: params.messageTimestamp,
      rawPayload: params.rawPayload,
      status: 'delivered',
      replyToWamid: params.replyToWamid ?? null,
      classification: params.classification ?? null,
    });
  }

  async listConversations(accountId: string) {
    const { conversations } = await this.getTables();
    try {
      return await db
        .select()
        .from(conversations)
        .where(eq(conversations.accountId, accountId))
        .orderBy(desc(conversations.lastMessageAt));
    } catch (err) {
      console.error('[whatsapp] listConversations failed', err);
      return [];
    }
  }

  async listMessages(conversationId: string) {
    const { messages } = await this.getTables();
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.messageTimestamp);

    return rows.map((row) => {
      let mime: string | null = null;
      let duration: number | null = null;
      let hasMedia = false;
      try {
        const payload = JSON.parse(row.rawPayload || '{}');
        const type = payload?.type;
        if (
          type === 'ptt' ||
          type === 'audio' ||
          type === 'image' ||
          type === 'sticker' ||
          payload?.mimetype?.startsWith?.('audio') ||
          payload?.mimetype?.startsWith?.('image')
        ) {
          hasMedia = true;
          mime =
            typeof payload?.mimetype === 'string'
              ? payload.mimetype
              : type === 'sticker'
                ? 'image/webp'
                : null;
          const dur =
            typeof payload?.duration === 'string'
              ? Number(payload.duration)
              : payload?.duration;
          duration = Number.isFinite(dur) ? Number(dur) : null;
        }
      } catch {
        // ignore parse errors
      }
      return {
        ...row,
        hasMedia,
        mimetype: mime,
        duration,
      };
    });
  }

  async listMessagesForAccount(accountId: string, conversationId: string) {
    const { conversations } = await this.getTables();
    const convo = await this.getConversationById(accountId, conversationId);
    if (!convo) return [];
    return this.listMessages(conversationId);
  }

  private async getLastMessageTimestampForPhone(
    accountId: string,
    contactPhone: string,
  ) {
    const { conversations } = await this.getTables();
    const normalized = this.sanitizeContactPhone(contactPhone);
    const convo = await db
      .select({ id: whatsappConversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.accountId, accountId),
          eq(conversations.contactPhone, normalized),
        ),
      )
      .limit(1);
    if (!convo.length) return null;
    const latest = await db
      .select({ messageTimestamp: whatsappMessages.messageTimestamp })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, convo[0].id))
      .orderBy(desc(whatsappMessages.messageTimestamp))
      .limit(1);
    return latest.length ? latest[0].messageTimestamp : null;
  }

  private async getConversationById(accountId: string, conversationId: string) {
    const existing = await db
      .select()
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.id, conversationId),
          eq(whatsappConversations.accountId, accountId),
        ),
      )
      .limit(1);
    return existing[0] ?? null;
  }

  private async getLastMessageJid(conversationId: string) {
    const latest = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(desc(whatsappMessages.messageTimestamp))
      .limit(1);
    if (!latest.length) return null;
    try {
      const payload = JSON.parse(latest[0].rawPayload);
      return payload?.key?.remoteJid ?? payload?.to ?? payload?.from ?? null;
    } catch {
      return null;
    }
  }

  async sendOutboundMessage(
    accountId: string,
    conversationId: string,
    body: string,
    replyToWamid?: string | null,
  ) {
    const conversation = await this.getConversationById(
      accountId,
      conversationId,
    );
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    this.ensureQrSocket(accountId);
    const sock = this.sockets.get(accountId);
    if (!sock) {
      throw new Error('WhatsApp not connected');
    }

    const lastJid = await this.getLastMessageJid(conversationId);
    const normalizedContact = this.sanitizeContactPhone(
      conversation.contactPhone,
    );
    if (!normalizedContact) {
      throw new Error('Invalid contact phone');
    }
    const fallbackJid = this.buildContactJid(normalizedContact);
    const lastNormalized = lastJid
      ? this.normalizeContact(String(lastJid))
      : '';
    const jid =
      lastNormalized && lastNormalized === normalizedContact
        ? this.buildContactJid(lastNormalized)
        : fallbackJid;

    let wamid: string | null = null;
    let ack = 1;
    let sent: any = null;
    const options: Record<string, any> = {};
    if (replyToWamid) {
      options.quotedMsg = replyToWamid;
      options.quotedMsgId = replyToWamid;
    }
    try {
      sent = await sock.sendText(jid, body, options);
    } catch {
      // fallback sem quoted se der erro
      sent = await sock.sendText(jid, body);
    }
    wamid = typeof sent?.id === 'string' ? sent.id : null;
    ack = typeof sent?.ack === 'number' ? sent.ack : 1;

    await this.saveMessage({
      accountId,
      contactPhone: normalizedContact,
      contactName: conversation.contactName ?? null,
      contactJid: jid,
      direction: 'OUTBOUND',
      body,
      messageTimestamp: new Date(),
      rawPayload: this.safeStringify({ to: jid, body, wamid, replyToWamid }),
      wamid,
      status: this.mapAckToStatus(ack),
      replyToWamid: replyToWamid ?? null,
    });

    return { ok: true };
  }

  async disconnectQr(accountId: string) {
    const sessionDir = path.join(process.cwd(), '.wppconnect', accountId);
    this.cleanupSocket(accountId);
    fs.rmSync(sessionDir, { recursive: true, force: true });
    this.connections.set(accountId, {
      status: 'disconnected',
      type: 'qr',
      lastUpdatedAt: Date.now(),
    });
    return { status: 'disconnected' };
  }

  async getMessageMedia(
    accountId: string,
    conversationId: string,
    messageId: string,
  ) {
    const message = await db
      .select({
        id: whatsappMessages.id,
        rawPayload: whatsappMessages.rawPayload,
        conversationId: whatsappMessages.conversationId,
        accountId: whatsappConversations.accountId,
      })
      .from(whatsappMessages)
      .innerJoin(
        whatsappConversations,
        eq(whatsappMessages.conversationId, whatsappConversations.id),
      )
      .where(
        and(
          eq(whatsappMessages.id, messageId),
          eq(whatsappConversations.accountId, accountId),
          eq(whatsappMessages.conversationId, conversationId),
        ),
      )
      .limit(1);

    if (!message.length) {
      // tenta localizar apenas pelo messageId e account para reduzir falhas de id desatualizado no front
      const fallback = await db
        .select({
          id: whatsappMessages.id,
          rawPayload: whatsappMessages.rawPayload,
          conversationId: whatsappMessages.conversationId,
          accountId: whatsappConversations.accountId,
        })
        .from(whatsappMessages)
        .innerJoin(
          whatsappConversations,
          eq(whatsappMessages.conversationId, whatsappConversations.id),
        )
        .where(
          and(
            eq(whatsappMessages.id, messageId),
            eq(whatsappConversations.accountId, accountId),
          ),
        )
        .limit(1);
      if (!fallback.length) {
        throw new Error('Message not found');
      }
      message.push(fallback[0]);
    }

    let payload: any = null;
    try {
      payload = JSON.parse(message[0].rawPayload || '{}');
    } catch {
      throw new Error('Media payload unavailable');
    }
    const type = payload?.type;
    const mimetype =
      (typeof payload?.mimetype === 'string' && payload.mimetype) ||
      (type === 'sticker' ? 'image/webp' : 'audio/ogg; codecs=opus');
    const isAudio =
      type === 'ptt' || type === 'audio' || mimetype.startsWith('audio');
    const isImage =
      type === 'image' || type === 'sticker' || mimetype.startsWith('image');
    if (!(isAudio || isImage || payload?.directPath)) {
      throw new Error('Message has no media');
    }
    const client = this.sockets.get(accountId);
    if (!client || typeof client.decryptFile !== 'function') {
      throw new Error('WhatsApp not connected');
    }
    const buffer: Buffer = await client.decryptFile(payload);
    return { buffer, mimetype };
  }
}
