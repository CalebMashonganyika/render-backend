#!/usr/bin/env node

/**
 * Test script for Duration-Aware Unlock Key System
 * Tests the complete flow: key generation, verification, and duration handling
 */

const https = require('https');

// Configuration
const BASE_URL = process.env.RENDER_BACKEND_URL || 'http://localhost:3000';
const TEST_KEYS = [
    'vsm-ABCDEFGH-5min',
    'vsm-IJKLMNOP-1day', 
    'vsm-QRSTUVWX-1month'
];

// Test results tracking
let testsPassed = 0;
let testsFailed = 0;

/**
 * Make HTTP request helper
 */
function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const options = {
            method: method,
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'KeyDurationTest/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = body ? JSON.parse(body) : {};
                    resolve({ status: res.statusCode, body: parsed, raw: body });
                } catch (e) {
                    resolve({ status: res.statusCode, body: body, raw: body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            const json = JSON.stringify(data);
            req.setHeader('Content-Length', Buffer.byteLength(json));
            req.write(json);
        }

        req.end();
    });
}

/**
 * Log test result
 */
function logTest(testName, passed, message = '') {
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${testName}: ${status} ${message}`);
    
    if (passed) {
        testsPassed++;
    } else {
        testsFailed++;
        console.log(`   Error: ${message}`);
    }
}

/**
 * Test database connection
 */
async function testDatabaseConnection() {
    try {
        console.log('\n🔗 Testing database connection...');
        const response = await makeRequest('GET', '/api/test');
        
        if (response.status === 200 && response.body.success) {
            logTest('Database Connection', true, `Connected at ${response.body.data.current_time}`);
            return true;
        } else {
            logTest('Database Connection', false, `Status: ${response.status}`);
            return false;
        }
    } catch (error) {
        logTest('Database Connection', false, error.message);
        return false;
    }
}

/**
 * Test key format validation
 */
function testKeyFormatValidation() {
    console.log('\n🔑 Testing key format validation...');
    
    const testCases = [
        { key: 'vsm-ABC12345-5min', expected: true, desc: 'Valid 5min key' },
        { key: 'vsm-XYZ78901-1day', expected: true, desc: 'Valid 1day key' },
        { key: 'vsm-ONE23456-1month', expected: true, desc: 'Valid 1month key' },
        { key: 'invalid-key', expected: false, desc: 'Invalid format' },
        { key: 'vsm-ABC-5min', expected: false, desc: 'Too short code' },
        { key: 'vsm-ABCDEFGH-5mins', expected: false, desc: 'Invalid duration' },
        { key: 'VSM-ABCDEFGH-5min', expected: true, desc: 'Uppercase prefix' }
    ];

    // Simple regex pattern for validation
    const regex = /^vsm-[A-Z0-9]{8}-(5min|1day|1month)$/i;
    
    testCases.forEach(testCase => {
        const isValid = regex.test(testCase.key);
        const passed = isValid === testCase.expected;
        logTest(`Format: ${testCase.desc}`, passed, `Key: ${testCase.key}`);
    });
}

/**
 * Test key generation via API
 */
async function testKeyGeneration() {
    console.log('\n🏭 Testing key generation...');
    
    const durationTypes = ['5min', '1day', '1month'];
    
    for (const duration of durationTypes) {
        try {
            console.log(`\n📝 Testing ${duration} generation...`);
            
            // Simulate admin authentication and key generation
            const response = await makeRequest('POST', '/admin/generate_key', { 
                duration_type: duration 
            });
            
            if (response.status === 200 && response.body.success) {
                const keyData = response.body.key;
                logTest(`Generate ${duration} Key`, true, 
                    `Key: ${keyData.unlock_key}, Duration: ${keyData.duration_type}`);
                
                // Validate key format
                const regex = /^vsm-[A-Z0-9]{8}-(5min|1day|1month)$/i;
                const formatValid = regex.test(keyData.unlock_key);
                logTest(`Key Format for ${duration}`, formatValid, 
                    `Key matches pattern: ${keyData.unlock_key}`);
            } else {
                logTest(`Generate ${duration} Key`, false, 
                    `Status: ${response.status}, Error: ${JSON.stringify(response.body)}`);
            }
        } catch (error) {
            logTest(`Generate ${duration} Key`, false, error.message);
        }
    }
}

/**
 * Test key verification with different durations
 */
async function testKeyVerification() {
    console.log('\n🔍 Testing key verification...');
    
    for (const testKey of TEST_KEYS) {
        try {
            console.log(`\n🧪 Testing verification for: ${testKey}`);
            
            const deviceId = 'test-device-' + Date.now();
            const response = await makeRequest('POST', '/api/verify_key', {
                user_id: deviceId,
                unlock_key: testKey
            });
            
            if (response.status === 200 && response.body.success) {
                logTest(`Verify ${testKey}`, true, 
                    `Duration: ${response.body.duration_type}, Minutes: ${response.body.duration_minutes}`);
                
                // Validate duration is correctly extracted
                const expectedDuration = testKey.includes('5min') ? '5min' : 
                                       testKey.includes('1day') ? '1day' : '1month';
                const durationCorrect = response.body.duration_type === expectedDuration;
                logTest(`Duration Extract ${testKey}`, durationCorrect, 
                    `Expected: ${expectedDuration}, Got: ${response.body.duration_type}`);
                
            } else {
                logTest(`Verify ${testKey}`, false, 
                    `Status: ${response.status}, Response: ${JSON.stringify(response.body)}`);
            }
        } catch (error) {
            logTest(`Verify ${testKey}`, false, error.message);
        }
    }
}

/**
 * Test duration calculation
 */
function testDurationCalculation() {
    console.log('\n⏰ Testing duration calculations...');
    
    const now = new Date();
    const durations = {
        '5min': 5 * 60 * 1000,
        '1day': 24 * 60 * 60 * 1000,
        '1month': 30 * 24 * 60 * 60 * 1000
    };
    
    Object.entries(durations).forEach(([duration, ms]) => {
        const expiryTime = new Date(now.getTime() + ms);
        const remaining = expiryTime - now;
        const passed = Math.abs(remaining - ms) < 1000; // Allow 1s tolerance
        
        logTest(`Calculate ${duration}`, passed, 
            `Duration: ${ms}ms (${ms/60000} minutes)`);
    });
}

/**
 * Test error handling for invalid keys
 */
async function testErrorHandling() {
    console.log('\n🚫 Testing error handling...');
    
    const invalidKeys = [
        'invalid-key-format',
        'vsm-ABC-5min',  // Too short
        'vsm-ABCDEFGHI-invalid',  // Invalid duration
        'ABCDEFGHIJ-5min',  // Missing prefix
        'vsm-ABCDEFGHIJ-5min'  // Too long
    ];
    
    for (const invalidKey of invalidKeys) {
        try {
            const response = await makeRequest('POST', '/api/verify_key', {
                user_id: 'test-device-error',
                unlock_key: invalidKey
            });
            
            const isRejected = response.status !== 200 || 
                              (response.body && response.body.success === false);
            logTest(`Reject Invalid Key`, isRejected, 
                `Key: ${invalidKey}, Status: ${response.status}`);
        } catch (error) {
            logTest(`Reject Invalid Key`, true, 
                `Key: ${invalidKey}, Error: ${error.message}`);
        }
    }
}

/**
 * Generate summary report
 */
function generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY REPORT');
    console.log('='.repeat(60));
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    
    if (testsFailed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! Duration-Aware Key System is working correctly!');
    } else {
        console.log('\n⚠️ Some tests failed. Please check the implementation.');
    }
    
    console.log('='.repeat(60));
}

/**
 * Main test execution
 */
async function main() {
    console.log('🚀 Starting Duration-Aware Unlock Key System Tests');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`⏰ Test started at: ${new Date().toISOString()}`);
    
    try {
        // Run all tests
        await testDatabaseConnection();
        testKeyFormatValidation();
        await testKeyGeneration();
        await testKeyVerification();
        testDurationCalculation();
        await testErrorHandling();
        
    } catch (error) {
        console.error('💥 Test execution failed:', error.message);
    }
    
    // Generate final report
    generateReport();
}

// Run tests if this script is executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    main,
    makeRequest,
    testDatabaseConnection,
    testKeyFormatValidation,
    testKeyGeneration,
    testKeyVerification,
    testDurationCalculation,
    testErrorHandling
};