const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.amkocqxmizilimqjegdp:eVVlVePWcPHZVDtq@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
});

client.connect()
    .then(() => client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    ))
    .then(res => {
        console.log('Tables:', res.rows.map(r => r.table_name));
        client.end();
    })
    .catch(err => {
        console.error('Database connection error:', err);
        client.end();
    });
