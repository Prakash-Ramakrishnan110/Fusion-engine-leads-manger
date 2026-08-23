/**
 * Comprehensive System Verification Suite
 * Tests all core modules: DB, Scorer, HMAC Unsubscribe, Opt-Out, WhatsApp Links, Dedupe
 */

const assert = require('assert');
const db = require('./data/db');
const dedupe = require('./src/utils/dedupe');
const scorer = require('./src/ml/leadScorer');
const optOut = require('./src/outreach/optOutManager');
const waDisp = require('./src/outreach/whatsappDispatcher');
const emailDisp = require('./src/outreach/emailDispatcher');

async function runTests() {
  console.log('====================================================');
  console.log(' RUNNING VERIFICATION SUITE FOR FUSION ENGINE');
  console.log('====================================================\n');

  // Test 1: Lead Scoring
  console.log('[Test 1] Testing Weighted Lead Scorer...');
  const hotCandidate = {
    name: 'Bangalore Tech Academy',
    email: 'info@bangaloretech.com',
    phone: '+91 98765 43210',
    website: 'https://bangaloretech.com',
    rating: 4.8,
    reviewsCount: 34,
    category: 'LMS',
    region: 'India'
  };
  const scoreResult = scorer.scoreLead(hotCandidate);
  console.log(`  -> Lead Score: ${scoreResult.score}% | Tier: ${scoreResult.tier} | Est. Value: $${scoreResult.estimatedValue}`);
  assert.strictEqual(scoreResult.tier, 'Hot', 'Expected Hot tier for complete lead');
  assert.ok(scoreResult.score >= 85, 'Expected score >= 85');
  console.log('  ✅ Lead Scorer Test Passed.\n');

  // Test 2: HMAC Signed Unsubscribe Token
  console.log('[Test 2] Testing HMAC Signed Unsubscribe Security...');
  const targetEmail = 'prospect@enterprise.com';
  const token = emailDisp.generateUnsubscribeToken(targetEmail);
  console.log(`  -> Generated HMAC Token: ${token.substring(0, 16)}...`);
  const isValid = emailDisp.verifyUnsubscribeToken(targetEmail, token);
  assert.strictEqual(isValid, true, 'HMAC token must be valid');
  const isInvalid = emailDisp.verifyUnsubscribeToken(targetEmail, 'fake_forged_token');
  assert.strictEqual(isInvalid, false, 'Forged token must fail validation');
  console.log('  ✅ HMAC Unsubscribe Verification Test Passed.\n');

  // Test 3: Opt-Out Check & WhatsApp Click-to-Chat Link Generation
  console.log('[Test 3] Testing Opt-Out Enforcement & WhatsApp wa.me Link...');
  const testEmail = `test_opt_${Date.now()}@dubaisupply.ae`;
  const leadObj = {
    name: 'Dubai Supply Logistics',
    email: testEmail,
    phone: '+971 50 123 4567',
    website: `https://${testEmail.split('@')[1]}`,
    category: 'ERP'
  };

  // Initially allowed
  const waBefore = waDisp.generateClickToChatLink(leadObj);
  assert.strictEqual(waBefore.allowed, true, 'Link generation should be allowed before opt-out');
  assert.ok(waBefore.url.includes('https://wa.me/916369884331'), 'wa.me target number correct');
  console.log(`  -> Generated WA Click-to-Chat Link: ${waBefore.url}`);

  // Register Opt-Out
  await optOut.registerOptOut(testEmail);
  const waAfter = waDisp.generateClickToChatLink(leadObj);
  assert.strictEqual(waAfter.allowed, false, 'Link generation must be blocked after opt-out');
  console.log(`  -> Opt-Out Blocked WA Link successfully: "${waAfter.reason}"`);
  await optOut.unregisterOptOut(testEmail);
  console.log('  ✅ Opt-Out Enforcement Test Passed.\n');

  // Test 4: Lead Deduplication
  console.log('[Test 4] Testing Lead Deduplication Logic...');
  const existingLeads = [
    { name: 'Existing Firm', email: 'hello@existing.com', phone: '+15551234567', website: 'https://existing.com', region: 'USA' }
  ];
  const duplicateCandidate = { name: 'Existing Firm', email: 'hello@existing.com', website: 'https://existing.com', region: 'USA' };
  const uniqueCandidate = { name: 'New Startup', email: 'ceo@newstartup.io', website: 'https://newstartup.io', region: 'USA' };

  assert.strictEqual(dedupe.isDuplicateLead(duplicateCandidate, existingLeads), true, 'Duplicate lead must be detected');
  assert.strictEqual(dedupe.isDuplicateLead(uniqueCandidate, existingLeads), false, 'Unique lead must pass');
  console.log('  ✅ Deduplication Test Passed.\n');

  // Test 5: DB Operations & Mutex Queue
  console.log('[Test 5] Testing Database Persistent Read/Write...');
  await db.saveLead({
    id: 'test_lead_99',
    name: 'Unit Test Lead',
    email: 'unittest@fusionengine.in',
    score: 90,
    tier: 'Hot',
    category: 'Apps',
    region: 'India'
  });
  const leadsFromDb = db.getLeads();
  const found = leadsFromDb.find(l => l.id === 'test_lead_99');
  assert.ok(found, 'Saved lead should exist in database');
  console.log(`  -> DB Retrieved Lead: "${found.name}" (${found.tier})`);
  // Cleanup test lead
  const cleanedLeads = db.getLeads().filter(l => l.id !== 'test_lead_99');
  await db.saveLeads(cleanedLeads);
  console.log('  ✅ Database Mutex Storage Test Passed.\n');

  console.log('====================================================');
  console.log(' ALL 5 SYSTEM VERIFICATION TESTS PASSED SUCCESSFULLY! ');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ Test Failure:', err);
  process.exit(1);
});
