import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('UserRole', ['ADMIN', 'MEMBER']);

export const contacts = pgTable('contacts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  name: text('name'),
  phoneE164: text('phone_e164'),
  email: text('email'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Definimos duas variações para lidar com bancos legados (PascalCase) e novos (snake_case).
// Usamos os mesmos nomes de propriedades para facilitar o uso dinâmico.
export const accountsSnake = pgTable('accounts', {
  id: text('id').primaryKey(), // vamos gerar cuid no app (ou pode usar uuid no banco)
  name: text('name').notNull(),
  ownerName: text('owner_name'),
  email: text('email').unique(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const accountsPascal = pgTable('Account', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerName: text('ownerName'),
  email: text('email').unique(),

  createdAt: timestamp('createdAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const usersSnake = pgTable('users', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(), // depois colocamos FK se quiser
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').default('ADMIN').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const usersPascal = pgTable('User', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: userRoleEnum('role').default('ADMIN').notNull(),

  createdAt: timestamp('createdAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const whatsappProviderEnum = pgEnum('WhatsappProvider', ['CLOUD']);
export const whatsappStatusEnum = pgEnum('WhatsappIntegrationStatus', [
  'PENDING',
  'CONNECTED',
]);

// Banco real: whatsapp_connections (mais campos que o código usa).
export const whatsappConnections = pgTable('whatsapp_connections', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  type: text('type'), // qr|cloud
  status: whatsappStatusEnum('status').notNull().default('PENDING'),
  wabaId: text('waba_id'),
  phoneNumberId: text('phone_number_id'),
  accessToken: text('access_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  providerName: text('provider_name'),
  sessionId: text('session_id'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const messageDirectionEnum = pgEnum('MessageDirection', [
  'INBOUND',
  'OUTBOUND',
]);

// Banco real: conversations (sem contact_phone/contact_name)
export const whatsappConversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  contactId: text('contact_id'),
  channel: text('channel'),
  stage: text('stage').default('entrando'),
  classification: text('classification'),
  valueCents: text('value_cents'),
  currency: text('currency'),
  isOpen: text('is_open'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Banco real: messages (campos wa_from/wa_to e text/mime/payload)
export const whatsappMessages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id'),
    conversationId: text('conversation_id').notNull(),
    direction: messageDirectionEnum('direction').notNull(),
    type: text('type'),
    externalMessageId: text('external_message_id'),
    waFrom: text('wa_from'),
    waTo: text('wa_to'),
    text: text('text'),
    mediaId: text('media_id'),
    mediaUrl: text('media_url'),
    mimeType: text('mime_type'),
    fileName: text('file_name'),
    fileSizeBytes: text('file_size_bytes'),
    rawPayload: text('raw_payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    wamidIdx: uniqueIndex('whatsapp_message_wamid_idx').on(table.externalMessageId),
  }),
);

export const metaIntegrations = pgTable('MetaIntegration', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull().unique(),
  metaUserId: text('metaUserId').notNull(),
  encryptedPayload: text('encryptedPayload').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
