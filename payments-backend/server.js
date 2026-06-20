// server.js — Ante Stripe backend (save-card-then-charge-on-miss)
//
// Model (verified): a user saves a card up front via a Stripe SetupIntent
// (Apple Pay is the primary mobile UI, shown inside Stripe's PaymentSheet).
// NO money moves at commit time. When a habit is verified MISSED, your trusted
// server job calls /charge-on-miss, which creates an off-session, merchant-
// initiated PaymentIntent against the saved card — funds flow card -> YOUR own
// Stripe account directly. Because Ante is the merchant of record and never
// holds a pooled balance owed to a third party, this is taking your own revenue
// (ideally donated to charity), not transmitting other people's money, which
// avoids money-transmitter licensing. Confirm the legal framing with counsel.
//
// Deploy to Vercel / Render / Fly / Railway. Node 18+. This is SEPARATE from the
// repo's server.py (that only proxies Canvas, locally). Never commit real keys.
//
// REQUIRED ENV (set in your host's dashboard — the implementer cannot create these):
//   STRIPE_SECRET_KEY=sk_live_xxx | sk_test_xxx     <- from your Stripe Dashboard
//   STRIPE_PUBLISHABLE_KEY=pk_live_xxx | pk_test_xxx <- from your Stripe Dashboard
//   STRIPE_WEBHOOK_SECRET=whsec_xxx                 <- after creating the webhook
//   ALLOWED_ORIGIN=https://4hhmt57fpf-blip.github.io
//   APPLE_MERCHANT_ID=merchant.com.ante.app         <- for native Apple Pay (optional here)
//
// NOTE: the anteUserId -> {customerId, defaultPM} map below is IN MEMORY for
// clarity and is wiped on every serverless cold start. REPLACE `db` with a real
// database (Supabase / Postgres / Firestore) before production.

import express from 'express';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://4hhmt57fpf-blip.github.io';
const app = express();

// CORS for the GitHub Pages PWA + the Capacitor webview (capacitor:// / ionic://).
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === ALLOWED_ORIGIN || /^(capacitor|ionic):\/\//.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGIN);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Webhook MUST see the raw body, so register it BEFORE express.json().
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook signature failed: ${err.message}`);
  }
  switch (event.type) {
    case 'setup_intent.succeeded': {
      const si = event.data.object;
      if (si.customer && si.payment_method) db.setDefaultPM(si.customer, si.payment_method);
      break;
    }
    case 'payment_intent.succeeded':
      // TODO: mark this miss-charge settled in your DB (use metadata.habitId/date).
      break;
    case 'payment_intent.payment_failed':
      // TODO: flag the user; prompt them to re-add a card.
      break;
  }
  res.json({ received: true });
});

app.use(express.json());

// --- tiny stand-in store; REPLACE with a real DB ---
const _users = {};      // anteUserId -> { customerId, defaultPM }
const _byCustomer = {}; // customerId -> anteUserId
const db = {
  getCustomer: (uid) => _users[uid]?.customerId,
  setCustomer: (uid, cid) => { _users[uid] = { ..._users[uid], customerId: cid }; _byCustomer[cid] = uid; },
  setDefaultPM: (cid, pm) => { const uid = _byCustomer[cid]; if (uid) _users[uid].defaultPM = pm; },
  getDefaultPM: (uid) => _users[uid]?.defaultPM,
};

async function ensureCustomer(anteUserId, email) {
  let customerId = db.getCustomer(anteUserId);
  if (!customerId) {
    const c = await stripe.customers.create({ email, metadata: { anteUserId } });
    customerId = c.id;
    db.setCustomer(anteUserId, customerId);
  }
  return customerId;
}

// 1) Create or fetch a Customer for an Ante user.
app.post('/create-customer', async (req, res) => {
  try {
    const { anteUserId, email } = req.body;
    const customerId = await ensureCustomer(anteUserId, email);
    res.json({ customerId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// 2) SetupIntent to save a card with NO charge. Used by the native PaymentSheet
//    (Apple Pay + card) AND the web Stripe.js Express Checkout / Payment Element.
//    FIX (from adversarial review): allow_redirects:'never' so an off-session,
//    card-only save never demands a return_url; apiVersion comes from the mobile
//    SDK (sent by the client) so the ephemeral key matches it.
app.post('/create-setup-intent', async (req, res) => {
  try {
    const { anteUserId, email, apiVersion } = req.body;
    const customerId = await ensureCustomer(anteUserId, email);

    let ephemeralKeySecret;
    if (apiVersion) {
      const ek = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion });
      ephemeralKeySecret = ek.secret;
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    res.json({
      setupIntentClientSecret: setupIntent.client_secret,
      ephemeralKey: ephemeralKeySecret,  // present only when the client sent apiVersion (native sheet)
      customerId,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// 3) Persist the saved payment method as default (webhook also covers this).
app.post('/save-payment-method', async (req, res) => {
  try {
    const { anteUserId, paymentMethodId } = req.body;
    const customerId = db.getCustomer(anteUserId);
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    db.setDefaultPM(customerId, paymentMethodId);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// 4) Charge on a verified MISS — off-session, merchant-initiated. SERVER-ONLY:
//    call this from your trusted miss-detection job, never from the client.
//    Idempotent per (habitId, date) so a day can't be double-charged.
app.post('/charge-on-miss', async (req, res) => {
  try {
    const { anteUserId, amountCents, habitId, date } = req.body;
    const customerId = db.getCustomer(anteUserId);
    const pm = db.getDefaultPM(anteUserId);
    if (!customerId || !pm) return res.status(400).json({ error: 'No saved card' });
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      payment_method: pm,
      off_session: true,
      confirm: true,
      metadata: { anteUserId, habitId, date },
    }, { idempotencyKey: `miss_${anteUserId}_${habitId}_${date}` });
    res.json({ status: intent.status });
  } catch (e) {
    if (e.code === 'authentication_required') {
      return res.status(402).json({ error: 'authentication_required', paymentIntent: e.raw?.payment_intent?.id });
    }
    res.status(400).json({ error: e.message });
  }
});

// ── Ante AI help chatbot (Claude) ──────────────────────────────────────────
// The app's Help section POSTs the conversation here; we call Claude with a
// scoped system prompt and return the reply. The ANTHROPIC_API_KEY never leaves
// this server. Swap the model to 'claude-haiku-4-5' for a cheaper/faster bot.
const ANTE_SYSTEM = `You are Ante AI, the in-app help assistant for Ante — a money-staked habit tracker. Users stake real money ($1–$100/day) on daily habits; completing a habit (auto-verified through a connected app like Apple Health, Screen Time, Canvas, Location, Kindle, or Duolingo) keeps their money, while missing it locks the stake into their personal Savings Vault — still their money, just inaccessible until they rebuild the habit. Be concise, friendly, and practical. Answer questions about how Ante works, setting up habits, connecting apps, staking, and the Savings Vault. If asked for personalized financial or investment advice, explain you can't give that. Keep replies under ~120 words.`;

app.post('/ai-chat', async (req, res) => {
  try {
    const raw = Array.isArray(req.body.messages) ? req.body.messages : [];
    const messages = raw.slice(-20).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 4000),
    })).filter(m => m.content);
    if (!messages.length) return res.status(400).json({ error: 'No message provided' });

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: ANTE_SYSTEM,
      messages,
    });
    const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message || 'AI request failed' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Ante backend (Stripe + AI) on :${port}`));
