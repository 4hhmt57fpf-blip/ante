# Ante — Phase 1: Real Cloud Accounts + Full Sync — Design

- **Date:** 2026-06-25
- **Status:** Design approved; pending spec review → implementation plan
- **Phase:** 1 of 3 (1: accounts+sync · 2: friend graph · 3: cash payouts)

## 1. Context & goal

Today Ante stores all app state (habits, streaks, transactions, profile) in a
single `localStorage` blob on one device. Accounts are device-local: the Supabase
auth code already exists in `index.html` (~lines 2420–2556) but is **dormant**
because `AUTH.SUPABASE_URL` / `AUTH.SUPABASE_ANON_KEY` are empty. The payments
backend (`payments-backend/server.js`) trusts a client-supplied random
`anteUserId` (a documented IDOR) and keeps Stripe data in an in-memory map that is
wiped on restart. The user's email is never set, so Stripe customers get no email.

**Goal:** make accounts *real* — cloud login, app data that syncs across devices
and survives a cleared browser, and a Stripe identity bound to the true
authenticated user (closing the IDOR). This is the foundation every later phase
(friend graph, payouts) depends on.

## 2. Scope

**In scope**
- Turn on Supabase cloud auth (email + Apple/Google — code already written).
- Move all app state to Supabase Postgres; sync across devices (offline cache via `localStorage`).
- Backend verifies the Supabase login token on money endpoints; identity derived from the token, never the body (closes the IDOR).
- Stripe customer + canonical stake ledger move to the real DB, keyed to the Supabase user ID.
- Fix the email bug (Stripe customers get a real email).

**Out of scope (later phases / separate)**
- Friend search/graph, recipients on habits, cash payouts (Phases 2–3). Schema is left *payout-ready* (unified real-user identity; a nullable `recipient_user_id` is added to `habits` in Phase 2).
- The dead-end "wallet / Add-Money" cleanup (related but tracked separately).
- Live Realtime cross-device push (pull-on-load + write-through is enough for Phase 1).

## 3. Architecture (Approach A)

Two channels, clean split:

```
                 ┌─────────────────────────────────────────┐
   Browser ──────┤ Supabase (Auth + Postgres, Row-Level Sec)│   app data: profiles,
   (Supabase JS) └─────────────────────────────────────────┘   habits, transactions
        │
        │  Authorization: Bearer <supabase access token>
        ▼
   ┌─────────────────────────┐      service-role      ┌──────────────────────────┐
   │ Express backend (Stripe)│ ─────────────────────► │ Supabase Postgres        │
   │  - verifies token       │                        │  stripe_customers, stakes│
   │  - all Stripe calls     │                        │  (server-authoritative)  │
   └─────────────────────────┘                        └──────────────────────────┘
```

- **Browser ↔ Supabase** for auth and app data. Row-Level Security (RLS) guarantees a user can only read/write their own rows.
- **Browser ↔ Express** for money operations; Express verifies the token and runs the (already-tested) Stripe code.
- **Express ↔ Supabase** via the service-role key for the few server-authoritative rows (Stripe customer ID, canonical stake).

## 4. Identity model

- The **Supabase user ID (UUID) is the one identity** everywhere. On login,
  `state.user = { id, email, provider, name }`.
- The random per-device `anteUserId` is **retired**; on the **client-facing**
  endpoints the backend derives the user from the verified token (`req.userId`) and
  ignores any id in the body. This is what closes the IDOR from the security review.
  (`/charge-on-miss` is the one exception — it is server-to-server, has no user
  token, and so takes the target user ID in the body, gated by `CHARGE_SECRET`.)
- **Device-local (salted-hash) accounts remain only for offline/preview** and
  cannot use real payments — the UI states "sign in to enable payments."

## 5. Data model (Supabase Postgres)

All tables have `user_id`, `updated_at`, and (where sync-deletable) `deleted_at`
for tombstone-based delete propagation. RLS enabled on every table.

| Table | Key columns | Writer | RLS |
|---|---|---|---|
| `profiles` | `id` (=auth.uid()), `name`, `handle` (unique, for Phase-2 search), `reminder_time`, `reminder_on`, `updated_at` | client | `id = auth.uid()` |
| `habits` | `id` text PK (client-generated), `user_id`, all habit fields (`name`,`emoji`,`icon`,`color`,`category`,`source`,`target`,`unit`,`freq`,`stake`,`destination`,`escalate`,`apps` jsonb,`cap_minutes`), `completed_days` jsonb, `missed_days` jsonb, `current_streak`, `best_streak`, `created_at`, `updated_at`, `deleted_at` | client | `user_id = auth.uid()` |
| `transactions` | `id` text PK, `user_id`, `date`, `desc`, `amount`, `type`, `created_at` | client | `user_id = auth.uid()` |
| `stripe_customers` | `user_id` PK, `customer_id`, `default_pm`, `updated_at` | **backend (service role)** | select own row; no client write |
| `stakes` | (`user_id`,`habit_id`) PK, `amount_cents`, `updated_at` | **backend (service role)** | select own row; no client write |

