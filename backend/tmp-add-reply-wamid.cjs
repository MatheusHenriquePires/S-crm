require('dotenv/config')
const { Client } = require('pg')

const sql = "ALTER TABLE \"WhatsappMessage\" ADD COLUMN IF NOT EXISTS \"replyToWamid\" text;"

async function run() {
  const conn = process.env.DATABASE_URL
  if (!conn) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }
  const client = new Client({ connectionString: conn })
  await client.connect()
  await client.query(sql)
  console.log('replyToWamid column ensured')
  await client.end()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
