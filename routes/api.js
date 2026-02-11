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

// Key duration configurations (in milliseconds)
const KEY_DURATIONS = {
  '5min': { label: '5 Minutes', duration: 5 * 60 * 1000 },
  '1day': { label: '1 Day', duration: 24 * 60 * 60 * 1000 },
  '1week': { label: '1 Week', duration: 7 * 24 * 60 * 60 * 1000 },
  '2weeks': { label: '2 Weeks', duration: 14 * 24 * 60 * 60 * 1000 },
  '1month': { label: '1 Month', duration: 30 * 24 * 60 * 60 * 1000 }
};

// Generate random unlock key in NEW format: vsm-XXXXXXXX-XXXX
// Duration is stored in database, NOT in the key format
function generateUnlockKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
  // Generate exactly 8 alphanumeric characters for the first part
  let firstPart = '';
  for (let i = 0; i < 8; i++) {
    firstPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Generate exactly 4 alphanumeric characters for the suffix
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `vsm-${firstPart}-${suffix}`;
}

// Generate WhatsApp-friendly key format
function generateWhatsAppKeyFormat(unlockKey) {
  return unlockKey;
}

// Validate key format - ONLY new format accepted: vsm-XXXXXXXX-XXXX
// Legacy format (with duration suffixes like 5min) is NO LONGER supported
function validateKeyFormat(key) {
  // New format: vsm-<8 alphanumeric>-<4 alphanumeric> ONLY
  const regex = /^vsm-[A-Z0-9]{8}-[A-Z0-9]{4}$/;
  
  // Check if it matches legacy format (should be rejected)
  const legacyRegex = /^vsm-[A-Z0-9]{8}-(5min|1day|1week|2weeks|1month)$/;
  
  if (legacyRegex.test(key)) {
    console.log('❌ LEGACY_FORMAT_REJECTED:', key);
    return false; // Reject legacy format
  }
  
  return regex.test(key);
}

 // Extract duration from key - for new format keys, we'll get duration from database
function extractDurationFromKey(key) {
  // New format has no duration in the key itself
  const regex = /^vsm-[A-Z0-9]{8}-[A-Z0-9]{4}$/;
  
  if (regex.test(key)) {
    // We'll get duration from database when we fetch the key
    console.log('🔑 NEW_FORMAT_KEY_DETECTED - duration will be retrieved from database');
    return null; // Return null to indicate we need to get duration from DB
  }
  
  return null;
}

// Calculate expiry timestamp based on duration type
function calculateExpiry(durationType = '5min') {
  const duration = KEY_DURATIONS[durationType] || KEY_DURATIONS['5min'];
  return new Date(Date.now() + duration.duration);
}

