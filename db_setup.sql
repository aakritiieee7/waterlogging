-- Database Schema for Delhi Waterlogging Monitoring & Response System

DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS upvotes;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS hotspots;
DROP TABLE IF EXISTS authorities;
DROP TABLE IF EXISTS users;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('citizen', 'authority')),
    full_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Authorities Table
CREATE TABLE IF NOT EXISTS authorities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- Reports Table
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    reporter_id INTEGER REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
    status VARCHAR(20) DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    assigned_authority_id INTEGER REFERENCES authorities(id),
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_proof_image TEXT,
    resolution_note TEXT
);

-- Hotspots Table
CREATE TABLE IF NOT EXISTS hotspots (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL
);

-- Upvotes Table
CREATE TABLE IF NOT EXISTS upvotes (
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (report_id, user_id)
);

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data

-- Insert Authorities
INSERT INTO authorities (name) VALUES 
('MCD (Municipal Corporation of Delhi)'),
('PWD (Public Works Department)'),
('DJB (Delhi Jal Board)'),
('NDMC (New Delhi Municipal Council)'),
('Cantonment Board')
ON CONFLICT (name) DO NOTHING;

-- Insert a Sample Authority User (password: authority123)
-- Hash for 'authority123' (simulated, will use bcrypt in app, but for seed we can put a dummy or wait)
-- Let's just seed the authorities names and hotspots for now. 
-- Citizens and Reports will be created via app, but I'll add some realistic hotspots.

INSERT INTO hotspots (name, description, severity, lat, lng) VALUES
('ITO Crossing', 'Major traffic junction, prone to heavy flooding during monsoon.', 'Critical', 28.6304, 77.2425),
('Minto Bridge', 'Railway underpass, frequently submerged.', 'Critical', 28.6330, 77.2285),
('Kashmere Gate Ring Road', 'Near ISBT, low lying area.', 'High', 28.6675, 77.2282),
('Dhaula Kuan Underpass', 'Strategic connection to Airport, prone to waterlogging.', 'High', 28.5910, 77.1610),
('Najafgarh Drain Area', 'Issues with overflow during peak rainfall.', 'Critical', 28.6139, 76.9830),
('Lajpat Nagar Central', 'Market area with drainage issues.', 'Medium', 28.5677, 77.2432),
('Rohini Sector 18', 'Residential area with local drainage blockages.', 'Medium', 28.7400, 77.1300)
ON CONFLICT DO NOTHING;
