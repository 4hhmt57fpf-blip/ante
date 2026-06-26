import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { makeDb } from '../db.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_USER = process.env.SUPABASE_TEST_USER_ID; // a real auth.users id in your test project
const ready = !!(url && key && TEST_USER);

test('stake round-trips through the DB', { skip: !ready && 'set SUPABASE_URL/KEY/TEST_USER_ID' }, async () => {
  const db = makeDb(createClient(url, key, { auth: { persistSession: false } }));
  await db.setStake(TEST_USER, 'plan_test_habit', 1234);
  assert.equal(await db.getStake(TEST_USER, 'plan_test_habit'), 1234);
});

test('customer + default PM round-trip', { skip: !ready && 'set SUPABASE_URL/KEY/TEST_USER_ID' }, async () => {
  const db = makeDb(createClient(url, key, { auth: { persistSession: false } }));
  await db.setCustomer(TEST_USER, 'cus_planTest');
  assert.equal(await db.getCustomer(TEST_USER), 'cus_planTest');
  await db.setDefaultPMByUser(TEST_USER, 'pm_planTest');
  assert.equal(await db.getDefaultPM(TEST_USER), 'pm_planTest');
});
