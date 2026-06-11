/**
 * Apify — Google Flights data (replaces SerpAPI)
 *
 * Runs an Apify "Google Flights scraper" actor synchronously and normalizes
 * the dataset items into the app's flight shape.
 *
 * Env vars:
 *   APIFY_TOKEN           — required. Apify Console → Settings → Integrations
 *   APIFY_GFLIGHTS_ACTOR  — optional. Actor ID as "username~actor-name".
 *                           Default: johnvc~google-flights-data-scraper-flight-and-price-search
 *   APIFY_INPUT_STYLE     — optional. 'serp' (default: departure_id/outbound_date keys)
 *                           or 'camel' (origin/departureDate keys) for actors
 *                           like khadinakbar/skootle that use camelCase input.
 *
 * Why tolerant parsing: actor output schemas vary — some mirror SerpAPI's
 * { best_flights, other_flights } shape, others emit one flat row per
 * itinerary, others nest legs under outbound/return. We detect all three.
 */

import { getRatesToCAD, convert } from '../fx.js'

const DEFAULT_ACTOR = 'johnvc~google-flights-data-scraper-flight-and-price-search'

// ── helpers ────────────────────────────────────────────────────────────────

function parseDurationMins(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v > 3000 ? Math.round(v / 60) : Math.round(v) // seconds vs minutes heuristic
  const s = String(v)
  const hm = s.match(/(\d+)\s*h(?:r|our)?s?\s*(\d+)?\s*m?/i)
  if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2] || 0)
  const mOnly = s.match(/^(\d+)\s*m/i)
  if (mOnly) return parseInt(mOnly[1])
  const n = parseInt(s)
  return isNaN(n) ? 0 : n
}

function parsePrice(v) {
  if (v == null) return 0
  if (typeof v === 'number') return Math.round(v)
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : Math.round(n)
}

function timeHHMM(v) {
  if (!v) return '—'
  const s = String(v)
  const iso = s.match(/T(\d{2}:\d{2})/)
  if (iso) return iso[1]
  const hm = s.match(/(\d{1,2}:\d{2})/)
  return hm ? hm[1].padStart(5, '0') : '—'
}

function airlineRating(name = '') {
  const ratings = {
    'qatar': 4.7, 'singapore': 4.8, 'emirates': 4.6, 'cathay': 4.6,
    'ana': 4.5, 'japan airlines': 4.5, 'etihad': 4.4, 'korean': 4.3,
    'lufthansa': 4.3, 'british': 4.2, 'turkish': 4.2, 'air france': 4.0,
    'klm': 4.1, 'air canada': 3.9, 'air india': 3.8, 'westjet': 3.7,
    'united': 3.8, 'delta': 4.0, 'american': 3.7, 'indigo': 3.6, 'spicejet': 3.4,
  }
  const lo = name.toLowerCase()
  for (const [k, v] of Object.entries(ratings)) if (lo.includes(k)) return v
  return 3.8
}

// ── normalization of one itinerary-like object ────────────────────────────

