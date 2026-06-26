# Real Cloud Accounts + Full Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on real Supabase cloud accounts, sync all app state across devices, and bind Stripe to the authenticated user (closing the charge-on-miss IDOR).

**Architecture:** Approach A from the spec — the browser talks to Supabase directly (Auth + Postgres with Row-Level Security) for app data, and to the Express backend for Stripe. The backend verifies the Supabase access token, derives identity from it, and uses a service-role key for server-authoritative rows (`stripe_customers`, `stakes`).

**Tech Stack:** Supabase (Auth + Postgres + RLS), `@supabase/supabase-js` (CDN on the client, npm on the backend), Express, Stripe, Node's built-in test runner (`node --test`).

**Spec:** [docs/superpowers/specs/2026-06-25-real-accounts-cloud-sync-design.md](../specs/2026-06-25-real-accounts-cloud-sync-design.md)

## Global Constraints

- Node **18+**; backend is ES modules (`"type": "module"` in `payments-backend/package.json`).
- **Never** ship `SUPABASE_SERVICE_ROLE_KEY` or `CHARGE_SECRET` to the client — backend env only.
- Client may only ever hold `SUPABASE_URL` + `SUPABASE_ANON_KEY` (public).
- Stripe charge bounds already enforced: `MIN_STAKE_CENTS = 50`, `MAX_STAKE_CENTS = 40000`.
- The Supabase **user ID (UUID) is the canonical identity**; backend client-facing endpoints derive it from the verified token, never the body.
- `/charge-on-miss` stays server-to-server (`CHARGE_SECRET`); it takes the target user ID in the body.
- Conflict resolution: **last-write-wins per row** via `updated_at`; deletes use a `deleted_at` tombstone.
- The iOS bundle (`ios/App/App/public/`) is a build artifact — propagate client changes with `npm run sync:web`. Only edit the root `index.html`.
- New backend deps must be added to `payments-backend/package.json`.

## Testing strategy (read before starting)

- **Automated (`node --test` in `payments-backend/`):** pure/near-pure backend logic — `requireUser` token handling, existing validators. These run with injected fakes, no network.
- **Integration (skippable):** `db.js` against a real Supabase project — tests `skip` themselves unless `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, so they're green-or-skipped in CI and runnable once you provision the project.
- **Manual / preview-browser:** Supabase RLS, client auth, and the sync engine are verified in the running app (`server.py` preview) against your test Supabase project, with exact expected outcomes per task. The single-file client has no unit harness; this is the honest verification path.

---

## Task 0: Provision Supabase (prerequisite — user action, no code)

This gates every integration/preview verification below. The implementer cannot create accounts; the project owner does this once.

- [ ] **Step 1: Create a Supabase project** at supabase.com. Record:
  - Project URL → `SUPABASE_URL`
  - `anon` public key → `SUPABASE_ANON_KEY` (client-safe)
  - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (backend only, secret)
- [ ] **Step 2: (Optional) Enable Apple/Google providers** in Supabase → Authentication → Providers (only needed for social login; email/password works without).
- [ ] **Step 3: Confirm email auth is enabled** (Authentication → Providers → Email). For local testing you may turn off "Confirm email" so test signups log in immediately.

No commit (no repo change).

---

## Task 1: Backend Supabase client + test harness

Adds the dependency, the service-role client, and a runnable test scaffold.

**Files:**
- Modify: `payments-backend/package.json`
- Create: `payments-backend/supabaseClient.js`
- Create: `payments-backend/test/smoke.test.js`

**Interfaces:**
- Produces: `supabaseAdmin` (a `@supabase/supabase-js` client using the service-role key) exported from `supabaseClient.js`.

- [ ] **Step 1: Add the dependency and test script**

Edit `payments-backend/package.json` `scripts` and `dependencies`:

```json
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.70.0",
    "@supabase/supabase-js": "^2.45.0",
    "express": "^4.21.2",
    "stripe": "^18.5.0"
  }
