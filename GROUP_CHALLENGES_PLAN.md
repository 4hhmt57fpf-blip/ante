# Group Challenges — Phase 0 (front-end demo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete front end of the group-challenge feature — public catalog, join, challenge detail (growing prize + elimination), and the create-flow with the verification gate — running on client-side demo data in `index.html`, with no real money or backend.

**Architecture:** Pure additions to the existing single-file app (`/Users/beckettlee/Desktop/ante/index.html`). New `state.challenges` demo data, a `challengePrize()` pure helper, a client-side `classifyChallengeLocal()` gate stub, and new render functions following the app's existing `renderX()` + modal/screen patterns. No new dependencies. Real money/multi-user is explicitly out (separate backend plans).

**Tech Stack:** Vanilla HTML/CSS/JS in one file; Capacitor for iOS packaging; `preview_eval` (browser) for verification; `npm run sync:web` to mirror to `www/` + the iOS bundle.

## Global Constraints

- **No real money in Phase 0.** Joining never charges a card; prizes are illustrative. Surface an honest "Preview" affordance, like the existing `"Sample activity"` banner pattern.
- **Self-staking model only** (spec §1): survivors get their stake back; failures forfeit to charity; **no winner-takes-the-pot**. The winner prize is **Ante-funded** and decoupled from forfeits.
- **Prize formula (spec §2):** `prize = clamp(BASE + PER_PLAYER × verifiedCount, 0, CAP)` with `BASE=50`, `PER_PLAYER=1.5`, `CAP=250` (dollars). Invariant for later real-money phases (display the rule now): prize can never exceed real stakes collected.
- **One-miss elimination** is the default end rule; time-based is the alternative.
- **Verification gate is allowlist-driven** (spec §3): only `gps.checkin`, `health.run`, `health.steps`, `canvas.nomiss` are money-eligible; `photo.ai`, `sleep`, `screen.time`, and unmapped → honor-only (no pot). "No Shave November" must redirect, not dead-end.
- Edit ROOT `index.html` (the GitHub Pages source); finish by running `npm run sync:web` so `www/` + `ios/App/App/public/` match. Verify with `preview_eval` on the running preview server (port 3847) before each commit.
- Follow existing code idioms: `state` + `saveState()`, `showTab()`/`goTo()`/`showModal()`/`closeModal()`, `showToast()`, `renderX()` functions, `esc()` for interpolation, inline SVG (no emoji icons in chrome).

---

### Task 1: Challenge data model + prize helper

**Files:**
- Modify: `index.html` (add near the other top-level consts/`state` defaults and the `seedDemoData()` region)

**Interfaces:**
- Produces:
  - `CHALLENGE_PRIZE = { BASE: 50, PER_PLAYER: 1.5, CAP: 250 }`
  - `challengePrize(c)` → integer dollars: `clamp(round(BASE + PER_PLAYER * verifiedCount(c)), 0, CAP)`
  - `verifiedCount(c)` → number of participants with `status !== 'out'` (Phase 0: all seeded joiners count)
  - `state.challenges`: array of `{ id, title, surface:'public'|'private', capability, metric, target, freq, endType:'elim'|'time', durationDays, stake, charity, participants:[{id,name,initials,grad,status:'in'|'out',streak}], createdBy }`
  - `state.myChallengeIds`: string[] of joined challenge ids
  - `seedChallenges()` — seeds ~4 public demo challenges with realistic participants

- [ ] **Step 1: Write the failing test (preview_eval)**

With the preview server running, this should currently throw (functions undefined):
```js
// preview_eval expression
(() => {
  const c = { participants: Array.from({length:100},(_,i)=>({status:'in'})) };
  return [typeof challengePrize, challengePrize(c), challengePrize({participants:[{status:'in'}]}),
          challengePrize({participants:Array.from({length:1000},()=>({status:'in'}))})];
})()
```
Expected after implementation: `["function", 200, 52, 250]` (100→$200, 1→$52, 1000→capped $250).

- [ ] **Step 2: Run it and confirm it fails** (`challengePrize is not defined`).

- [ ] **Step 3: Implement the model + helpers**

