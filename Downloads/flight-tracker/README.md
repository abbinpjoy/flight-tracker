# ✈ FlightTrack v3

AI-powered live flight price tracker with multi-API parallel search.

## How it works

Every refresh tick, ALL configured APIs run simultaneously:

```
SerpAPI (Google Flights) ──┐
Kiwi Tequila ──────────────┤──► Merge → Deduplicate → Score → Rank
Duffel NDC ────────────────┤
Claude Agent (web search) ─┘
```

Results are merged, deduplicated, scored by value (price + duration + stops + airline quality), and ranked dynamically. The cheapest and best-value options are auto-marked.

---

## API Keys — add to Vercel Environment Variables

| API | What it gives | Free tier | Sign up |
|-----|--------------|-----------|---------|
| `ANTHROPIC_API_KEY` | Claude agent + web search | Pay per use | console.anthropic.com |
| `SERPAPI_KEY` | Google Flights live prices | 100/month | serpapi.com |
| `KIWI_API_KEY` | Budget airlines, cheapest combos | Free tier | tequila.kiwi.com |
| `DUFFEL_ACCESS_TOKEN` | 300+ airlines, NDC fares | Free test | app.duffel.com/join |
| `RESEND_API_KEY` | Email alerts | 100/day | resend.com |

**Minimum:** just `ANTHROPIC_API_KEY` — Claude searches Google Flights, Kayak, Skyscanner via web search.
**Best results:** add `SERPAPI_KEY` + `KIWI_API_KEY` — real-time data from multiple sources.

---

## Deploy

```bash
git add .
git commit -m "update"
git push origin main --force
```

Vercel auto-deploys on push.
