/**
 * Flight Search Orchestrator
 *
 * Runs ALL available APIs in parallel simultaneously:
 *   1. SerpAPI (Google Flights) — best real-time pricing
 *   2. Kiwi Tequila            — best for budget airlines & combinations
 *   3. Duffel                  — NDC fares, bookable offers
 *   4. Claude agent            — web search fallback
 *
 * Merges results, deduplicates, applies value scoring,
 * and returns the best options dynamically ranked.
 *
 * Results change every refresh tick as live prices update.
 */

import { searchGoogleFlights }  from './apis/serpapi.js'
import { searchKiwi }           from './apis/kiwi.js'
import { DuffelClient }         from './duffel.js'
import { agentSearch }          from './agent.js'
import { generateFallback }     from './fallback.js'

export async function orchestrateSearch({
  origin, destination, date, returnDate,
  cabin, passengers, minLayoverMins = 60, maxLayoverMins = null,
  currency = 'CAD', apiKey,
}) {
  const log = (...a) => console.log(`[orchestrator ${origin}→${destination}]`, ...a)

  // ── Run all available APIs in parallel ────────────────────────────────
  log('Launching parallel API searches...')
  const startTime = Date.now()

  const [serpResult, kiwiResult, duffelResult, agentResult] = await Promise.allSettled([

    // 1. SerpAPI — Google Flights (best real-time data)
    process.env.SERPAPI_KEY && !process.env.SERPAPI_KEY.includes('YOUR')
      ? searchGoogleFlights({ origin, destination, date, returnDate, cabin, passengers, currency, minLayoverMins })
      : Promise.resolve(null),

    // 2. Kiwi Tequila (best for budget airlines)
    process.env.KIWI_API_KEY && !process.env.KIWI_API_KEY.includes('YOUR')
      ? searchKiwi({ origin, destination, date, returnDate, cabin, passengers, currency, minLayoverMins, maxLayoverMins })
      : Promise.resolve(null),

    // 3. Duffel (NDC fares, bookable)
    process.env.DUFFEL_ACCESS_TOKEN && !process.env.DUFFEL_ACCESS_TOKEN.includes('YOUR')
      ? new DuffelClient(process.env.DUFFEL_ACCESS_TOKEN).searchOffers({ origin, destination, departureDate: date, returnDate, adults: parseInt(passengers), cabinClass: cabin, minLayoverMins, maxLayoverMins, currency })
      : Promise.resolve(null),

    // 4. Claude agent with web search (always available if Anthropic key set)
    apiKey
      ? agentSearch({ origin, destination, date, returnDate, cabin, passengers, minLayoverMins, maxLayoverMins, apiKey })
      : Promise.resolve(null),
  ])

  const elapsed = Date.now() - startTime
  log(`Parallel fetch done in ${elapsed}ms`)

  // ── Collect results from each source ─────────────────────────────────
  const sourceResults = []
  const sourceSummary = []

  function collect(result, label) {
    if (result.status === 'fulfilled' && result.value) {
      const flights = Array.isArray(result.value) ? result.value : (result.value.flights || [])
      if (flights.length > 0) {
        sourceResults.push(...flights)
        sourceSummary.push(`${label}(${flights.length})`)
        log(`${label}: ${flights.length} flights`)
        return true
      }
    }
    if (result.status === 'rejected') log(`${label} error: ${result.reason?.message}`)
    else log(`${label}: no results`)
    return false
  }

  const serpOk   = collect(serpResult,   'SerpAPI')
  const kiwiOk   = collect(kiwiResult,   'Kiwi')
  const duffelOk = collect(duffelResult, 'Duffel')
  const agentOk  = collect(agentResult,  'Agent')

  log(`Sources with results: ${sourceSummary.join(', ') || 'none'}`)

  // ── If no real APIs returned data, use dynamic fallback ───────────────
  if (sourceResults.length === 0) {
    log('All APIs empty — using dynamic fallback')
    const fallback = generateFallback(origin, destination, date, cabin, passengers, minLayoverMins)
    return { ...fallback, elapsed, sourceSummary: ['estimate'] }
  }

  // ── Deduplicate: same airline + similar departure time + similar price ─
  const deduped = deduplicateFlights(sourceResults)
  log(`Deduplication: ${sourceResults.length} → ${deduped.length} flights`)

  // ── Apply layover filter one more time ────────────────────────────────
  const filtered = deduped.filter(f => {
    if (!f.stops) return true
    if (f.minLayoverMins !== null && f.minLayoverMins !== undefined) {
      if (f.minLayoverMins < minLayoverMins) return false
      if (maxLayoverMins && f.maxLayoverMins > maxLayoverMins) return false
    }
    return true
  })
  log(`After layover filter: ${filtered.length} flights`)

  // ── Score and sort ────────────────────────────────────────────────────
  const scored = scoreAndRank(filtered)

  // ── Mark cheapest and best value ──────────────────────────────────────
  markBestOptions(scored)

  // ── Build summary ─────────────────────────────────────────────────────
  const cheapest = scored[0]
  const bestVal  = scored.find(f => f.priceCategory === 'best_value')
  const direct   = scored.find(f => f.stops === 0)
  const sources  = [...new Set(scored.map(f => f.source).filter(Boolean))]

  const summary = buildSummary(scored, cheapest, bestVal, direct, origin, destination, minLayoverMins, sources)
  const priceLevel = detectPriceLevel(date)

  return {
    flights:        scored,
    directAvailable:!!direct,
    cheapestDirect: direct?.price || null,
    summary,
    priceLevel,
    recommendation: priceLevel === 'peak' ? 'Book now — peak season' : priceLevel === 'high' ? 'Book soon' : 'Monitor prices',
    source:         sources.length > 1 ? `multi(${sourceSummary.join('+')})` : (sources[0] || 'estimate'),
    sourceSummary,
    webSearches:    agentResult.value?.searches || 0,
    elapsed,
    fetchedAt:      new Date().toISOString(),
  }
}

