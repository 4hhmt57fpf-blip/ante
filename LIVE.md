# Ante is LIVE 🃏

## Permanent URL (GitHub Pages)

**https://4hhmt57fpf-blip.github.io/ante/**

This URL never expires. It's served from the `main` branch of your GitHub repo
(https://github.com/4hhmt57fpf-blip/ante) via GitHub Pages. Every time you push
to `main`, the site auto-redeploys in ~30–60 seconds.

Open this in **Safari on iPhone**, then:
1. Tap the **Share** button (square with ↑)
2. Scroll down → **Add to Home Screen** → **Add**

Ante lives on your home screen with its own gold "A" icon. Runs offline after first load.

---

## How deployment works now

- **Source:** GitHub Pages → "Deploy from a branch" → `main` / `(root)`
- **No build step:** the app is a single-file PWA served as static files. A
  `.nojekyll` file at the repo root tells GitHub to serve files as-is (no Jekyll).
- **To update the live app:** edit `index.html` (and friends), commit, and push
  to `main` via GitHub Desktop. Pages redeploys automatically.

### Note: the old `.github/workflows/deploy.yml`
That leftover workflow (peaceiris/actions-gh-pages) is no longer used and will
show a failed run on each push — it's harmless. To stop the red X, delete
`.github/workflows/deploy.yml` and push.

---

## What's in this build

- **Category-first onboarding** — pick Fitness / Wellness / Digital / School / Location / Custom before choosing a specific goal
- **App linking per category** — each category shows exactly which app verifies it; locked categories prompt you to connect the app first
- **Savings Vault instead of charity** — missed stakes go into your personal 🔒 Savings Vault, not to charity. Your money stays yours, just locked. Build the habit back, unlock the vault.

---

## Local dev server (Canvas proxy + ICS)

The Python server is only needed for the live Canvas integration (the browser
extension posts to it). The deployed Pages site runs the app standalone.

```bash
cd /Users/beckettlee/Desktop/ante
python3 server.py   # http://localhost:3847
```
