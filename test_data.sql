-- Test data for unlock key system
-- Run this in your PostgreSQL database to create test keys

-- Insert some test unlock keys
INSERT INTO unlock_keys (unlock_key, expires_at, used, duration_minutes) VALUES
('TEST-1234', NOW() + INTERVAL '1 hour', false, 5),
('ABCD-5678', NOW() + INTERVAL '1 hour', false, 5),
('DEMO-9999', NOW() + INTERVAL '1 hour', false, 5);

-- Check inserted data
SELECT * FROM unlock_keys ORDER BY created_at DESC;