RLS example (`habits`):
```sql
alter table habits enable row level security;
create policy habits_owner on habits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```
`stripe_customers` / `stakes`: a `select` policy `using (user_id = auth.uid())`
and **no** insert/update policy — normal users can't write; the service-role key
bypasses RLS for backend writes.

**Design choices (defaults):** completions stored as **JSONB arrays** on `habits`
(may normalize into a `habit_events` table in Phase 2 for the social feed);
conflict resolution is **last-write-wins** per row via `updated_at`.

## 6. Sync engine (client)

A small cloud module (e.g. `cloud` helpers) layered over the existing `state`:

- **On login (`afterLogin`):** `pullState()` — fetch the user's rows, merge into
  `state` taking the newer of cloud vs local per row (`updated_at`), drop
  tombstoned rows (`deleted_at`), then `saveState()` updates the local cache.
- **On mutation** (`createHabit`, `completeHabit`, `missHabit`, `saveHabitEdit`,
  `deleteHabit`, settings save): after the local update, write-through an upsert of
  the affected row(s) with `updated_at = now()`. Deletes set `deleted_at` and
  upsert (so other devices see the deletion).
- **Conflict:** last-write-wins per row. Tradeoff: a true simultaneous edit on two
  devices loses the older one — acceptable for a habit app.
- **Offline:** `localStorage` stays the source while offline; mutations mark a
  `_dirty` set; flush on next online load. Best-effort; the UI never blocks on sync.

## 7. Backend changes (Express)

- New `requireUser` middleware: read `Authorization: Bearer <token>`, verify via the
  Supabase service client (`auth.getUser(token)`), set `req.userId` + `req.userEmail`;
  401 on missing/invalid. Apply to `/create-customer`, `/create-setup-intent`,
  `/save-payment-method`, `/register-stake`.
- Identity comes from `req.userId` — stop reading `anteUserId` from the body (IDOR closed).
- Replace the in-memory `db` with Supabase service-role queries against
  `stripe_customers` / `stakes`.
- `ensureCustomer` uses `req.userEmail` from the token → **fixes the email bug**.
- `/charge-on-miss` keeps its `CHARGE_SECRET` (server-to-server); the trusted job
  supplies the target user ID in the body, and it now reads the customer + stake
  from the DB (not the in-memory map).
- Webhook (`setup_intent.succeeded`) now persists the default PM to the DB.
- **New env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only — never shipped to the client).

## 8. Client auth wiring

- Fill `AUTH.SUPABASE_URL` / `AUTH.SUPABASE_ANON_KEY` (user-provided) → existing
  Supabase login activates (email + Apple/Google).
- Before each backend money call, get a fresh access token
  (`supabase.auth.getSession()`) and send it as the bearer.
- `anteUserId()` returns `state.user.id` when signed in (kept only for client-side
  keys; the backend ignores it).
- Set `state.profile.email = state.user.email` (UI) — backend no longer depends on it.
- Gate real payments behind a configured + signed-in Supabase session.

## 9. Error handling

- **Token expiry:** Supabase JS auto-refreshes; always pull a fresh access token
  immediately before a backend call.
- **Backend 401:** client surfaces "please sign in again" and routes to login.
- **Sync failure / offline:** keep the local cache, mark `_dirty`, retry on next
  load; never block the UI on a network round-trip.
- **RLS / service-role:** the service-role key lives only on the backend; a leak
  would bypass RLS, so it must never reach the client bundle.

## 10. Success criteria (verification)

1. Sign up on device A → add a habit → sign in on device B → the habit appears; edit on B → shows on A.
2. Clear browser storage → sign in → all data restored from the cloud.
3. Delete a habit on A → it disappears on B (tombstone propagates).
4. Backend rejects money calls with a missing/invalid token; a user cannot act under another user's ID (IDOR closed).
5. A Stripe customer is created bound to the real user ID **and** a real email.
6. Offline edits apply locally and sync when back online.
7. Preview/offline mode still works without an account (no payments).

## 11. Operational prerequisites (user-owned)

I write the code, SQL schema, and RLS policies; the user provisions and deploys:
1. Create a Supabase project.
2. Apply the schema + RLS (SQL provided with the implementation).
3. (Optional) Configure Apple/Google OAuth providers in the Supabase dashboard.
4. Set `AUTH.SUPABASE_URL` / `ANON_KEY` in `index.html`; run `npm run sync:web` for the iOS bundle.
5. Deploy the backend with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` alongside the existing Stripe + `CHARGE_SECRET` env vars.

## 12. Risks & open notes

- **LWW data loss** on genuinely concurrent multi-device edits (accepted).
- **Service-role key** exposure would bypass RLS — must stay server-only.
- **RLS correctness** is load-bearing for data isolation; policies must be tested.
- **iOS bundle** (`ios/App/App/public/`) is a build artifact; changes propagate via `npm run sync:web`.
