import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('UserRole', ['ADMIN', 'MEMBER']);

// Tabelas seguem o naming original das migrações (PascalCase + camelCase columns)
export const accounts = pgTable('Account', {
  id: text('id').primaryKey(), // vamos gerar cuid no app (ou pode usar uuid no banco)
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

export const users = pgTable('User', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(), // depois colocamos FK se quiser
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

export const whatsappIntegrations = pgTable('WhatsappIntegration', {
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

export const whatsappConversations = pgTable('WhatsappConversation', {
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

export const whatsappMessages = pgTable(
  'WhatsappMessage',
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
