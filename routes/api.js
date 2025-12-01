const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const router = express.Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Admin authentication middleware
function requireAdminAuth(req, res, next) {
  console.log('🔍 API Keys auth check:');
  console.log('  📋 Session exists:', !!req.session);
  console.log('  🔑 Session ID:', req.sessionID);
  console.log('  🎛️ Session data:', JSON.stringify(req.session));
  console.log('  👤 isAdmin:', req.session?.isAdmin);
  console.log('  🍪 Cookie header:', req.headers.cookie);
  
  if (!req.session || !req.session.isAdmin) {
    console.log('❌ API Keys auth failed - no valid admin session');
    console.log('  ❌ Session check:', !!req.session);
    console.log('  ❌ isAdmin check:', req.session?.isAdmin);
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required'
    });
  }
  
  console.log('✅ API Keys admin auth successful');
  next();
}

// Generate random unlock key in format XXXX-XXXX
function generateUnlockKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 8; i++) {
    if (i > 0 && i % 4 === 0) key += '-';
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Generate secure token
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

// GET /api/test - Simple database connection test
router.get('/test', async (req, res) => {
  console.log('🧪 DATABASE_CONNECTION_TEST');
  
  try {
    console.log('🔗 Attempting database connection...');
    const client = await pool.connect();
    
    try {
      console.log('✅ Database connected successfully');
      
      // Test query
      const result = await client.query('SELECT NOW() as current_time, version() as db_version');
      console.log('📊 Test query result:', result.rows[0]);
      
      // Check if unlock_keys table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'unlock_keys'
        ) as table_exists
      `);
      
      console.log('🔑 unlock_keys table exists:', tableCheck.rows[0].table_exists);
      
      res.json({
        success: true,
        message: 'Database connection successful',
        data: {
          current_time: result.rows[0].current_time,
          db_version: result.rows[0].db_version,
          table_exists: tableCheck.rows[0].table_exists
        }
      });
      
    } finally {
      client.release();
      console.log('🔗 Database client released');
    }
    
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
      hint: 'Check DATABASE_URL environment variable'
    });
  }
});

// POST /api/verify_key
router.post('/verify_key', async (req, res) => {
  console.log('🔑 VERIFY_KEY_REQUEST:', {
    method: req.method,
    url: req.url,
    body: req.body,
    timestamp: new Date().toISOString()
  });

  try {
    const { user_id, unlock_key } = req.body;

    console.log('🔑 REQUEST_DATA:', { user_id, unlock_key });

    if (!user_id || !unlock_key) {
      console.log('❌ MISSING_PARAMETERS:', { user_id: !!user_id, unlock_key: !!unlock_key });
      return res.status(400).json({
        success: false,
        message: 'user_id and unlock_key are required'
      });
    }

    console.log('🔗 CONNECTING_TO_DATABASE...');
    const client = await pool.connect();

    try {
      console.log('✅ DATABASE_CONNECTED');

      // Check if key exists, is not used, and not expired
      const query = `
        SELECT id FROM unlock_keys
        WHERE unlock_key = $1 AND used = false AND expires_at > NOW()
      `;
      console.log('🔍 QUERYING_KEY:', query, [unlock_key]);
      
      const result = await client.query(query, [unlock_key]);
      console.log('📊 QUERY_RESULT:', result.rows);

      if (result.rows.length === 0) {
        console.log('❌ KEY_NOT_FOUND_OR_USED_OR_EXPIRED');
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired unlock key'
        });
      }

      const keyId = result.rows[0].id;
      console.log('🔑 KEY_ID_FOUND:', keyId);

      // Mark key as used and save redeemed_by
      console.log('🔄 MARKING_KEY_AS_USED...');
      await client.query(
        'UPDATE unlock_keys SET used = true, redeemed_by = $1 WHERE id = $2',
        [user_id, keyId]
      );
      console.log('✅ KEY_MARKED_AS_USED');

      // Generate a secure token for the user
      const token = generateSecureToken();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      console.log('🎫 GENERATED_TOKEN:', token.substring(0, 8) + '...');
      console.log('⏰ EXPIRES_AT:', expiresAt.toISOString());

      // Store token in database
      console.log('💾 STORING_TOKEN_IN_DATABASE...');
      await client.query(
        'INSERT INTO user_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [token, user_id, expiresAt]
      );
      console.log('✅ TOKEN_STORED_SUCCESSFULLY');

      const response = {
        success: true,
        token: token,
        message: 'Premium features unlocked!',
        premium_until: expiresAt.toISOString(),
        duration_minutes: 5
      };

      console.log('🎉 SUCCESS_RESPONSE:', response);
      res.json(response);

    } catch (dbError) {
      console.error('❌ DATABASE_ERROR:', dbError);
      console.error('❌ DATABASE_ERROR_STACK:', dbError.stack);
      throw dbError;
    } finally {
      client.release();
      console.log('🔗 DATABASE_CLIENT_RELEASED');
    }

  } catch (error) {
    console.error('💥 VERIFY_KEY_ERROR:', error);
    console.error('💥 ERROR_STACK:', error.stack);
    console.error('💥 ERROR_TYPE:', error.constructor.name);
    
    // More detailed error response for debugging
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/check_token
router.post('/check_token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    const client = await pool.connect();

    try {
      // Check if token exists and is not expired
      const query = `
        SELECT user_id, expires_at FROM user_tokens
        WHERE token = $1 AND expires_at > NOW()
      `;
      const result = await client.query(query, [token]);

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }

      const { user_id, expires_at } = result.rows[0];

      res.json({
        success: true,
        valid: true,
        user_id: user_id,
        expires_at: expires_at.toISOString()
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error checking token:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /api/keys (for admin dashboard - requires auth)
router.get('/keys', requireAdminAuth, async (req, res) => {
  try {
    const client = await pool.connect();

    try {
      const query = `
        SELECT id, unlock_key, expires_at, used, redeemed_by, duration_minutes, created_at
        FROM unlock_keys
        ORDER BY created_at DESC
      `;
      const result = await client.query(query);

      res.json({
        success: true,
        keys: result.rows
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error fetching keys:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /api/routes - List all available routes
router.get('/routes', (req, res) => {
  const routes = [];
  
  router.stack.forEach((layer) => {
    if (layer.route) {
      routes.push({
        method: Object.keys(layer.route.methods).join(', ').toUpperCase(),
        path: layer.route.path,
        handler: layer.route.stack[0].handle.name || 'anonymous'
      });
    }
  });
  
  res.json({
    success: true,
    routes: routes,
    message: 'Available API routes'
  });
});

module.exports = router;