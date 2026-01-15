import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SSL opcional: desabilita se o servidor não suporta
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool);