```js
// ── GROUP CHALLENGES (Phase 0: front-end demo, no real money) ──
const CHALLENGE_PRIZE = { BASE: 50, PER_PLAYER: 1.5, CAP: 250 };
function verifiedCount(c){ return (c.participants || []).filter(p => p.status !== 'out').length; }
function challengePrize(c){
  const raw = CHALLENGE_PRIZE.BASE + CHALLENGE_PRIZE.PER_PLAYER * verifiedCount(c);
  return Math.max(0, Math.min(CHALLENGE_PRIZE.CAP, Math.round(raw)));
}
function seedChallenges(){
  const grads = ['#5b5bf6,#3b3b8c','#e85d75,#8c1c2e','#f59e0b,#92400e','#10b981,#065f46','#8b5cf6,#4c1d95'];
  const ppl = (n) => Array.from({length:n}, (_,i) => ({
    id:'p'+i, name:'Player '+(i+1), initials:'P'+((i%9)+1),
    grad:grads[i%grads.length], status: i%11===0 ? 'out' : 'in', streak: 1+(i%14)
  }));
  state.challenges = [
    { id:'ch_steps', title:'10k steps a day', surface:'public', capability:'health.steps',
      metric:'Steps', target:10000, freq:'Every Day', endType:'elim', durationDays:30, stake:10,
      charity:'American Red Cross', participants: ppl(87), createdBy:'Ante' },
    { id:'ch_run', title:'Run 2 miles daily', surface:'public', capability:'health.run',
      metric:'Run distance', target:2, freq:'Every Day', endType:'elim', durationDays:21, stake:25,
      charity:'World Wildlife Fund', participants: ppl(42), createdBy:'Ante' },
    { id:'ch_gym', title:'Hit the gym 5×/week', surface:'public', capability:'gps.checkin',
      metric:'Check-ins', target:5, freq:'3x week', endType:'time', durationDays:28, stake:15,
      charity:'Feeding America', participants: ppl(31), createdBy:'Ante' },
    { id:'ch_canvas', title:'No missing assignments', surface:'public', capability:'canvas.nomiss',
      metric:'Assignments', target:0, freq:'Every Day', endType:'time', durationDays:30, stake:10,
      charity:'Khan Academy', participants: ppl(19), createdBy:'Ante' },
  ];
  state.myChallengeIds = state.myChallengeIds || [];
}
```
Also add to the `state` defaults (near `walletBalance: 50,`): `challenges: [], myChallengeIds: [],` and call `seedChallenges()` inside `seedDemoData()` (after habits are seeded) so the demo has live challenges.

- [ ] **Step 4: Re-run the Step 1 expression — confirm `["function",200,52,250]`.**

- [ ] **Step 5: Commit**
```bash
git add index.html
git commit -m "feat(challenges): data model + Ante-funded prize helper (Phase 0)"
```

---

### Task 2: Challenges catalog screen

**Files:**
- Modify: `index.html` — add a `screen-challenges` (follow the `screen-feed`/`screen-stats` markup pattern) and a `renderChallenges()` function; add a nav entry point (see Task 7).

**Interfaces:**
- Consumes: `state.challenges`, `challengePrize()`, `verifiedCount()`, `state.myChallengeIds`
- Produces: `renderChallenges()` (fills `#challenges-list`); `openChallenge(id)` (Task 3)

- [ ] **Step 1: Failing test (preview_eval)**
```js
(() => { seedChallenges(); renderChallenges();
  const el = document.getElementById('challenges-list');
  return { cards: el ? el.querySelectorAll('.chal-card').length : 'NO-EL',
           hasPrize: !!el && /\$\d/.test(el.textContent),
           hasJoined: !!el && /\d+ joined/i.test(el.textContent) };
})()
```
Expected after impl: `{ cards: 4, hasPrize: true, hasJoined: true }`.

- [ ] **Step 2: Run it — fails** (`#challenges-list` null / `renderChallenges` undefined).

- [ ] **Step 3: Implement markup + render**

