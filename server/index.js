const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');
const path = require('path');
const multer = require('multer');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'delhi_water_secret_key_2024';
const GEMINI_API_KEY = 'AIzaSyCLZwZ8arUnmHbSTdSj2lI0xgiWWsTJTSg';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);


async function generateContentSafe(prompt) {
    // Valid models found via listModels for this key
    const models = ["gemini-2.0-flash-exp", "gemini-flash-latest", "gemini-pro-latest", "gemini-1.5-flash"];

    for (const modelName of models) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (e) {
            console.warn(`Model ${modelName} failed: ${e.message}`);
        }
    }

    console.log("⚠️ ALL LIVE AI MODELS FAILED. SWITCHING TO SIMULATION.");
    if (prompt.includes("VALID report")) {
        return JSON.stringify({
            is_valid: true,
            reason: "Simulated Acceptance: Valid civic issue detected."
        });
    } else if (prompt.includes("authority should handle")) {
        // Mocking Authority Prediction
        if (prompt.includes("drain") || prompt.includes("road")) return "PWD";
        if (prompt.includes("sewage") || prompt.includes("pipeline")) return "DJB";
        return "MCD";
    }

    return "Simulation Mode: Verified.";
}

async function startChatSafe(history, message, systemPrompt) {
    const models = ["gemini-2.0-flash-exp", "gemini-flash-latest", "gemini-pro-latest", "gemini-1.5-flash"];

    for (const modelName of models) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const chat = model.startChat({
                history: history,
                generationConfig: { maxOutputTokens: 500 },
            });
            const result = await chat.sendMessage(systemPrompt + "\nUser: " + message);
            const response = await result.response;
            return response.text();
        } catch (e) {
            console.warn(`Chat Model ${modelName} failed: ${e.message}`);
        }
    }

    console.log("⚠️ CHAT AI FAILED. SWITCHING TO SIMULATION.");

    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes("hello") || lowerMsg.includes("hi") || lowerMsg.includes("hey")) {
        return "Namaste! I am the URRS Assistant. I can help you with **Safety Guidelines**, **Emergency Contacts**, or **Reporting Waterlogging**. How may I assist you today?";
    }
    if (lowerMsg.includes("emergency") || lowerMsg.includes("number") || lowerMsg.includes("phone")) {
        return "Here are the **Emergency Contacts for Delhi**:\n\n*   **Police:** 112\n*   **Ambulance:** 102\n*   **Fire:** 101\n*   **NDRF Control:** 9711077372\n*   **Delhi Jal Board:** 1916\n\nPlease stay safe and avoid waterlogged areas!";
    }
    if (lowerMsg.includes("report") || lowerMsg.includes("complain") || lowerMsg.includes("photo")) {
        return "To report an issue:\n\n1. Navigate to the **Reports** page.\n2. Click the **'New Report'** button.\n3. Upload a photo and add a brief description.\n\nOur AI will automatically analyze the severity and route it to the correct authority (MCD, PWD, or DJB).";
    }
    if (lowerMsg.includes("mcd") || lowerMsg.includes("pwd") || lowerMsg.includes("djb") || lowerMsg.includes("role")) {
        return "**Authority Responsibilities:**\n\n*   **MCD:** Handles internal colony drains, garbage clearing, and sanitation.\n*   **PWD:** Manages major arterial roads (width > 60ft) and flyovers.\n*   **DJB:** Responsible for sewerage and water supply pipelines.\n\nWe ensure your report reaches the right department instantly.";
    }
    if (lowerMsg.includes("safe") || lowerMsg.includes("precaution") || lowerMsg.includes("tip")) {
        return "**Safety Guidelines:**\n\n1. **Avoid Wading:** Open manholes may be invisible under water.\n2. **Electrical Safety:** Stay away from street poles and transformers.\n3. **Drive Slowly:** Hydroplaning can cause loss of control.\n4. **Keep Emergency Kit:** Flashlight, power bank, and first aid.";
    }
    if (lowerMsg.includes("water") || lowerMsg.includes("logging") || lowerMsg.includes("rain")) {
        return "I am monitoring real-time rainfall data. \n\nCurrently, we are tracking **high-risk zones** near Minto Bridge and Okhla. Please check the **Live Map** for the latest alerts.";
    }

    return "I can assist you with **Reporting**, **Safety Tips**, or **Emergency Contacts**. Please ask me specifically about these topics.\n\n*(Note: I am running in Offline Demo Mode)*";
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Multer setup for image uploads (simulated storage in memory or local for now)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Create uploads directory if not exists
const fs = require('fs');
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware for JWT Verification
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- AUTH ROUTES ---

