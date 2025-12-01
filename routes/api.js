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

// POST /api/verify_key
router.post('/verify_key', async (req, res) => {
  try {
    const { user_id, unlock_key } = req.body;

    if (!user_id || !unlock_key) {
      return res.status(400).json({
        success: false,
        message: 'user_id and unlock_key are required'
      });
    }

    const client = await pool.connect();

    try {
      // Check if key exists, is not used, and not expired
      const query = `
        SELECT id FROM unlock_keys
        WHERE unlock_key = $1 AND used = false AND expires_at > NOW()
      `;
      const result = await client.query(query, [unlock_key]);

      if (result.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired unlock key'
        });
      }

      const keyId = result.rows[0].id;

      // Mark key as used and save redeemed_by
      await client.query(
        'UPDATE unlock_keys SET used = true, redeemed_by = $1 WHERE id = $2',
        [user_id, keyId]
      );

      // Generate a secure token for the user
      const token = generateSecureToken();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store token in database
      await client.query(
        'INSERT INTO user_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [token, user_id, expiresAt]
      );

      res.json({
        success: true,
        token: token,
        message: 'Premium features unlocked!',
        premium_until: expiresAt.toISOString(),
        duration_minutes: 5
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error verifying key:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
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
        SELECT id, unlock_key, expires_at, used, redeemed_by, created_at
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

module.exports = router;