```

- [ ] **Step 2: Install**

Run: `cd payments-backend && npm install`
Expected: `@supabase/supabase-js` added to `node_modules`, lockfile updated.

- [ ] **Step 3: Create the service-role client**

Create `payments-backend/supabaseClient.js`:

```js
// Service-role Supabase client — BACKEND ONLY. Bypasses RLS; never expose this key.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lazily fail only when actually used, so the server can still boot for non-DB routes
// in dev. Auth/DB routes will surface a clear error if these are unset.
export const supabaseAdmin = (url && serviceKey)
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export function assertSupabase() {
  if (!supabaseAdmin) throw new Error('Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return supabaseAdmin;
}
```

- [ ] **Step 4: Write a smoke test**

Create `payments-backend/test/smoke.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test runner works', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 5: Run the tests**

Run: `cd payments-backend && npm test`
Expected: PASS (1 test). The `--test` runner discovers `test/*.test.js`.

- [ ] **Step 6: Commit**

```bash
git add payments-backend/package.json payments-backend/package-lock.json payments-backend/supabaseClient.js payments-backend/test/smoke.test.js
git commit -m "feat(backend): add supabase service client + node test harness"
```

---

## Task 2: Database schema + RLS

The SQL the project owner applies. Server-authoritative tables (`stripe_customers`, `stakes`) deny client writes; the service role bypasses RLS.

**Files:**
- Create: `payments-backend/schema.sql`

- [x] **Step 1: Write the schema**

Create `payments-backend/schema.sql`:

```sql
-- Ante Phase 1 schema. Apply in Supabase → SQL Editor.
-- Identity = auth.users(id). RLS isolates every user to their own rows.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  handle text unique,
  reminder_time text,
  reminder_on boolean default false,
  updated_at timestamptz not null default now()
);

create table if not exists habits (
  id text primary key,                       -- client-generated id
  user_id uuid not null references auth.users(id) on delete cascade,
  name text, emoji text, icon text, color text, category text,
  source text, metric text, dir text,
  target numeric, unit text, verify text,
  apps jsonb default '[]'::jsonb, cap_minutes int,
  freq text, stake numeric, destination text, escalate boolean default false,
  completed_days jsonb default '[]'::jsonb,
  missed_days jsonb default '[]'::jsonb,
  current_streak int default 0, best_streak int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists habits_user_idx on habits(user_id);

create table if not exists transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text, "desc" text, amount numeric, type text,
  created_at timestamptz default now()
);
create index if not exists transactions_user_idx on transactions(user_id);

-- Server-authoritative (written only by the backend service role).
create table if not exists stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text, default_pm text,
  updated_at timestamptz not null default now()
);

create table if not exists stakes (
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id text not null,
  amount_cents int not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, habit_id)
);

-- ---- RLS ----
alter table profiles        enable row level security;
alter table habits          enable row level security;
alter table transactions    enable row level security;
alter table stripe_customers enable row level security;
alter table stakes          enable row level security;

create policy profiles_owner on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy habits_owner on habits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_owner on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Read-own-only; NO insert/update/delete policy → clients can't write.
-- The service-role key bypasses RLS for backend writes.
create policy stripe_customers_read on stripe_customers
  for select using (user_id = auth.uid());
create policy stakes_read on stakes
  for select using (user_id = auth.uid());
```

- [x] **Step 2: Apply it** — applied directly as tracked migration `ante_phase1_schema_and_rls` via the Supabase MCP (not the manual dashboard path). All 5 tables created with `rls_enabled = true`.

- [x] **Step 3: Verify RLS** — confirmed via `pg_policies`: `profiles/habits/transactions` = owner ALL (using+check); `stripe_customers/stakes` = SELECT-only (no write path for clients). Security advisor returns zero findings. Bonus: revoked public EXECUTE on the pre-existing `rls_auto_enable()` SECURITY DEFINER function (migration `harden_rls_auto_enable_revoke_public_execute`); the `ensure_rls` event trigger still fires.

- [x] **Step 4: Commit**

```bash
git add payments-backend/schema.sql
git commit -m "feat(backend): add Supabase schema + RLS policies"
```

---

## Task 3: Backend data-access layer (`db.js`)

Replaces the in-memory maps. Factory takes a Supabase client so it's testable.

**Files:**
- Create: `payments-backend/db.js`
- Create: `payments-backend/test/db.integration.test.js`

**Interfaces:**
- Produces: `makeDb(client)` → object with async methods:
  - `getCustomer(userId) → string|null`
  - `setCustomer(userId, customerId) → void`
  - `getDefaultPM(userId) → string|null`
  - `setDefaultPMByUser(userId, pm) → void`
  - `setDefaultPMByCustomer(customerId, pm) → void`
  - `getStake(userId, habitId) → number|null`
  - `setStake(userId, habitId, amountCents) → void`

- [ ] **Step 1: Write `db.js`**

```js
// Supabase-backed data access for server-authoritative rows. Pass a service-role
// client to makeDb(). All methods are async.
export function makeDb(client) {
  return {
    async getCustomer(userId) {
      const { data, error } = await client.from('stripe_customers')
        .select('customer_id').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data?.customer_id ?? null;
    },
    async setCustomer(userId, customerId) {
      const { error } = await client.from('stripe_customers')
        .upsert({ user_id: userId, customer_id: customerId, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' });
      if (error) throw error;
    },
    async getDefaultPM(userId) {
      const { data, error } = await client.from('stripe_customers')
        .select('default_pm').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data?.default_pm ?? null;
    },
    async setDefaultPMByUser(userId, pm) {
      const { error } = await client.from('stripe_customers')
        .upsert({ user_id: userId, default_pm: pm, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' });
      if (error) throw error;
    },
    async setDefaultPMByCustomer(customerId, pm) {
      const { error } = await client.from('stripe_customers')
        .update({ default_pm: pm, updated_at: new Date().toISOString() })
        .eq('customer_id', customerId);
      if (error) throw error;
    },
    async getStake(userId, habitId) {
      const { data, error } = await client.from('stakes')
        .select('amount_cents').eq('user_id', userId).eq('habit_id', habitId).maybeSingle();
      if (error) throw error;
      return data?.amount_cents ?? null;
    },
    async setStake(userId, habitId, amountCents) {
      const { error } = await client.from('stakes')
        .upsert({ user_id: userId, habit_id: habitId, amount_cents: amountCents,
                  updated_at: new Date().toISOString() }, { onConflict: 'user_id,habit_id' });
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 2: Write the integration test (skippable)**

Create `payments-backend/test/db.integration.test.js`:

```js
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
```

- [ ] **Step 3: Run tests**

Run: `cd payments-backend && npm test`
Expected: smoke PASS; db tests **SKIP** (no env) — or PASS if you've set the env + a test user id.

- [ ] **Step 4: Commit**

```bash
git add payments-backend/db.js payments-backend/test/db.integration.test.js
git commit -m "feat(backend): Supabase-backed data access layer"
```

---

## Task 4: Auth module (`requireUser` + move charge-secret helpers)

**Files:**
- Create: `payments-backend/auth.js`
- Create: `payments-backend/test/auth.test.js`

**Interfaces:**
- Produces:
  - `timingSafeEqualStr(a, b) → boolean`
  - `makeRequireChargeSecret(secret) → middleware` (503 if no secret, 401 if mismatch)
  - `makeRequireUser(client) → async middleware` (sets `req.userId`, `req.userEmail`; 401 otherwise)

- [ ] **Step 1: Write `auth.js`**

```js
import crypto from 'crypto';

export function timingSafeEqualStr(a, b) {
  const ah = crypto.createHash('sha256').update(String(a)).digest();
  const bh = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}

// Server-to-server guard for /charge-on-miss. Fail closed if no secret configured.
export function makeRequireChargeSecret(secret) {
  return function requireChargeSecret(req, res, next) {
    if (!secret) return res.status(503).json({ error: 'Charging is not configured (CHARGE_SECRET unset).' });
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m || !timingSafeEqualStr(m[1], secret)) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };
}

