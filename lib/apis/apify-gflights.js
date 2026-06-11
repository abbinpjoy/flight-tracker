/**
 * Apify — Google Flights data (replaces SerpAPI)
 *
 * Runs an Apify actor synchronously and reads its dataset items.
 * Free tier: $5 platform credit EVERY month (recurring) ≈ 400–600 searches
 * at typical actor pricing of $8–12 / 1,000 records.
 *
 * Env vars:
 *   APIFY_TOKEN           — from console.apify.com → Settings → Integrations
 *   APIFY_GFLIGHTS_ACTOR  — optional, defaults to 'skootle~google-flights-scraper'
 *                           (mirrors SerpAPI's best_flights/other_flights shape).
 *                           Use the actor's "username~actor-name" ID.
 *
 * Robustness notes:
 * - Input is sent as a SUPERSET of the field names common across Google
 *   Flights actors (departure_id/origin/from, outbound_date/date, …) since
 *   actors ignore unknown fields in most input schemas.
 * - Output parsing handles BOTH common shapes:
 *     A) SerpAPI-mirror: items containing best_flights[] / other_flights[]
 *     B) Flat records:   one dataset item per itinerary
 */

import { getRatesToCAD, convert } from '../fx.js'

const APIFY_BASE = 'https://api.apify.com/v2'

export async function searchApifyGoogleFlights({
  origin, destination, date, returnDate,
  cabin, passengers, currency = 'CAD', minLayoverMins = 60,
}) {
  const token = process.env.APIFY_TOKEN
  if (!token || token.length < 10) return null

  const actor = (process.env.APIFY_GFLIGHTS_ACTOR || 'skootle~google-flights-scraper')
    .replace('/', '~') // accept either separator

  const travelClassNum = { economy: 1, premium_economy: 2, business: 3, first: 4 }[cabin] || 1
  const travelClassStr = { economy: 'economy', premium_economy: 'premium_economy', business: 'business', first: 'first' }[cabin] || 'economy'

  // Superset input — covers the field-name conventions of the popular actors
  const input = {
    // SerpAPI-style names
    departure_id:  origin,
    arrival_id:    destination,
    outbound_date: date,
    ...(returnDate ? { return_date: returnDate } : {}),
    type:          returnDate ? 1 : 2,           // 1=round trip, 2=one-way (SerpAPI convention)
    flight_type:   returnDate ? 'round_trip' : 'one_way',
    travel_class:  travelClassNum,
    cabin_class:   travelClassStr,
    adults:        parseInt(passengers) || 1,
    currency,
    hl: 'en', gl: 'ca',
    // generic names some actors use
    origin, destination, from: origin, to: destination,
    date, departureDate: date,
    ...(returnDate ? { returnDate } : {}),
    maxItems: 30, limit: 30,
  }

  const url = `${APIFY_BASE}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items` +
              `?token=${token}&timeout=50&format=json&clean=true`

  let items
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(input),
      signal:  AbortSignal.timeout(50000),
    })
    if (!res.ok) {
      const txt = await res.text()
      // Surface actor/auth/credit problems to the orchestrator → UI log
      throw new Error(`Apify HTTP ${res.status}: ${txt.slice(0, 160)}`)
    }
    items = await res.json()
  } catch (err) {
    console.error('[Apify] Error:', err.message)
    throw err
  }

  if (!Array.isArray(items) || !items.length) {
    console.log('[Apify] Actor returned no items')
    return null
  }

  const fxRates = await getRatesToCAD()

  // ── Shape A: SerpAPI-mirror — one item holding best_flights/other_flights ──
  const mirror = items.find(it => Array.isArray(it?.best_flights) || Array.isArray(it?.other_flights))
  const rawOffers = mirror
    ? [...(mirror.best_flights || []), ...(mirror.other_flights || [])]
    : items // ── Shape B: flat itinerary records ──

  const flights = []
  for (const offer of rawOffers) {
    try {
      const f = normalizeOffer(offer, { currency, fxRates, minLayoverMins })
      if (f) flights.push(f)
    } catch (e) {
      console.error('[Apify] Parse error:', e.message)
    }
  }

  console.log(`[Apify] ${flights.length} flights from Google Flights (${mirror ? 'mirror' : 'flat'} shape)`)
  return flights.length > 0 ? flights : null
}

