/**
 * Claude AI Agent — Dynamic Flight Search
 *
 * Fixes:
 * - Updated anthropic-version header to latest
 * - Correct tools format for web_search
 * - Reduced max_tokens to stay within limits
 * - Better JSON extraction from response
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

  const systemPrompt = `You are a flight price search agent. Search the web for real current flight prices.

Search Google Flights, Kayak and Skyscanner for this exact route and date.
Find ALL airlines operating this route — not just the most popular ones.
Include budget carriers, regional airlines, and code-share flights.

LAYOVER RULE: Only include connecting flights where every layover is at least ${minLayoverMins} minutes.${maxLayoverMins ? ` Maximum layover: ${maxLayoverMins} minutes.` : ''}

Convert all prices to CAD: 1 USD=1.37, 1 GBP=1.74, 1 EUR=1.48, 1 AED=0.37, 1 INR=0.016, 1 SGD=1.01, 1 AUD=0.89, 1 QAR=0.38.

Return ONLY a raw JSON array — no markdown, no explanation, just the array starting with [

[
  {
    "airline": "Qatar Airways",
    "code": "QR",
    "departure": "14:45",
    "arrival": "19:05+1",
    "duration": "27h 35m",
    "durationMins": 1655,
    "stops": 1,
    "via": "DOH",
    "minLayoverMins": 115,
    "price": 1920,
    "currency": "CAD",
    "refundable": true,
    "rating": 4.7,
    "bookUrl": "https://www.qatarairways.com",
    "priceCategory": ""
  }
]`

  const userPrompt = `Search for flights:
FROM: ${origin}
TO: ${destination}
TRIP: ${tripType}
CABIN: ${cabinLabel}
PASSENGERS: ${passengers}
MIN LAYOVER: ${minLayoverMins} minutes

Search Google Flights, Kayak and Skyscanner now. Return JSON array only.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 2000,
        system:     systemPrompt,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
        }],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`)
    }

    const data     = await res.json()
    const searches = (data.content || []).filter(b => b.type === 'tool_use').length
    const text     = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')

    console.log(`[Agent] ${searches} web searches, ${text.length} chars`)

    // Parse JSON array from response
    let flights = null

    // Try 1: direct array parse
    try { const t = text.trim(); if (t.startsWith('[')) flights = JSON.parse(t) } catch {}

    // Try 2: extract array from text
    if (!flights) {
      const m = text.match(/\[\s*\{[\s\S]*?\}\s*\]/)
      if (m) try { flights = JSON.parse(m[0]) } catch {}
    }

    // Try 3: extract from JSON object wrapper
    if (!flights) {
      const m = text.match(/\{[\s\S]*?"flights"\s*:\s*(\[[\s\S]*?\])\s*[,}]/)
      if (m) try { flights = JSON.parse(m[1]) } catch {}
    }

    if (!Array.isArray(flights) || flights.length === 0) {
      console.log('[Agent] Parse failed. Sample:', text.slice(0, 300))
      return { flights: [], searches, source: 'agent_no_parse' }
    }

    // Filter layovers
    flights = flights.filter(f => {
      if (!f.stops || f.stops === 0) return true
      if (typeof f.minLayoverMins === 'number') {
        if (f.minLayoverMins < minLayoverMins) return false
        if (maxLayoverMins && f.minLayoverMins > maxLayoverMins) return false
      }
      return true
    })

    flights.sort((a, b) => (a.price || 0) - (b.price || 0))
    console.log(`[Agent] ${flights.length} valid flights after filter`)

    return { flights, searches, source: 'claude_websearch', fetchedAt: new Date().toISOString() }

  } catch (err) {
    console.error('[Agent] Error:', err.message)
    throw err
  }
}

export function markCategories(flights) {
  if (!flights?.length) return
  flights.forEach(f => { if (!f.priceCategory) f.priceCategory = '' })
  if (!flights.find(f => f.priceCategory === 'cheapest')) flights[0].priceCategory = 'cheapest'
  if (flights.length > 1 && !flights.find(f => f.priceCategory === 'best_value')) {
    const minP = flights[0].price, maxP = flights[flights.length-1].price, rP = maxP-minP||1
    const minD = Math.min(...flights.map(f=>f.durationMins||1500))
    const maxD = Math.max(...flights.map(f=>f.durationMins||1500)), rD = maxD-minD||1
    const scored = flights.map((f,i) => ({
      i,
      s: ((f.price-minP)/rP)*0.45 + ((f.stops||0)*0.10) + (((f.durationMins||1500)-minD)/rD)*0.25 + ((1-(f.rating||3.8)/5)*0.20)
    })).sort((a,b)=>a.s-b.s)
    const bv = flights[scored.find(x => flights[x.i].priceCategory !== 'cheapest')?.i]
    if (bv) bv.priceCategory = 'best_value'
  }
}