// Verifies a Supabase access token and attaches the user. Client-facing endpoints.
export function makeRequireUser(client) {
  return async function requireUser(req, res, next) {
    try {
      if (!client) return res.status(503).json({ error: 'Auth not configured' });
      const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
      if (!m) return res.status(401).json({ error: 'Unauthorized' });
      const { data, error } = await client.auth.getUser(m[1]);
      if (error || !data?.user) return res.status(401).json({ error: 'Unauthorized' });
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      next();
    } catch (e) { res.status(401).json({ error: 'Unauthorized' }); }
  };
}
```

- [ ] **Step 2: Write the unit test**

Create `payments-backend/test/auth.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRequireUser, makeRequireChargeSecret } from '../auth.js';

function res() {
  return { code: 0, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; } };
}
const fakeClient = {
  auth: {
    async getUser(token) {
      return token === 'good'
        ? { data: { user: { id: 'u1', email: 'a@b.com' } } }
        : { error: { message: 'bad jwt' } };
    },
  },
};

test('requireUser rejects missing header', async () => {
  const r = res(); let nexted = false;
  await makeRequireUser(fakeClient)({ headers: {} }, r, () => { nexted = true; });
  assert.equal(r.code, 401); assert.equal(nexted, false);
});

test('requireUser rejects bad token', async () => {
  const r = res(); let nexted = false;
  await makeRequireUser(fakeClient)({ headers: { authorization: 'Bearer nope' } }, r, () => { nexted = true; });
  assert.equal(r.code, 401); assert.equal(nexted, false);
});

