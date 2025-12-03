-- Database Migration for Key System Fix
-- Run this in your Neon PostgreSQL SQL Editor

-- 1. Add missing columns if they don't exist
ALTER TABLE unlock_keys 
ADD COLUMN IF NOT EXISTS key_expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '30 days',
ADD COLUMN IF NOT EXISTS premium_duration_seconds INTEGER NOT NULL DEFAULT 300,
ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS redeemed_by TEXT NULL;

-- 2. Update existing rows to have proper values
UPDATE unlock_keys 
SET 
  key_expires_at = CASE 
    WHEN key_expires_at IS NULL THEN created_at + INTERVAL '30 days'
    ELSE key_expires_at 
  END,
  premium_duration_seconds = CASE 
    WHEN duration_type = '5min' THEN 300
    WHEN duration_type = '1day' THEN 86400
    WHEN duration_type = '1month' THEN 2592000
    WHEN premium_duration_seconds IS NULL THEN 300
    ELSE premium_duration_seconds
  END
WHERE key_expires_at IS NULL OR premium_duration_seconds IS NULL;

-- 3. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_unlock_keys_key_expires_at ON unlock_keys(key_expires_at);
CREATE INDEX IF NOT EXISTS idx_unlock_keys_premium_duration_seconds ON unlock_keys(premium_duration_seconds);
CREATE INDEX IF NOT EXISTS idx_unlock_keys_used ON unlock_keys(used);
CREATE INDEX IF NOT EXISTS idx_unlock_keys_duration_type ON unlock_keys(duration_type);