function normalizeItinerary(item, idx, ctx) {
  const { currency, fxRates, minLayoverMins } = ctx

  // Legs can live under several keys depending on the actor
  const legs = item.flights || item.legs || item.segments
    || item.outbound?.segments || item.outbound || []
  const legArr = Array.isArray(legs) ? legs : []

  const price = parsePrice(item.price ?? item.total_price ?? item.priceValue ?? item.fare)
  if (!price || price <= 0) return null

  const itemCurr = item.currency || item.price_currency || 'CAD'
  const priceOut = itemCurr === currency ? price : convert(price, itemCurr, currency, fxRates)

  // stops: explicit field, else legs-1, else null (unknown)
  let stops = item.stops ?? item.number_of_stops ?? item.numStops
  if (stops == null) stops = legArr.length ? legArr.length - 1 : null

  const layovers = item.layovers || []
  // Respect the user's min-layover rule when the actor exposes layover durations
  for (const lay of layovers) {
    const mins = parseDurationMins(lay.duration ?? lay.minutes)
    if (mins > 0 && mins < minLayoverMins) return null
  }
  const layoverMinsList = layovers.map(l => parseDurationMins(l.duration ?? l.minutes)).filter(m => m > 0)

  const first = legArr[0] || {}
  const last  = legArr[legArr.length - 1] || {}

  const airline = item.airline || first.airline || first.carrier
    || first.airline_name || item.carrier || '—'
  const code = item.airline_code || first.airline_code || first.carrier_code
    || (typeof airline === 'string' && /^[A-Z0-9]{2}$/.test(airline) ? airline : '')

  const durationMins = parseDurationMins(
    item.total_duration ?? item.duration ?? item.durationMins ?? item.total_duration_minutes
  )

  const via = stops > 0 && legArr.length > 1
    ? legArr.slice(0, -1).map(l =>
        l.arrival_airport?.id || l.arrival_airport_code || l.arrivalAirport
        || l.to || l.destination || ''
      ).filter(Boolean).join('+') || null
    : null

  const segments = legArr.map((l, i) => ({
    from: l.departure_airport?.id || l.departure_airport_code || l.from || l.origin || '',
    to:   l.arrival_airport?.id   || l.arrival_airport_code   || l.to   || l.destination || '',
    dep:  timeHHMM(l.departure_airport?.time || l.departure_time || l.departureTime || l.departing_at),
    arr:  timeHHMM(l.arrival_airport?.time   || l.arrival_time   || l.arrivalTime   || l.arriving_at),
    airline: l.airline || l.carrier || l.airline_name || '',
    flight:  l.flight_number || l.flightNumber || '',
    durationMins: parseDurationMins(l.duration),
    layoverMins:  i > 0 ? (layoverMinsList[i - 1] || 0) : 0,
  }))

  return {
    id: `apify-${idx}-${code || 'x'}-${priceOut}`,
    airline: String(airline),
    code,
    flightNumber: segments.map(s => s.flight).filter(Boolean).join('+'),
    departure: timeHHMM(item.departure_time || first.departure_airport?.time || first.departure_time || first.departing_at),
    arrival:   timeHHMM(item.arrival_time   || last.arrival_airport?.time    || last.arrival_time    || last.arriving_at),
    duration: durationMins > 0 ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m` : '—',
    durationMins,
    stops,
    via,
    segments,
    minLayoverMins: layoverMinsList.length ? Math.min(...layoverMinsList) : null,
    maxLayoverMins: layoverMinsList.length ? Math.max(...layoverMinsList) : null,
    price: priceOut,
    currency,
    seatsLeft: null,
    refundable: false,
    changeable: false,
    rating: airlineRating(String(airline)),
    bookUrl: item.booking_url || item.bookingUrl || null, // client falls back to Google Flights deep link
    priceCategory: '',
    source: 'apify_google_flights',
  }
}

// ── main entry ─────────────────────────────────────────────────────────────

export async function searchApifyGoogleFlights({
  origin, destination, date, returnDate,
  cabin, passengers, currency = 'CAD', minLayoverMins = 60,
}) {
  const token = process.env.APIFY_TOKEN
  if (!token || token.length < 10) return null

  const actor = (process.env.APIFY_GFLIGHTS_ACTOR || DEFAULT_ACTOR).replace('/', '~')
  const style = process.env.APIFY_INPUT_STYLE || 'serp'

  const travelClassMap = { economy: 1, premium_economy: 2, business: 3, first: 4 }

  const input = style === 'camel'
    ? {
        origin, destination,
        departureDate: date,
        ...(returnDate ? { returnDate } : {}),
        adults: parseInt(passengers) || 1,
        currency,
        cabinClass: cabin,
      }
    : {
        departure_id: origin,
        arrival_id:   destination,
        outbound_date: date,
        ...(returnDate ? { return_date: returnDate, type: 1 } : { type: 2 }),
        adults: parseInt(passengers) || 1,
        currency,
        travel_class: travelClassMap[cabin] || 1,
        hl: 'en', gl: 'ca',
      }

  // run-sync-get-dataset-items: starts the actor, waits for it to finish
  // (up to `timeout` seconds), and returns the dataset rows in one response.
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=45&format=json`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(50000),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    // Surface the error so the orchestrator marks the source as 'error'
    // (visible in the UI log) instead of silently showing 0 results
    throw new Error(`Apify ${res.status}: ${txt.slice(0, 160)}`)
  }

  const data = await res.json()
  const fxRates = await getRatesToCAD()
  const ctx = { currency, fxRates, minLayoverMins }

  // Shape A: SerpAPI-mirror — items contain best_flights / other_flights arrays
  // Shape B: flat — each dataset row IS one itinerary
  let rawItineraries = []
  const rows = Array.isArray(data) ? data : (data.items || [])
  for (const row of rows) {
    if (row && (row.best_flights || row.other_flights)) {
      rawItineraries.push(...(row.best_flights || []), ...(row.other_flights || []))
    } else if (row && (row.price != null || row.total_price != null || row.fare != null)) {
      rawItineraries.push(row)
    }
  }

  const flights = []
  rawItineraries.forEach((item, idx) => {
    try {
      const f = normalizeItinerary(item, idx, ctx)
      if (f) flights.push(f)
    } catch (e) {
      console.error('[Apify] normalize error:', e.message)
    }
  })

  console.log(`[Apify] ${flights.length} flights from ${rawItineraries.length} raw itineraries (actor: ${actor})`)
  return flights.length > 0 ? flights : null
}
