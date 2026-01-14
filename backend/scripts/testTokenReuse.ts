/**
 * Test: Refresh Token Reuse Detection
 * 
 * Bu test, revoked token tekrar kullanıldığında tüm token chain'in
 * iptal edildiğini doğrular.
 * 
 * Çalıştırma: npm run test:token-reuse
 */

import { createRefreshToken, verifyRefreshToken, rotateRefreshToken } from '../src/utils/tokenService';
import { prisma } from '../src/utils/prisma';

async function testTokenReuseDetection() {
  console.log('🧪 Testing Refresh Token Reuse Detection\n');
  
  // Test user ID
  const testUserId = 'test-user-' + Date.now();
  
  try {
    // 1. Create initial refresh token
    console.log('1️⃣ Creating initial refresh token...');
    const { token: token1 } = await createRefreshToken({
      userId: testUserId,
      ip: '127.0.0.1',
      userAgent: 'Test Agent',
    });
    console.log('✅ Token1 created\n');
    
    // 2. Rotate token (simulates normal refresh)
    console.log('2️⃣ Rotating token (normal refresh flow)...');
    const { refreshToken: token2 } = await rotateRefreshToken({
      oldToken: token1,
      ip: '127.0.0.1',
      userAgent: 'Test Agent',
    });
    console.log('✅ Token1 revoked, Token2 created\n');
    
    // 3. Rotate again
    console.log('3️⃣ Rotating again...');
    const { refreshToken: token3 } = await rotateRefreshToken({
      oldToken: token2,
      ip: '127.0.0.1',
      userAgent: 'Test Agent',
    });
    console.log('✅ Token2 revoked, Token3 created\n');
    
    // 4. Try to reuse old token (SECURITY ALERT!)
    console.log('4️⃣ 🚨 Attempting to reuse revoked Token1 (simulating attack)...');
    try {
      await verifyRefreshToken(token1);
      console.error('❌ FAIL: Token reuse was not detected!');
      process.exit(1);
    } catch (error: any) {
      if (error.message.includes('SECURITY_ALERT')) {
        console.log('✅ SUCCESS: Token reuse detected!');
        console.log(`   Error message: ${error.message}\n`);
      } else {
        console.error('❌ FAIL: Wrong error thrown');
        console.error(error);
        process.exit(1);
      }
    }
    
    // 5. Verify Token3 is also revoked (family revocation)
    console.log('5️⃣ Verifying token family revocation...');
    try {
      await verifyRefreshToken(token3);
      console.error('❌ FAIL: Token3 should be revoked (family revocation)');
      process.exit(1);
    } catch (error: any) {
      if (error.message.includes('revoked')) {
        console.log('✅ SUCCESS: Entire token family revoked\n');
      } else {
        console.error('❌ FAIL: Token3 not revoked');
        console.error(error);
        process.exit(1);
      }
    }
    
    // 6. Check security event log
    console.log('6️⃣ Checking security event log...');
    const securityEvents = await prisma.securityEvent.findMany({
      where: {
        userId: testUserId,
        eventType: 'REFRESH_TOKEN_REUSE',
      },
      orderBy: { timestamp: 'desc' },
      take: 1,
    });
    
    if (securityEvents.length > 0) {
      console.log('✅ Security event logged:');
      console.log(`   Event Type: ${securityEvents[0].eventType}`);
      console.log(`   Severity: ${securityEvents[0].severity}`);
      console.log(`   Message: ${securityEvents[0].message}`);
    } else {
      console.error('⚠️  WARNING: Security event not logged');
    }
    
    console.log('\n🎉 All tests passed! Token reuse detection working correctly.\n');
    
    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
    await prisma.securityEvent.deleteMany({ where: { userId: testUserId } });
    console.log('✅ Cleanup complete\n');
    
  } catch (error) {
    console.error('❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run test
testTokenReuseDetection();
