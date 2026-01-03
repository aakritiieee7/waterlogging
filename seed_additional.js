const bcrypt = require('bcryptjs');
const db = require('./server/db');

async function seedAdditionalData() {
    try {
        const citizenPass = await bcrypt.hash('citizen123', 10);
        const authorityPass = await bcrypt.hash('authority123', 10);

        // 1. Insert Users
        const citResult = await db.query(
            'INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id',
            ['ravi_citizen', citizenPass, 'citizen', 'Ravi Kumar']
        );
        const authResult = await db.query(
            'INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id',
            ['mcd_official', authorityPass, 'authority', 'S.K. Sharma']
        );

        const citId = citResult.rows[0].id;
        const authUserId = authResult.rows[0].id;

        // 2. Get Authority IDs (MCD and PWD)
        const authorities = await db.query('SELECT id, name FROM authorities');
        const mcdId = authorities.rows.find(a => a.name.includes('MCD')).id;
        const pwdId = authorities.rows.find(a => a.name.includes('PWD')).id;

        // 3. Insert Sample Reports
        const report1 = await db.query(
            'INSERT INTO reports (reporter_id, title, description, severity, status, assigned_authority_id, lat, lng) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [citId, 'Waterlogging at Civic Centre', 'Large puddle forming near the entrance, blocking pedestrian path.', 'Medium', 'Open', mcdId, 28.6328, 77.2250]
        );

        const report2 = await db.query(
            'INSERT INTO reports (reporter_id, title, description, severity, status, assigned_authority_id, lat, lng) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [citId, 'Minto Road Flooding', 'Cars are getting stuck near the underpass. Urgent action needed.', 'Critical', 'In Progress', pwdId, 28.6330, 77.2285]
        );

        // 4. Add Upvotes and Comments
        if (report1.rows.length > 0) {
            const r1Id = report1.rows[0].id;
            await db.query('INSERT INTO upvotes (report_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r1Id, citId]);
            await db.query('INSERT INTO comments (report_id, user_id, comment_text) VALUES ($1, $2, $3)', [r1Id, citId, 'This has been happening every year. Need a permanent fix.']);
        }

        console.log('Seed data (Users, Reports, Interactions) created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
}

seedAdditionalData();