Add the screen (mirror existing `.screen` + header patterns), containing a `<div id="challenges-list">`, and:
```js
function renderChallenges(){
  const el = document.getElementById('challenges-list'); if (!el) return;
  const joined = new Set(state.myChallengeIds || []);
  el.innerHTML = (state.challenges || []).filter(c => c.surface === 'public').map(c => {
    const n = verifiedCount(c), prize = challengePrize(c), mine = joined.has(c.id);
    const end = c.endType === 'elim' ? 'Last one standing' : c.durationDays + '-day';
    return `<div class="chal-card" onclick="openChallenge('${c.id}')">
      <div class="chal-top"><div class="chal-title">${esc(c.title)}</div>
        <span class="chal-prize">🏆 $${prize}</span></div>
      <div class="chal-meta">${esc(end)} · $${c.stake} stake · ${n} joined${mine?' · <b>you\\'re in</b>':''}</div>
      <div class="chal-sub">Miss a day → $${c.stake} to ${esc(c.charity)} · winner keeps stake + prize</div>
    </div>`;
  }).join('') + `<div class="chal-preview-note">Preview — challenges run for real once accounts &amp; payments are live.</div>`;
}
```
Add minimal CSS for `.chal-card/.chal-top/.chal-title/.chal-prize/.chal-meta/.chal-sub/.chal-preview-note` consistent with the app's surface/border/radius tokens.

- [ ] **Step 4: Re-run Step 1 — confirm `{cards:4, hasPrize:true, hasJoined:true}`.**
- [ ] **Step 5: Commit** `feat(challenges): public catalog screen`

---

### Task 3: Challenge detail (prize, participants, elimination status)

**Files:** Modify `index.html` — `openChallenge(id)` + a `challenge-detail` modal (reuse the `showModal`/`closeModal` modal pattern).

**Interfaces:**
- Consumes: `state.challenges`, `challengePrize()`, `state.myChallengeIds`
- Produces: `openChallenge(id)`; renders a "Join"/"You're in" CTA wired to `joinChallenge(id)` (Task 4)

- [ ] **Step 1: Failing test**
```js
(() => { seedChallenges(); openChallenge('ch_steps');
  const m = document.getElementById('challenge-detail-content');
  return { open: !!m && m.textContent.includes('10k steps'),
           showsPrize: !!m && /\$\d/.test(m.textContent),
           listsPlayers: !!m && m.querySelectorAll('.chal-player').length > 0,
           hasJoin: !!m && /Join/i.test(m.textContent) };
})()
```
Expected: all `true` / `>0`.

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `openChallenge(id)`: look up the challenge, render title, the live prize with the "grows as people join" line, end condition, charity, the participant list (in/out with streak; show elimination via a struck/greyed `.chal-player.out`), and a primary CTA — `Join for $X` if not joined, else `You're in ✓`. Show the prize-rule line: *"Winner keeps their stake + an Ante-funded prize. Prize can never exceed total stakes collected."*
- [ ] **Step 4: Re-run Step 1 — all true.**
- [ ] **Step 5: Commit** `feat(challenges): challenge detail with prize + participants`

---

### Task 4: Join flow (demo — no charge)

**Files:** Modify `index.html` — `joinChallenge(id)`.

**Interfaces:**
- Consumes: `state.challenges`, `state.myChallengeIds`, `state.profile`
- Produces: `joinChallenge(id)` — adds the user to the challenge's participants + `myChallengeIds`, persists, re-renders, toasts. No card charge.

- [ ] **Step 1: Failing test**
```js
(() => { seedChallenges(); state.myChallengeIds=[]; const before = verifiedCount(state.challenges[0]);
  joinChallenge('ch_steps');
  const c = state.challenges.find(x=>x.id==='ch_steps');
  return { joinedFlag: state.myChallengeIds.includes('ch_steps'),
           added: verifiedCount(c) === before+1,
           hasMe: c.participants.some(p=>p.me) };
})()
```
Expected: all `true`.

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement**
```js
function joinChallenge(id){
  const c = (state.challenges||[]).find(x=>x.id===id); if(!c) return;
  if((state.myChallengeIds||[]).includes(id)){ showToast("You're already in this one",'' ); return; }
  const nm = (state.profile && state.profile.name) || 'You';
  c.participants.push({ id:'me', name:nm, initials:initialsFor(nm), grad:'#7fdca4,#34a36b', status:'in', streak:0, me:true });
  state.myChallengeIds = [...(state.myChallengeIds||[]), id];
  saveState();
  if(typeof renderChallenges==='function') renderChallenges();
  openChallenge(id);
  showToast(`You're in — good luck. $${c.stake} on the line.`, 'green');
}
```
(Note inline: a real join will stake via Stripe + a server membership record — Phase backend.)
- [ ] **Step 4: Re-run Step 1 — all true.**
- [ ] **Step 5: Commit** `feat(challenges): demo join flow`

---

### Task 5: Create-your-own flow + verification gate (the headline)

**Files:** Modify `index.html` — `classifyChallengeLocal(text)`, the create screen/modal (template grid + free-text box), and `submitChallengeDraft()`.

**Interfaces:**
- Produces:
  - `CAPABILITY_ALLOW = { 'gps.checkin':true, 'health.run':true, 'health.steps':true, 'canvas.nomiss':true, 'photo.ai':false, 'sleep':false, 'screen.time':false }`
  - `classifyChallengeLocal(text)` → `{ capability, eligible, redirect }` (keyword→capability stub; `eligible = CAPABILITY_ALLOW[capability] === true`)
  - The verdict UX: ACCEPT (stake fields appear) / REDIRECT ("can't hold money — run free or pick verifiable")

- [ ] **Step 1: Failing test (the gate behavior is the requirement)**
```js
(() => {
  const a = classifyChallengeLocal('run 3 miles every morning');
  const b = classifyChallengeLocal('No Shave November, photo each day');
  const c = classifyChallengeLocal('10k steps daily');
  return { run: [a.capability, a.eligible], noshave: [b.capability, b.eligible, !!b.redirect], steps: [c.capability, c.eligible] };
})()
```
Expected: `{ run:["health.run",true], noshave:["photo.ai",false,true], steps:["health.steps",true] }`.

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement the classifier + create UI**
```js
const CAPABILITY_ALLOW = { 'gps.checkin':true,'health.run':true,'health.steps':true,'canvas.nomiss':true,
                           'photo.ai':false,'sleep':false,'screen.time':false };
