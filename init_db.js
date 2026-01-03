const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.amkocqxmizilimqjegdp:eVVlVePWcPHZVDtq@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

async function setupDatabase() {
    const client = new Client({
        connectionString: connectionString,
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        const sql = fs.readFileSync(path.join(__dirname, 'db_setup.sql'), 'utf8');
        const statements = sql.split(';').filter(s => s.trim() !== '');

        for (let statement of statements) {
            await client.query(statement);
        }

        console.log('Database schema and seed data initialized successfully.');
    } catch (err) {
        console.error('Error setting up database:', err);
    } finally {
        await client.end();
    }
}

setupDatabase();
