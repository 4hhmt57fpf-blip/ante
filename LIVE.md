# Ante is LIVE 🃏

## Current live URL

**https://aab32c32f2e40b.lhr.life**

Open this in **Safari on iPhone**, then:
1. Tap the **Share** button (square with ↑)
2. Scroll down → **Add to Home Screen** → **Add**

Ante lives on your home screen with its own gold "A" icon. Runs offline after first load.

---

## What's new in this build

- **Category-first onboarding** — pick Fitness / Wellness / Digital / School / Location / Custom before choosing a specific goal
- **App linking per category** — each category shows exactly which app verifies it; locked categories prompt you to connect the app first
- **Savings Vault instead of charity** — missed stakes go into your personal 🔒 Savings Vault, not to charity. Your money stays yours, just locked. Build the habit back, unlock the vault.

---

## Re-launch the tunnel (URL expires hourly)

```bash
cd /Users/beckettlee/Desktop/ante
ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no -R 80:localhost:3847 localhost.run
```

The new URL prints on screen. Update this file with it.

---

## Make the URL permanent (~3 min) — GitHub Pages

The repo already has a Pages deploy workflow (`.github/workflows/deploy.yml`).

1. Create a new public repo at https://github.com/new named `ante`
2. In Terminal:
   ```
   cd /Users/beckettlee/Desktop/ante
   git remote add origin https://github.com/<your-username>/ante.git
   git push -u origin main
   ```
3. Repo **Settings → Pages → Build and deployment → GitHub Actions**
4. Your permanent URL: `https://<your-username>.github.io/ante/`

(You'll need to log in to GitHub once — that's the one step that requires you.)
