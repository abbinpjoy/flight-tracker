# ✈ FlightTrack v3

AI-powered live flight price tracker with multi-API parallel search.

## How it works

Every refresh tick, ALL configured APIs run simultaneously:

```
Google Flights (Apify) ────┐
Travelpayouts/Aviasales ───┤──► Merge → Deduplicate → Score → Rank
Duffel NDC ────────────────┤
Claude Agent (web search) ─┘
```

Results are merged, deduplicated, scored by value (price + duration + stops + airline quality), and ranked dynamically. The cheapest and best-value options are auto-marked.

---

## API Keys — add to Vercel Environment Variables

| API | What it gives | Free tier | Sign up |
|-----|--------------|-----------|---------|
| `ANTHROPIC_API_KEY` | Claude agent + web search | Pay per use | console.anthropic.com |
| `APIFY_TOKEN` | Google Flights via Apify actor | $5 credit/month (recurring) | console.apify.com |
| `KIWI_API_KEY` | Budget airlines (legacy keys only — Tequila is invitation-only since 2024) | — | n/a |
| `DUFFEL_ACCESS_TOKEN` | 300+ airlines, NDC fares | Free test | app.duffel.com/join |
| `RESEND_API_KEY` | Email alerts | 100/day | resend.com |

**Minimum:** just `ANTHROPIC_API_KEY` — Claude searches Google Flights, Kayak, Skyscanner via web search.
**Best results:** add `APIFY_TOKEN` + `DUFFEL_ACCESS_TOKEN` + `TRAVELPAYOUTS_TOKEN` — real-time data from multiple sources.

---

## Deploy

```bash
git add .
git commit -m "update"
git push origin main --force
```

Vercel auto-deploys on push.
