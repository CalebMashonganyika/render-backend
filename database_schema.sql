-- Database schema for Unlock Key System
-- Run this in your PostgreSQL database

-- Create unlock_keys table
CREATE TABLE IF NOT EXISTS unlock_keys (
    id SERIAL PRIMARY KEY,
    unlock_key VARCHAR(20) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    redeemed_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user_tokens table for session management
CREATE TABLE IF NOT EXISTS user_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_unlock_key ON unlock_keys(unlock_key);
CREATE INDEX IF NOT EXISTS idx_expires_at ON unlock_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_used ON unlock_keys(used);
CREATE INDEX IF NOT EXISTS idx_token ON user_tokens(token);
CREATE INDEX IF NOT EXISTS idx_user_id ON user_tokens(user_id);

-- Optional: Clean up expired tokens (run this periodically)
-- DELETE FROM user_tokens WHERE expires_at < NOW();
-- DELETE FROM unlock_keys WHERE expires_at < NOW() AND used = false;