DO $$ BEGIN
  CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "WhatsappConversation" (
  "id" text PRIMARY KEY NOT NULL,
  "accountId" text NOT NULL,
  "contactPhone" text NOT NULL,
  "contactName" text,
  "lastMessageAt" timestamp with time zone NOT NULL DEFAULT now(),
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "WhatsappMessage" (
  "id" text PRIMARY KEY NOT NULL,
  "conversationId" text NOT NULL,
  "direction" "MessageDirection" NOT NULL,
  "body" text NOT NULL,
  "messageTimestamp" timestamp with time zone NOT NULL DEFAULT now(),
  "rawPayload" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);
