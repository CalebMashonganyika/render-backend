# Fix 500 Error in Render Backend - Complete Solution

## Issue Summary

You're getting a **500 Internal Server Error** when the Flutter app tries to verify unlock keys. The admin dashboard works fine, indicating the backend is running, but there's likely a database schema issue with the `/api/verify_key` endpoint.

## Root Cause

The 500 error is likely caused by **missing database columns** that the API expects:
- `duration_minutes` column in `unlock_keys` table
- `duration_type` column in `unlock_keys` table  
- `duration_type` column in `user_tokens` table

## Quick Fix Steps

### 1. Run Database Migration (Critical)

Run this SQL on your Neon PostgreSQL database to add the missing columns:

```sql
-- Add missing columns to unlock_keys table
ALTER TABLE unlock_keys 
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS duration_type VARCHAR(10) DEFAULT '5min';

-- Add missing columns to user_tokens table  
ALTER TABLE user_tokens 
ADD COLUMN IF NOT EXISTS duration_type VARCHAR(10) DEFAULT '5min';

-- Update existing rows to have proper duration values
UPDATE unlock_keys 
SET 
    duration_minutes = CASE 
        WHEN unlock_key LIKE '%-5min' THEN 5
        WHEN unlock_key LIKE '%-1day' THEN 1440
        WHEN unlock_key LIKE '%-1month' THEN 43200
        ELSE 5
    END,
    duration_type = CASE 
        WHEN unlock_key LIKE '%-5min' THEN '5min'
        WHEN unlock_key LIKE '%-1day' THEN '1day'
        WHEN unlock_key LIKE '%-1month' THEN '1month'
        ELSE '5min'
    END
WHERE duration_minutes IS NULL OR duration_type IS NULL;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_unlock_keys_duration_type ON unlock_keys(duration_type);
CREATE INDEX IF NOT EXISTS idx_unlock_keys_duration_minutes ON unlock_keys(duration_minutes);
CREATE INDEX IF NOT EXISTS idx_user_tokens_duration_type ON user_tokens(duration_type);
```

### 2. Redeploy Backend (If Needed)

If you're running the backend locally or need to redeploy, make sure you have the latest changes.

### 3. Test the Fix

Use the diagnostic script to test your backend:

```bash
cd render-backend
node diagnose_backend.js
```

This will test all the endpoints and show you exactly what's failing.

## Enhanced Error Handling

I've already updated the backend code with better error handling that will:

1. **Detect missing columns** and provide specific error messages
2. **Show database schema issues** in the `/api/test` endpoint
3. **Provide debugging info** in error responses

## Flutter App Verification

Your Flutter app is already correctly configured to use the render backend:

```dart
// In viar_app/lib/subscription_service.dart
static const String renderBaseUrl = 'https://render-backend-bonn.onrender.com';
```

No changes needed in the Flutter app - it's connecting to the right backend.

## Quick Test Commands

Test the key verification directly:

```bash
# Test database connection
curl "https://render-backend-bonn.onrender.com/api/test"

# Test key format validation
curl -X POST "https://render-backend-bonn.onrender.com/api/test_verify" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test-device","unlock_key":"vsm-ABCDEFG-5min"}'

# Test actual key verification
curl -X POST "https://render-backend-bonn.onrender.com/api/verify_key" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test-device","unlock_key":"vsm-ABCDEFG-5min"}'
```

## Expected Behavior After Fix

1. **Database test** should show all required columns
2. **Key verification** should return proper duration information
3. **Flutter app** should successfully unlock premium features for the correct duration

## Troubleshooting

If you still get errors after running the migration:

1. Check the **Render backend logs** for detailed error messages
2. Run the **diagnostic script** to identify the specific issue
3. Verify the **database schema** has the required columns
4. Test with **Postman** or **curl** before testing in the app

## Key Files Updated

- `routes/api.js` - Enhanced with better error handling and database queries
- `diagnose_backend.js` - Diagnostic tool to test all endpoints
- `database_schema.sql` - Updated with duration-aware columns
- `FIX_500_ERROR.md` - This troubleshooting guide

The fix should resolve your 500 error and get the unlock key system working with proper duration handling! 🎉