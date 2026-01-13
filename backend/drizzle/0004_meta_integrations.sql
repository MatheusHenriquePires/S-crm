CREATE TABLE IF NOT EXISTS "MetaIntegration" (
  "id" text PRIMARY KEY NOT NULL,
  "accountId" text NOT NULL UNIQUE,
  "metaUserId" text NOT NULL,
  "encryptedPayload" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
