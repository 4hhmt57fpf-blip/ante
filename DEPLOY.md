# Deploy Ante in 5 Minutes

## The Goal
Get Ante live at a public URL so you can share with real users.

## Fastest Path: Vercel

### Step 1: Create Vercel Account (if you don't have one)
Go to vercel.com → Sign up with GitHub

### Step 2: Deploy from GitHub
1. Push this repo to GitHub:
```bash
cd /Users/beckettlee/Desktop/ante
git remote add origin https://github.com/YOUR_USERNAME/ante.git
git branch -M main
git push -u origin main
```

2. Go to vercel.com → Import Project
3. Select `ante` repository
4. Click Deploy (takes 30 seconds)
5. You get a live URL like: `https://ante-xyz.vercel.app`

### Step 3: Share Your URL
Send this to friends:
```
🎯 Try Ante: https://ante-xyz.vercel.app
Bet on your habits. Actually follow through.
```

---

## Alternative: Deploy to Netlify (Even Easier)

1. Go to netlify.com
2. Drag & drop `/Users/beckettlee/Desktop/ante` folder
3. Done. You have a live URL.

---

## Tracking Users (Local)

Once deployed, create a simple tracker:

**ante/users.json** (manual tracking):
```json
{
  "users": [
    {"name": "friend1", "joinDate": "2026-06-19", "status": "active"},
    {"name": "friend2", "joinDate": "2026-06-19", "status": "inactive"}
  ]
}
```

Or use:
- Google Forms for sign-ups
- Typeform for feedback
- Simple spreadsheet for tracking retention

---

## What to Measure

1. **Sign-ups**: Who's using it?
2. **DAU (Daily Active Users)**: Who comes back each day?
3. **Habit Creation**: How many habits per user?
4. **Streak Length**: How long until people fail?
5. **Retention**: % of users active after 7 days

**Goal**: 50 users with 70%+ 7-day retention = YC-ready traction

---

## Next Feature: Canvas Integration

Once you have 20+ users, add Canvas sync:
- Users authenticate with Canvas
- Auto-create habits from assignments
- Charity donation on missed deadlines
- This = viral growth at UMich

---

**You have everything you need. Deploy now. Share the link. Get users.**
