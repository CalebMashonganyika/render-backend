// Test script to verify rate limiting returns JSON instead of plain text
const express = require('express');
const rateLimit = require('express-rate-limit');

// Mock the app environment for testing
const app = express();

// Apply the same rate limiting configuration as the main app
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2, // Very low limit for testing
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  // Custom handler to return JSON instead of plain text
  handler: (req, res, next, options) => {
    console.log('⚠️ Rate limit exceeded for IP:', req.ip);
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.round(options.windowMs / 1000) || 60
    });
  }
});

app.use('/api/', limiter);

// Add a test endpoint
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Test endpoint working' });
});

// Test route
app.get('/test', (req, res) => {
  res.send('Server is running');
});

module.exports = app;

// If this file is run directly, start the test server
if (require.main === module) {
  const PORT = 3001;
  app.listen(PORT, () => {
    console.log(`🧪 Test server running on port ${PORT}`);
    console.log('📝 Test rate limiting with multiple rapid requests to /api/test');
  });
}