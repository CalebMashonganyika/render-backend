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

// Trust proxy headers for accurate IP detection (required for Render.com)
app.set('trust proxy', true);

// Database connection (Neon.tech)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for admin dashboard
}));
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
    secure: false, // Set to false for debugging
    httpOnly: true,
    maxAge: 30 * 60 * 1000, // 30 minutes
    sameSite: 'lax' // Allow cookies to be sent
  }
}));

// Rate limiting with proxy support for Render
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  trustProxy: true, // Trust proxy headers for accurate IP detection
  // Custom handler to return JSON instead of plain text
  handler: (req, res, next, options) => {
    console.log('⚠️ Rate limit exceeded for IP:', req.ip);
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.round(options.windowMs / 1000) || 60
    });
  }
});

app.use('/api/', limiter);
app.use('/admin/', limiter);

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
        duration_minutes INTEGER DEFAULT 5,
        duration_type VARCHAR(20) DEFAULT '5min',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_unlock_key ON unlock_keys(unlock_key);
      CREATE INDEX IF NOT EXISTS idx_expires_at ON unlock_keys(expires_at);
      CREATE INDEX IF NOT EXISTS idx_used ON unlock_keys(used);
    `);

    // Add duration_minutes column to existing table
    try {
      await client.query('ALTER TABLE unlock_keys ADD COLUMN duration_minutes INTEGER DEFAULT 5');
      console.log('✅ Added duration_minutes column to unlock_keys table');
    } catch (error) {
      if (error.code === '42701') {
        console.log('✅ duration_minutes column already exists');
      } else {
        throw error;
      }
    }

    // Add duration_type column to unlock_keys table
    try {
      await client.query('ALTER TABLE unlock_keys ADD COLUMN duration_type VARCHAR(20) DEFAULT \'5min\'');
      console.log('✅ Added duration_type column to unlock_keys table');
    } catch (error) {
      if (error.code === '42701') {
        console.log('✅ duration_type column already exists');
      } else {
        throw error;
      }
    }

    // Add duration_type column to user_tokens table
    try {
      await client.query('ALTER TABLE user_tokens ADD COLUMN duration_type VARCHAR(20) DEFAULT \'5min\'');
      console.log('✅ Added duration_type column to user_tokens table');
    } catch (error) {
      if (error.code === '42701') {
        console.log('✅ duration_type column already exists in user_tokens table');
      } else {
        throw error;
      }
    }

    // Create tokens table for session tokens
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        id SERIAL PRIMARY KEY,
        token VARCHAR(255) UNIQUE NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        duration_type VARCHAR(20) DEFAULT '5min',
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
console.log('🔗 Loading API routes...');
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);
console.log('✅ API routes loaded');

console.log('🔗 Loading admin routes...');
const adminRouter = require('./routes/admin');
app.use('/admin', adminRouter);
console.log('✅ Admin routes loaded');

// Debug route registration
app._router.stack.forEach((layer) => {
  if (layer.route) {
    console.log(`🛣️ Registered route: ${Object.keys(layer.route.methods).join(', ').toUpperCase()} ${layer.route.path}`);
  }
});

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
      console.log(`🔒 CSP disabled for admin dashboard (inline scripts allowed)`);
      console.log(`🍪 Session cookie settings: secure=false, sameSite=lax`);
      console.log(`📝 Admin dashboard serving: public/admin-fixed.html (via router)`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;