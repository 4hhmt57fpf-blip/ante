# Meeting prep — Ray Fitness founder

Prep for the intro to **Colin Raney** (co-founder/CEO, Ray Fitness). Goal is open — could be advice, product feedback, or a collab — so this preps you for all three.

---

## 1. Who you're meeting

**Ray Fitness** — an AI personal-trainer iOS app.
- **Product:** real-time **voice coaching** during workouts + **computer-vision rep counting / form correction** + adaptive programming that adjusts to your equipment, time, and energy. Live on the App Store since May 2025, ~4.9★.
- **Stage:** seed, ~$4.5M (Founder Collective, True Ventures). Boston. ~8 months in market.
- **Colin Raney (CEO):** ex-CMO of PillPack (acquired by Amazon) and Formlabs; studio lead at IDEO. He got **certified as a personal trainer** before building Ray — he cares about craft and domain depth.
- **Rich Miner (co-founder):** **co-founded Android**, co-founded Google Ventures. Deeply technical.

**What this means for you:** they have elite design taste *and* deep technical chops. They'll spot anything fake instantly. Don't oversell — show what's real, be honest about what's early, and be the sharpest person-in-the-room on the *behavioral* side of fitness.

---

## 2. Your one-line positioning (lead with this)

> "Ray makes sure you're doing the workout right. Ante makes sure you **show up** at all — you put money on it, and it's only at risk if you skip. Different layer of the same problem."

Ray = the **coaching** layer. Ante = the **accountability / behavioral** layer. **Complementary, not competitive.** This framing makes you interesting to him rather than a threat, and it's a natural lead-in to "could these work together."

---

## 3. Smart questions to ask him

1. Ray reports ~91% workout-completion. **How much of that is the live coaching presence vs. sunk-cost/commitment?** Have you isolated it?
2. Have you tested any **commitment or staking mechanic**, or does the in-the-moment coach already solve adherence on its own?
3. As LLMs + computer vision commoditize, **where's the moat** — the data (a user's injury/form history) or the UX?
4. Where do you see overlap with **Future** (human coaches) vs **Fitbod** (logging) — and which customer is least contested?

---

## 4. The demo — what to show (90 seconds)

Demo on your **iPhone** (real Apple Health), keep the web link as a backup to send afterward. Show only the real parts, in this order:

1. **Sign up** — real account (email + password actually validate; wrong password is rejected). "Accounts are real — salted-hashed locally now, Supabase-backed when we flip it on."
2. **Pick a habit → stake** — onboarding: choose a habit, connect its verification source, set the daily stake. "Every bet maps to an automatic verification source — no honor system."
3. **Mark a fitness habit complete** — on your phone this reads **real Apple Health** data and passes/fails for real. Streak flame + confetti fire.
4. **Photo + AI proof** — snap a photo of a custom goal; **Claude vision** actually judges whether the photo shows you did it and can *reject* a bad photo. (This is the most on-theme thing to show a CV-fitness founder.)
5. **Stats** — the 5-week heatmap + the 2D/3D routine map. Visual, real, on-device.
6. **The vault** — the 3D vault-door splash. "Forfeited money locks in here — still yours, you earn it back."

**Routes to avoid / own honestly** (don't let these become a "gotcha"):
- **Money:** there's no "add funds" — open *How Ante handles money*: "You save a card once, and we only charge it the day you actually miss. Never holding a balance is what keeps us out of money-transmitter licensing." (This is a *strength* — say it confidently.)
- **Friends feed:** labeled **"Sample activity"** — "social is stubbed; real friends come with the Supabase backend."

---

## 5. Honest status (if he asks "how real is it?")

- **Real today:** the full habit loop (create / stake / track / streak / miss), real accounts, **real Apple Health verification on iOS**, real Canvas + GPS verification, and **real AI photo verification** (Claude vision). Live PWA + installable iOS app.
- **Wired but not flipped on:** Stripe charge-on-miss (code complete, needs keys + a legal sign-off before live money). Supabase cloud accounts + social (the local versions upgrade automatically when keys are added).
- **Honest framing:** "It's a working prototype with a few real verification rails and a clear path to production — not a finished product."

---

## 6. Pre-meeting checklist (do these, in order)

1. **[Required for photo-AI] Deploy the backend.** Deploy `payments-backend/` to Render or Vercel (free tier), set `ANTHROPIC_API_KEY` (from console.anthropic.com). Then set `HELP.BACKEND_URL` in `index.html` to the deployed `https://…` URL. *(Local fallback for a laptop/web demo only: `node --env-file=.env server.js` and point at `http://localhost:3000` — a phone can't reach localhost.)*
2. **Build to your iPhone.** Open Xcode → connect your iPhone → sign in with your Apple ID under Signing (free 7-day provisioning, no $99 needed) → run to the device. Make sure your phone's Apple Health has some step/workout data so verification has something real to read.
3. **Push the web backup.** Push root `index.html` to GitHub so `https://4hhmt57fpf-blip.github.io/ante/` is current. ⚠️ Before pushing live, make sure `HELP.BACKEND_URL` points at the deployed backend (not `localhost`), or the live AI calls will fail.
4. **Dry-run the demo once** on the phone the morning of — sign up fresh, add a habit, verify with Health, do a photo proof, open stats.

---

*Positioning, talking points, and demo flow are the priority. The build is there to make the conversation concrete — not to be the conversation.*