// Phase-0 client stub. Real classification is the server /classify-challenge (Claude) in the backend phase.
function classifyChallengeLocal(text){
  const t = (text||'').toLowerCase();
  let capability = 'photo.ai'; // default: unmapped → photo/honor → not eligible
  if (/\b(run|jog|ran|miles|5k|10k run|marathon)\b/.test(t)) capability='health.run';
  else if (/\bstep|walk|steps\b/.test(t)) capability='health.steps';
  else if (/\b(gym|pool|library|check ?in|show up|go to)\b/.test(t)) capability='gps.checkin';
  else if (/\b(assignment|canvas|homework|submit)\b/.test(t)) capability='canvas.nomiss';
  else if (/\b(sleep|bed)\b/.test(t)) capability='sleep';
  else if (/\b(screen|social|tiktok|instagram|phone)\b/.test(t)) capability='screen.time';
  const eligible = CAPABILITY_ALLOW[capability] === true;
  const redirect = eligible ? null
    : "We can't verify that without a sensor, so it can't hold money. Run it as a free streak, or pick a verifiable goal like a daily run or 10k steps.";
  return { capability, eligible, redirect };
}
```
Create UI: a **template grid** (the 4 eligible capabilities as one-tap presets) + a **"describe your own" input**. On submit of free text, call `classifyChallengeLocal()` and show the verdict: if `eligible`, reveal stake/duration/end-type/charity fields and a Create button (adds a `surface:'private'` challenge to `state.challenges` + auto-joins); if not, show the `redirect` copy with **"Run it free (no pot)"** and **"Pick a verifiable goal"** buttons.

- [ ] **Step 4: Re-run Step 1 — matches expected.** Then manually drive the UI in preview: type "No Shave November" → confirm the redirect screen (not a dead-end); type "run 2 miles" → confirm stake fields appear.
- [ ] **Step 5: Commit** `feat(challenges): create flow + verification gate (No Shave November redirect)`

---

### Task 6: Rework the legacy "winners split the pot" group-pot copy

**Files:** Modify `index.html` — the Group Pots hero (`~1957`), the group-pot mode note (`~2256`), and `createGroupPot()` (`~5134`) so nothing claims winner-takes-pot.

**Interfaces:** No new API; aligns existing copy with the self-staking + Ante-prize model.

- [ ] **Step 1: Failing test**
```js
(() => {
  const html = document.documentElement.innerHTML;
  return { stillHasSplitPot: /winners split the pot|splits the forfeited pot/i.test(html) };
})()
```
Expected after fix: `{ stillHasSplitPot: false }`.

- [ ] **Step 2: Run — currently `true` (the bad copy is live).**
- [ ] **Step 3: Replace the copy** — e.g. hero sub → *"Stake together on the same goal. Survivors keep their stake; misses go to charity; the last one standing wins an Ante-funded prize."* Repoint the "Group Pots" CTA at the new challenges create flow (Task 5) and update `createGroupPot()` accordingly (or have it open the challenge catalog).
- [ ] **Step 4: Re-run Step 1 — `{stillHasSplitPot:false}`.**
- [ ] **Step 5: Commit** `refactor(challenges): retire winner-take-pot copy → self-staking + Ante prize`

---

### Task 7: Entry point, preview labeling, and sync

**Files:** Modify `index.html` (nav/entry to `screen-challenges`), then run the sync script.

- [ ] **Step 1:** Add the entry point — simplest: a "Challenges" sub-tab/segment in the Friends screen, or a card on Home that calls `goTo('screen-challenges'); renderChallenges();`. Ensure `showTab`/`goTo` reach it and back-nav works.
- [ ] **Step 2: End-to-end preview check**
```js
// after navigating in, assert the surface renders and a join updates the prize
(() => { seedChallenges(); renderChallenges(); const c0 = challengePrize(state.challenges[0]);
  state.myChallengeIds=[]; joinChallenge(state.challenges[0].id);
  return { prizeWentUp: challengePrize(state.challenges[0]) >= c0, joined: state.myChallengeIds.length===1 }; })()
