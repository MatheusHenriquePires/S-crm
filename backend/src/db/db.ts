import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const rawDatabaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!rawDatabaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

function normalizeConnectionString(url: string) {
  try {
    const parsed = new URL(url);
    const isSupabasePooler = parsed.hostname.includes('pooler.supabase.com');

    if (isSupabasePooler) {
      // Supabase pgbouncer precisa de SSL e do project ref
      if (!parsed.searchParams.has('sslmode')) {
        // no-verify evita erro de certificado self-signed
        parsed.searchParams.set('sslmode', 'no-verify');
      }
      if (!parsed.searchParams.has('options')) {
        const match = parsed.username.match(/\.([a-z0-9]{10,})$/);
        const projectRef = match?.[1];
        if (projectRef) {
          parsed.searchParams.set('options', `project=${projectRef}`);
        }
      }
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

const connectionString = normalizeConnectionString(rawDatabaseUrl);
const shouldUseSSL =
  process.env.DB_SSL === 'true' ||
  connectionString.includes('sslmode=require') ||
  connectionString.includes('sslmode=no-verify') ||
  /supabase\.co|supabase\.com/.test(connectionString);

export const pool = new Pool({
  connectionString,
  // SSL habilitado automaticamente para Supabase/hosts externos
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool);
