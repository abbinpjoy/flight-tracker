# FlightTrack v3 — Senior QA Audit & Fix Report
**Date:** June 10, 2026 · **Scope:** full codebase (18 files, ~4,000 LOC) · **Build:** ✓ passing before and after fixes

---

## Critical bugs — FIXED in this patch

### BUG-1 · Virtual Interline shows physically impossible itineraries (CRITICAL — correctness)
`virtualinterline.js` paired the cheapest outbound (`YVR→DOH`) with the cheapest inbound (`DOH→COK`) on the same date with **no check that leg 2 departs after leg 1 arrives**. A combo arriving DOH 23:50 paired with a DOH departure at 02:00 that morning rendered as a bookable fare. Anyone booking it would buy two unusable tickets.
**Fix:** combos now require a verified hub connection of ≥ 2h (self-transfer minimum — bags must be collected and re-checked) and ≤ 24h, computed from Duffel's local timestamps (exact, since both are at the same hub airport). Combos without timestamps are dropped instead of guessed. The connection time is now also added to `durationMins` (previously total travel time excluded the hub wait entirely, mis-ranking VI combos against through-fares) and shown in the card note.

### BUG-2 · Alerts silently stop working after tracking starts (CRITICAL — core feature)
`setInterval(doFetch, …)` in `RouteTracker` captured the **first** `doFetch` closure forever. Consequences: any alert added *after* pressing Track never fired on interval ticks; alert-email edits were ignored; the log was stuck on "Tick #1". The `useCallback` dependency on `tickCount` made it worse — a new closure was created every fetch, but the interval never saw it.
**Fix:** interval now calls through `doFetchRef.current`, which is re-pointed at the freshest closure on every render; tick counting moved to a ref.

### BUG-3 · Routes lost on every page refresh (HIGH — data loss)
Alerts and email were persisted to localStorage; the routes themselves never were. Reloading the deployed Vercel app wiped all configured routes back to the single YVR→COK default.
**Fix:** routes load from `ft_routes` on mount (with shape validation) and save on every change.

### BUG-4 · Price Grid burns your entire API quota in one click (HIGH — cost/quota)
A round-trip grid fired up to ~21 unthrottled `/api/search` calls, each running **Duffel + Virtual Interline** (VI = up to 20 more Duffel calls each). One click ≈ instant Duffel rate-limit ban and ~20–25% of SerpAPI's 100/month free quota.
**Fix:** all grid calls now pass `skipDuffel: true, skipVI: true` (the grid only needs the cheapest indicative price per cell) and run through a concurrency pool of 3 instead of all-at-once.

### BUG-5 · Stale hardcoded FX rates mis-rank "cheapest" (HIGH — correctness)
`lib/fx.js` (live rates, 12h cache) existed but was **imported nowhere** — dead code. `duffel.js`, `serpapi.js`, `travelpayouts.js`, and the agent prompt each carried their own hardcoded 2024-era table (`USD:1.37, GBP:1.74…`). For a price-comparison tool, stale FX silently re-orders the ranking across sources.
**Fix:** all four call sites now use `getRatesToCAD()` / `convert()` with static fallback when offline.

### BUG-6 · SerpAPI double-converts CAD prices ×1.37 (HIGH — wrong prices)
When `search_parameters.currency` was missing from the echo, the code defaulted to `'USD'` and multiplied **already-CAD** prices by 1.37 — a CA$1,800 fare displayed as CA$2,466.
**Fix:** fallback defaults to the *requested* currency (no conversion unless SerpAPI explicitly says otherwise).

