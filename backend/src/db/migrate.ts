import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './db';

async function main() {
  await migrate(db, { migrationsFolder: 'drizzle' });
  await pool.end();
  console.log('Migrations applied');
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await pool.end();
  process.exit(1);
});
