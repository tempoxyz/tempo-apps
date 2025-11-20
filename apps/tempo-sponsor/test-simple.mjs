#!/usr/bin/env node

// Simple test script for tempo-sponsor that can run without installing dependencies
// Usage: node test-simple.mjs [sponsor-url]

const SPONSOR_URL = process.argv[2] || 'http://localhost:8787';

console.log('🧪 Simple Tempo Sponsor Test\n');
console.log(`Testing sponsor at: ${SPONSOR_URL}\n`);

// Test CORS preflight
async function testCORS() {
  console.log('1️⃣ Testing CORS (OPTIONS request)...');
  try {
    const response = await fetch(SPONSOR_URL, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
    };
    
    console.log('   ✅ CORS headers:', corsHeaders);
  } catch (error) {
    console.log('   ❌ CORS test failed:', error.message);
  }
}

// Test invalid method
async function testInvalidMethod() {
  console.log('\n2️⃣ Testing invalid HTTP method (GET)...');
  try {
    const response = await fetch(SPONSOR_URL, {
      method: 'GET',
    });
    
    if (response.status === 405) {
      console.log('   ✅ Correctly rejected with 405 Method Not Allowed');
    } else {
      console.log('   ⚠️ Unexpected status:', response.status);
    }
  } catch (error) {
    console.log('   ❌ Request failed:', error.message);
  }
}

// Test invalid RPC method
async function testInvalidRPC() {
  console.log('\n3️⃣ Testing invalid RPC method...');
  try {
    const response = await fetch(SPONSOR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
    });
    
    const result = await response.json();
    
    if (result.error && result.error.code === -32601) {
      console.log('   ✅ Correctly rejected unsupported method');
    } else {
      console.log('   ⚠️ Unexpected response:', result);
    }
  } catch (error) {
    console.log('   ❌ Request failed:', error.message);
  }
}

// Test with mock transaction
async function testMockTransaction() {
  console.log('\n4️⃣ Testing with mock transaction data...');
  try {
    // This is a mock serialized transaction (will fail but tests the flow)
    const mockTx = '0x76' + '0'.repeat(200); // Simplified mock
    
    const response = await fetch(SPONSOR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendRawTransaction',
        params: [mockTx],
      }),
    });
    
    const result = await response.json();
    
    if (result.error) {
      console.log('   ⚠️ Expected error (mock data):', result.error.message);
    } else {
      console.log('   📦 Response:', result);
    }
  } catch (error) {
    console.log('   ❌ Request failed:', error.message);
  }
}

// Test health/connectivity
async function testHealth() {
  console.log('\n5️⃣ Testing service health...');
  try {
    const start = Date.now();
    const response = await fetch(SPONSOR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: [],
      }),
    });
    
    const latency = Date.now() - start;
    
    if (response.ok) {
      console.log(`   ✅ Service responding (${latency}ms latency)`);
    } else {
      console.log(`   ⚠️ Service returned status ${response.status}`);
    }
  } catch (error) {
    console.log('   ❌ Service unreachable:', error.message);
    console.log('\n   💡 Make sure the service is running:');
    console.log('      - For local: run `pnpm dev` in apps/tempo-sponsor');
    console.log('      - For production: check deployment status');
  }
}

// Run all tests
async function runTests() {
  console.log('Starting tests...\n');
  console.log('═'.repeat(50));
  
  await testHealth();
  await testCORS();
  await testInvalidMethod();
  await testInvalidRPC();
  await testMockTransaction();
  
  console.log('\n' + '═'.repeat(50));
  console.log('\n✨ All tests completed!\n');
  console.log('Note: For full integration testing with real transactions,');
  console.log('use test-sponsor.js with proper dependencies installed.\n');
}

runTests().catch(console.error);