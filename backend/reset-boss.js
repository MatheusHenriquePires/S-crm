const { Client } = require('pg');
require('dotenv').config();

async function reset() {
    console.log('Connecting to database...');
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Dropping pgboss schema...');
        await client.query('DROP SCHEMA IF EXISTS pgboss CASCADE');
        console.log('Schema dropped successfully.');
    } catch (err) {
        console.error('Error resetting schema:', err);
    } finally {
        await client.end();
    }
}

reset();
