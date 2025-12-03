-- Migration script for new key system
-- Adds key_expires_at and premium_duration_seconds columns

-- Add new columns to unlock_keys table
ALTER TABLE unlock_keys 
ADD COLUMN IF NOT EXISTS key_expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
ADD COLUMN IF NOT EXISTS premium_duration_seconds INTEGER NOT NULL DEFAULT 300;

-- Update existing rows to have proper values
UPDATE unlock_keys 
SET 
    premium_duration_seconds = CASE 
        WHEN duration_type = '5min' THEN 300
        WHEN duration_type = '1day' THEN 86400
        WHEN duration_type = '1month' THEN 2592000
        ELSE 300
    END,
    key_expires_at = CASE 
        WHEN key_expires_at IS NULL THEN created_at + INTERVAL '30 days'
        ELSE key_expires_at
    END
WHERE premium_duration_seconds IS NULL OR key_expires_at IS NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_unlock_keys_key_expires_at ON unlock_keys(key_expires_at);
CREATE INDEX IF NOT EXISTS idx_unlock_keys_premium_duration ON unlock_keys(premium_duration_seconds);

-- Add comments for documentation
COMMENT ON COLUMN unlock_keys.key_expires_at IS 'When this key expires (always 30 days from creation)';
COMMENT ON COLUMN unlock_keys.premium_duration_seconds IS 'Duration of premium access after redemption in seconds';

-- Verify the table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'unlock_keys' 
ORDER BY ordinal_position;