# Ante Payments — Stripe + Apple Pay

The code is built and wired. To make money actually move, **you** need to do the
steps below (I can't create accounts, hold secret keys, or deploy a server).

## The model (why it's compliant)

**Save-card-then-charge-on-miss.** When a user commits a bet, Ante saves a card
with a Stripe **SetupIntent** — **no money moves**. When a habit is verified
**missed**, the backend charges that saved card **off-session** (a merchant-
initiated transaction) straight into **your** Stripe account. Because Ante is the
merchant of record and never holds a pooled balance owed to a third party, this
is taking your own revenue (ideally donated to charity) — not transmitting other
people's money, which is what avoids money-transmitter licensing.

> ⚠️ **Copy/legal note:** the app currently says misses go to a "Savings Vault
> (still your money)." If you actually charge the card, the money *leaves* the
> user. Reconcile that wording (e.g. reframe miss-charges as a charity donation)
> and add a mandate checkbox stating the card **will** be charged on a miss —
> Stripe requires explicit consent for off-session charges. Confirm with counsel.

## Security: who can trigger a charge

`/charge-on-miss` **moves money**, so it is locked down and must only ever be
called by your own trusted miss-detection job (server-to-server):

- It requires `Authorization: Bearer $CHARGE_SECRET`. Requests without the secret
  are rejected (`401`), and if `CHARGE_SECRET` is unset the endpoint refuses to
  charge at all (`503`, fail-closed). **Never put `CHARGE_SECRET` in the app/browser.**
- The charge **amount is derived server-side** from the stored stake — it ignores
  any amount in the request body and is clamped to `[$0.50, $400]`. The app records
  the stake via `POST /register-stake` (`{ anteUserId, habitId, amountCents }`) when
  a bet is locked in, edited, or escalates; `index.html`'s `registerStake()` does
  this automatically once `PAYMENTS.BACKEND_URL` is set.

> **Follow-up (not done here):** the browser-facing endpoints (`/create-customer`,
> `/create-setup-intent`, `/save-payment-method`, `/register-stake`) trust the
> client-supplied `anteUserId`, so a caller can act under any user id. A charge
> still needs `CHARGE_SECRET` and is amount-capped, so the blast radius is bounded,
> but before scaling add real per-user auth (e.g. a Supabase Auth JWT verified on
> the backend) and key these endpoints off the verified user instead of the body.

## What you provide

1. **Stripe account** → Publishable key (`pk_…`) + Secret key (`sk_…`).
2. **Apple Developer Program** + a **Merchant ID** (e.g. `merchant.com.ante.app`)
   created at developer.apple.com → Identifiers → Merchant IDs.
3. **Register** that Merchant ID in Stripe (Dashboard → Settings → Payment methods
   → Apple Pay). For the **web** site, also add the domain
   `4hhmt57fpf-blip.github.io` there (Stripe auto-hosts the verification file).
4. **Deploy** `payments-backend/` (Vercel / Render / Fly / Railway) and set env:
   `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `CHARGE_SECRET` (a long random string — `openssl rand -hex 32`),
   `ALLOWED_ORIGIN=https://4hhmt57fpf-blip.github.io`.
5. **Webhook**: in Stripe, add an endpoint at `https://YOUR_BACKEND/webhook`, copy
   its `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
6. **Database**: replace the in-memory `db` in `server.js` with Supabase/Postgres/
   Firestore (the sample store is wiped on every serverless cold start).

## Wire it into the app

In `index.html`, set the two values in the `PAYMENTS` object:

```js
const PAYMENTS = {
  BACKEND_URL: 'https://your-deployed-backend',
  STRIPE_PK: 'pk_live_or_test_xxx',
  ...
};
```

Then `npm run sync:web` to push it into the iOS bundle. The "💳 Apple Pay / Add
card" button (Add Funds modal) now runs the real save-card flow: native iOS shows
Stripe's PaymentSheet with Apple Pay; web shows Stripe Express Checkout + card.

## iOS (native Apple Pay)

In Xcode → App target → **Signing & Capabilities → + Capability → Apple Pay**, and
select your Merchant ID. That writes `com.apple.developer.in-app-payments` into
`App.entitlements`. Apple Pay does **not** work in the Simulator — test on a real
device (and the plugin flags Apple Pay as beta, so verify the sheet there).

## Plugin / library facts (verified)

- `@capacitor-community/stripe@8.1.1` — Capacitor 8 + **SPM-native** (no CocoaPods),
  Apple Pay via PaymentSheet. Already installed + synced into `CapApp-SPM`.
- Save-a-card uses **PaymentSheet with `setupIntentClientSecret`** (the standalone
  `createApplePay` API only accepts a `paymentIntentClientSecret`, so it can't save
  a card with no charge — that's why we use the sheet).
- Web pins `@stripe/stripe-js@^8.x` to match the plugin's peer dependency.
- `IOS_STRIPE_API_VERSION` in `PAYMENTS` must match the iOS Stripe SDK's API
  version so the server's ephemeral key lines up — adjust if Stripe updates it.
