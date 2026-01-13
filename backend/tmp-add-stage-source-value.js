const { Client } = require('pg')
const run = async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  await client.query('ALTER TABLE "WhatsappConversation" ADD COLUMN IF NOT EXISTS "stage" text DEFAULT \'entrando\'')
  await client.query('ALTER TABLE "WhatsappConversation" ADD COLUMN IF NOT EXISTS "source" text')
  await client.query('ALTER TABLE "WhatsappConversation" ADD COLUMN IF NOT EXISTS "value" text')
  await client.end()
}
run().catch((err) => { console.error(err); process.exit(1) })