// ── Deduplicate flights from multiple sources ─────────────────────────────
function deduplicateFlights(flights) {
  const seen  = new Map()
  const result = []

  for (const f of flights) {
    // Key: airline code + departure time + stops + rough price bucket
    const priceBucket = Math.round(f.price / 50) * 50 // group within CA$50
    const key = `${f.code}-${f.departure}-${f.stops}-${priceBucket}`

    if (!seen.has(key)) {
      seen.set(key, true)
      result.push(f)
    } else {
      // Keep the one with more data (segments, seat count, etc.)
      const existing = result.find(r => {
        const rb = Math.round(r.price/50)*50
        return `${r.code}-${r.departure}-${r.stops}-${rb}` === key
      })
      if (existing && (!existing.segments?.length && f.segments?.length)) {
        Object.assign(existing, f)
      }
    }
  }

  return result
}

// ── Score flights by value (lower score = better value) ───────────────────
function scoreAndRank(flights) {
  if (!flights.length) return flights

  const prices   = flights.map(f => f.price)
  const durations = flights.map(f => f.durationMins || 1500)
  const minP = Math.min(...prices),   maxP = Math.max(...prices)
  const minD = Math.min(...durations), maxD = Math.max(...durations)
  const rangeP = maxP - minP || 1
  const rangeD = maxD - minD || 1

  return flights.map(f => ({
    ...f,
    valueScore: (
      ((f.price - minP) / rangeP)                      * 0.45 + // 45% price
      ((f.stops || 0) * 0.10)                                  + // 10% stops
      (((f.durationMins||1500) - minD) / rangeD)       * 0.25 + // 25% duration
      ((1 - Math.min((f.rating||3.8), 5) / 5)          * 0.20)  // 20% airline quality
    ),
  })).sort((a, b) => a.price - b.price) // sort by price for display
}

// ── Mark cheapest and best value ──────────────────────────────────────────
function markBestOptions(flights) {
  flights.forEach(f => { f.priceCategory = '' })

  if (flights.length === 0) return

  // Cheapest = lowest price
  flights[0].priceCategory = 'cheapest'

  // Best value = lowest value score (not same as cheapest)
  if (flights.length > 1) {
    const bestValueFlight = [...flights].sort((a, b) => (a.valueScore||0) - (b.valueScore||0))[0]
    if (bestValueFlight && bestValueFlight !== flights[0]) {
      bestValueFlight.priceCategory = 'best_value'
    } else if (flights.length > 1) {
      // Pick second if same flight is cheapest
      const others = [...flights].sort((a, b) => (a.valueScore||0) - (b.valueScore||0))
      const bv = others.find(f => f.priceCategory !== 'cheapest')
      if (bv) bv.priceCategory = 'best_value'
    }
  }
}

// ── Build human-readable summary ──────────────────────────────────────────
function buildSummary(flights, cheapest, bestVal, direct, origin, destination, minLayoverMins, sources) {
  if (!flights.length) return 'No flights found for this route.'

  const parts = []

  parts.push(`${flights.length} flights found on ${origin}→${destination}.`)

  if (cheapest) {
    parts.push(`Cheapest: ${cheapest.airline} at CA$${cheapest.price.toLocaleString()}${cheapest.via ? ` via ${cheapest.via}` : ' (direct)'} (${cheapest.duration}).`)
  }

  if (bestVal && bestVal !== cheapest) {
    parts.push(`Best value: ${bestVal.airline} CA$${bestVal.price.toLocaleString()} — rated ★${bestVal.rating} with ${bestVal.stops === 0 ? 'no stops' : `${bestVal.stops} stop${bestVal.stops>1?'s':''}`}.`)
  }

  if (direct) {
    parts.push(`Direct flights available from CA$${direct.price.toLocaleString()}.`)
  } else {
    parts.push(`All options connect via hub. Min layover ${minLayoverMins}min enforced.`)
  }

  if (sources.length > 1) {
    parts.push(`Data from: ${sources.slice(0,3).join(', ')}.`)
  }

  return parts.join(' ')
}

function detectPriceLevel(date) {
  const m = new Date(date).getMonth() + 1
  return [12,1].includes(m) ? 'peak' : [7,8].includes(m) ? 'high' : [3,4].includes(m) ? 'moderate' : 'normal'
}
