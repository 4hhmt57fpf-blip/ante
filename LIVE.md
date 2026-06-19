# Ante is LIVE 🃏

## Use it now (on your phone)

**Open this URL on your iPhone (Safari):**

> https://4d55b48c9452eb.lhr.life

Then **Add to Home Screen**:
1. Tap the **Share** button (square with ↑) in Safari
2. Scroll down → **Add to Home Screen** → **Add**

Ante now lives on your home screen as a real app with its own gold "A" icon.

### Why this works even when the tunnel goes down
Ante is a **PWA (installable web app)** with a service worker. Once you've
opened it once, it's cached on your phone and runs **fully offline** — all your
habits, streaks, and history are stored locally on your device. You do **not**
need the laptop/tunnel running to use it after the first load.

> Note: the `*.lhr.life` link is a free public tunnel to this Mac. It stays up
> while the dev server + tunnel are running. For a **permanent** link that's
> always online, see below.

---

## Make the URL permanent (optional, ~3 min) — GitHub Pages

The repo already has a Pages deploy workflow (`.github/workflows/deploy.yml`).
To get a forever-URL like `https://<you>.github.io/ante`:

1. Create a new public repo at https://github.com/new named `ante`
2. In Terminal:
   ```
   cd /Users/beckettlee/Desktop/ante
   git remote add origin https://github.com/<your-username>/ante.git
   git push -u origin main
   ```
3. Repo **Settings → Pages → Build and deployment → GitHub Actions**
4. Your permanent app: `https://<your-username>.github.io/ante/`

(You'll need to log in to GitHub once — that's the one step I can't do for you.)

---

## What's in the app
- Stake money on daily habits; miss a day → it "donates" to your chosen charity
- Streaks, success %, wallet, 7-day chart, transaction history
- **Edit any bet** (name, emoji, stake, frequency, charity)
- **Settings**: your name/handle, daily reminder notifications, export backup, reset
- **5-week history heatmap** per habit
- Friends feed + challenge-a-friend share flow
- Installable, works offline, data stays on your device
