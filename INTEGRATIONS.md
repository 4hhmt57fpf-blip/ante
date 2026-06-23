# Ante — Real Verification & Payments Architecture

> Scope of this doc: how to take the prototype's **simulated** verification and
> stakes (Apple Health, Screen Time, Canvas, Strava, payments) and make them
> **real**. None of this can run inside the single-file HTML prototype — each
> piece needs a native iOS capability and/or a server. This is the build plan,
> not code that ships in `index.html`.

## 0. Core principle (already in the product)

Every bet must map to a **verifiable source** — no honor system. The prototype
encodes this in `SOURCES` and `state.connections`. The real build keeps that
contract: a habit can only be created if its source is connected, and a day is
only marked complete when the source confirms it.

```
SOURCES  ──maps to──►  verifier  ──confirms──►  day complete | missed (stake locked)
 health                 HealthKit (on-device)
 screentime             DeviceActivity (on-device)
 canvas                 Canvas LMS API (server)
 strava                 Strava API + webhooks (server)
 camera                 AI photo + human review (server)
```

## 1. System shape

```
┌─────────────────────────────┐      ┌──────────────────────────────┐
│  iOS app (Capacitor shell)  │      │  Ante backend (the only place │
│  - index.html (current UI)  │◄────►│  with secrets)                │
│  - Native plugins:          │ HTTPS│  - Auth (Supabase, already    │
│    • HealthKit reader        │      │    scaffolded in AUTH/_sb)    │
│    • DeviceActivity monitor  │      │  - Verification engine (cron) │
│    • Secure token store      │      │  - Payments (Stripe)          │
└─────────────────────────────┘      │  - OAuth callbacks            │
            ▲                          └──────────────┬───────────────┘
            │ on-device only                          │ server-to-server
            │ (HealthKit, ScreenTime never            ▼
            │  leave the phone)              Canvas API · Strava API · Stripe
```

Two verification classes:

- **On-device** (HealthKit, Screen Time): Apple forbids reading these
  server-side. The native layer reads them locally, evaluates the goal, and
  POSTs a **signed result** (`{habitId, date, met:true/false, metricValue}`) to
  the backend. The phone is the verifier; the server trusts a signed assertion +
  re-checks for tampering (monotonic dates, device attestation).
- **Server-side** (Canvas, Strava): the backend holds the OAuth token and polls
  / receives webhooks, so verification happens without the phone.

## 2. Apple Health (HealthKit)

- **Capability:** add HealthKit entitlement; `NSHealthShareUsageDescription` in
  `Info.plist`. Read-only.
- **Plugin:** a Capacitor plugin wrapping `HKHealthStore`. Request authorization
  for the specific types a bet needs — `stepCount`, `distanceWalkingRunning`,
  `appleExerciseTime`, `mindfulSession`, `sleepAnalysis`.
- **Verification:** at the day's deadline (and on app open) query the relevant
  `HKStatisticsQuery` for `[startOfDay, deadline]`, compare to `habit.target`
  with `habit.dir` (`≥` / `≤`), emit the signed result.
- **Bonus:** Whoop / Fitbit / Garmin / Oura / Strava all write into Health, so
  "connect Apple Health" covers them — matches the prototype's `health` source.
- **Seam in current code:** `SOURCES.health`, `state.connections.health`, and the
  `goal.unit` targets in `createHabit()`.

## 3. Screen Time (FamilyControls / DeviceActivity / ManagedSettings)

- **Capability:** the **Family Controls** entitlement (Apple approval required).
  Frameworks: `FamilyControls` (auth + app picker), `ManagedSettings` (enforce
  limits), `DeviceActivity` (usage thresholds via an extension).
- **Key constraint:** you **cannot** read a user's installed apps or raw usage in
  your own process or on a server. You present Apple's `FamilyActivityPicker`
  (opaque tokens, not app names) and register `DeviceActivitySchedule`s with
  thresholds. A `DeviceActivityMonitor` **app extension** fires
  `eventDidReachThreshold` when the cap is exceeded — that's your "miss" signal.
- **Flow:** user picks app categories → set daily cap → extension watches → on
  threshold breach, write a flag to a shared App Group container → main app reads
  it and reports the miss.
- **Seam in current code:** the `APP_PICKER_HTML` note already tells users the
  real version opens Apple's own picker; `state.onboardData.apps` / `capMinutes`
  map directly onto `FamilyActivitySelection` + the schedule threshold.

## 4. Canvas (LMS)