// Get duration info for a key
function getDurationInfo(durationType) {
  return KEY_DURATIONS[durationType] || KEY_DURATIONS['5min'];
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
      
      // Check table columns
      const columnsCheck = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'unlock_keys'
        ORDER BY ordinal_position
      `);
      
      res.json({
        success: true,
        message: 'Database connection successful',
        data: {
          current_time: result.rows[0].current_time,
          db_version: result.rows[0].db_version,
          table_exists: tableCheck.rows[0].table_exists,
          columns: columnsCheck.rows
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

// POST /api/test_verify - Test key verification endpoint
router.post('/test_verify', async (req, res) => {
  console.log('🧪 TEST_VERIFY_KEY_REQUEST');
  
  try {
    const { user_id, unlock_key } = req.body;
    
    console.log('🧪 TEST_DATA:', { user_id, unlock_key });
    
    if (!user_id || !unlock_key) {
      return res.status(400).json({
        success: false,
        error: 'user_id and unlock_key are required'
      });
    }
    
    // Test key format validation
    const isValidFormat = validateKeyFormat(unlock_key);
    console.log('🧪 FORMAT_VALID:', isValidFormat);
    
    if (!isValidFormat) {
      return res.status(400).json({
        success: false,
        error: 'Invalid key format. Only new format accepted: vsm-XXXXXXXX-XXXX (8 chars + dash + 4 alphanumeric chars)'
      });
    }
    
    // Extract duration
    const durationType = extractDurationFromKey(unlock_key);
    console.log('🧪 DURATION_TYPE:', durationType);
    
    const durationInfo = getDurationInfo(durationType);
    console.log('🧪 DURATION_INFO:', durationInfo);
    
    const expiresAt = calculateExpiry(durationType);
    console.log('🧪 EXPIRES_AT:', expiresAt.toISOString());
    
    res.json({
      success: true,
      message: 'Test verification successful',
      data: {
        key_format_valid: isValidFormat,
        extracted_duration: durationType,
        duration_info: durationInfo,
        calculated_expiry: expiresAt.toISOString(),
        duration_minutes: Math.floor(durationInfo.duration / (60 * 1000))
      }
    });
    
  } catch (error) {
    console.error('❌ Test verify error:', error);
    res.status(500).json({
      success: false,
      error: 'Test verification failed',
      details: error.message
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
        error: 'user_id and unlock_key are required'
      });
    }

    // Validate key format (ONLY new format accepted: vsm-XXXXXXXX-XXXX)
    if (!validateKeyFormat(unlock_key)) {
      console.log('❌ INVALID_KEY_FORMAT:', unlock_key);
      return res.status(400).json({
        success: false,
        error: 'Invalid key format. Only new format accepted: vsm-XXXXXXXX-XXXX (8 chars + dash + 4 alphanumeric chars)'
      });
    }

     console.log('🔗 CONNECTING_TO_DATABASE...');
     const client = await pool.connect();

     try {
       console.log('✅ DATABASE_CONNECTED');

       // Check if key exists with new schema
       const query = `
         SELECT id, unlock_key, key_expires_at, premium_duration_seconds, used, duration_type, redeemed_by FROM unlock_keys
         WHERE unlock_key = $1
       `;
       console.log('🔍 QUERYING_KEY:', query, [unlock_key]);
       
       const result = await client.query(query, [unlock_key]);
       console.log('📊 QUERY_RESULT:', result.rows);

       // If key doesn't exist, create it automatically with the new schema
       let keyId;
       let keyData;
       let durationType; // Will be set from DB or default
       
       if (result.rows.length === 0) {
         console.log('🔑 KEY_NOT_FOUND_CREATING_NEW...');
         durationType = '5min'; // Default if key not found
         const durationInfo = getDurationInfo(durationType);
         const premiumDurationSeconds = Math.floor(durationInfo.duration / 1000);
         const keyExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
         
         const insertResult = await client.query(
           'INSERT INTO unlock_keys (unlock_key, expires_at, key_expires_at, premium_duration_seconds, used, duration_type, created_at, duration_minutes) VALUES ($1, $2, $3, $4, false, $5, NOW(), $6) RETURNING id, unlock_key, key_expires_at, premium_duration_seconds, used, duration_type',
           [unlock_key, keyExpiresAt, keyExpiresAt, premiumDurationSeconds, durationType, Math.floor(premiumDurationSeconds / 60)]
         );
         keyData = insertResult.rows[0];
         keyId = keyData.id;
         console.log('✅ NEW_KEY_CREATED_WITH_ID:', keyId, 'key_expires_at:', keyData.key_expires_at);
       } else {
         keyData = result.rows[0];
         keyId = keyData.id;
         durationType = keyData.duration_type; // Get duration from database
        
        // Check if key is already used (one-time-use enforcement)
        if (keyData.used) {
          console.log('❌ KEY_ALREADY_USED');
          return res.status(400).json({
            success: false,
            error: 'Key has already been used'
          });
        }
        
        // Check if key is expired (30-day key validity)
        const now = new Date();
        const keyExpiresAt = new Date(keyData.key_expires_at);
        if (now > keyExpiresAt) {
          console.log('❌ KEY_EXPIRED at:', keyExpiresAt.toISOString(), 'now:', now.toISOString());
          return res.status(400).json({
            success: false,
            error: 'Key has expired (30-day validity period exceeded)'
          });
        }
      }

      console.log('🔑 KEY_ID_FOUND:', keyId);

      // Mark key as used and save redeemed_by (one-time-use enforcement)
      console.log('🔄 MARKING_KEY_AS_USED...');
      await client.query(
        'UPDATE unlock_keys SET used = true, redeemed_by = $1, redeemed_at = NOW() WHERE id = $2',
        [user_id, keyId]
      );
      console.log('✅ KEY_MARKED_AS_USED');

      // Generate a secure token for the user
      const token = generateSecureToken();
      const durationInfo = getDurationInfo(durationType);

      // CRITICAL FIX: Calculate premium expiration using duration from key format, NOT database
      // Ensure we get the correct duration in milliseconds
      const durationMs = durationInfo.duration; // This comes from KEY_DURATIONS mapping
      const currentTimestamp = Date.now();
      const premiumExpiresAt = new Date(currentTimestamp + durationMs);

      console.log('🔍 DURATION_TYPE_FROM_KEY:', durationType);
      console.log('🔍 DURATION_INFO:', durationInfo);
      console.log('🔍 DURATION_MS:', durationMs);
      console.log('🔍 NOW_TIMESTAMP:', currentTimestamp);
      console.log('🔍 CALCULATED_EXPIRES_AT:', premiumExpiresAt.toISOString());

      console.log('🎫 GENERATED_TOKEN:', token.substring(0, 8) + '...');
      console.log('⏰ ORIGINAL_PREMIUM_EXPIRES_AT:', premiumExpiresAt.toISOString());
      console.log('⏰ ORIGINAL_EXPIRES_AT_LOCAL:', premiumExpiresAt.toString());
      console.log('⏳ CALCULATED_DURATION_MS:', durationMs);
      console.log('📋 DURATION_INFO:', durationInfo);

      // DEBUG: Check if the timestamp is correct
      console.log('🧪 TIMESTAMP_DEBUG:');
      console.log('🧪 Is premiumExpiresAt in future?', premiumExpiresAt > new Date());
      console.log('🧪 premiumExpiresAt.getTime():', premiumExpiresAt.getTime());
      console.log('🧪 Date.now():', Date.now());
      console.log('🧪 Difference (should be durationMs):', premiumExpiresAt.getTime() - Date.now());

      // Store token in database with premium expiration using UTC
      console.log('💾 STORING_TOKEN_IN_DATABASE...');
      // CRITICAL FIX: Store timestamp directly without timezone conversion
      await client.query(
        'INSERT INTO user_tokens (token, user_id, expires_at, duration_type) VALUES ($1, $2, $3, $4)',
        [token, user_id, premiumExpiresAt.toISOString(), durationType]
      );
      console.log('✅ TOKEN_STORED_SUCCESSFULLY');
      console.log('💾 STORED_ISO_EXPIRY:', premiumExpiresAt.toISOString());
      console.log('💾 STORED_TIMESTAMP_VALUE:', premiumExpiresAt.getTime());

      // CRITICAL FIX: Ensure premium_expires_at is properly returned to the app
      // This timestamp MUST be used by the app for countdown - never recalculated locally
      console.log('🔒 UTC PREMIUM_EXPIRES_AT:', premiumExpiresAt.toISOString());
      console.log('🔒 APP_MUST_USE_THIS_TIMESTAMP_FOR_COUNTDOWN');
      
      // Validate the timestamp is in the future
      const validationNow = new Date();
      if (premiumExpiresAt <= validationNow) {
        console.error('❌ CRITICAL_ERROR: Generated expiry time is not in the future!');
        console.error('❌ NOW:', validationNow.toISOString());
        console.error('❌ EXPIRY:', premiumExpiresAt.toISOString());
        throw new Error('Generated expiry time is invalid');
      }

      // Fix duration type based on actual premium duration seconds from database
      let fixedDurationType = durationType;
      const actualSeconds = keyData.premium_duration_seconds;
      
      if (actualSeconds >= 604800) { // 7 days = 604800 seconds
        fixedDurationType = '1week';
      } else if (actualSeconds >= 172800) { // 2 days = 172800 seconds (2 weeks)
        fixedDurationType = '2weeks';
      } else if (actualSeconds >= 86400) { // 1 day = 86400 seconds
        fixedDurationType = '1day';
      } else if (actualSeconds >= 2592000) { // 30 days = 2592000 seconds
        fixedDurationType = '1month';
      } else { // Less than 1 day
        fixedDurationType = '5min';
      }
      
      if (fixedDurationType !== durationType) {
        console.log('🔧 FIXED_DURATION_TYPE: Changed from', durationType, 'to', fixedDurationType, 'based on actual seconds:', actualSeconds);
        // Update duration_type in database for future reference
        await client.query(
          'UPDATE unlock_keys SET duration_type = $1 WHERE id = $2',
          [fixedDurationType, keyId]
        );
        durationType = fixedDurationType; // Use the fixed duration type for calculation
        // Recalculate expiry with correct duration
        const durationInfo = getDurationInfo(durationType);
        const durationMs = durationInfo.duration; // This comes from KEY_DURATIONS mapping
        const currentTimestamp = Date.now();
        premiumExpiresAt = new Date(currentTimestamp + durationMs);
        console.log('🔧 RECALCULATED_EXPIRY: New expiry is', premiumExpiresAt.toISOString());
      }
      
      const response = {
        success: true,
        message: 'Premium features unlocked!',
        token: token,
        premium_until: premiumExpiresAt.toISOString(), // Premium expires based on key duration
        premium_expires_at: premiumExpiresAt.toISOString(), // Same timestamp, explicit field name
        duration_type: durationType,
        premium_duration_seconds: keyData.premium_duration_seconds,
        premium_duration_minutes: Math.floor(keyData.premium_duration_seconds / 60)
      };

      console.log('📤 RESPONSE_WITH_EXPIRY:', response);

      console.log('🎉 SUCCESS_RESPONSE:', response);
      res.json(response);

    } catch (dbError) {
      console.error('❌ DATABASE_ERROR:', dbError);
      console.error('❌ DATABASE_ERROR_STACK:', dbError.stack);
      console.error('❌ DATABASE_ERROR_CODE:', dbError.code);
      console.error('❌ DATABASE_ERROR_DETAIL:', dbError.detail);
      
      // Handle specific database errors
      if (dbError.code === '42703') { // undefined column
        return res.status(500).json({
          success: false,
          error: 'Database schema error: Missing column',
          details: dbError.message,
          timestamp: new Date().toISOString(),
          hint: 'Please run the database migration script to add missing columns'
        });
      }
      
      if (dbError.code === '42P01') { // undefined table
        return res.status(500).json({
          success: false,
          error: 'Database schema error: Table does not exist',
          details: dbError.message,
          timestamp: new Date().toISOString(),
          hint: 'Please create the unlock_keys table'
        });
      }
      
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
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/check_token
router.post('/check_token', async (req, res) => {
  console.log('🔍 CHECK_TOKEN_REQUEST:', {
    method: req.method,
    url: req.url,
    body: req.body,
    timestamp: new Date().toISOString()
  });

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        active: false,
        error: 'Token is required'
      });
    }

    const client = await pool.connect();

    try {
      // Check if token exists and get its expiry
      const query = `
        SELECT user_id, expires_at FROM user_tokens
        WHERE token = $1
      `;
      const result = await client.query(query, [token]);

      if (result.rows.length === 0) {
        console.log('❌ TOKEN_NOT_FOUND:', token.substring(0, 8) + '...');
        return res.status(401).json({
          success: false,
          active: false,
          error: 'Invalid token'
        });
      }

      const { user_id, expires_at } = result.rows[0];
      const now = new Date();
      const expiresAt = new Date(expires_at);

      // Calculate remaining time using SERVER TIME ONLY
      const remainingTime = expiresAt.getTime() - now.getTime();
      const isActive = remainingTime > 0;

      console.log('🔍 TOKEN_CHECK_RESULT:', {
        user_id,
        expires_at: expires_at.toISOString(),
        now: now.toISOString(),
        remaining_time_ms: remainingTime,
        active: isActive
      });

      if (!isActive) {
        console.log('❌ TOKEN_EXPIRED');
        return res.json({
          success: true,
          active: false,
          expired_at: expires_at.toISOString(),
          message: 'Premium subscription has expired'
        });
      }

      console.log('✅ TOKEN_ACTIVE');
      res.json({
        success: true,
        active: true,
        user_id: user_id,
        expires_at: expires_at.toISOString(),
        remaining_time: remainingTime, // Time left in milliseconds
        remaining_minutes: Math.floor(remainingTime / (60 * 1000)),
        message: 'Premium subscription is active'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Error checking token:', error);
    res.status(500).json({
      success: false,
      active: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/keys (for admin dashboard - requires auth)
router.get('/keys', requireAdminAuth, async (req, res) => {
  try {
    const client = await pool.connect();

    try {
      const query = `
        SELECT id, unlock_key, expires_at, key_expires_at, premium_duration_seconds, used, redeemed_by, duration_type, created_at, duration_minutes
        FROM unlock_keys
        ORDER BY created_at DESC
      `;
      const result = await client.query(query);

      // Add computed fields for better display
      const keys = result.rows.map(key => {
        const keyExpiresAt = new Date(key.key_expires_at);
        const now = new Date();
        const keyExpired = now > keyExpiresAt;
        
        const durationInfo = getDurationInfo(key.duration_type || '5min');
        
        return {
          ...key,
          key_expired: keyExpired,
          key_expires_in_days: Math.max(0, Math.ceil((keyExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
          premium_duration_label: durationInfo.label,
          premium_duration_minutes: Math.floor(key.premium_duration_seconds / 60)
        };
      });

      res.json({
        success: true,
        keys: keys
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

// POST /api/generate_key (for admin dashboard - requires auth)
router.post('/generate_key', requireAdminAuth, async (req, res) => {
  try {
    const { duration_type = '5min' } = req.body;
    
    // Validate duration type
    if (!KEY_DURATIONS[duration_type]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid duration type'
      });
    }

    const client = await pool.connect();

    try {
      // Generate key in NEW format: vsm-XXXXXXXX-XXXX
      const unlockKey = generateUnlockKey();
      const durationInfo = getDurationInfo(duration_type);
      const premiumDurationSeconds = Math.floor(durationInfo.duration / 1000); // Convert ms to seconds
      const keyExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      // Store the key in database with duration_type
      const result = await client.query(
        'INSERT INTO unlock_keys (unlock_key, key_expires_at, premium_duration_seconds, duration_type, used, created_at) VALUES ($1, $2, $3, $4, false, NOW()) RETURNING id, unlock_key, key_expires_at, premium_duration_seconds, duration_type, used, created_at',
        [unlockKey, keyExpiresAt, premiumDurationSeconds, duration_type]
      );

      const keyData = result.rows[0];

      // Generate WhatsApp-friendly format
      const whatsappFormat = generateWhatsAppKeyFormat(unlockKey);

      res.json({
        success: true,
        key: {
          id: keyData.id,
          unlock_key: keyData.unlock_key,
          duration_type: keyData.duration_type,
          duration_label: durationInfo.label,
          premium_duration_seconds: keyData.premium_duration_seconds,
          key_expires_at: keyData.key_expires_at,
          created_at: keyData.created_at,
          used: keyData.used,
          whatsapp_format: whatsappFormat
        },
        message: `Key generated successfully for ${durationInfo.label}. Key expires in 30 days.`,
        whatsapp_format: whatsappFormat
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error generating key:', error);
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