test('requireUser accepts good token and attaches user', async () => {
  const r = res(); const req = { headers: { authorization: 'Bearer good' } }; let nexted = false;
  await makeRequireUser(fakeClient)(req, r, () => { nexted = true; });
  assert.equal(nexted, true); assert.equal(req.userId, 'u1'); assert.equal(req.userEmail, 'a@b.com');
});

test('requireChargeSecret 503 when unset, 401 on mismatch, next on match', () => {
  let r = res(); makeRequireChargeSecret('')({ headers: {} }, r, () => {}); assert.equal(r.code, 503);
  r = res(); makeRequireChargeSecret('s')({ headers: { authorization: 'Bearer x' } }, r, () => {}); assert.equal(r.code, 401);
  r = res(); let ok = false; makeRequireChargeSecret('s')({ headers: { authorization: 'Bearer s' } }, r, () => { ok = true; }); assert.equal(ok, true);
});
```

- [ ] **Step 3: Run**

Run: `cd payments-backend && npm test`
Expected: all auth tests PASS.

- [ ] **Step 4: Commit**

```bash
git add payments-backend/auth.js payments-backend/test/auth.test.js
git commit -m "feat(backend): requireUser token middleware + move charge-secret helpers"
```

---

## Task 5: Wire `server.js` to auth + DB (close the IDOR, fix email)

Replaces the in-memory `db`, applies `requireUser` to client endpoints, derives identity from the token, and uses the token email for Stripe.

**Files:**
- Modify: `payments-backend/server.js`

**Interfaces:**
- Consumes: `supabaseAdmin` (Task 1), `makeDb` (Task 3), `makeRequireUser` / `makeRequireChargeSecret` (Task 4).

- [ ] **Step 1: Replace imports + setup**

In `server.js`, remove the inline `crypto` import, `timingSafeEqualStr`, `requireChargeSecret`, and the in-memory `db`/`_users`/`_byCustomer`/`_stakes` block. Add near the top (after the Stripe/Anthropic setup):

```js
import { supabaseAdmin } from './supabaseClient.js';
import { makeDb } from './db.js';
import { makeRequireUser, makeRequireChargeSecret } from './auth.js';

