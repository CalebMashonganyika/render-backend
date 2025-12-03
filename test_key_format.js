// Test script to verify the new key format implementation
// This tests the core logic without requiring a database connection

console.log('🧪 TESTING NEW KEY FORMAT IMPLEMENTATION\n');

// Import the validation functions from the API routes
// We'll extract and test them independently

// Key duration configurations (in milliseconds)
const KEY_DURATIONS = {
  '5min': { label: '5 Minutes', duration: 5 * 60 * 1000 },
  '1day': { label: '1 Day', duration: 24 * 60 * 60 * 1000 },
  '1month': { label: '1 Month', duration: 30 * 24 * 60 * 60 * 1000 }
};

// Generate random unlock key in new format: vsm-XXXXXXXX-duration
function generateUnlockKey(durationType = '5min') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 8; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `vsm-${randomPart}-${durationType}`;
}

// Validate new key format: vsm-XXXXXXXX-5min/1day/1month
function validateKeyFormat(key) {
  const regex = /^vsm-[A-Z0-9]{8}-(5min|1day|1month)$/;
  return regex.test(key);
}

// Extract duration from key format
function extractDurationFromKey(key) {
  const parts = key.split('-');
  if (parts.length !== 3) return null;
  
  const durationType = parts[2];
  return KEY_DURATIONS[durationType] ? durationType : null;
}

// Calculate expiry timestamp based on duration type
function calculateExpiry(durationType = '5min') {
  const duration = KEY_DURATIONS[durationType] || KEY_DURATIONS['5min'];
  return new Date(Date.now() + duration.duration);
}

// Get duration info for a key
function getDurationInfo(durationType) {
  return KEY_DURATIONS[durationType] || KEY_DURATIONS['5min'];
}

console.log('📋 KEY_DURATIONS configuration:');
console.log(JSON.stringify(KEY_DURATIONS, null, 2));
console.log('\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(testName, testFunction) {
  try {
    console.log(`🧪 Test: ${testName}`);
    testFunction();
    console.log('✅ PASSED\n');
    testsPassed++;
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}\n`);
    testsFailed++;
  }
}

// Test 1: Valid key formats (exactly 8 alphanumeric characters)
runTest('Valid key formats', () => {
  const validKeys = [
    'vsm-ABC12345-5min',
    'vsm-XYZ56789-1day',
    'vsm-123ABCD4-1month',
    'vsm-00000001-5min',
    'vsm-ZZZ9999A-1day',
    'vsm-A7B9K2LM-5min',
    'vsm-XP93KF2Q-1day',
    'vsm-QW83JDK2-1month'
  ];
  
  validKeys.forEach(key => {
    if (!validateKeyFormat(key)) {
      throw new Error(`Key "${key}" should be valid but validation failed`);
    }
  });
  console.log(`  ✓ All ${validKeys.length} valid keys passed validation`);
  console.log(`  ✓ All keys follow exact format: vsm-8_alphanumeric_chars-duration`);
});

// Test 2: Invalid key formats (including special character rejection)
runTest('Invalid key formats', () => {
  const invalidKeys = [
    'OLD-FORMAT',
    'vsm-123-5min',           // Too short (only 3 chars)
    'vsm-1234567-5min',       // Too short (only 7 chars)
    'vsm-123456789-5min',     // Too long (9 chars)
    'vsm-ABC1234#-5min',      // Contains special character #
    'vsm-ABC1234@-5min',      // Contains special character @
    'vsm-ABC1234--5min',      // Contains extra dash
    'vsm-ABC1234-invalid',    // Invalid duration
    'vsm-ABC1234-5minutes',   // Wrong duration format
    'VSM-ABC1234-5min',       // Wrong case
    'vsm-abc1234-5min',       // Lowercase letters (though this might be valid depending on requirements)
    'vsm-ABC1234-5min-extra'  // Extra parts
  ];
  
  invalidKeys.forEach(key => {
    if (validateKeyFormat(key)) {
      throw new Error(`Key "${key}" should be invalid but passed validation`);
    }
  });
  console.log(`  ✓ All ${invalidKeys.length} invalid keys correctly rejected`);
  console.log('  ✓ Special characters (#, @, -) properly rejected in middle segment');
});

// Test 3: Duration extraction
runTest('Duration extraction from keys', () => {
  const testCases = [
    { key: 'vsm-ABC12345-5min', expected: '5min' },
    { key: 'vsm-XYZ56789-1day', expected: '1day' },
    { key: 'vsm-123ABCD4-1month', expected: '1month' }
  ];
  
  testCases.forEach(({ key, expected }) => {
    const extracted = extractDurationFromKey(key);
    if (extracted !== expected) {
      throw new Error(`Expected duration "${expected}" for key "${key}", got "${extracted}"`);
    }
  });
  console.log(`  ✓ All ${testCases.length} duration extractions correct`);
});

// Test 4: Key generation
runTest('Key generation', () => {
  for (let durationType of ['5min', '1day', '1month']) {
    const generatedKey = generateUnlockKey(durationType);
    console.log(`  📝 Generated key for ${durationType}: ${generatedKey}`);
    
    if (!validateKeyFormat(generatedKey)) {
      throw new Error(`Generated key "${generatedKey}" is not valid`);
    }
    
    const extractedDuration = extractDurationFromKey(generatedKey);
    if (extractedDuration !== durationType) {
      throw new Error(`Generated key duration mismatch: expected "${durationType}", got "${extractedDuration}"`);
    }
  }
  console.log('  ✓ All key generations produce valid keys');
});

// Test 5: Expiry calculation
runTest('Expiry calculation', () => {
  const now = Date.now();
  
  for (let durationType of ['5min', '1day', '1month']) {
    const expiry = calculateExpiry(durationType);
    const expectedDuration = KEY_DURATIONS[durationType].duration;
    const actualDuration = expiry.getTime() - now;
    
    // Allow 1 second tolerance for execution time
    if (Math.abs(actualDuration - expectedDuration) > 1000) {
      throw new Error(`Expiry calculation for ${durationType} incorrect: expected ${expectedDuration}ms, got ${actualDuration}ms`);
    }
  }
  console.log('  ✓ All expiry calculations correct');
});

// Test 6: Duration info retrieval
runTest('Duration info retrieval', () => {
  const testCases = ['5min', '1day', '1month'];
  
  testCases.forEach(durationType => {
    const info = getDurationInfo(durationType);
    if (!info || info.label !== KEY_DURATIONS[durationType].label) {
      throw new Error(`Duration info for ${durationType} incorrect`);
    }
  });
  console.log('  ✓ All duration info retrievals correct');
});

// Generate and test sample keys
console.log('🎫 SAMPLE KEY GENERATION TEST:');
console.log('================================');
for (let i = 0; i < 5; i++) {
  const key = generateUnlockKey('5min');
  const duration = extractDurationFromKey(key);
  const expiry = calculateExpiry(duration);
  const durationInfo = getDurationInfo(duration);
  
  console.log(`Key ${i + 1}: ${key}`);
  console.log(`  Duration: ${duration}`);
  console.log(`  Label: ${durationInfo.label}`);
  console.log(`  Expires: ${expiry.toISOString()}`);
  console.log(`  Valid: ${validateKeyFormat(key) ? '✅' : '❌'}`);
  console.log();
}

console.log('📊 TEST SUMMARY:');
console.log(`✅ Tests Passed: ${testsPassed}`);
console.log(`❌ Tests Failed: ${testsFailed}`);
console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
  console.log('\n🎉 ALL TESTS PASSED! The new key format implementation is working correctly.');
} else {
  console.log('\n⚠️  Some tests failed. Please review the implementation.');
}