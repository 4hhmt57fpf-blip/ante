# Group Challenges & Money Pots — design spec

*Status: design (approved in brainstorm 2026-06-23). Not yet planned/implemented.*

## Context

Ante users want to stake money in **group challenges**: pool a stake, complete the challenge, and the people who follow through are made whole while the people who flake lose theirs. The product requirement (from the founder) is that challenge creation should *feel* open — "people think they can do any challenge" — while the system **only ever attaches money to challenges that can't be cheated.** The motivating hard case is "No Shave November, submit a daily photo," which is unverifiable (photos get reused, staged, or AI-generated) and therefore must not be allowed to hold money.

This spec resolves the decisions made during the brainstorm:

1. **Money model = self-staking, not a pot redistribution** (legal + anti-cheat reasons, below).
2. **Two surfaces** — curated **public** pots and user-created **private** pots — which splits the create-vs-curate tension by *who authors* and *who joins*.
3. **A capability-registry gate** is the single source of truth for whether a challenge may carry money. The AI classifier only *proposes*; a server-side allowlist *decides*.
4. **Two end conditions** — time-based or last-person-standing (§2).
5. **Sponsored challenges are the monetization** — B2B / parent→kid, with sponsor-funded prizes (§8).

"Un-cheatable" here honestly means **cheat-resistant + server-verified + no profit motive to cheat** — not magic. The design layers all three.

## 1. Money model — self-staking only

- Everyone in a pot stakes the same amount up front (save-a-card / charge-on-result, never a held balance).
- **Complete the challenge → you get your own stake back. Miss it → your stake is forfeited to a charity** (or the user's locked vault), chosen when the pot is created.
- **There is no winner-takes-the-pot. Survivors never receive other players' money.** A *winner prize* is still possible — but it must be funded by **Ante** (as a marketing budget, early on) or a **sponsor** (parent / employer / brand, later), **never** by other players' losses. Decoupling the prize from the forfeits (which go to charity) is what lets "last person standing" win real cash without it becoming an unlicensed betting pool. See the payout model in §2.

Why this is non-negotiable:
- **Legal.** Pooling stakes and paying winners from losers' money is the gambling + money-transmitter trap (consideration + prize + chance, holding others' funds). Self-staking on your own controllable behavior stays in the skill-staking lane that StickK / WayBetter / Forfeit operate in. (Not legal advice — a fintech/gaming attorney signs off before real money.)
- **Anti-cheat.** It removes the payoff for the worst attack: if you can't win other people's money, multi-account/Sybil farming and collusion have nothing to steal.

> **Existing-code conflict to fix:** the app already ships a "Group Pots — winners split the pot" screen (`index.html:1957`, `2256`, `createGroupPot()` ~`5134`). That is the rejected winner-take-pot model and must be reworked to self-staking as part of this feature.

## 2. Two surfaces

| | Who authors it | Who can join | Cheat-proofing | Moderation |
|---|---|---|---|---|
| **Public pot** | **Ante (curated catalog)** | anyone on the app | every entry pre-vetted verifiable — no gate needed at join time | none (curated) |
| **Private pot** | **the user** | only people they invite (link/code) | runs through the verification gate (§3) — only verifiable challenges hold money | none needed (contained to invitees) |

Rationale:
- **Public = curated** because public means strangers. User-generated *public* challenges would invite spam, offensive titles, scams ("everyone stake $50"), and unverifiable junk — a moderation burden. A rotating catalog of ~20–40 strong verified challenges is safer, higher-integrity, and **solves cold-start** (something to join day one). Curated does not mean unscalable — public discovery doesn't need infinite variety (cf. DietBet, Kalshi).
- **Private = user-created** because that's the **scaling/virality engine** (friends invite friends → make their own pots → invite theirs), and UGC is safe when *contained* to a small invited group.

### Challenge formats & end conditions

Every challenge (public or private) picks ONE end condition at creation:

- **Time-based** — a fixed window (e.g. 30 days). Everyone who holds the bar for the whole window is a survivor; the rest forfeit along the way. Simplest; best for "everyone vs. the goal."
- **Last person standing (survival / elimination)** — players are eliminated the day they miss; the challenge ends when one person remains (or a max duration is hit, whichever comes first). Higher drama, naturally competitive, and the ideal shape for a sponsor-funded prize (the survivor wins the sponsor's reward).

Both run on the **same self-staking rail**: eliminated/failed players forfeit their own stake to charity; survivors get theirs back. "Last standing" changes *when it ends and who's crowned* — not where the money flows.

**Elimination rule (decided):** one missed day eliminates you. Simple, dramatic, and it means more forfeits flow to charity.

### Payout model (Ante-funded prize, decoupled from forfeits)

The winner **keeps their own stake AND gets a prize**, where the prize is **Ante's money** (a marketing budget early on; a sponsor's money later — §8), never the losers' stakes. Because elimination produces **one winner per challenge**, Ante pays exactly one prize regardless of how many join — so the prize can *grow with signups* without the cost scaling out of control.

- **Prize formula (recommended):** **$50 base + $1.50 per verified participant, hard cap $250** per challenge (Ante-funded). Winner keeps their stake on top. → 10 players = $65, 100 = $200, 1,000 = $250 (cap reached at ~134 players). The base makes small challenges worth entering; the per-player term makes the headline *visibly grow* ("Prize: $182 and counting"); the cap bounds the cost. Cost-per-participant *falls* as challenges scale ($6.50 → $2.00 → $0.25/head) — the right growth-loop curve. Track it as **CAC (marketing), not profit**; H&F fully-loaded CAC benchmarks run ~$6–18/user, so this sits in range at real group sizes.
- **THE non-negotiable invariant:** **the prize can never exceed the real stakes collected** — `prize ≤ Σ(locked, non-refunded stakes of verified-unique participants)`. This one rule makes every Sybil/collusion pumping attack negative-EV by construction. If only one guardrail ships, ship this.
- **Other guardrails:** a player counts toward the prize only after real auth + deduped payment-method/device fingerprint + captured stake + a completed **day-1 check-in** (signup ≠ prize unit); non-refundable, chargeback-decrementing stakes + per-user/device join cooldowns; absolute + per-winner caps; **scaled prizes only on curated, proof-of-effort challenges** (never attacker-created or trivially-completable ones). All of this requires the real-accounts backend (§5) — which is why money pots can't ship before it exists.
- **Sponsor transition:** keep the exact formula + cap; swap the funding line from Ante's marketing budget to a sponsor's — the cap becomes a per-challenge sponsorship rate (§8).
- **Benchmark validation:** pot-funded apps (DietBet, StepBet) pay *unreliable, often tiny* winnings ($5–10); HealthyWage's $5,000 Jackpot and Peloton sweepstakes are **operator/sponsor-funded** precisely because a guaranteed, marketable prize is a stronger hook than a variable pot split. Ante's operator-funded-prize + keep-your-stake + losers→charity is a defensible hybrid that copies the proven part of the leaders' playbook.

## 3. The verification gate (the whole ballgame)

User-created (private) challenges pass through a gate before they can carry money. The gate has three layers:

1. **Verified templates, front and center.** Each badged *Pot-eligible*: e.g. "Run 3 mi/day (GPS+Health)", "10k steps/day (Health)", "No missing assignments (Canvas)". Configuring a template = "creating your own" within safe rails. ~90% of users never leave this path.
2. **An open "describe your own" box** for the long tail — this is what makes creation *feel* limitless.
3. **A hard registry gate.** Free-text runs through an AI classifier (`/classify-challenge`) that maps it to **exactly one capability key** (`gps.checkin`, `health.run`, `health.steps`, `canvas.nomiss`, `photo.ai`, …) plus parameters. **The classifier never returns an eligibility flag or a tier and never moves money** — it only proposes a capability. A **server-side allowlist** (default-deny) decides whether that capability may hold money.

### Capability allowlist (money-eligibility)

