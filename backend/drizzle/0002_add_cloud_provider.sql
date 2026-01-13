DO $$ BEGIN
  ALTER TYPE "WhatsappProvider" ADD VALUE IF NOT EXISTS 'CLOUD';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

UPDATE "WhatsappIntegration"
SET "provider" = 'CLOUD'
WHERE "provider" <> 'CLOUD';
