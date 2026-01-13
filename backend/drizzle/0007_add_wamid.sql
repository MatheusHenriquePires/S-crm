ALTER TABLE "WhatsappMessage" ADD COLUMN "wamid" text;
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_message_wamid_idx" ON "WhatsappMessage" ("wamid");
