const { PgBoss } = require('pg-boss');
require('dotenv').config();

async function verify() {
    console.log('Verifying PgBoss...');
    const boss = new PgBoss(process.env.DATABASE_URL);

    try {
        boss.on('error', err => console.error('Boss error:', err));
        await boss.start();
        console.log('Boss started.');

        const queue = 'test-queue';
        await boss.subscribe(queue, async (job) => {
            console.log('Job received:', job.data);
        });
        console.log('Subscribed to queue.');

        await boss.send(queue, { msg: 'hello' });
        console.log('Job sent.');

        // Allow some time for processing
        await new Promise(r => setTimeout(r, 2000));

        await boss.stop();
        console.log('Verification finished successfully.');
    } catch (err) {
        console.error('Verification failed:', err);
    }
}

verify();
