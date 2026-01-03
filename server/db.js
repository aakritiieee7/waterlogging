const { Pool } = require('pg');

// Use env var if available (Vercel), otherwise fallback to hardcoded (Local)
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.amkocqxmizilimqjegdp:eVVlVePWcPHZVDtq@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
