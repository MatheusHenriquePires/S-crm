require('dotenv/config')
const { Client } = require('pg')

const query =
  'select "id","direction","body","rawPayload","createdAt" from "WhatsappMessage" order by "createdAt" desc limit 5'

async function run() {
  const conn = process.env.DATABASE_URL
  if (!conn) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }
  const client = new Client({ connectionString: conn })
  await client.connect()
  const res = await client.query(query)
  console.log(JSON.stringify(res.rows, null, 2))
  await client.end()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
