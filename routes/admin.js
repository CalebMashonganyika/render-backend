const express = require('express');
const path = require('path');
const crypto = require('crypto');
const pkg = require('pg');
const { Pool } = pkg;

const router = express.Router();

// GET /admin - serve the admin dashboard HTML
router.get('/', (req, res) => {
  console.log('📄 Router serving admin dashboard HTML');
  res.sendFile(path.join(__dirname, '../public', 'admin-fixed.html'));
});

// Database connection (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Admin authentication middleware
function requireAdminAuth(req, res, next) {
  console.log('🔍 Admin auth check:');
  console.log('  📋 Session exists:', !!req.session);
  console.log('  🔑 Session ID:', req.sessionID);
  console.log('  🎛️ Session data:', JSON.stringify(req.session));
  console.log('  👤 isAdmin:', req.session?.isAdmin);
  console.log('  🍪 Cookie header:', req.headers.cookie);
  
  // Check session auth
  if (req.session && req.session.isAdmin) {
    console.log('✅ Session-based admin auth successful');
    return next();
  }

  // Check Bearer token auth
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    console.log('🔑 Bearer token auth attempt, token length:', token.length);
    // For now, accept the admin password as a token
    if (token === process.env.ADMIN_PASSWORD) {
      console.log('✅ Bearer token admin auth successful');
      return next();
    }
  }

  console.log('❌ Admin authentication failed - no valid session or token');
  console.log('  ❌ Session check:', !!req.session);
  console.log('  ❌ isAdmin check:', req.session?.isAdmin);
  console.log('  ❌ Authorization header:', req.headers.authorization);
  return res.status(401).json({
    success: false,
    message: 'Admin authentication required'
  });
}

// POST /admin/login
router.post('/login', async (req, res) => {
  try {
    console.log('🔐 Admin login attempt from:', req.ip);
    console.log('📝 Request body:', JSON.stringify(req.body));
    console.log('📝 Request headers:', JSON.stringify(req.headers));

    const { password } = req.body;

    if (!password) {
      console.log('❌ Login failed: No password provided');
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    // Check password against environment variable with fallback
    let adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.log('⚠️ ADMIN_PASSWORD not set in environment, using default: admin123');
      adminPassword = 'admin123';
    } else {
      console.log('✅ ADMIN_PASSWORD found in environment');
    }

    console.log('🔑 Received password:', password);
    console.log('🔑 Expected password:', adminPassword);

    // Simple password check
    if (password !== adminPassword) {
      console.log('❌ Login failed: Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Set session
    req.session.isAdmin = true;
    req.session.loginTime = new Date().toISOString();

    console.log('✅ Admin login successful - session set');
    console.log('📋 Session data:', JSON.stringify(req.session));

    res.json({
      success: true,
      message: 'Login successful',
      redirect: '/admin'
    });

  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error: ' + error.message
    });
  }
});

// POST /admin/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }

    res.clearCookie('connect.sid');
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// GET /admin/test - Simple test endpoint to verify communication
router.get('/test', (req, res) => {
  console.log('🧪 Test endpoint hit');
  console.log('📋 Session:', !!req.session);
  console.log('📋 Headers:', JSON.stringify(req.headers));
  
  res.json({
    success: true,
    message: 'Communication working!',
    timestamp: new Date().toISOString(),
    session: {
      id: req.sessionID,
      isAdmin: req.session?.isAdmin || false
    },
    headers: {
      'content-type': req.headers['content-type'],
      'origin': req.headers.origin,
      'user-agent': req.headers['user-agent']
    }
  });
});

// POST /admin/generate_key (requires auth)
router.post('/generate_key', requireAdminAuth, async (req, res) => {
  let client;

  try {
    const { duration } = req.body;
    console.log('🔑 Generating new unlock key, duration:', duration, 'minutes');
    
    // Default to 5 minutes if not specified
    const durationMinutes = duration ? parseInt(duration) : 5;
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid duration'
      });
    }

    client = await pool.connect();

    // Generate unique key
    let key;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      key = generateUnlockKey();
      attempts++;

      // Check if key already exists
      const checkQuery = 'SELECT id FROM unlock_keys WHERE unlock_key = $1';
      const checkResult = await client.query(checkQuery, [key]);

      if (checkResult.rows.length === 0) break;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      console.error('❌ Could not generate unique key after', maxAttempts, 'attempts');
      return res.status(500).json({
        success: false,
        message: 'Could not generate unique key'
      });
    }

    // Set expiry based on duration
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    // Insert new key
    const insertQuery = `
      INSERT INTO unlock_keys (unlock_key, expires_at, used, duration_minutes)
      VALUES ($1, $2, false, $3)
      RETURNING id, unlock_key, expires_at, duration_minutes, created_at
    `;
    const result = await client.query(insertQuery, [key, expiresAt, durationMinutes]);

    console.log('✅ Key generated successfully:', key, 'for', durationMinutes, 'minutes');

    res.json({
      success: true,
      key: result.rows[0],
      message: `Key generated successfully (${durationMinutes} minutes)`
    });

  } catch (error) {
    console.error('❌ Error generating key:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  } finally {
    if (client) client.release();
  }
});

// DELETE /admin/keys/:id (requires auth)
router.delete('/keys/:id', requireAdminAuth, async (req, res) => {
  let client;

  try {
    const { id } = req.params;
    console.log('🗑️ Deleting key with ID:', id);

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid key ID'
      });
    }

    client = await pool.connect();

    const deleteQuery = 'DELETE FROM unlock_keys WHERE id = $1 RETURNING id';
    const result = await client.query(deleteQuery, [parseInt(id)]);

    if (result.rows.length === 0) {
      console.log('❌ Key not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Key not found'
      });
    }

    console.log('✅ Key deleted successfully:', id);
    res.json({
      success: true,
      message: 'Key deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting key:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  } finally {
    if (client) client.release();
  }
});

// PUT /admin/keys/:id/toggle (requires auth) - mark as used/unused
router.put('/keys/:id/toggle', requireAdminAuth, async (req, res) => {
  let client;

  try {
    const { id } = req.params;
    console.log('🔄 Toggling key status for ID:', id);

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid key ID'
      });
    }

    client = await pool.connect();

    // Get current status
    const selectQuery = 'SELECT used FROM unlock_keys WHERE id = $1';
    const selectResult = await client.query(selectQuery, [parseInt(id)]);

    if (selectResult.rows.length === 0) {
      console.log('❌ Key not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Key not found'
      });
    }

    const currentUsed = selectResult.rows[0].used;
    const newUsed = !currentUsed;

    // Update status
    const updateQuery = 'UPDATE unlock_keys SET used = $1 WHERE id = $2 RETURNING id, used';
    const updateResult = await client.query(updateQuery, [newUsed, parseInt(id)]);

    console.log('✅ Key status toggled:', id, '->', newUsed ? 'used' : 'unused');

    res.json({
      success: true,
      key: updateResult.rows[0],
      message: `Key marked as ${newUsed ? 'used' : 'unused'}`
    });

  } catch (error) {
    console.error('❌ Error toggling key status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  } finally {
    if (client) client.release();
  }
});

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

module.exports = router;