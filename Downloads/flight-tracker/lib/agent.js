/**
 * Claude AI Agent — dynamic flight search
 *
 * Unlike the old fixed-7-airline approach, this agent:
 * 1. Uses web_search to query live booking sites
 * 2. Finds ALL available airlines on the route (not a preset list)
 * 3. Enforces minimum 1hr layover filter
 * 4. Searches for the objectively cheapest + best value options
 * 5. Returns structured JSON with full flight detail
 */

const SYSTEM = `You are an expert flight search agent with real-time web access.

CRITICAL RULES:
1. Use web_search to find REAL current prices — search at least 4 of: Google Flights, Kayak, Skyscanner, Expedia, Momondo, airline direct sites
2. Find ALL airlines operating the route — do NOT limit to a preset list. Include budget carriers, regional airlines, code-share flights
3. LAYOVER RULE: For connecting flights, ONLY include itineraries where EVERY layover is AT LEAST the minimum specified by the user (default 1 hour). Exclude any option with a layover shorter than the minimum, even if it's cheaper
4. Return prices in CAD. Convert if needed: 1 USD = 1.37 CAD, 1 GBP = 1.74 CAD, 1 EUR = 1.48 CAD, 1 AED = 0.37 CAD, 1 INR = 0.016 CAD
5. Calculate layover durations accurately from segment times
6. Return ONLY raw JSON — no markdown, no backticks, no explanation

OUTPUT FORMAT — return exactly this JSON structure:
{
  "flights": [
    {
      "airline": "Full Airline Name",
      "code": "2-letter IATA code",
      "flightNumber": "e.g. AI116",
      "departure": "HH:MM",
      "arrival": "HH:MM+N (e.g. +1 if next day)",
      "departureAirport": "IATA code",
      "arrivalAirport": "IATA code",
      "duration": "Xh Ym",
      "durationMins": 1575,
      "stops": 0,
      "via": "DEL or AMS+FRA or null if direct",
      "segments": [
        {
          "from": "YVR", "to": "DEL",
          "dep": "10:15", "arr": "13:45+1",
          "airline": "Air India", "flight": "AI116",
          "durationMins": 930
        },
        {
          "from": "DEL", "to": "COK",
          "dep": "16:00", "arr": "19:15+1",
          "airline": "Air India", "flight": "AI521",
          "layoverMins": 135,
          "durationMins": 195
        }
      ],
      "minLayoverMins": 135,
      "price": 1842,
      "currency": "CAD",
      "seatsLeft": 4,
      "refundable": false,
      "changeable": true,
      "rating": 4.2,
      "bookUrl": "https://...",
      "priceCategory": ""
    }
  ],
  "searchedSources": ["Google Flights", "Kayak", "Skyscanner"],
  "totalFound": 12,
  "directAvailable": false,
  "cheapestDirect": null,
  "summary": "2-3 sentence analysis covering best options, price level, layover times, and recommendation",
  "priceLevel": "peak|high|normal|low",
  "recommendation": "Book now|Wait|Monitor prices"
}`

export async function agentSearch({
  origin,
  destination,
  date,
  returnDate,
  cabin,
  passengers,
  minLayoverMins = 60,
  maxLayoverMins = null,
  apiKey,
}) {
  const cabinLabel = {
    economy: 'Economy', premium_economy: 'Premium Economy',
    business: 'Business Class', first: 'First Class',
  }[cabin] || 'Economy'

  const layoverRule = `Minimum layover: ${minLayoverMins} minutes (${Math.floor(minLayoverMins/60)}h ${minLayoverMins%60}m).${maxLayoverMins ? ` Maximum layover: ${maxLayoverMins} minutes.` : ''} Exclude any flight where any single layover is shorter than the minimum.`

  const userPrompt = `Search for ALL available flights:

Route: ${origin} → ${destination}
Date: ${date}${returnDate ? `\nReturn: ${returnDate}` : ' (one-way)'}
Cabin: ${cabinLabel}
Passengers: ${passengers}
${layoverRule}

Search multiple booking sites for ALL airlines on this route — include every carrier you find (major, budget, regional, code-share). Do not limit to a preset list.

For each result, verify the layover duration between segments and exclude any with layover < ${minLayoverMins} minutes.

Find: (1) absolute cheapest valid option, (2) best value (price + journey time + stops + airline quality balanced).
Prices in CAD.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system:     SYSTEM,
      tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic ${res.status}: ${t}`)
  }

  const data     = await res.json()
  const searches = data.content.filter(b => b.type === 'tool_use').length
  const text     = data.content.filter(b => b.type === 'text').map(b => b.text).join('')

  let parsed = null
  try { parsed = JSON.parse(text.trim()) } catch {}
  if (!parsed) {
    const m = text.match(/\{[\s\S]*"flights"[\s\S]*\}/)
    if (m) { try { parsed = JSON.parse(m[0]) } catch {} }
  }

  if (!parsed?.flights?.length) {
    return { flights: [], summary: 'Agent returned no results', searches, source: 'agent_empty' }
  }

  // Post-process: enforce layover rule on agent output
  parsed.flights = parsed.flights.filter(f => {
    if (f.stops === 0) return true
    if (!f.minLayoverMins) return true // no layover data, keep
    return f.minLayoverMins >= minLayoverMins &&
      (!maxLayoverMins || f.maxLayoverMins <= maxLayoverMins)
  })

  // Sort + mark categories
  parsed.flights.sort((a, b) => a.price - b.price)
  markCategories(parsed.flights)

  return { ...parsed, searches, source: 'claude_websearch', fetchedAt: new Date().toISOString() }
}

export function markCategories(flights) {
  flights.forEach(f => { if (!f.priceCategory) f.priceCategory = '' })
  if (flights.length > 0 && !flights.find(f => f.priceCategory === 'cheapest')) {
    flights[0].priceCategory = 'cheapest'
  }
  if (!flights.find(f => f.priceCategory === 'best_value') && flights.length > 1) {
    // Score: balances price, stops, duration, rating
    const minP = flights[0].price
    const maxP = flights[flights.length - 1].price
    const range = maxP - minP || 1
    const scored = flights.map(f => ({
      code:  f.code,
      id:    f.id || f.code,
      score: ((f.price - minP) / range) * 0.45
           + (f.stops * 0.20)
           + ((f.durationMins || 1600) / 3000) * 0.20
           + (1 - (f.rating || 4) / 5) * 0.15,
    })).sort((a, b) => a.score - b.score)
    const bv = flights.find(f => (f.id || f.code) === scored[0].id)
    if (bv && bv.priceCategory !== 'cheapest') bv.priceCategory = 'best_value'
  }
}
