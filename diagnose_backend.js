#!/usr/bin/env node

/**
 * Quick test script to diagnose the 500 error in render backend
 */

const https = require('https');

// Configuration - update this to match your render backend URL
const BASE_URL = 'https://render-backend-bonn.onrender.com';

console.log('🚀 Testing Render Backend Endpoints');
console.log(`📍 Base URL: ${BASE_URL}`);
console.log('');

// Test endpoints
const tests = [
  {
    name: 'Health Check',
    method: 'GET',
    path: '/health',
    body: null
  },
  {
    name: 'Database Test',
    method: 'GET', 
    path: '/api/test',
    body: null
  },
  {
    name: 'Test Key Format',
    method: 'POST',
    path: '/api/test_verify',
    body: {
      user_id: 'test-device-123',
      unlock_key: 'vsm-ABCDEFG-5min'
    }
  },
  {
    name: 'Test Invalid Key Format',
    method: 'POST',
    path: '/api/test_verify',
    body: {
      user_id: 'test-device-123', 
      unlock_key: 'invalid-key'
    }
  },
  {
    name: 'Test Verify Key (Valid)',
    method: 'POST',
    path: '/api/verify_key',
    body: {
      user_id: 'test-device-123',
      unlock_key: 'vsm-ABCDEFG-5min'
    }
  }
];

async function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n🧪 Testing: ${test.name}`);
    console.log(`   Method: ${test.method} ${test.path}`);
    if (test.body) {
      console.log(`   Body: ${JSON.stringify(test.body)}`);
    }
    
    const url = new URL(BASE_URL + test.path);
    const options = {
      method: test.method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DiagnosticTest/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Headers: ${JSON.stringify(res.headers)}`);
        
        try {
          const parsed = body ? JSON.parse(body) : {};
          console.log(`   Response: ${JSON.stringify(parsed, null, 2)}`);
          
          if (res.statusCode >= 400) {
            console.log(`   ❌ ERROR: Status ${res.statusCode}`);
          } else {
            console.log(`   ✅ SUCCESS: Status ${res.statusCode}`);
          }
        } catch (e) {
          console.log(`   Raw Response: ${body}`);
        }
        
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log(`   ❌ REQUEST ERROR: ${error.message}`);
      resolve();
    });

    if (test.body) {
      const json = JSON.stringify(test.body);
      req.setHeader('Content-Length', Buffer.byteLength(json));
      req.write(json);
    }

    req.end();
  });
}

async function main() {
  console.log('=' .repeat(60));
  console.log('🔍 RENDER BACKEND DIAGNOSTIC TEST');
  console.log('=' .repeat(60));
  
  for (const test of tests) {
    await runTest(test);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 DIAGNOSTIC COMPLETE');
  console.log('='.repeat(60));
  
  console.log('\n💡 NEXT STEPS:');
  console.log('1. Check the database test output for schema issues');
  console.log('2. Look for any "undefined column" errors');
  console.log('3. If verify_key fails, check the specific error message');
  console.log('4. Compare with your Flutter app logs');
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.length > 0) {
  const customUrl = args[0];
  console.log(`🔄 Using custom URL: ${customUrl}`);
  BASE_URL = customUrl;
}

main().catch(console.error);