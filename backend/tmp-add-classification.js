const { Client } = require('pg')
const run = async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  await client.query('ALTER TABLE "WhatsappConversation" ADD COLUMN IF NOT EXISTS "classification" text;')
  await client.end()
}
run().catch((err) => { console.error(err); process.exit(1) })
