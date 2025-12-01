// Test script for Render backend API
// Run with: node test.js

const https = require('https');

// Replace with your actual Render backend URL
// Format: https://your-service-name.onrender.com
const BASE_URL = 'https://render-backend-bonn.onrender.com';

// Test data
const testData = {
  user_id: 'test-user-123',
  unlock_key: 'ABCD-EFGH' // This will fail since no key exists, but tests the API
};

// Test verify_key endpoint
function testVerifyKey() {
  console.log('🧪 Testing /api/verify_key endpoint...');

  const data = JSON.stringify(testData);

  const options = {
    hostname: BASE_URL.replace('https://', ''),
    path: '/api/verify_key',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);

    res.on('data', (chunk) => {
      const response = JSON.parse(chunk.toString());
      console.log('Response:', JSON.stringify(response, null, 2));
    });
  });

  req.on('error', (e) => {
    console.error('❌ Error:', e.message);
  });

  req.write(data);
  req.end();
}

// Test check_token endpoint (will fail without a valid token)
function testCheckToken() {
  console.log('\n🧪 Testing /api/check_token endpoint...');

  const data = JSON.stringify({
    token: 'invalid-test-token'
  });

  const options = {
    hostname: BASE_URL.replace('https://', ''),
    path: '/api/check_token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);

    res.on('data', (chunk) => {
      const response = JSON.parse(chunk.toString());
      console.log('Response:', JSON.stringify(response, null, 2));
    });
  });

  req.on('error', (e) => {
    console.error('❌ Error:', e.message);
  });

  req.write(data);
  req.end();
}

// Test health check
function testHealth() {
  console.log('\n🧪 Testing /health endpoint...');

  const options = {
    hostname: BASE_URL.replace('https://', ''),
    path: '/health',
    method: 'GET'
  };

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);

    res.on('data', (chunk) => {
      try {
        const response = JSON.parse(chunk.toString());
        console.log('Response:', JSON.stringify(response, null, 2));
      } catch (e) {
        console.log('Response:', chunk.toString());
      }
    });
  });

  req.on('error', (e) => {
    console.error('❌ Error:', e.message);
  });

  req.end();
}

// Run all tests
console.log('🚀 Starting API tests for Render backend...');
console.log('📍 Base URL:', BASE_URL);
console.log('⚠️  Make sure to update BASE_URL with your actual Render service URL\n');

testHealth();
setTimeout(testVerifyKey, 1000);
setTimeout(testCheckToken, 2000);