require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const session = require('express-session');
const pkg = require('pg');
const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 8080;

// Database connection (Neon.tech)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
const sessionSecret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
if (!sessionSecret) {
  console.error('❌ SESSION_SECRET or ADMIN_PASSWORD environment variable is required for session secret');
  process.exit(1);
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 60 * 1000 // 30 minutes
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Database initialization
async function initializeDatabase() {
  try {
    console.log('Attempting to connect to Neon database...');
    const client = await pool.connect();
    console.log('✅ Connected to Neon PostgreSQL database');

    // Create unlock_keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS unlock_keys (
        id SERIAL PRIMARY KEY,
        unlock_key VARCHAR(20) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        redeemed_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_unlock_key ON unlock_keys(unlock_key);
      CREATE INDEX IF NOT EXISTS idx_expires_at ON unlock_keys(expires_at);
      CREATE INDEX IF NOT EXISTS idx_used ON unlock_keys(used);
    `);

    // Create tokens table for session tokens
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        id SERIAL PRIMARY KEY,
        token VARCHAR(255) UNIQUE NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for tokens
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_token ON user_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_user_id ON user_tokens(user_id);
    `);

    client.release();
    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  }
}

// Routes
app.use('/api', require('./routes/api'));
app.use('/admin', require('./routes/admin'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Database: Neon PostgreSQL`);
      console.log(`🔑 Admin password configured: ${process.env.ADMIN_PASSWORD ? 'YES' : 'NO'}`);
      console.log(`🔐 Session secret configured: ${process.env.SESSION_SECRET ? 'YES (custom)' : 'NO (using ADMIN_PASSWORD)'}`);
      console.log(`🌐 CORS enabled with credentials: true`);
      console.log(`📝 Admin dashboard serving: public/admin-fixed.html (via router)`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;