### BUG-7 · False "Direct from CA$X" claims (MEDIUM — misleading UX)
Travelpayouts v1 cached fares were hardcoded `stops: 0` (the API doesn't expose stop count), so a 2-stop cached fare wore a green "Direct" badge and drove the "Direct from CA$X" summary line.
**Fix:** v1 fares now report `stops: null`; UI renders a grey "stops n/a" badge; the orchestrator's direct detection requires a real itinerary with segments from a live source.

### BUG-8 · VI results killed mid-search by function timeout (MEDIUM)
VI's internal timeout is 35s, but `/api/search` declared `maxDuration: 30` — Vercel killed the function before VI could ever return.
**Fix:** `maxDuration: 60`.

### BUG-9 · `/api/notify` is an open email relay (MEDIUM — security)
The deployed endpoint accepted any `to` address — anyone who finds your Vercel URL could send arbitrary spam from your Resend account/domain.
**Fix:** optional `ALERT_ALLOWED_EMAILS` allowlist (documented in `.env.example`). Set it.

### BUG-10 · Synthetic "estimate" fares indistinguishable from real ones (MEDIUM — trust)
When all APIs fail, `fallback.js` generates invented prices — and the UI rendered them identically to live fares.
**Fix:** red "⚠ ESTIMATE — not a live fare" badge on every fallback card.

### Smaller fixes also included
VI warm-cache key now includes cabin/passengers (business-class searches no longer reuse economy results) · agent prompt uses live FX · README/.env corrected for the Kiwi situation (below).

## Known issues NOT fixed (documented, lower priority)
- **History chart misaligns series of different lengths** (rows built by array index, not timestamp). Cosmetic.
- **Duffel round-trips:** only the outbound slice is normalized; price is the round-trip total but segments/duration show outbound only. Semi-intentional, worth a "return leg" expander later.
- **Tracking only runs while the tab is open** — see architecture note below; this is the biggest structural gap, not a bug per se.
- **Alert fire-keys never re-arm** — an alert fires once per airline/route ever, even if the price rises and drops again days later.

---

## Platform & API recommendations (verified June 2026)

Your stack is actually well-chosen for 2026, with two corrections:

1. **Kiwi Tequila — remove from plans.** Kiwi closed the platform to the public; new partnerships are invitation-only, so the README's "sign up free" path is dead. The adapter is kept for legacy keys but marked deprecated.
2. **Do NOT migrate to Amadeus Self-Service** (the usual recommendation): Amadeus is decommissioning the entire self-service developer portal on **July 17, 2026** — API keys will be disabled. Industry guidance points to **Duffel as the most practical migration destination**, which you already have. Your Duffel + SerpAPI + Travelpayouts trio is the right post-Amadeus stack.

Worth adding:
- **Travelpayouts "prices for dates" + calendar endpoints** — you already have the token; the v3 endpoints give cheapest-by-day data that could populate the Price Grid with *zero* SerpAPI quota.
- **Seats.aero (free tier)** if you ever want award-seat availability for YVR→COK on points (Aeroplan partners fly that route via YYZ/hub carriers).
- **Architecture upgrade (the real "better platform")**: a browser-tab tracker isn't tracking when the laptop sleeps. Move the loop server-side with **Vercel Cron + Vercel KV/Upstash**: a cron hits `/api/search` every N hours, stores the cheapest fare per route in KV, and emails via Resend on drops. The UI becomes a dashboard over stored history instead of the engine. This also gives you a real multi-day price-history chart, which is the single most useful feature for deciding *when* to book.

## Travel-agent strategies for YVR→COK (and international fares generally)

- **Book the Gulf-carrier inflection point.** For Vancouver–Kerala in mid-December, the sweet spot is typically 3–5 months out; December peak (school holidays + NRI traffic to Kerala) sells out the cheap buckets on EK/QR/EY early. Your Dec 14, 2026 date: aim to lock by July–September.
- **Split-city positioning.** Price YVR→DEL/BOM/MAA + a separate IndiGo/Air India Express hop to COK. Domestic Indian legs are often CA$40–80, and metro gateways get far more fare competition than COK. Your VI engine partially does this — consider adding DEL/BOM/MAA as "pseudo-hubs" for Indian destinations.
- **Check SIN/KUL routings, not just the Gulf.** Singapore Airlines and Malaysia Airlines via SIN/KUL frequently undercut Gulf carriers to South India in shoulder periods, with shorter second legs.
- **One-way pricing asymmetry.** YVR→COK and COK→YVR priced as two one-ways (even on different alliances) sometimes beats the round-trip — your tracker only checks round-trip as a unit. Add a "split round-trip" mode that prices each direction independently and sums.
- **Currency-of-sale arbitrage.** The same QR itinerary booked on the INR or AED storefront can differ 5–15% from the CAD price. Easy to add: query SerpAPI with `gl=in&currency=INR` in parallel and convert — flag when the foreign storefront wins (book with a no-FX-fee card).
- **Tuesday–Thursday departures + ±3 day flex** — your grid already covers this; the grid is now cheap enough to run daily after BUG-4's fix.
- **Set alerts at the 25th percentile, not a round number.** After a week of history, alert at the lowest quartile observed — that's a statistically "good" price, and you'll act instead of waiting for a mythical bottom.

---

**Files changed:** `lib/duffel.js`, `lib/apis/virtualinterline.js`, `lib/apis/serpapi.js`, `lib/apis/travelpayouts.js`, `lib/agent.js`, `lib/orchestrator.js`, `pages/api/search.js`, `pages/api/notify.js`, `pages/index.js`, `README.md`, `.env.example`
**Verified:** `next build` ✓ · syntax checks ✓ · unit smoke tests (FX conversion, VI feasibility guard, ISO-8601 duration parsing) ✓