- **Auth:** Canvas supports per-user **API tokens** and OAuth2. For a consumer
  app use OAuth2 against the institution's Canvas (`/login/oauth2/auth`).
- **Verification:** backend calls `GET /api/v1/users/self/courses` then
  `/courses/:id/assignments` + `/submissions` to confirm nothing is
  missing/late. Run on a schedule near each assignment due date.
- **Storage:** token lives **server-side only**, encrypted. The prototype's
  `state.canvas.token` is for demo; real tokens never sit in the web layer.
- **Seam in current code:** `SOURCES.canvas`, `state.canvas`.

## 5. Strava

- **Auth:** OAuth2 (`activity:read`). Store refresh token server-side.
- **Verification:** subscribe to Strava **webhooks** (`activity create`) so the
  backend learns about runs in near-real-time, then pull
  `GET /athlete/activities` to confirm distance/duration vs the goal.
- **Note:** if the user already syncs Strava → Apple Health, the `health` path
  covers it without a separate Strava connection. Offer Strava direct for
  Android / users who don't use Health.

## 6. Payments & stakes (Stripe)

The model: a stake is money **at risk**; a miss moves it to a locked Savings
Vault (still the user's money) or, for social/charity bets, to a third party.

- **Setup:** Stripe customer per user; collect a payment method with
  `SetupIntent` (saved, off-session capable). PCI stays with Stripe — the app
  never sees card numbers (mirrors the prototype's "never enter card details"
  rule).
- **Two viable mechanics:**
  1. **Charge-on-miss (recommended to start):** save the card; when a day is
     missed, create an off-session `PaymentIntent` for the stake. Simple, no
     held funds. Risk: failed charges → retry/dunning.
  2. **Escrow / hold:** pre-authorize or pre-collect the period's max stake into
     a Stripe-held balance, release what's earned back. Cleaner UX, more
     complex (Stripe Connect + Treasury, KYC).
- **Destinations:** Savings Vault (track as ledger balance, pay back on
  win-streak), or charity (Stripe payout / donation partner).
- **⚠️ App Store rule:** real-money/charity flows interact with Apple's IAP
  policy. "Person-to-person" and regulated money movement are generally **exempt
  from IAP** and use a real payment processor, but this needs legal review
  before submission. Do **not** route stakes through IAP.
- **Seam in current code:** `walletBalance`, `savingsVault`, `txHistory`,
  `playAnteAnimation`, the Add-Money keypad — all become views over the
  server-side ledger.

## 7. Verification engine (backend)

- Scheduled jobs per habit `freq` + deadline; idempotent per `(habitId, date)`.
- Inputs: signed on-device results (Health/ScreenTime) + server pulls
  (Canvas/Strava) + AI photo review (camera).
- Output: write `completedDays` / `missedDays`, update streaks, and on a miss
  trigger the payment move. Everything double-entry in a ledger table.
- **Progress feedback on failure (addresses the brief):** every connector
  surfaces state to the UI — `connecting / connected / syncing / failed` — with a
  user-visible reason and retry. Never silently assume "verified."

## 8. Data model (server) — additions beyond the prototype's `state`

```
users(id, auth_provider, ...)
connections(user_id, source, status, oauth_ref, last_sync_at, error)
habits(id, user_id, source, metric, target, dir, unit, freq, stake, deadline_local, tz)
verifications(habit_id, date, met, metric_value, evidence_ref, verifier, created_at)
ledger(user_id, type[stake|forfeit|payback|deposit], amount, habit_id, stripe_ref, ts)
payment_methods(user_id, stripe_customer, stripe_pm, default)
```

## 9. Security

- Only the **public** Supabase anon key ships in the app (already the case).
- All third-party tokens + Stripe secret key live server-side, encrypted.
- On-device results are signed; server re-validates (no client-trusted "I won").
- No PII or tokens in URLs/query strings.

## 10. Suggested phasing

1. **Apple Health steps/workouts** end-to-end (highest trust, on-device, no
   Apple approval friction) + **Stripe charge-on-miss**. This alone makes the
   core loop real.
2. **Canvas** (server OAuth — good for the student wedge).
3. **Screen Time** (needs Family Controls entitlement approval; start the
   request early).
4. **Strava direct**, **AI photo review**, **escrow** payments, group-pot payouts.

---

_Generated as the planning deliverable for requirement #4. The prototype keeps
its realistic simulated flows so the whole experience is demoable today; this doc
is the map from those seams to production._
