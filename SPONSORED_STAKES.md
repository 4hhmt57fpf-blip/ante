# Sponsored Stakes — spec + custodial integration

A sponsor (parent / coach / employer) funds a stake on a member's habit. Member
completes it → money releases to them now. Member misses → money goes to their
locked **future account**. The sponsor never loses; the money goes to the member
either way (spend-now vs save-for-later).

## Data model
- `Sponsor` — `{id, role:'parent'|'coach'|'employer', stripeCustomerId, defaultPaymentMethod}`
- `Member` — `{id, name, inviteCode, accepted, sponsorIds[], spendableBalance, futureBalance, futureAccountRef}`
- `Sponsorship` — `{sponsorId, memberId}` (created when the member accepts the invite code)
- `SponsoredStake` — `{id, sponsorId, memberId, habitName, source, amount, freq, missTo:'future'|'charity'|'refund', status}`
- `Ledger` — one row per release/lock `{stakeId, memberId, date, amount, to:'spendable'|'future', txRef}`

## Money flow
1. Sponsor funds via Stripe (the backend already built) — off-session charge per miss, or a held balance.
2. Verified completion → release `amount` to `member.spendableBalance` (cashable to the member's connected account).
3. Verified miss → move `amount` to `member.futureBalance` (phase 1: in-app locked number; phase 2: real custodial account).

## The compliance line (read this before building phase 2)
Routing money into a minor's investment account makes *you* look like a broker /
custodian / money transmitter. **Don't be.** Orchestrate; let a partner custody.

- Ante = the app/tech layer ("introducing" app). The PARTNER is the broker-dealer
  and account custodian, holds the funds, runs KYC/AML, and is the system of record
  for holdings. This keeps Ante out of broker-dealer / MTL territory for the
  investing piece. Confirm structure with counsel + the partner's compliance team.
- A Roth IRA needs *earned income* — usually not available for a kid's allowance.
  Use a **custodial brokerage (UTMA/UGMA)** or a **529** instead, framed as
  "a custodial account for their future self."
- Until a partner is integrated, `futureBalance` is a **locked in-app savings
  number** — label it "locked savings," never "invested," so you make no
  investment claim you can't back.

## Custodial / investing-as-a-service partners (UTMA/UGMA, 529)
| Partner | Fit | Notes |
|---|---|---|
| **DriveWealth** | Best general fit | Brokerage-as-a-service API, fractional shares, custodial (UGMA/UTMA) accounts. Powers many consumer-fintech "invest the spare change / allowance" features. |
| **Atomic Invest** (atomic.financial) | Embedded investing | Managed portfolios + custodial accounts via API; explicitly "investing-as-a-service." |
| **Apex Fintech (Apex Clearing)** | Clearing + custody | Backs many robo-advisors; custodial accounts supported; heavier integration. |
| **Alpaca** | Brokerage API | Trader-focused; custodial/minor support is thinner — evaluate. |
| **529 path** | Education savings | 529s are state-sponsored and harder to embed. Back-end administrator is usually **Ascensus**; consumer-layer partners exist (e.g. Backer). Lower API-friendliness than UTMA. |

Recommendation: start with **DriveWealth or Atomic** for a UTMA "future account"
(API-friendly, custodial supported); add 529 later if education is the wedge.

## Partner API flow (UTMA via DriveWealth/Atomic, generic)
1. **Account open** — when a sponsor first sets a member's future account, collect
   guardian + minor info; call the partner's `createCustodialAccount` (guardian =
   custodian, minor = beneficiary). Partner runs KYC/AML and returns
   `futureAccountRef`.
2. **Fund on miss** — verified miss → your backend charges the sponsor (Stripe,
   off-session) → call the partner's funding/transfer API to deposit `amount` into
   `futureAccountRef`. Ideally the partner moves the money end-to-end so Ante never
   holds a pooled balance owed out.
3. **Invest** — optional: partner buys a default fractional portfolio (broad ETF).
4. **Display** — read `getAccount(futureAccountRef)` → show "future savings $X (+growth)".
5. **Unlock** — governed by custodial rules (custodian controls until the minor
   reaches the state's age of majority under UTMA). Ante surfaces it; the partner
   holds the legal custody.

## Pricing
Self-stakes free (consumer top-of-funnel). Revenue = **sponsor seats**: recurring
fee per member someone sponsors. Same primitive sells up the ladder: parent → kid,
coach → client, employer/school → member. Billed via the Stripe backend already built.

## MVP build order
1. Sponsor mode: add a member, generate an invite code, member accepts.
2. Set a sponsored stake on the member's habit (reuses the existing goal catalog).
3. Completion releases / miss locks into the member's in-app future-savings balance.
4. Sponsor dashboard: members, streaks, released-vs-saved, total saved.
5. Per-member seat billing.
6. Phase 2: swap the in-app future balance for a DriveWealth/Atomic custodial account.
