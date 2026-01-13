DO $$ BEGIN
  CREATE TYPE "WhatsappProvider" AS ENUM ('CLOUD');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsappIntegrationStatus" AS ENUM ('PENDING', 'CONNECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "WhatsappIntegration" (
  "id" text PRIMARY KEY NOT NULL,
  "accountId" text NOT NULL,
  "provider" "WhatsappProvider" NOT NULL,
  "status" "WhatsappIntegrationStatus" NOT NULL DEFAULT 'PENDING',
  "encryptedPayload" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
