/**
 * Claude AI Agent — Dynamic Flight Search
 *
 * Searches ALL airlines on any route dynamically via web search.
 * No predefined airline list — finds whatever actually flies the route.
 */

export async function agentSearch({
  origin, destination, date, returnDate,
  cabin, passengers, minLayoverMins = 60, maxLayoverMins = null, apiKey,
}) {
  const cabinLabel = {
    economy: 'Economy', premium_economy: 'Premium Economy',
    business: 'Business Class', first: 'First Class',
  }[cabin] || 'Economy'

  const tripType = returnDate
    ? `Round trip — outbound ${date}, return ${returnDate}`
    : `One-way on ${date}`

  const systemPrompt = `You are a flight search agent with real-time web access.

TASK: Find every available flight for the given route by searching live booking sites.

MANDATORY — search ALL of these in sequence:
1. Google Flights: search "${origin} to ${destination} flights ${date}"
2. Kayak: search "kayak flights ${origin} ${destination} ${date}"
3. Skyscanner: search "skyscanner ${origin} ${destination} ${date}"
4. Search "[airline name] flights ${origin} to ${destination}" for any airline you discover

FIND ALL AIRLINES — include every carrier you see: major airlines, budget carriers, low-cost airlines, regional carriers, code-share flights. Do NOT limit to well-known names.

LAYOVER RULE: For connecting flights, calculate the time between arrival of one segment and departure of the next. Only include itineraries where EVERY layover is AT LEAST ${minLayoverMins} minutes. Exclude any flight with a shorter layover.${maxLayoverMins ? ` Also exclude any layover over ${maxLayoverMins} minutes.` : ''}

PRICES: Convert everything to CAD. Rates: 1 USD=1.37 CAD, 1 GBP=1.74, 1 EUR=1.48, 1 AED=0.37, 1 INR=0.016, 1 SGD=1.01, 1 AUD=0.89, 1 QAR=0.38.

OUTPUT: Return ONLY a raw JSON object. No markdown. No backticks. No explanation. Just the JSON.

JSON FORMAT:
{
  "flights": [
    {
      "airline": "Qatar Airways",
      "code": "QR",
      "flightNumber": "QR42 + QR516",
      "departure": "14:45",
      "arrival": "19:05+1",
      "duration": "27h 35m",
      "durationMins": 1655,
      "stops": 1,
      "via": "DOH",
      "segments": [
        { "from": "YVR", "to": "DOH", "dep": "14:45", "arr": "10:20+1", "airline": "Qatar Airways", "flight": "QR42", "durationMins": 870, "layoverMins": 0 },
        { "from": "DOH", "to": "COK", "dep": "12:15+1", "arr": "19:05+1", "airline": "Qatar Airways", "flight": "QR516", "durationMins": 230, "layoverMins": 115 }
      ],
      "minLayoverMins": 115,
      "price": 1920,
      "currency": "CAD",
      "seatsLeft": 4,
      "refundable": true,
      "changeable": true,
      "rating": 4.7,
      "bookUrl": "https://www.qatarairways.com",
      "priceCategory": ""
    }
  ],
  "searchedSources": ["Google Flights", "Kayak", "Skyscanner"],
  "totalAirlinesFound": 7,
  "directAvailable": false,
  "cheapestDirect": null,
  "summary": "Found N airlines on ${origin}-${destination}. Cheapest: [airline] CA$[price] via [hub] ([duration], [layover]min layover). Best value: [airline].",
  "priceLevel": "peak",
  "recommendation": "Book now"
}`

  const userPrompt = `Search NOW for all flights:
FROM: ${origin}
TO: ${destination}
TRIP: ${tripType}
CABIN: ${cabinLabel}
PASSENGERS: ${passengers}
MIN LAYOVER: ${minLayoverMins} minutes at every stop${maxLayoverMins ? `\nMAX LAYOVER: ${maxLayoverMins} minutes` : ''}

Search Google Flights, Kayak, Skyscanner. Find every airline on this route. Return JSON only.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system:     systemPrompt,
      tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)

  const data     = await res.json()
  const searches = data.content.filter(b => b.type === 'tool_use').length
  const text     = data.content.filter(b => b.type === 'text').map(b => b.text).join('')

  console.log(`[agent] ${searches} web searches, ${text.length} chars response`)

  // ── Parse JSON ────────────────────────────────────────────────────────
  let parsed = null
  // Try 1: direct parse
  try { parsed = JSON.parse(text.trim()) } catch {}
  // Try 2: extract JSON block
  if (!parsed) {
    const m = text.match(/\{[\s\S]*?"flights"\s*:\s*\[[\s\S]*\][\s\S]*?\}/)
    if (m) try { parsed = JSON.parse(m[0]) } catch {}
  }
  // Try 3: extract just the array
  if (!parsed) {
    const m = text.match(/\[\s*\{\s*"airline"[\s\S]*?\}\s*\]/)
    if (m) try { parsed = { flights: JSON.parse(m[0]) } } catch {}
  }

  if (!parsed?.flights?.length) {
    console.log('[agent] Parse failed. Sample:', text.slice(0, 400))
    return { flights: [], searches, source: 'agent_no_parse' }
  }

  // ── Enforce layover rules ─────────────────────────────────────────────
  parsed.flights = parsed.flights.filter(f => {
    if (!f.stops) return true
    // Use minLayoverMins field if present
    if (typeof f.minLayoverMins === 'number') {
      if (f.minLayoverMins < minLayoverMins) return false
      if (maxLayoverMins && f.maxLayoverMins > maxLayoverMins) return false
      return true
    }
    // Fall back to checking segments
    if (Array.isArray(f.segments)) {
      for (const seg of f.segments) {
        if (seg.layoverMins > 0) {
          if (seg.layoverMins < minLayoverMins) return false
          if (maxLayoverMins && seg.layoverMins > maxLayoverMins) return false
        }
      }
    }
    return true
  })

  parsed.flights.sort((a, b) => a.price - b.price)
  markCategories(parsed.flights)

  return { ...parsed, searches, source: 'claude_websearch', fetchedAt: new Date().toISOString() }
}

export function markCategories(flights) {
  if (!flights?.length) return
  flights.forEach(f => { if (!f.priceCategory) f.priceCategory = '' })

  if (!flights.find(f => f.priceCategory === 'cheapest')) {
    flights[0].priceCategory = 'cheapest'
  }

  if (flights.length > 1 && !flights.find(f => f.priceCategory === 'best_value')) {
    const minP = flights[0].price
    const maxP = flights[flights.length - 1].price
    const range = maxP - minP || 1
    const minD = Math.min(...flights.map(f => f.durationMins || 1600))
    const maxD = Math.max(...flights.map(f => f.durationMins || 1600))
    const dRange = maxD - minD || 1

    const scored = flights.map((f, idx) => ({
      idx,
      score: ((f.price - minP) / range) * 0.40
           + ((f.stops || 0) * 0.15)
           + (((f.durationMins || 1600) - minD) / dRange) * 0.25
           + ((1 - (f.rating || 4) / 5) * 0.20),
    })).sort((a, b) => a.score - b.score)

    const bv = flights[scored[0].idx]
    if (bv && bv.priceCategory !== 'cheapest') bv.priceCategory = 'best_value'
  }
}
