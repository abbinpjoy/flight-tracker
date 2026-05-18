/**
 * Flight Search Orchestrator
 *
 * Fires ALL configured APIs simultaneously.
 * Waits for ALL to finish (or timeout individually).
 * Merges every result, deduplicates, scores and ranks.
 *
 * SerpAPI fast result does NOT stop the others — all run in parallel.
 */

import { searchGoogleFlights } from './apis/serpapi.js'
import { searchKiwi }          from './apis/kiwi.js'
import { DuffelClient }        from './duffel.js'
import { agentSearch }         from './agent.js'
import { generateFallback }    from './fallback.js'

// Individual timeouts so a slow API never kills the whole response
const T = { serpapi: 12000, kiwi: 12000, duffel: 15000, agent: 22000 }

function raceTimeout(promise, ms, name) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${name} timeout after ${ms}ms`)), ms)
    ),
  ])
}

export async function orchestrateSearch({
  origin, destination, date, returnDate,
  cabin, passengers,
  minLayoverMins = 60, maxLayoverMins = null,
  currency = 'CAD', apiKey,
}) {
  const log = (...a) => console.log(`[orch ${origin}→${destination}]`, ...a)
  const t0  = Date.now()

  const hasSerpAPI = !!(process.env.SERPAPI_KEY?.length > 10)
  const hasKiwi    = !!(process.env.KIWI_API_KEY?.length > 5)
  const hasDuffel  = !!(process.env.DUFFEL_ACCESS_TOKEN?.length > 10)
  const hasAgent   = !!apiKey

  log(`Starting — SerpAPI:${hasSerpAPI} Kiwi:${hasKiwi} Duffel:${hasDuffel} Agent:${hasAgent}`)

  const params = { origin, destination, date, returnDate, cabin, passengers, currency, minLayoverMins, maxLayoverMins }

  // ── Fire ALL APIs at once — Promise.allSettled waits for ALL ──────────
  const [rSerp, rKiwi, rDuffel, rAgent] = await Promise.allSettled([
    hasSerpAPI ? raceTimeout(searchGoogleFlights(params), T.serpapi, 'SerpAPI') : Promise.resolve(null),
    hasKiwi    ? raceTimeout(searchKiwi(params),          T.kiwi,    'Kiwi')    : Promise.resolve(null),
    hasDuffel  ? raceTimeout(
        new DuffelClient(process.env.DUFFEL_ACCESS_TOKEN).searchOffers({
          origin, destination, departureDate: date, returnDate,
          adults: parseInt(passengers), cabinClass: cabin,
          minLayoverMins, maxLayoverMins, currency,
        }), T.duffel, 'Duffel')
      : Promise.resolve(null),
    hasAgent   ? raceTimeout(agentSearch({ ...params, apiKey }), T.agent, 'Agent') : Promise.resolve(null),
  ])

  log(`All APIs done in ${Date.now() - t0}ms`)

  // ── Extract flights from each result ──────────────────────────────────
  const sourceStats  = []
  const allFlights   = []

  function harvest(settled, sourceName) {
    if (settled.status === 'rejected') {
      const errMsg = settled.reason?.message || 'unknown error'
      log(`${sourceName} FAILED: ${errMsg}`)
      sourceStats.push({ name: sourceName, count: 0, status: 'error', error: errMsg })
      return
    }
    const val = settled.value
    if (!val) {
      sourceStats.push({ name: sourceName, count: 0, status: 'skipped' })
      return
    }

    const flights = Array.isArray(val) ? val : (val.flights || [])
    if (flights.length === 0) {
      log(`${sourceName}: 0 results`)
      sourceStats.push({ name: sourceName, count: 0, status: 'empty' })
      return
    }

    flights.forEach(f => { f.apiSource = sourceName })
    allFlights.push(...flights)
    sourceStats.push({ name: sourceName, count: flights.length, status: 'ok' })
    log(`${sourceName}: ${flights.length} flights ✓`)
  }

  harvest(rSerp,   'SerpAPI')
  harvest(rKiwi,   'Kiwi')
  harvest(rDuffel, 'Duffel')
  harvest(rAgent,  'Agent')

  const activeSources = sourceStats.filter(s => s.status === 'ok')
  log(`Merged: ${allFlights.length} total flights from ${activeSources.length} sources`)

  // ── Fallback if nothing worked ────────────────────────────────────────
  if (allFlights.length === 0) {
    log('No API results — using dynamic fallback')
    const fb = generateFallback(origin, destination, date, cabin, passengers, minLayoverMins)
    return { ...fb, sourceStats, elapsed: Date.now() - t0 }
  }

  // ── Apply layover filter ──────────────────────────────────────────────
  const layoverValid = allFlights.filter(f => {
    if (!f.stops || f.stops === 0) return true
    const min = f.minLayoverMins ?? f.min_layover_duration_minutes ?? null
    if (min === null) return true // no data, keep it
    if (min < minLayoverMins) return false
    if (maxLayoverMins && min > maxLayoverMins) return false
    return true
  })
  log(`Layover filter: ${allFlights.length} → ${layoverValid.length}`)

  // ── Deduplicate: same airline + same departure + similar price ────────
  const seen    = new Map()
  const deduped = []
  for (const f of layoverValid) {
    const pBucket = Math.round((f.price || 0) / 30) * 30
    const key     = `${f.code || f.airline}-${f.departure}-${f.stops}-${pBucket}`
    if (!seen.has(key)) {
      seen.set(key, true)
      deduped.push(f)
    }
  }
  log(`Dedup: ${layoverValid.length} → ${deduped.length}`)

  // ── Score every flight (lower = better value) ─────────────────────────
  const prices = deduped.map(f => f.price || 0)
  const durations = deduped.map(f => f.durationMins || 1500)
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const minD = Math.min(...durations), maxD = Math.max(...durations)
  const rP = maxP - minP || 1
  const rD = maxD - minD || 1

  const scored = deduped.map(f => ({
    ...f,
    priceCategory: '',
    valueScore: (
      ((f.price - minP) / rP)                        * 0.45 +  // 45% price
      ((f.stops || 0) * 0.10)                                 + // 10% fewer stops
      (((f.durationMins || 1500) - minD) / rD)       * 0.25 +  // 25% shorter flight
      ((1 - Math.min(f.rating || 3.8, 5) / 5)        * 0.20)   // 20% airline quality
    ),
  })).sort((a, b) => a.price - b.price)

  // ── Mark cheapest + best value ────────────────────────────────────────
  if (scored.length > 0) {
    scored[0].priceCategory = 'cheapest'
  }
  if (scored.length > 1) {
    const byValue = [...scored].sort((a, b) => a.valueScore - b.valueScore)
    const bv      = byValue.find(f => f.priceCategory !== 'cheapest')
    if (bv) bv.priceCategory = 'best_value'
  }

  // ── Build summary ──────────────────────────────────────────────────────
  const cheapest  = scored[0]
  const bestVal   = scored.find(f => f.priceCategory === 'best_value')
  const direct    = scored.find(f => f.stops === 0)
  const srcNames  = activeSources.map(s => `${s.name}(${s.count})`).join(' + ')

  const summaryParts = [
    `${scored.length} flights found from ${activeSources.length} source${activeSources.length > 1 ? 's' : ''} [${srcNames}].`,
    cheapest  ? `Cheapest: ${cheapest.airline} CA$${cheapest.price?.toLocaleString()}${cheapest.via ? ` via ${cheapest.via}` : ' direct'} · ${cheapest.duration}.` : '',
    bestVal   ? `Best value: ${bestVal.airline} CA$${bestVal.price?.toLocaleString()} · ★${bestVal.rating} · ${bestVal.stops === 0 ? 'direct' : `${bestVal.stops} stop${bestVal.stops > 1 ? 's' : ''}`}.` : '',
    direct    ? `Direct available from CA$${direct.price?.toLocaleString()}.` : `No direct flights — all via hub (min ${minLayoverMins}min layover).`,
  ]

  const pl = detectPriceLevel(date)
  const sourceLabel = activeSources.length > 1
    ? `multi(${activeSources.map(s => s.name.toLowerCase()).join('+')})`
    : (activeSources[0]?.name?.toLowerCase() || 'estimate')

  return {
    flights:         scored,
    directAvailable: !!direct,
    cheapestDirect:  direct?.price || null,
    summary:         summaryParts.filter(Boolean).join(' '),
    priceLevel:      pl,
    recommendation:  pl === 'peak' ? 'Book now — peak season' : pl === 'high' ? 'Book soon' : 'Monitor prices',
    source:          sourceLabel,
    sourceStats,
    webSearches:     rAgent.value?.searches || 0,
    totalMerged:     allFlights.length,
    afterFilter:     layoverValid.length,
    afterDedup:      deduped.length,
    elapsed:         Date.now() - t0,
    fetchedAt:       new Date().toISOString(),
  }
}

function detectPriceLevel(date) {
  const m = new Date(date).getMonth() + 1
  return [12, 1].includes(m) ? 'peak' : [7, 8].includes(m) ? 'high' : [3, 4].includes(m) ? 'moderate' : 'normal'
}
