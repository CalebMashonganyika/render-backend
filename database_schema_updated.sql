-- Updated Database schema for Duration-Aware Unlock Key System
-- Run this in your PostgreSQL database to fix duration support

-- Add missing columns to unlock_keys table if they don't exist
ALTER TABLE unlock_keys 
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS duration_type VARCHAR(10) DEFAULT '5min';

-- Update existing rows to have proper duration values
-- This will help with existing data
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

-- Add missing columns to user_tokens table if they don't exist
ALTER TABLE user_tokens 
ADD COLUMN IF NOT EXISTS duration_type VARCHAR(10) DEFAULT '5min';

-- Create indexes for better performance on the new columns
CREATE INDEX IF NOT EXISTS idx_unlock_keys_duration_type ON unlock_keys(duration_type);
CREATE INDEX IF NOT EXISTS idx_unlock_keys_duration_minutes ON unlock_keys(duration_minutes);
CREATE INDEX IF NOT EXISTS idx_user_tokens_duration_type ON user_tokens(duration_type);

-- Update the comments
COMMENT ON COLUMN unlock_keys.duration_minutes IS 'Duration in minutes for this unlock key';
COMMENT ON COLUMN unlock_keys.duration_type IS 'Duration type: 5min, 1day, or 1month';
COMMENT ON COLUMN user_tokens.duration_type IS 'Duration type that was used to generate this token';

-- Verify the table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'unlock_keys' 
ORDER BY ordinal_position;