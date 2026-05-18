# ✈ FlightTrack v3

AI-powered live flight price tracker with:
- **Duffel API** — 300+ airlines, real NDC fares (best Amadeus alternative)
- **Claude AI agent** — web search across Google Flights, Kayak, Skyscanner, Expedia
- **Dynamic airline search** — finds ALL airlines on the route, not a fixed list
- **Smart layover rules** — configurable min/max layover per search
- **Browser push notifications** — instant pop-up when price threshold hit
- **Email alerts** — email when price drops below your target (via Resend)

---

## Quick deploy (5 min)

### 1. Get your Anthropic API key (required)
1. Go to https://console.anthropic.com
2. API Keys → Create Key → copy it (`sk-ant-...`)

### 2. Get Duffel API token (optional but recommended)
1. Go to https://app.duffel.com/join — free account, no credit card
2. Dashboard → API Tokens → Create token
3. Copy the test token (`duffel_test_...`)
4. For live fares, request production access after testing

### 3. Get Resend API key (optional, for email alerts)
1. Go to https://resend.com — free, 100 emails/day
2. API Keys → Create API Key → copy it (`re_...`)

### 4. Push to GitHub
```bash
git init && git add . && git commit -m "FlightTrack v3"
git branch -M main
git remote add origin https://TOKEN@github.com/USERNAME/flight-tracker.git
git push -u origin main
```

### 5. Deploy on Vercel
1. vercel.com → New Project → import your repo → Deploy
2. Settings → Environment Variables → add:

| Name | Value | Required |
|------|-------|----------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | ✅ Yes |
| `DUFFEL_ACCESS_TOKEN` | `duffel_test_...` | Optional |
| `RESEND_API_KEY` | `re_...` | Optional |
| `ALERT_FROM_EMAIL` | `alerts@yourdomain.com` | Optional |

3. Deployments → Redeploy → ✅ live!

---

## How the search works

Every refresh tick:

```
1. Duffel API (if DUFFEL_ACCESS_TOKEN set)
   └── Real-time fares from 300+ airlines
   └── Layover filtering applied server-side
   └── Returns bookable offers with seat counts

2. Claude Agent (if ANTHROPIC_API_KEY set)
   └── Searches Google Flights, Kayak, Skyscanner, Expedia, Momondo
   └── Finds ALL airlines on the route (not a fixed list)
   └── Enforces min/max layover rules on results
   └── Returns structured JSON with segment detail

3. Calibrated Estimates (always available as fallback)
   └── Regional carrier database with seasonal pricing
   └── Layover constraints enforced
   └── ±6% random noise to simulate market movement
```

---

## Layover rules

- **Minimum layover**: Excludes any itinerary where any single connection is shorter than this (default: 60 min)
- **Maximum layover**: Excludes itineraries with any connection longer than this (optional)
- Both rules are enforced at the API level AND post-processed on agent results

---

## Notification types

| Type | How | Setup |
|------|-----|-------|
| In-app log | Always | None |
| Browser push | Click "Enable" in Notifications tab | Browser permission |
| Email | Automatic when threshold hit | RESEND_API_KEY in Vercel |
