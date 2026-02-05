const { PgBoss } = require('pg-boss');
console.log('PgBoss constructor:', PgBoss);
// if (PgBoss.default) PgBoss = PgBoss.default;
console.log('PgBoss constructor:', PgBoss);
require('dotenv').config();

async function test() {
    console.log('Testing PgBoss connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Defined' : 'Undefined');

    try {
        const boss = new PgBoss(process.env.DATABASE_URL);
        boss.on('error', error => console.error('PgBoss Error:', error));

        console.log('Starting boss...');
        await boss.start();
        console.log('PgBoss started successfully!');
        await boss.stop();
    } catch (err) {
        console.error('Failed to start PgBoss message:', err.message);
        console.error('Failed to start PgBoss code:', err.code);
        // console.error(err);
    }
}

test();
