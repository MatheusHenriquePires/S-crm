CREATE INDEX IF NOT EXISTS "idx_whatsapp_conversation_account_phone" ON "WhatsappConversation" ("accountId", "contactPhone");
CREATE INDEX IF NOT EXISTS "idx_whatsapp_message_conversation_ts" ON "WhatsappMessage" ("conversationId", "messageTimestamp");