app.post('/api/auth/register', async (req, res) => {
    const { username, password, role, full_name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4) RETURNING id, username, role',
            [username, hashedPassword, role, full_name]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'User already exists or database error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(400).json({ error: 'User not found' });

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
        res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- AUTHORITY ROUTES ---

app.get('/api/authorities', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM authorities');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// --- REPORT ROUTES ---


async function validateReportContent(title, description) {
    const prompt = `
    You are a strict Content Moderator for a government civic grievance portal.
    Analyze the following report:
    Title: "${title}"
    Description: "${description}"
    
    Determine if this is a VALID report about a civic issue (waterlogging, roads, sanitation, traffic, infrastructure, etc.).
    REJECT if:
    - It is spam (gibberish, random characters, "test", "hello").
    - It is abusive, offensive, or uses profanity.
    - It is clearly irrelevant (e.g. promoting a product, personal diary entry, asking for a date).
    - It contains absolutely no actionable information.
    
    Return ONLY a JSON object: { "is_valid": boolean, "reason": "short explanation if rejected" }
    `;

    try {
        const responseText = await generateContentSafe(prompt);
        // Clean markdown code blocks if present
        const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("AI Validation Failed:", e);
        // Fail open (allow report if AI fails) to avoid blocking legitimate users during outages
        return { is_valid: true };
    }
}

app.post('/api/reports', authenticateToken, upload.single('image'), async (req, res) => {
    const { title, description, severity, lat, lng, assigned_authority_id } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        console.log(`🤖 AI Analyzing Report: "${title}"`);
        const aiValidation = await validateReportContent(title, description);

        if (!aiValidation.is_valid) {
            console.log(`❌ Report Rejected by AI: ${aiValidation.reason}`);
            // If rejected, we might want to delete the uploaded file to save space
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error("Failed to delete noise file:", err);
                });
            }
            return res.status(400).json({
                error: "Report Rejected by AI Moderator",
                reason: aiValidation.reason,
                is_spam: true
            });
        }
        console.log("✅ Report Passed AI Validation.");

        const duplicateCheck = await db.query(`
            SELECT id, created_at FROM reports 
            WHERE 
                lat BETWEEN $1 AND $2 
                AND lng BETWEEN $3 AND $4
                AND created_at > NOW() - INTERVAL '12 hours'
                AND status != 'Resolved'
            LIMIT 1
        `, [lat - 0.0002, lat + 0.0002, lng - 0.0002, lng + 0.0002]);

        if (duplicateCheck.rows.length > 0) {
            console.log("❌ Duplicate Report Detected (Spatial).");
            if (req.file) fs.unlink(req.file.path, () => { });
            return res.status(409).json({
                error: "Duplicate Warning",
                message: "A report already exists at this exact location from today. Please upvote the existing report instead.",
                existing_report_id: duplicateCheck.rows[0].id
            });
        }

        const result = await db.query(
            'INSERT INTO reports (reporter_id, title, description, severity, status, assigned_authority_id, lat, lng, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [req.user.id, title, description, severity, 'Open', assigned_authority_id, lat, lng, imageUrl]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/reports', async (req, res) => {
    const { authority_id, status } = req.query;
    let query = 'SELECT r.*, u.full_name as reporter_name, a.name as authority_name FROM reports r JOIN users u ON r.reporter_id = u.id JOIN authorities a ON r.assigned_authority_id = a.id';
    let params = [];

    if (authority_id || status) {
        query += ' WHERE';
        if (authority_id) {
            params.push(authority_id);
            query += ` r.assigned_authority_id = $${params.length}`;
        }
        if (status) {
            if (params.length > 0) query += ' AND';
            params.push(status);
            query += ` r.status = $${params.length}`;
        }
    }

    query += ' ORDER BY r.created_at DESC';

    try {
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/reports/:id/resolve', authenticateToken, upload.single('proof_image'), async (req, res) => {
    if (req.user.role !== 'authority') return res.status(403).json({ error: 'Only authorities can resolve reports' });

    const { id } = req.params;
    const { note } = req.body;
    const proofImageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const result = await db.query(
            'UPDATE reports SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolution_proof_image = $2, resolution_note = $3 WHERE id = $4 RETURNING *',
            ['Resolved', proofImageUrl, note, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/reports/:id/upvote', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('INSERT INTO upvotes (report_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, req.user.id]);
        res.sendStatus(201);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/reports/:id/upvotes', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('SELECT COUNT(*) FROM upvotes WHERE report_id = $1', [id]);
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/reports/:id/comments', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { text } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO comments (report_id, user_id, comment_text) VALUES ($1, $2, $3) RETURNING *',
            [id, req.user.id, text]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/reports/:id/comments', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            'SELECT c.*, u.full_name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.report_id = $1 ORDER BY c.created_at ASC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// --- HOTSPOT ROUTES ---

app.get('/api/hotspots', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM hotspots');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// --- AI ROUTES ---

app.post('/api/ai/predict-authority', async (req, res) => {
    const { description, location } = req.body;
    const prompt = `You are a Delhi Government dispatcher. Based on this report: "${description}" at location "${location}", identify which authority should handle it:
    - MCD (Municipal Corporation of Delhi): For local colony roads, internal drains, and garbage related flooding.
    - PWD (Public Works Department): For major arterial roads, flyovers, and large storm water drains.
    - DJB (Delhi Jal Board): For sewage overflow, water pipeline bursts.
    - NDMC (New Delhi Municipal Council): For Lutyens Delhi and Central Delhi areas.
    - Cantonment Board: For military/cantonment areas.
    
    Provide ONLY the Name of the authority (one of: MCD, PWD, DJB, NDMC, Cantonment Board).`;

    try {
        let responseText = await generateContentSafe(prompt);
        responseText = responseText.trim();
        // Clean response if AI adds extra text
        const valid = ['MCD', 'PWD', 'DJB', 'NDMC', 'Cantonment Board'];
        const found = valid.find(v => responseText.toUpperCase().includes(v));
        res.json({ prediction: found || responseText });
    } catch (err) {
        console.error('AI Prediction Error:', err);
        res.status(500).json({ error: 'AI Prediction failed' });
    }
});

app.post('/api/ai/chat', async (req, res) => {
    const { message, history } = req.body;

    // Convert history format if necessary (Gemini expects role: 'user'/'model')
    // For simplicity, we restart context or keep it lightweight

    const systemPrompt = `You are the Delhi Waterlogging Monitoring & Response System Assistant. 
    Provide helpful, calm, and authoritative guidance to citizens.
    Capabilities:
    - Guide users through creating a report (provide info about title, severity, location).
    - Provide emergency contacts (Fire: 101, Police: 100/112, Ambulance: 102).
    - Give safety tips (Electrical safety, health, traffic).
    - Explain authority roles (MCD: Local drains, PWD: Major roads, DJB: Water supply/sewerage).
    Strict Guardrails:
    - Informational only.
    - No medical or legal diagnosis.
    - If someone is in immediate danger, tell them to call 112 or 101.
    Current context: Waterlogging in Delhi.`;

    try {
        const reply = await startChatSafe([], message, systemPrompt);
        res.json({ reply: reply });
    } catch (err) {
        console.error('AI Chat Error:', err);
        res.status(500).json({ error: 'Chat failed' });
    }
});

// --- RAINFALL WARNING SYSTEM (Simulated) ---

app.get('/api/rainfall-warnings', (req, res) => {
    // Hardcoded realistic data for demonstration
    const warnings = [
        { date: 'Tomorrow', risk: 'High', areas: ['North Delhi', 'Central Delhi', 'Minto Road'], advice: 'Avoid low-lying areas and underpasses.' },
        { date: 'Day after Tomorrow', risk: 'Medium', areas: ['South Delhi', 'Dwarka'], advice: 'Expect slow traffic.' }
    ];
    res.json(warnings);
});

// --- HISTORICAL PREDICTION ROUTES ---

// Get predicted hotspots for a specific date
app.get('/api/predictions/date/:date', async (req, res) => {
    const { date } = req.params;

    try {
        let result = await db.query(
            'SELECT * FROM predicted_hotspots WHERE prediction_date = $1 ORDER BY confidence_score DESC',
            [date]
        );

        // If no data exists, generate it on-demand
        if (result.rows.length === 0) {
            console.log(`ℹ️ No predictions found for ${date}. Generating on-demand...`);

            try {
                // Determine script path
                const scriptPath = path.join(__dirname, '../scripts/predict_for_date.py');

                // Returns a promise that resolves when the script completes
                const runScript = () => new Promise((resolve, reject) => {
                    // Determine Python executable path (prefer venv)
                    // Use absolute path to ensure robustness
                    const venvPython = '/Users/aakritirajhans/waterlogging-3/waterlogging/venv/bin/python';

                    const pythonExec = require('fs').existsSync(venvPython) ? venvPython : 'python3';

                    console.log(`[Server] Generating prediction using: ${pythonExec}`);

                    const process = spawn(pythonExec, [scriptPath, date]);

                    process.stdout.on('data', (data) => console.log(`[Python]: ${data}`));
                    process.stderr.on('data', (data) => console.error(`[Python Err]: ${data}`));

                    process.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`Script exited with code ${code}`));
                    });
                });

                await runScript();

                // Re-fetch data after generation
                result = await db.query(
                    'SELECT * FROM predicted_hotspots WHERE prediction_date = $1 ORDER BY confidence_score DESC',
                    [date]
                );

            } catch (genErr) {
                console.error('⚠️ On-demand generation failed:', genErr);
                // We continue to return empty result rather than 500, so the UI doesn't crash
            }
        }

        const hotspots = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng),
            severity: row.severity,
            confidence: parseFloat(row.confidence_score),
            predicted_rainfall: parseFloat(row.predicted_rainfall_mm),
            risk_factors: row.risk_factors ? JSON.parse(row.risk_factors) : {},
            radius_meters: row.radius_meters
        }));

        res.json({
            date: date,
            hotspots: hotspots,
            model_version: hotspots.length > 0 ? result.rows[0].model_version : null,
            total_count: hotspots.length
        });
    } catch (err) {
        console.error('Prediction fetch error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get historical incidents for a date range
app.get('/api/historical/incidents', async (req, res) => {
    const { start_date, end_date, severity } = req.query;

    let query = 'SELECT * FROM historical_incidents WHERE 1=1';
    let params = [];

    if (start_date) {
        params.push(start_date);
        query += ` AND incident_date >= $${params.length}`;
    }

    if (end_date) {
        params.push(end_date);
        query += ` AND incident_date <= $${params.length}`;
    }

    if (severity) {
        params.push(severity);
        query += ` AND severity = $${params.length}`;
    }

    query += ' ORDER BY incident_date DESC LIMIT 100';

    try {
        const result = await db.query(query, params);
        res.json({
            incidents: result.rows,
            total_count: result.rows.length
        });
    } catch (err) {
        console.error('Historical incidents fetch error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get rainfall data for a specific date
app.get('/api/rainfall/date/:date', async (req, res) => {
    const { date } = req.params;

    try {
        const result = await db.query(
            'SELECT * FROM historical_rainfall WHERE record_date = $1',
            [date]
        );

        const stations = result.rows.map(row => ({
            name: row.station_name,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng),
            rainfall_24h: parseFloat(row.rainfall_24h),
            rainfall_1h: row.rainfall_1h ? parseFloat(row.rainfall_1h) : null,
            rainfall_3h: row.rainfall_3h ? parseFloat(row.rainfall_3h) : null,
            rainfall_6h: row.rainfall_6h ? parseFloat(row.rainfall_6h) : null,
            temperature: row.temperature_c ? parseFloat(row.temperature_c) : null,
            humidity: row.humidity_percent
        }));

        res.json({
            date: date,
            stations: stations,
            total_stations: stations.length
        });
    } catch (err) {
        console.error('Rainfall data fetch error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get model performance metrics
app.get('/api/model/metrics', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM model_metadata ORDER BY training_date DESC LIMIT 1'
        );

        if (result.rows.length === 0) {
            return res.json({
                current_version: 'v2.0.0',
                message: 'No model metadata available yet'
            });
        }

        const metadata = result.rows[0];

        res.json({
            current_version: metadata.model_version,
            accuracy: parseFloat(metadata.accuracy),
            precision: parseFloat(metadata.precision_score),
            recall: parseFloat(metadata.recall_score),
            f1_score: parseFloat(metadata.f1_score),
            training_samples: metadata.training_samples,
            last_trained: metadata.training_date,
            feature_importance: metadata.feature_importance ? JSON.parse(metadata.feature_importance) : null,
            data_sources: metadata.data_sources ? JSON.parse(metadata.data_sources) : null
        });
    } catch (err) {
        console.error('Model metrics fetch error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Trigger prediction for a specific date (admin only)
app.post('/api/predictions/generate', authenticateToken, async (req, res) => {
    if (req.user.role !== 'authority') {
        return res.status(403).json({ error: 'Only authorities can trigger predictions' });
    }

    const { date } = req.body;

    if (!date) {
        return res.status(400).json({ error: 'Date is required' });
    }

    // Trigger real-time Python inference
    console.log(`🚀 Triggering prediction for ${date}...`);
    const scriptPath = path.join(__dirname, '../scripts/predict_for_date.py');

    // Determine Python executable path (prefer venv)
    const venvPython = process.platform === 'win32'
        ? path.join(__dirname, '../venv/Scripts/python.exe')
        : path.join(__dirname, '../venv/bin/python');

    const fs = require('fs');
    const pythonExec = fs.existsSync(venvPython) ? venvPython : 'python3';

    console.log(`   Using Python: ${pythonExec}`);

    // Spawn Python process
    const pythonProcess = spawn(pythonExec, [scriptPath, date]);

    let scriptOutput = '';
    let scriptError = '';

    pythonProcess.stdout.on('data', (data) => {
        const text = data.toString();
        scriptOutput += text;
        console.log(`[Python]: ${text}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        scriptError += text;
        console.error(`[Python API Error]: ${text}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python script finished with code ${code}`);

        if (code === 0) {
            res.json({
                message: 'Detailed prediction analysis generated successfully',
                date: date,
                status: 'success',
                model_output: 'Database updated with new hotspots.'
            });
        } else {
            res.status(500).json({
                error: 'Prediction generation failed',
                status: 'error',
                debug_info: scriptError
            });
        }
    });
});

// Get prediction statistics
app.get('/api/predictions/stats', async (req, res) => {
    try {
        const totalPredictions = await db.query(
            'SELECT COUNT(DISTINCT prediction_date) as count FROM predicted_hotspots'
        );

        const severityBreakdown = await db.query(
            'SELECT severity, COUNT(*) as count FROM predicted_hotspots GROUP BY severity'
        );

        const recentPredictions = await db.query(
            'SELECT prediction_date, COUNT(*) as hotspot_count FROM predicted_hotspots GROUP BY prediction_date ORDER BY prediction_date DESC LIMIT 10'
        );

        res.json({
            total_prediction_dates: parseInt(totalPredictions.rows[0].count),
            severity_breakdown: severityBreakdown.rows,
            recent_predictions: recentPredictions.rows
        });
    } catch (err) {
        console.error('Prediction stats error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Export for Vercel
module.exports = app;

// Only listen if running locally
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
