#!/usr/bin/env node

/**
 * Test script for nonce management functionality
 * Verifies that multiple parallel transactions work correctly
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testNonceManagement() {
  console.log('🧪 Testing Nonce Management System\n');

  try {
    // 1. Check current status
    console.log('1️⃣ Checking nonce increment status...');
    const statusRes = await fetch(`${API_URL}/api/nonce-control/status`);
    const status = await statusRes.json();
    console.log(`   Status: ${status.nonceIncrementEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`   ${status.description}\n`);

    // 2. Enable nonce increment if not already
    if (!status.nonceIncrementEnabled) {
      console.log('2️⃣ Enabling nonce increment...');
      const toggleRes = await fetch(`${API_URL}/api/nonce-control/toggle`, { method: 'POST' });
      const toggleResult = await toggleRes.json();
      console.log(`   ${toggleResult.message}\n`);
    }

    // 3. Test parallel execution
    console.log('3️⃣ Testing parallel chain execution...');
    console.log('   Sending transactions to Ethereum and IoTeX simultaneously...\n');

    const startTime = Date.now();
    
    // Execute both in parallel
    const [ethRes, iotexRes] = await Promise.allSettled([
      fetch(`${API_URL}/api/transaction`).then(r => r.json()),
      fetch(`${API_URL}/api/iotex-transaction`).then(r => r.json())
    ]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // 4. Check results
    console.log('4️⃣ Results:');
    
    if (ethRes.status === 'fulfilled' && !ethRes.value.error) {
      console.log(`   ✅ Ethereum: SUCCESS`);
      console.log(`      TX: ${ethRes.value.txHash}`);
      console.log(`      Price: $${ethRes.value.newPrice}`);
    } else {
      console.log(`   ❌ Ethereum: FAILED`);
      if (ethRes.value?.error) {
        console.log(`      Error: ${ethRes.value.error}`);
        console.log(`      Details: ${ethRes.value.details || 'N/A'}`);
      }
    }

    if (iotexRes.status === 'fulfilled' && !iotexRes.value.error) {
      console.log(`   ✅ IoTeX: SUCCESS`);
      console.log(`      TX: ${iotexRes.value.txHash}`);
      console.log(`      Price: $${iotexRes.value.newPrice}`);
    } else {
      console.log(`   ❌ IoTeX: FAILED`);
      if (iotexRes.value?.error) {
        console.log(`      Error: ${iotexRes.value.error}`);
        console.log(`      Details: ${iotexRes.value.details || 'N/A'}`);
      }
    }

    console.log(`\n⏱️  Total time: ${elapsed} seconds`);

    // 5. Test with nonce increment disabled
    console.log('\n5️⃣ Testing with nonce increment DISABLED (security demo)...');
    
    // Toggle off
    await fetch(`${API_URL}/api/nonce-control/toggle`, { method: 'POST' });
    console.log('   Nonce increment disabled\n');

    // Reset nonce tracking
    await fetch(`${API_URL}/api/nonce-control/reset`, { method: 'POST' });

    // Try parallel execution again
    const [ethRes2, iotexRes2] = await Promise.allSettled([
      fetch(`${API_URL}/api/transaction`).then(r => r.json()),
      fetch(`${API_URL}/api/iotex-transaction`).then(r => r.json())
    ]);

    let ethSuccess2 = ethRes2.status === 'fulfilled' && !ethRes2.value.error;
    let iotexSuccess2 = iotexRes2.status === 'fulfilled' && !iotexRes2.value.error;

    console.log('   Expected: One success, one nonce error');
    console.log(`   Ethereum: ${ethSuccess2 ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   IoTeX: ${iotexSuccess2 ? '✅ SUCCESS' : '❌ FAILED'}`);

    if (!ethSuccess2 && ethRes2.value?.details?.includes('nonce')) {
      console.log('   ✓ Correctly showing nonce protection!');
    } else if (!iotexSuccess2 && iotexRes2.value?.details?.includes('nonce')) {
      console.log('   ✓ Correctly showing nonce protection!');
    }

    // Re-enable for future use
    console.log('\n6️⃣ Re-enabling nonce increment for normal operation...');
    await fetch(`${API_URL}/api/nonce-control/toggle`, { method: 'POST' });
    console.log('   ✅ Nonce increment re-enabled\n');

    console.log('🎉 Nonce management test complete!');
    console.log('\nSummary:');
    console.log('- With nonce increment: Multiple chains work in parallel');
    console.log('- Without nonce increment: NEAR\'s replay protection is demonstrated');
    console.log('- Perfect for workshops to show both security and scalability!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nMake sure:');
    console.log('1. Backend is running (npm run dev)');
    console.log('2. Accounts are funded');
    console.log('3. Environment is properly configured');
  }
}

// Run the test
testNonceManagement();