// ── Normalize one offer from either shape into FlightTrack's flight object ──
function normalizeOffer(offer, { currency, fxRates, minLayoverMins }) {
  // Legs: SerpAPI-mirror uses offer.flights[]; flat records may use
  // segments[] / legs[] or be a single-leg record themselves.
  const legs = offer.flights || offer.segments || offer.legs ||
               (offer.departure_airport || offer.departureAirport ? [offer] : [])
  if (!legs.length && offer.price == null) return null

  const get = (o, ...keys) => { for (const k of keys) { if (o?.[k] != null) return o[k] } return null }

  const first = legs[0] || {}
  const last  = legs[legs.length - 1] || first
  const stops = legs.length ? legs.length - 1 : (get(offer, 'stops', 'number_of_stops') ?? null)

  // Layovers (mirror shape) — enforce the user's minimum
  const layovers = offer.layovers || []
  for (const lay of layovers) {
    const mins = lay.duration || lay.minutes || 0
    if (mins && mins < minLayoverMins) return null
  }
  const layoverDurations = layovers.map(l => l.duration || l.minutes || 0).filter(Boolean)

  // Price — number, or object like { amount, currency }
  let rawPrice = get(offer, 'price', 'total_price', 'totalPrice', 'amount')
  let rawCurr  = get(offer, 'currency', 'price_currency') || currency
  if (rawPrice && typeof rawPrice === 'object') {
    rawCurr  = rawPrice.currency || rawCurr
    rawPrice = rawPrice.amount ?? rawPrice.value ?? rawPrice.price
  }
  rawPrice = parseFloat(rawPrice)
  if (!rawPrice || rawPrice <= 0) return null
  const price = rawCurr === currency ? Math.round(rawPrice) : convert(rawPrice, rawCurr, currency, fxRates)

  // Times — accept "HH:MM", "YYYY-MM-DD HH:MM", or ISO 8601
  const timeOf = v => {
    if (!v) return null
    if (typeof v === 'object') v = v.time || v.datetime || v.date_time
    const s = String(v)
    const m = s.match(/(\d{2}):(\d{2})/)
    return m ? `${m[1]}:${m[2]}` : null
  }
  const depAirport = first.departure_airport || first.departureAirport || {}
  const arrAirport = last.arrival_airport   || last.arrivalAirport    || {}
  const departure  = timeOf(depAirport.time || get(first, 'departure_time', 'departureTime', 'departing_at')) || '—'
  const arrival    = timeOf(arrAirport.time || get(last,  'arrival_time',  'arrivalTime',  'arriving_at'))   || '—'

  const durMins = get(offer, 'total_duration', 'totalDuration', 'duration_minutes', 'durationMins') ||
                  legs.reduce((s, l) => s + (l.duration || 0), 0) + layoverDurations.reduce((s, m) => s + m, 0) || 0

  const segments = legs.map((leg, i) => ({
    from:         get(leg.departure_airport || leg.departureAirport || {}, 'id', 'iata', 'code') || get(leg, 'from', 'origin') || '',
    to:           get(leg.arrival_airport   || leg.arrivalAirport   || {}, 'id', 'iata', 'code') || get(leg, 'to', 'destination') || '',
    dep:          timeOf((leg.departure_airport || leg.departureAirport || {}).time || get(leg, 'departure_time', 'departing_at')) || '',
    arr:          timeOf((leg.arrival_airport   || leg.arrivalAirport   || {}).time || get(leg, 'arrival_time',  'arriving_at'))  || '',
    airline:      get(leg, 'airline', 'carrier', 'marketing_carrier') || '',
    flight:       get(leg, 'flight_number', 'flightNumber') || '',
    durationMins: leg.duration || 0,
    layoverMins:  i > 0 ? (layoverDurations[i - 1] || 0) : 0,
  }))

  const via = stops > 0 && segments.length > 1
    ? segments.slice(0, -1).map(s => s.to).filter(Boolean).join('+') || null
    : null

  const airlineName = get(first, 'airline', 'carrier', 'marketing_carrier') || get(offer, 'airline') || '—'

  return {
    id:            `apify-${get(offer, 'itineraryId', 'id') || Math.random().toString(36).slice(2)}`,
    airline:       typeof airlineName === 'object' ? (airlineName.name || '—') : airlineName,
    code:          extractCode(first.airline_logo || offer.airline_logo || ''),
    flightNumber:  segments.map(s => s.flight).filter(Boolean).join('+'),
    departure, arrival,
    duration:      durMins > 0 ? `${Math.floor(durMins / 60)}h ${durMins % 60}m` : '—',
    durationMins:  durMins,
    stops,
    via,
    segments,
    minLayoverMins: layoverDurations.length ? Math.min(...layoverDurations) : null,
    maxLayoverMins: layoverDurations.length ? Math.max(...layoverDurations) : null,
    price,
    currency,
    seatsLeft:     null,
    refundable:    false,
    changeable:    false,
    rating:        airlineRating(typeof airlineName === 'string' ? airlineName : ''),
    // Actor-provided deep link if present; otherwise the client builds a
    // canonical Google Flights URL (getBookUrl fallback in index.js)
    bookUrl:       get(offer, 'google_flights_url', 'googleFlightsUrl', 'deeplink', 'url'),
    googleFlightsUrl: get(offer, 'google_flights_url', 'googleFlightsUrl'),
    priceCategory: '',
    source:        'apify_google_flights',
  }
}

function extractCode(logoUrl) {
  const m = String(logoUrl).match(/\/([A-Z0-9]{2})\.png/)
  return m ? m[1] : ''
}

function airlineRating(name = '') {
  const ratings = {
    'Qatar Airways': 4.7, 'Singapore Airlines': 4.8, 'Emirates': 4.6,
    'Cathay Pacific': 4.6, 'ANA': 4.5, 'Japan Airlines': 4.5,
    'Etihad Airways': 4.4, 'Korean Air': 4.3, 'Lufthansa': 4.3,
    'British Airways': 4.2, 'Air France': 4.0, 'KLM': 4.1,
    'Air Canada': 3.9, 'Air India': 3.8, 'Turkish Airlines': 4.2,
    'WestJet': 3.7, 'United Airlines': 3.8, 'Delta Air Lines': 4.0,
    'American Airlines': 3.7, 'IndiGo': 3.6, 'SpiceJet': 3.4,
  }
  for (const [k, v] of Object.entries(ratings)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v
  }
  return 3.8
}
