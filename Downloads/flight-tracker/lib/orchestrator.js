/**
 * Flight Search Orchestrator
 *
 * Fires ALL configured APIs simultaneously.
 * Waits for ALL to finish (or timeout individually).
 * Merges every result, deduplicates, scores and ranks.
 */

import { searchGoogleFlights }     from './apis/serpapi.js'
import { searchKiwi }              from './apis/kiwi.js'
import { searchTravelpayouts }     from './apis/travelpayouts.js'
import { searchVirtualInterline }  from './apis/virtualinterline.js'
import { DuffelClient }            from './duffel.js'
import { agentSearch }             from './agent.js'
import { generateFallback }        from './fallback.js'

// Individual timeouts per API
const T = {
  serpapi:   12000,
  kiwi:      12000,
  duffel:    15000,
  travelpayouts: 10000,
  virtualinterline: 35000, // 2s delay + up to 3 batches × (15s Duffel + 1.2s pause)
  agent:     22000,
}

// Cache was here but serverless functions are stateless — removed.
// Duffel rate limiting is now handled client-side via lastDuffelCall ref.
// VI cache kept for warm-process reuse (may help on Vercel if same instance reused).
const viCache    = new Map()
const VI_CACHE_TTL = 5 * 60 * 1000

function getCachedVI(key) {
  const e = viCache.get(key)
  if (!e) return null
  if (Date.now() - e.ts > VI_CACHE_TTL) { viCache.delete(key); return null }
  return e.results
}
function setCachedVI(key, r) { viCache.set(key, { ts: Date.now(), results: r }) }

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
  skipDuffel = false,
  skipVI     = false,
}) {
  const log = (...a) => console.log(`[orch ${origin}→${destination}]`, ...a)
  const t0  = Date.now()

  const hasSerpAPI      = !!(process.env.SERPAPI_KEY?.length > 10)
  const hasKiwi         = !!(process.env.KIWI_API_KEY?.length > 5)
  const hasDuffel       = !!(process.env.DUFFEL_ACCESS_TOKEN?.length > 10)
  const hasTravelpayouts = !!(process.env.TRAVELPAYOUTS_TOKEN?.length > 5)
  const hasVI           = hasDuffel && !skipVI
  const hasAgent        = !!apiKey && !hasSerpAPI && !hasKiwi && !hasDuffel && !hasTravelpayouts

  log(`APIs — SerpAPI:${hasSerpAPI} TP:${hasTravelpayouts} Duffel:${hasDuffel}${skipDuffel?'(skip)':''} VI:${hasVI}${skipVI?'(skip)':''} Kiwi:${hasKiwi} Agent:${hasAgent}`)

  const params     = { origin, destination, date, returnDate, cabin, passengers, currency, minLayoverMins, maxLayoverMins }
  const viCacheKey = `${origin}-${destination}-${date}`
  const cachedVI   = getCachedVI(viCacheKey)
  if (cachedVI) log('VI: warm cache hit')

  // ── Fire ALL APIs simultaneously ──────────────────────────────────────
  const [rSerp, rKiwi, rDuffel, rTP, rVI, rAgent] = await Promise.allSettled([
    hasSerpAPI
      ? raceTimeout(searchGoogleFlights(params), T.serpapi, 'SerpAPI')
      : Promise.resolve(null),

    hasKiwi
      ? raceTimeout(searchKiwi(params), T.kiwi, 'Kiwi')
      : Promise.resolve(null),

    // skipDuffel = client says "within cooldown window, don't call Duffel"
    hasDuffel && !skipDuffel
      ? raceTimeout(
          new DuffelClient(process.env.DUFFEL_ACCESS_TOKEN).searchOffers({
            origin, destination, departureDate: date, returnDate,
            adults: parseInt(passengers), cabinClass: cabin,
            minLayoverMins, maxLayoverMins, currency,
          }), T.duffel, 'Duffel')
      : Promise.resolve(null),

    hasTravelpayouts
      ? raceTimeout(searchTravelpayouts(params), T.travelpayouts, 'Travelpayouts')
      : Promise.resolve(null),

    // skipVI = true when skipDuffel is true (VI uses Duffel internally)
    hasVI
      ? cachedVI
        ? Promise.resolve(cachedVI)
        : raceTimeout(
            new Promise(r => setTimeout(r, 2000))
              .then(() => searchVirtualInterline({ origin, destination, date, cabin, passengers, minLayoverMins, currency }))
              .then(results => { if (results) setCachedVI(viCacheKey, results); return results }),
            T.virtualinterline, 'VirtualInterline')
      : Promise.resolve(null),

    hasAgent
      ? raceTimeout(agentSearch({ ...params, apiKey }), T.agent, 'Agent')
      : Promise.resolve(null),
  ])

    hasAgent
      ? raceTimeout(agentSearch({ ...params, apiKey }), T.agent, 'Agent')
      : Promise.resolve(null),
  ])

  log(`All APIs done in ${Date.now() - t0}ms`)

  // ── Harvest results ────────────────────────────────────────────────────
  const sourceStats = []
  const allFlights  = []

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
    if (!flights.length) {
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
  harvest(rTP,     'Travelpayouts')
  harvest(rVI,     'VirtualInterline')
  harvest(rAgent,  'Agent')

  const activeSources = sourceStats.filter(s => s.status === 'ok')
  log(`Merged: ${allFlights.length} total from ${activeSources.length} sources`)

  // ── Fallback ──────────────────────────────────────────────────────────
  if (allFlights.length === 0) {
    log('No API results — using fallback')
    const fb = generateFallback(origin, destination, date, cabin, passengers, minLayoverMins)
    return { ...fb, sourceStats, elapsed: Date.now() - t0 }
  }

  // ── Layover filter ────────────────────────────────────────────────────
  const layoverValid = allFlights.filter(f => {
    if (!f.stops || f.stops === 0) return true
    const min = f.minLayoverMins ?? null
    if (min === null) return true
    if (min < minLayoverMins) return false
    if (maxLayoverMins && min > maxLayoverMins) return false
    return true
  })

  // ── Deduplicate ───────────────────────────────────────────────────────
  // VI combos use their own unique keys — never dedup against regular flights
  const seen    = new Map()
  const deduped = []
  for (const f of layoverValid) {
    if (f.isVirtualInterline) {
      deduped.push(f) // always keep — they're unique by design
      continue
    }
    const pBucket    = Math.round((f.price || 0) / 10) * 10
    const airlineKey = (f.airline || f.code || '').toLowerCase().replace(/\s+/g,'').slice(0, 8)
    const key        = `${airlineKey}-${f.departure}-${f.stops}-${pBucket}`
    if (!seen.has(key)) { seen.set(key, true); deduped.push(f) }
  }
  log(`Dedup: ${layoverValid.length} → ${deduped.length}`)

  // ── Score & rank ──────────────────────────────────────────────────────
  const prices    = deduped.map(f => f.price || 0)
  const durations = deduped.map(f => f.durationMins || 1500)
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const minD = Math.min(...durations), maxD = Math.max(...durations)
  const rP = maxP - minP || 1, rD = maxD - minD || 1

  const scored = deduped.map(f => ({
    ...f,
    priceCategory: '',
    valueScore: (
      ((f.price - minP) / rP)                        * 0.45 +
      ((f.stops || 0) * 0.10)                                +
      (((f.durationMins || 1500) - minD) / rD)       * 0.25 +
      ((1 - Math.min(f.rating || 3.8, 5) / 5)        * 0.20)
    ),
  })).sort((a, b) => a.price - b.price)

  if (scored.length > 0) scored[0].priceCategory = 'cheapest'
  if (scored.length > 1) {
    const bv = [...scored].sort((a,b)=>a.valueScore-b.valueScore).find(f=>f.priceCategory!=='cheapest')
    if (bv) bv.priceCategory = 'best_value'
  }
  // Mark VI flights
  scored.filter(f=>f.isVirtualInterline).forEach(f=>{ if(!f.priceCategory) f.priceCategory='virtual_interline' })

  const cheapest = scored[0]
  const bestVal  = scored.find(f=>f.priceCategory==='best_value')
  const direct   = scored.find(f=>f.stops===0&&!f.isVirtualInterline)
  const viCount  = scored.filter(f=>f.isVirtualInterline).length
  const srcNames = activeSources.map(s=>`${s.name}(${s.count})`).join(' + ')

  const summaryParts = [
    `${scored.length} options from ${activeSources.length} source${activeSources.length>1?'s':''} [${srcNames}].`,
    viCount ? `${viCount} virtual interline combo${viCount>1?'s':''} found (book separately).` : '',
    cheapest ? `Cheapest: ${cheapest.airline} CA$${cheapest.price?.toLocaleString()}${cheapest.via?` via ${cheapest.via}`:' direct'}.` : '',
    bestVal  ? `Best value: ${bestVal.airline} CA$${bestVal.price?.toLocaleString()} ★${bestVal.rating}.` : '',
    direct   ? `Direct from CA$${direct.price?.toLocaleString()}.` : 'No direct flights found.',
  ]

  return {
    flights:         scored,
    directAvailable: !!direct,
    cheapestDirect:  direct?.price || null,
    summary:         summaryParts.filter(Boolean).join(' '),
    priceLevel:      detectPriceLevel(date),
    recommendation:  detectPriceLevel(date)==='peak'?'Book now — peak season':'Monitor prices',
    source:          activeSources.length>1?`multi(${activeSources.map(s=>s.name.toLowerCase()).join('+')})` : (activeSources[0]?.name?.toLowerCase()||'estimate'),
    sourceStats,
    totalMerged:     allFlights.length,
    afterDedup:      deduped.length,
    elapsed:         Date.now() - t0,
    fetchedAt:       new Date().toISOString(),
  }
}

function detectPriceLevel(date) {
  const m = new Date(date).getMonth() + 1
  return [12,1].includes(m)?'peak':[7,8].includes(m)?'high':[3,4].includes(m)?'moderate':'normal'
}
