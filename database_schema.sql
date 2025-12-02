-- Database schema for Unlock Key System
-- Run this in your PostgreSQL database

-- Create unlock_keys table
CREATE TABLE IF NOT EXISTS unlock_keys (
    id SERIAL PRIMARY KEY,
    unlock_key VARCHAR(25) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    redeemed_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_minutes INTEGER DEFAULT 5,
    duration_type VARCHAR(10) DEFAULT '5min'
);

-- Create user_tokens table for session management
CREATE TABLE IF NOT EXISTS user_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_type VARCHAR(10) DEFAULT '5min'
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_unlock_key ON unlock_keys(unlock_key);
CREATE INDEX IF NOT EXISTS idx_expires_at ON unlock_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_used ON unlock_keys(used);
CREATE INDEX IF NOT EXISTS idx_duration_type ON unlock_keys(duration_type);
CREATE INDEX IF NOT EXISTS idx_duration_minutes ON unlock_keys(duration_minutes);
CREATE INDEX IF NOT EXISTS idx_token ON user_tokens(token);
CREATE INDEX IF NOT EXISTS idx_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_token_duration_type ON user_tokens(duration_type);

-- Optional: Clean up expired tokens (run this periodically)
-- DELETE FROM user_tokens WHERE expires_at < NOW();
-- DELETE FROM unlock_keys WHERE expires_at < NOW() AND used = false;