```
Expected: `{ prizeWentUp:true, joined:true }`. Also take a `preview_screenshot` of the catalog + detail for the record.
- [ ] **Step 3: Confirm no console errors** (`preview_console_logs` level error → none).
- [ ] **Step 4: Sync**
```bash
npm run sync:web   # mirrors index.html → www/ → ios/App/App/public/
```
- [ ] **Step 5: Commit** `feat(challenges): entry point + sync Phase 0 demo to www/ios`

---

## Self-Review (done while writing)

- **Spec coverage:** two surfaces (public catalog Task 2; private create Task 5) ✓; verification gate + No Shave redirect (Task 5) ✓; self-staking + Ante prize formula (Tasks 1,3) ✓; elimination + end conditions (Tasks 1,3) ✓; retire winner-take-pot (Task 6) ✓. **Deferred to backend plans (not Phase 0):** real auth, shared store, server-side `/verify-day` + `/classify-challenge`, settlement/escrow, real Stripe — see below.
- **Placeholder scan:** none — every task has concrete code + a runnable `preview_eval` check.
- **Type consistency:** `challengePrize`/`verifiedCount`/`state.challenges`/`state.myChallengeIds`/`classifyChallengeLocal` used identically across tasks.

## Follow-on plans (write these when the infra exists — NOT Phase 0)

Each needs you to provision something first; each is its own spec→plan→build cycle:
1. **Real accounts** — Supabase Auth replacing local `anteUserId`. (Needs: a Supabase project.)
2. **Shared challenge store** — Postgres tables (`challenges`, `memberships`, `daily_results`, `pots`). (Needs: Supabase.)
3. **Server-side verification** — `/verify-day` (the only writer of pass/fail) + `/classify-challenge` (Claude). (Needs: deployed backend.)
4. **Settlement + prize** — tally results, stake-return vs charity-forfeit via the hardened `/charge-on-miss` + `/register-stake`, sponsor escrow, and the **prize ≤ stakes-collected** invariant enforced server-side. (Needs: deployed backend + live Stripe + legal sign-off.)
