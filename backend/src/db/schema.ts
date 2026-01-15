import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('UserRole', ['ADMIN', 'MEMBER']);

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

export const whatsappIntegrationsSnake = pgTable('whatsapp_connections', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  provider: whatsappProviderEnum('provider').notNull(),
  status: whatsappStatusEnum('status').notNull().default('PENDING'),
  encryptedPayload: text('encrypted_payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const whatsappIntegrationsCamel = pgTable('whatsapp_connections', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  provider: whatsappProviderEnum('provider').notNull(),
  status: whatsappStatusEnum('status').notNull().default('PENDING'),
  encryptedPayload: text('encryptedPayload').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const messageDirectionEnum = pgEnum('MessageDirection', [
  'INBOUND',
  'OUTBOUND',
]);

export const whatsappConversationsSnake = pgTable('conversations', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  contactPhone: text('contact_phone').notNull(),
  contactName: text('contact_name'),
  contactPhotoUrl: text('contact_photo_url'),
  stage: text('stage').default('entrando'),
  source: text('source'),
  value: text('value'),
  classification: text('classification'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const whatsappConversationsCamel = pgTable('conversations', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  contactPhone: text('contactPhone').notNull(),
  contactName: text('contactName'),
  contactPhotoUrl: text('contactPhotoUrl'),
  stage: text('stage').default('entrando'),
  source: text('source'),
  value: text('value'),
  classification: text('classification'),
  lastMessageAt: timestamp('lastMessageAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const whatsappMessagesSnake = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    direction: messageDirectionEnum('direction').notNull(),
    body: text('body').notNull(),
    messageTimestamp: timestamp('message_timestamp', { withTimezone: true })
      .defaultNow()
      .notNull(),
    rawPayload: text('raw_payload').notNull(),
    wamid: text('wamid'),
    status: text('status').default('sent'),
    replyToWamid: text('reply_to_wamid'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    wamidIdx: uniqueIndex('whatsapp_message_wamid_idx').on(table.wamid),
  }),
);

export const whatsappMessagesCamel = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversationId').notNull(),
    direction: messageDirectionEnum('direction').notNull(),
    body: text('body').notNull(),
    messageTimestamp: timestamp('messageTimestamp', { withTimezone: true })
      .defaultNow()
      .notNull(),
    rawPayload: text('rawPayload').notNull(),
    wamid: text('wamid'),
    status: text('status').default('sent'),
    replyToWamid: text('replyToWamid'),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    wamidIdx: uniqueIndex('whatsapp_message_wamid_idx').on(table.wamid),
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