| Capability | Money pot? | Notes / required server checks |
|---|---|---|
| `canvas.nomiss` | ✅ Yes | Official account data; hardest to fake. Students only. |
| `health.run` / `health.workout` | ⚠️ Yes, with checks | Require a GPS route + HR stream from an allowlisted source bundle (Apple Watch / Garmin / Strava); reject vehicular speed / no-signal tracks. Lower stakes. |
| `gps.checkin` | ⚠️ Yes, with checks | Geofence anchored to a **server-side POI** (never the user's first ping); require plausible trajectory/speed; reject the iOS simulated-location flag. |
| `health.steps` / `health.mindful` | ⚠️ Yes, low stakes | Allowlist trusted source bundles; price low; frame as motivational, not adversarially secure. |
| `photo.ai`, `sleep`, `screen.time`, anything unmapped/ambiguous | ❌ No (honor only) | Cannot hold money. |

### "No Shave November" — handled gracefully

User types it in the open box (feels limitless). Classifier maps it → `photo.ai` → allowlist = **No**. The verdict screen does **not** dead-end:

> "Love it — but no sensor measures beard growth, and photos can be reused, staged, or AI-generated, so this one can't hold money. Run **No Shave November** as a **free group streak**, or stake on something we can verify — like a daily **Run** or **10k steps**."

Two buttons: **Run it free (no pot)** / **Pick a verifiable goal.** The challenge still exists; it just can't carry money. This is exactly "feel like you can do anything, but only verifiable things hold money" — and the redirect *teaches why*.

## 4. Threat model — what survives even a good design

The red-team found three vectors that no UX fully removes; they're handled by server checks + pricing + the self-staking model, not by the gate alone:

1. **HealthKit data forgery.** Third-party apps can write fabricated samples that *look* sensor-sourced; phone-rockers/treadmills produce real-but-fake motion. → Allowlist trusted **source bundle IDs**, require GPS route + HR for runs, cross-check cadence/speed, keep Health stakes low. HealthKit is on-device only and can never be fully server-verified.
2. **GPS spoofing + self-set geofence.** Mock-location apps + anchoring to the user's own first check-in. → Anchor geofences to **server POIs**, require a continuous plausible trajectory, reject the simulated-location flag, prefer a signed HealthKit workout route over a single coordinate.
3. **Chargeback / collection evasion.** The loser is a real, identified, motivated user; off-session charges are the most disputable kind. → Capture explicit per-charge consent (Stripe mandate evidence: terms + timestamp + IP), validate the card with a $0/$1 auth and block prepaid BINs at setup, charge near real-time, treat charge-failure as unresolved debt (block new stakes), ban serial disputers.

**Two invariants kill whole attack classes and must never be relaxed:**
- **No LLM verdict ever moves money** — the classifier proposes a capability; a signed server verdict is the only thing that passes/charges.
- **No pot pays or charges without a server-side verdict** — today `completeHabit()` is a pure client-side localStorage write (`index.html:3675`), so anyone could mark a habit "done" from the console. For money pots, the server (a `/verify-day` endpoint) must be the *only* writer of pass/fail; the client path carries zero financial weight.

## 5. Backend & infra (hard dependency)

Real-money multi-user pots are **not possible on Ante's current architecture** (hardcoded friends, client-local accounts, in-memory Stripe map, client-side completion). Required, minimum:

- **Supabase Auth** — real accounts replacing the local `anteUserId`.
- **Shared challenge store** (Postgres): `challenges` (immutable spec), `memberships`, `daily_results`, `pots`/`settlements`.
- **Server-side verification** — `/verify-day` re-evaluates the submitted payload and is the only writer of pass/fail; `/classify-challenge` for the AI gate (returns capability only).
- **Settlement** — on challenge end, the server tallies per-member results and triggers stake-return vs charity-forfeit via the Stripe backend. The hardened money endpoints now exist: `/register-stake` records the canonical stake from the app, and `/charge-on-miss` is server-to-server only (guarded by `CHARGE_SECRET`), takes **no** client-supplied amount, and clamps to `[MIN_STAKE_CENTS, MAX_STAKE_CENTS]`. Still open before production: a real per-user auth token (Supabase JWT) so endpoints can't be invoked under another user's id (the documented IDOR follow-up), and a real DB behind the in-memory stake ledger.
- **Sponsor escrow (for §8 prizes)** — a sponsor-funded prize is held/charged separately from player self-stakes and released to the winner on a server verdict; it must never be commingled with player money.

## 6. Phased build order

- **Phase 1 — Curated public pots (MVP).** Ante-authored catalog of verified challenges; anyone joins; self-staking; server-side verification on the rails that already work (**Apple Health + GPS**, plus Canvas for students). No creation gate, no moderation. Simplest build, instantly demoable ("join — 4,213 in, $10"), seeds the network. Requires the backend above.
- **Phase 2 — Private user-created pots.** Add the template + open-box creation flow and the `/classify-challenge` gate; invite-by-link/code; both end conditions (time-based + last-standing); the viral UGC loop. Reuses Phase 1's backend + verification.
- **Phase 3 — Sponsored challenges (the revenue, §8).** A sponsor attaches to a private pot, funds the prize (separate escrow), and gets a dashboard. Per-seat billing. This is the B2B / parent-kid monetization and the reason the whole feature earns money beyond engagement.
- **(Optional Phase 0 — demo slice.)** The creation + gate UX and verdict screen running locally with no real money/multi-user, purely to show the mechanic (e.g. at the Ray demo). No settlement.

## 7. Open questions (for the founder)

1. **Stake limits / pricing.** Flat presets ($1–$50) like solo bets, or per-challenge? Lower caps on lower-integrity capabilities (steps) than higher (Canvas/GPS-route)?
2. **Charity destination for public pots** — Ante picks per-challenge, or the joiner picks on entry?
3. **Elimination rule** — within time-based or last-standing: does ONE missed day eliminate you / forfeit your stake, or is there a grace allowance (e.g. "best 25 of 30 days", one mulligan)? Stricter = more drama + more forfeits to charity; looser = friendlier.
4. **Catalog cadence** — how many public challenges run at once, and how often do they rotate?
5. **Sponsored prizes** — for the B2B / parent-kid path: does the sponsor prize go only to the last-standing winner, split among all survivors, or a fixed per-survivor bonus? And is the sponsor billed a seat fee, the prize, or both?

## 8. Sponsored challenges (B2B / parent → kid) — the monetization layer

Group challenges are the wedge that makes Ante sellable up the ladder — parent → kid, coach → client, employer/school → team. A **sponsor** runs a challenge for a group and optionally funds a **prize** for the winner / survivors. This reuses the existing Sponsored Stakes model (see `SPONSORED_STAKES.md`).

- **Players still self-stake** — own money back on success, forfeit to charity on failure. The legal model is unchanged.
- **The sponsor funds any winner prize** — e.g. a parent puts up $50 for whichever kid is "last standing"; an employer funds a wellness-challenge reward. The prize is the sponsor's promotional money, **not** pooled from other players' losses, so it sidesteps the gambling/MTL trap. *(Caveat: a sponsor-funded prize for a skill contest can still trip state contest/sweepstakes rules in strict states — keep it skill-only and get the attorney's read.)*
- **Revenue = sponsor seats / fees**, recurring per sponsored member — plus optionally a cut/markup on the prize. This is the B2B money, the same place StickK actually earns (corporate wellness), not a consumer rake. The legal research flagged B2B as the real revenue; sponsored group challenges are the productized version.

Architecturally, a sponsored challenge is just a **private pot with a sponsor attached**: same verification gate, same self-staking rail, plus a sponsor who creates the group, funds the prize (held in separate escrow, §5), and gets a dashboard (members, streaks, survived-vs-out, total saved/donated). It is the natural Phase 2/3 extension once private pots exist.

## 9. Out of scope (deliberately)

Winner prizes funded from *other players'* forfeits (redistributive pots — gambling/MTL); user-created *public* challenges (moderation burden); prediction-market / betting-on-others'-outcomes (CFTC territory); photo/sleep/screen-time as money-eligible; real money before the backend + verification + legal sign-off exist. *(Sponsor-funded winner prizes ARE in scope — see §8.)*