const db = makeDb(supabaseAdmin);
const requireUser = makeRequireUser(supabaseAdmin);
const requireChargeSecret = makeRequireChargeSecret(process.env.CHARGE_SECRET);
```

Keep `MIN_STAKE_CENTS`, `MAX_STAKE_CENTS`, and `normalizeStakeCents` where they are.

- [ ] **Step 2: Update `ensureCustomer` to be async-DB + token email**

```js
async function ensureCustomer(userId, email) {
  let customerId = await db.getCustomer(userId);
  if (!customerId) {
    const c = await stripe.customers.create({ email, metadata: { anteUserId: userId } });
    customerId = c.id;
    await db.setCustomer(userId, customerId);
  }
  return customerId;
}
```

- [ ] **Step 3: Lock down the client-facing endpoints**

```js
app.post('/create-customer', requireUser, async (req, res) => {
  try {
    const customerId = await ensureCustomer(req.userId, req.userEmail);
    res.json({ customerId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/create-setup-intent', requireUser, async (req, res) => {
  try {
    const { apiVersion } = req.body || {};
    const customerId = await ensureCustomer(req.userId, req.userEmail);
    let ephemeralKeySecret;
    if (apiVersion) {
      const ek = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion });
      ephemeralKeySecret = ek.secret;
    }
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId, usage: 'off_session',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    res.json({
      setupIntentClientSecret: setupIntent.client_secret,
      ephemeralKey: ephemeralKeySecret, customerId,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/save-payment-method', requireUser, async (req, res) => {
  try {
    const { paymentMethodId } = req.body || {};
    const customerId = await db.getCustomer(req.userId);
    if (!customerId) return res.status(400).json({ error: 'No customer' });
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    await db.setDefaultPMByUser(req.userId, paymentMethodId);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
```

- [ ] **Step 4: Update `/register-stake` (token identity)**

```js
app.post('/register-stake', requireUser, async (req, res) => {
  try {
    const { habitId, amountCents } = req.body || {};
    if (!habitId) return res.status(400).json({ error: 'habitId required' });
    const amount = normalizeStakeCents(amountCents);
    if (amount === null) return res.status(400).json({ error: `amountCents must be an integer in [${MIN_STAKE_CENTS}, ${MAX_STAKE_CENTS}]` });
    await db.setStake(req.userId, habitId, amount);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
```

- [ ] **Step 5: Update `/charge-on-miss` (DB reads; body user id)**

```js
app.post('/charge-on-miss', requireChargeSecret, async (req, res) => {
  try {
    const { userId, habitId, date } = req.body || {};
    if (!userId || !habitId) return res.status(400).json({ error: 'userId and habitId required' });
    const customerId = await db.getCustomer(userId);
    const pm = await db.getDefaultPM(userId);
    if (!customerId || !pm) return res.status(400).json({ error: 'No saved card' });
    const amountCents = await db.getStake(userId, habitId);
    if (amountCents == null) return res.status(409).json({ error: 'No registered stake for this habit' });
    if (amountCents < MIN_STAKE_CENTS || amountCents > MAX_STAKE_CENTS) return res.status(409).json({ error: 'Stored stake out of allowed range' });
    const intent = await stripe.paymentIntents.create({
      amount: amountCents, currency: 'usd', customer: customerId, payment_method: pm,
      off_session: true, confirm: true, metadata: { userId, habitId, date },
    }, { idempotencyKey: `miss_${userId}_${habitId}_${date}` });
    res.json({ status: intent.status, amountCents });
  } catch (e) {
    if (e.code === 'authentication_required') return res.status(402).json({ error: 'authentication_required', paymentIntent: e.raw?.payment_intent?.id });
    res.status(400).json({ error: e.message });
  }
});
```

- [ ] **Step 6: Update the webhook to persist the PM**

```js
case 'setup_intent.succeeded': {
  const si = event.data.object;
  if (si.customer && si.payment_method) await db.setDefaultPMByCustomer(si.customer, si.payment_method);
  break;
}
```
(Make the webhook handler `async` so `await` is valid.)

- [ ] **Step 7: Syntax check + tests**

Run: `cd payments-backend && node --check server.js && npm test`
Expected: `server.js` parses; all tests PASS/skip.

- [ ] **Step 8: Boot + auth-gate verification (no Supabase needed)**

Run (one line): `cd payments-backend && STRIPE_SECRET_KEY=sk_test_x CHARGE_SECRET=secret node server.js &` then
`curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/register-stake -H 'Content-Type: application/json' -d '{"habitId":"h","amountCents":500}'`
Expected: `503` (auth not configured) or `401` — i.e. **rejected without a token.** Kill the server afterward (`kill %1`).

- [ ] **Step 9: Commit**

```bash
git add payments-backend/server.js
git commit -m "feat(backend): token-verified endpoints + DB-backed Stripe identity (closes IDOR, fixes email)"
```

---

## Task 6: Client — Supabase keys + access-token helper + email fix

**Files:**
- Modify: `index.html` (the `AUTH` config ~line 2427; `afterLogin` ~2521; `anteUserId` ~3753)

**Interfaces:**
- Produces: `sbAccessToken()` → `Promise<string|null>`; `state.profile.email` populated; `anteUserId()` returns the Supabase id when signed in.

- [ ] **Step 1: Fill the keys (project owner)**

Edit `index.html` `AUTH`:
```js
const AUTH = { SUPABASE_URL: 'https://YOURPROJECT.supabase.co', SUPABASE_ANON_KEY: 'eyJ...anon...' };
```

- [ ] **Step 2: Add the access-token helper**

Immediately after the `ensureSupabase()` function, add:
```js
// Current Supabase access token (auto-refreshed by the SDK), or null if not signed in.
async function sbAccessToken() {
  const sb = await ensureSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || null;
}
```

- [ ] **Step 3: Fix the email + identity in `afterLogin`**

In `afterLogin()`, after the existing name copy, add:
```js
if (state.user && state.user.email) state.profile.email = state.user.email;
```

- [ ] **Step 4: Prefer the Supabase id in `anteUserId()`**

Change the first line of `anteUserId()`'s logic so a signed-in user uses the real id:
```js
function anteUserId() {
  if (!state.profile) state.profile = {};
  if (state.user && state.user.id) return state.user.id;   // real identity when signed in
  if (!state.profile.anteUserId) {
    state.profile.anteUserId = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    saveState();
  }
  return state.profile.anteUserId;
}
```

- [ ] **Step 5: Preview verification — login works**

Reload the preview; sign up with a test email/password.
- Run (preview console): `await sbAccessToken()` → expect a non-null JWT string.
- Run: `(await ensureSupabase()).auth.getUser()` → expect your user with the email.
- Check Supabase → Authentication → Users: the new user appears.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(client): supabase access-token helper, email fix, real-id identity"
```

---

## Task 7: Client — attach the token to backend money calls

**Files:**
- Modify: `index.html` (`savePaymentMethod` ~3759; `registerStake` ~3760-ish)

**Interfaces:**
- Consumes: `sbAccessToken()` (Task 6); the backend's `requireUser` (Task 5).

- [ ] **Step 1: Add an auth header to `create-setup-intent`**

In `savePaymentMethod()`, before the fetch, get the token and include it:
```js
const token = await sbAccessToken();
if (!token) { showToast('Sign in to enable payments.', 'gold'); return; }
const r = await fetch(PAYMENTS.BACKEND_URL.replace(/\/$/, '') + '/create-setup-intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ apiVersion }),
}).then(x => x.json());
```
(Drop `anteUserId`/`email` from the body — the backend uses the token.)

- [ ] **Step 2: Token-ify `registerStake` (now async)**

Replace `registerStake` with:
```js
async function registerStake(habit) {
  if (!PAYMENTS.BACKEND_URL || !habit || !habit.id) return;
  const cents = Math.round((escalatedStake(habit) || habit.stake || 0) * 100);
  if (!cents) return;
  const token = await sbAccessToken();
  if (!token) return;   // not signed in → no server-side stake yet
  fetch(PAYMENTS.BACKEND_URL.replace(/\/$/, '') + '/register-stake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ habitId: habit.id, amountCents: cents }),
  }).catch(() => {});
}
```
(Existing call sites already ignore the return value, so making it async is safe.)

- [ ] **Step 3: Preview verification — end to end (needs deployed/local backend with Supabase env + `PAYMENTS.BACKEND_URL` set)**

With the backend running and `PAYMENTS.BACKEND_URL` set: sign in, lock in a habit, then in Supabase → Table Editor → `stakes`, confirm a row appears for your user with the right `amount_cents`. Without a token the backend returns 401 (confirm by signing out and retrying — no row written).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(client): send supabase token on Stripe + register-stake calls"
```

---

## Task 8: Client — cloud sync engine (pull, push, conflict, delete, offline)

The core of "full sync." Adds a cloud module and wires it into the habit/profile mutations.

**Files:**
- Modify: `index.html` (add a "CLOUD SYNC" block near the auth code; wire `afterLogin`, `createHabit` callers, `completeHabit`, `missHabit`, `saveHabitEdit`, `deleteHabit`, settings save)

**Interfaces:**
- Consumes: `ensureSupabase()`, `currentUser()`, `state`, `saveState()`, `escalatedStake`.
- Produces: `cloudPull()`, `cloudPushHabit(h)`, `cloudPushProfile()`, `cloudPushTx(tx)`, `cloudDeleteHabit(id)`, `cloudFlushDirty()`, and the mappers `habitToRow(h)` / `rowToHabit(row)`.

- [ ] **Step 1: Add the cloud-sync module**

Add this block right after `sbAccessToken()`:

```js
// ── CLOUD SYNC (Phase 1) ──────────────────────────────────────────────
// localStorage stays the offline cache; Supabase is the cross-device source.
// Per-row last-write-wins via updatedAt. Deletes use a deleted_at tombstone.
function nowIso() { return new Date().toISOString(); }
function stamp(o) { o.updatedAt = nowIso(); return o; }

function habitToRow(h) {
  return {
    id: h.id, user_id: currentUser().id,
    name: h.name, emoji: h.emoji, icon: h.icon, color: h.color, category: h.category,
    source: h.source, metric: h.metric, dir: h.dir, target: h.target, unit: h.unit, verify: h.verify,
    apps: h.apps || [], cap_minutes: h.capMinutes ?? null,
    freq: h.freq, stake: h.stake, destination: h.destination, escalate: !!h.escalate,
    completed_days: h.completedDays || [], missed_days: h.missedDays || [],
    current_streak: h.currentStreak || 0, best_streak: h.bestStreak || 0,
    created_at: h.createdAt, updated_at: h.updatedAt || nowIso(), deleted_at: h.deletedAt || null,
  };
}
function rowToHabit(r) {
  return {
    id: r.id, name: r.name, emoji: r.emoji, icon: r.icon, color: r.color, category: r.category,
    source: r.source, metric: r.metric, dir: r.dir, target: r.target, unit: r.unit, verify: r.verify,
    apps: r.apps || [], capMinutes: r.cap_minutes,
    freq: r.freq, stake: r.stake, destination: r.destination, escalate: !!r.escalate,
    completedDays: r.completed_days || [], missedDays: r.missed_days || [],
    currentStreak: r.current_streak || 0, bestStreak: r.best_streak || 0,
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
  };
}

async function cloudPull() {
  const sb = await ensureSupabase(); if (!sb || !currentUser()) return;
  const uid = currentUser().id;
  const [{ data: hRows }, { data: pRow }, { data: txRows }] = await Promise.all([
    sb.from('habits').select('*').eq('user_id', uid),
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('transactions').select('*').eq('user_id', uid),
  ]);
  // Merge habits by id, newer updatedAt wins; drop tombstoned.
  const byId = {};
  (state.habits || []).forEach(h => { byId[h.id] = h; });
  (hRows || []).forEach(r => {
    if (r.deleted_at) { delete byId[r.id]; return; }
    const local = byId[r.id];
    if (!local || new Date(r.updated_at) >= new Date(local.updatedAt || 0)) byId[r.id] = rowToHabit(r);
  });
  state.habits = Object.values(byId).filter(h => !h.deletedAt);
  if (pRow) {
    if (!state.profile.updatedAt || new Date(pRow.updated_at) >= new Date(state.profile.updatedAt)) {
      state.profile.name = pRow.name ?? state.profile.name;
      state.profile.handle = pRow.handle ?? state.profile.handle;
      state.profile.reminderTime = pRow.reminder_time ?? state.profile.reminderTime;
      state.profile.reminderOn = pRow.reminder_on ?? state.profile.reminderOn;
      state.profile.updatedAt = pRow.updated_at;
    }
  }
  if (txRows && txRows.length) {
    const seen = new Set((state.txHistory || []).map(t => t.id).filter(Boolean));
    txRows.forEach(t => { if (!seen.has(t.id)) state.txHistory.unshift({ id: t.id, date: t.date, desc: t.desc, amount: t.amount, type: t.type }); });
  }
  saveState();
  if (typeof renderHabits === 'function') renderHabits();
}

function markDirty(kind, id) {
  state._dirty = state._dirty || [];
  if (!state._dirty.some(d => d.kind === kind && d.id === id)) state._dirty.push({ kind, id });
  saveState();
}

async function cloudPushHabit(h) {
  const sb = await ensureSupabase(); if (!sb || !currentUser()) return;
  stamp(h);
  const { error } = await sb.from('habits').upsert(habitToRow(h), { onConflict: 'id' });
  if (error) markDirty('habit', h.id);
}
async function cloudDeleteHabit(id) {
  const sb = await ensureSupabase(); if (!sb || !currentUser()) return;
  const { error } = await sb.from('habits').update({ deleted_at: nowIso(), updated_at: nowIso() }).eq('id', id);
  if (error) markDirty('habitDelete', id);
}
async function cloudPushProfile() {
  const sb = await ensureSupabase(); if (!sb || !currentUser()) return;
  state.profile.updatedAt = nowIso();
  const p = state.profile;
  const { error } = await sb.from('profiles').upsert({
    id: currentUser().id, name: p.name, handle: p.handle,
    reminder_time: p.reminderTime, reminder_on: !!p.reminderOn, updated_at: p.updatedAt,
  }, { onConflict: 'id' });
  if (error) markDirty('profile', currentUser().id);
}
async function cloudPushTx(tx) {
  const sb = await ensureSupabase(); if (!sb || !currentUser() || !tx) return;
  if (!tx.id) tx.id = 't_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const { error } = await sb.from('transactions').upsert({
    id: tx.id, user_id: currentUser().id, date: tx.date, desc: tx.desc, amount: tx.amount, type: tx.type,
  }, { onConflict: 'id' });
  if (error) markDirty('tx', tx.id);
}
async function cloudFlushDirty() {
  if (!state._dirty || !state._dirty.length || !currentUser()) return;
  const pending = state._dirty.splice(0); saveState();
  for (const d of pending) {
    if (d.kind === 'habit') { const h = (state.habits || []).find(x => x.id === d.id); if (h) await cloudPushHabit(h); }
    else if (d.kind === 'habitDelete') await cloudDeleteHabit(d.id);
    else if (d.kind === 'profile') await cloudPushProfile();
    else if (d.kind === 'tx') { const t = (state.txHistory || []).find(x => x.id === d.id); if (t) await cloudPushTx(t); }
  }
}
```

- [ ] **Step 2: Pull on login + flush on load/online**

In `afterLogin()`, after the email line from Task 6, add:
```js
cloudPull().then(cloudFlushDirty);
```
And once near boot (e.g. end of `checkAuthOnLoad`), add an online listener:
```js
window.addEventListener('online', () => cloudFlushDirty());
```

- [ ] **Step 3: Write-through on habit create**

In **both** `commitHabit()` and `addHabitFromModal()`, right after the existing `registerStake(h)` line, add:
```js
stamp(h); cloudPushHabit(h);
```

- [ ] **Step 4: Write-through on complete/miss/edit/delete**

- In `completeHabit()`, after `saveState();`: `stamp(h); cloudPushHabit(h); cloudPushTx(state.txHistory[0]);`
- In `missHabit()`, after `saveState();`: `stamp(h); cloudPushHabit(h); cloudPushTx(state.txHistory[0]);`
- In `saveHabitEdit()`, after `saveState();`: `stamp(h); cloudPushHabit(h);`
- In `deleteHabit(id)`, after `saveState();`: `cloudDeleteHabit(id);`

- [ ] **Step 5: Write-through on settings save**

In the settings-save function (where `state.profile.name`/`handle`/reminder are written), after its `saveState();`: `cloudPushProfile();`

- [ ] **Step 6: Preview verification — cross-device sync**

(Needs the keys from Task 6 + Task 0 project.)
1. Sign in (browser A / preview). Add a habit, complete it.
2. In Supabase → Table Editor → `habits` and `transactions`: rows present for your user, `updated_at` set.
3. Open a second browser/incognito (browser B), sign in as the same user → run `await cloudPull()` in console → the habit appears (`state.habits`).
4. Edit the habit's stake in B → in A run `await cloudPull()` → A shows the new stake (newer `updatedAt` wins).
5. Delete the habit in A → in B run `await cloudPull()` → it's gone (tombstone).
6. Clear `localStorage` in A, reload, sign in → data restored via `cloudPull()`.

Record these results in the PR description (manual verification).

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(client): cloud sync engine (pull/push/LWW/tombstone/offline)"
```

---

## Task 9: Gate payments on a real account + propagate to iOS

**Files:**
- Modify: `index.html` (the "Add card" entry point / payments UI copy)
- Build: `npm run sync:web`

- [ ] **Step 1: Gate the card flow on sign-in**

At the top of `savePaymentMethod()` (after the `BACKEND_URL` check), the Task-7 token guard already returns early with "Sign in to enable payments." Confirm device-local/preview users hit that path (no Supabase session → `sbAccessToken()` is null). No further code needed; verify by signing out and tapping "Add card" → toast appears, no network call.

- [ ] **Step 2: Propagate to the iOS bundle**

Run: `npm run sync:web`
Expected: `index.html` copied into `www/` and `ios/App/App/public/`.

- [ ] **Step 3: Commit**

```bash
git add index.html www ios
git commit -m "chore: gate payments on real account + sync web bundle to iOS"
```

---

## Self-review (completed)

- **Spec coverage:** auth activation (T6) · schema+RLS (T2) · backend token verification + IDOR close (T4,T5) · real DB (T1,T3,T5) · email fix (T5,T6) · full sync incl. deletes/offline (T8) · success criteria mapped to T5/T7/T8 verification steps · operational prereqs (T0). Payout-readiness: identity unified on the Supabase id (T5,T6); `recipient_user_id` deferred to Phase 2 per spec. ✓
- **Placeholders:** none — every code step has full code; "Task 0" is intentionally a user-action gate, not a code placeholder.
- **Type consistency:** `makeDb`/`makeRequireUser`/`makeRequireChargeSecret` signatures match between Tasks 3–5; `habitToRow`/`rowToHabit` field names match the schema columns in Task 2; `/charge-on-miss` body uses `userId` consistently (client + backend).
- **Known limitation (stated honestly):** client-side sync + RLS are verified via the preview browser against a live Supabase project, not automated unit tests, because the single-file client has no module/test harness. Backend logic is unit-tested (`node --test`).
