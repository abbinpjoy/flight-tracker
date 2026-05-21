/**
 * Duffel API Client
 *
 * Duffel returns LOCAL times without timezone offsets (e.g. "2026-12-14T00:05:00").
 * To compute accurate durations we convert each local time to UTC using the airport's
 * IANA timezone via Node.js Intl API (handles DST automatically, no external calls).
 */

// ── Airport IANA timezone lookup ─────────────────────────────────────────────
const AIRPORT_TZ = {
  // Canada
  YVR:'America/Vancouver', YYZ:'America/Toronto', YUL:'America/Toronto',
  YYC:'America/Edmonton',  YEG:'America/Edmonton', YOW:'America/Toronto',
  YHZ:'America/Halifax',   YWG:'America/Winnipeg',
  // USA
  LAX:'America/Los_Angeles', SFO:'America/Los_Angeles', SEA:'America/Los_Angeles',
  PDX:'America/Los_Angeles', LAS:'America/Los_Angeles', PHX:'America/Phoenix',
  JFK:'America/New_York',    EWR:'America/New_York',    BOS:'America/New_York',
  MIA:'America/New_York',    ATL:'America/New_York',    IAD:'America/New_York',
  ORD:'America/Chicago',     DFW:'America/Chicago',     MSP:'America/Chicago',
  DEN:'America/Denver',
  // UK & Ireland
  LHR:'Europe/London', LGW:'Europe/London', MAN:'Europe/London',
  DUB:'Europe/Dublin',
  // Europe
  CDG:'Europe/Paris',  ORY:'Europe/Paris',  AMS:'Europe/Amsterdam',
  FRA:'Europe/Berlin', MUC:'Europe/Berlin', BER:'Europe/Berlin',
  MAD:'Europe/Madrid', BCN:'Europe/Madrid', FCO:'Europe/Rome',
  MXP:'Europe/Rome',   ZRH:'Europe/Zurich', VIE:'Europe/Vienna',
  CPH:'Europe/Copenhagen', ARN:'Europe/Stockholm', HEL:'Europe/Helsinki',
  // Middle East
  DXB:'Asia/Dubai',    AUH:'Asia/Dubai',    DOH:'Asia/Qatar',
  BAH:'Asia/Bahrain',  KWI:'Asia/Kuwait',   MCT:'Asia/Muscat',
  AMM:'Asia/Amman',    BEY:'Asia/Beirut',   CAI:'Africa/Cairo',
  IST:'Europe/Istanbul', SAW:'Europe/Istanbul',
  // India
  DEL:'Asia/Kolkata',  BOM:'Asia/Kolkata',  MAA:'Asia/Kolkata',
  BLR:'Asia/Kolkata',  HYD:'Asia/Kolkata',  COK:'Asia/Kolkata',
  CCJ:'Asia/Kolkata',  TRV:'Asia/Kolkata',  CCU:'Asia/Kolkata',
  GOI:'Asia/Kolkata',  AMD:'Asia/Kolkata',  PNQ:'Asia/Kolkata',
  JAI:'Asia/Kolkata',  IXE:'Asia/Kolkata',  IXC:'Asia/Kolkata',
  // South/Southeast Asia
  CMB:'Asia/Colombo',  KTM:'Asia/Kathmandu', DAC:'Asia/Dhaka',
  KUL:'Asia/Kuala_Lumpur', SIN:'Asia/Singapore', BKK:'Asia/Bangkok',
  CGK:'Asia/Jakarta',  DPS:'Asia/Makassar',
  HAN:'Asia/Ho_Chi_Minh', SGN:'Asia/Ho_Chi_Minh',
  RGN:'Asia/Rangoon',  PNH:'Asia/Phnom_Penh', VTE:'Asia/Vientiane',
  // East Asia
  HKG:'Asia/Hong_Kong', MNL:'Asia/Manila',
  NRT:'Asia/Tokyo',  HND:'Asia/Tokyo',  KIX:'Asia/Tokyo',  CTS:'Asia/Tokyo',
  ICN:'Asia/Seoul',  GMP:'Asia/Seoul',
  PEK:'Asia/Shanghai', PVG:'Asia/Shanghai', CAN:'Asia/Shanghai',
  CTU:'Asia/Shanghai', SZX:'Asia/Shanghai',
  TPE:'Asia/Taipei',
  // Australia & NZ
  SYD:'Australia/Sydney',  MEL:'Australia/Melbourne', BNE:'Australia/Brisbane',
  PER:'Australia/Perth',   ADL:'Australia/Adelaide',  AKL:'Pacific/Auckland',
  // Africa
  JNB:'Africa/Johannesburg', CPT:'Africa/Johannesburg',
  NBO:'Africa/Nairobi',      ADD:'Africa/Addis_Ababa',
  LOS:'Africa/Lagos',        ACC:'Africa/Accra',
  CMN:'Africa/Casablanca',   TUN:'Africa/Tunis',
}

/**
 * Convert a Duffel local datetime string (no timezone) to UTC Date
 * using the airport's IANA timezone via Node.js Intl API.
 * Handles DST automatically.
 */
function localToUTC(localStr, iataCode) {
  if (!localStr) return null
  const tz = AIRPORT_TZ[iataCode] || 'UTC'

  // Treat the string as UTC first (naive date)
  const naive = new Date(localStr.includes('Z') || localStr.match(/[+-]\d{2}:\d{2}$/)
    ? localStr                 // already has offset info — use directly
    : localStr + 'Z')         // no offset — treat as UTC initially

  // If the timestamp already has timezone info, just return it directly
  if (localStr.includes('Z') || localStr.match(/[+-]\d{2}:\d{2}$/)) {
    return new Date(localStr)
  }

  // Get the UTC offset for this timezone at this approximate time using Intl
  // Trick: format the naive-UTC date in both UTC and target timezone, measure difference
  const utcStr = naive.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr  = naive.toLocaleString('en-US', { timeZone: tz })
  const offsetMs = new Date(utcStr) - new Date(tzStr) // positive = behind UTC (e.g. PST = +8h)

  // Real UTC = naive + offset
  return new Date(naive.getTime() + offsetMs)
}

/**
 * Compute flight segment duration in minutes using correct UTC conversion.
 * Falls back to parseDur(seg.duration) if timestamps unavailable.
 */
function segmentDurMins(seg, originCode, destCode) {
  if (seg.departing_at && seg.arriving_at) {
    const depUTC = localToUTC(seg.departing_at, originCode)
    const arrUTC = localToUTC(seg.arriving_at,  destCode)
    if (depUTC && arrUTC) {
      const diff = Math.round((arrUTC - depUTC) / 60000)
      if (diff > 0 && diff < 30 * 60) return diff // sanity: < 30 hours
    }
  }
  return parseDur(seg.duration)
}

function parseDur(d) {
  if (!d) return 0
  if (typeof d === 'number') return Math.round(d / 60)
  const m = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0) + Math.round(parseInt(m[3] || 0) / 60)
}

export class DuffelClient {
  constructor(accessToken) {
    this.token = accessToken
    this.base  = 'https://api.duffel.com'
  }

  async request(method, path, body = null, retries = 2) {
    const url = `${this.base}/air${path}`
    const opts = {
      method,
      headers: {
        'Authorization':  `Bearer ${this.token}`,
        'Duffel-Version': 'v2',
        'Content-Type':   'application/json',
        'Accept':         'application/json',
      },
    }
    if (body) opts.body = JSON.stringify(body)

    const res = await fetch(url, opts)

    if (!res.ok) {
      // On 429, read the ratelimit-reset header and wait before retrying
      if (res.status === 429 && retries > 0) {
        const resetAfter = parseInt(res.headers.get('ratelimit-reset') || '2', 10)
        const waitMs = Math.max(resetAfter * 1000, 2000) // at least 2s
        console.warn(`[Duffel] 429 rate limit — retrying in ${waitMs}ms (${retries} retries left)`)
        await new Promise(r => setTimeout(r, waitMs))
        return this.request(method, path, body, retries - 1)
      }

      let detail = `HTTP ${res.status}`
      try {
        const text = await res.text()
        const j = JSON.parse(text)
        detail = j.errors?.[0]?.message || j.errors?.[0]?.title || detail
      } catch {}
      throw new Error(`Duffel ${res.status}: ${detail}`)
    }

    // Guard against non-JSON responses (e.g. Cloudflare error pages)
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`Duffel non-JSON response: ${text.slice(0, 80)}`)
    }
  }

  async searchOffers({
    origin, destination, departureDate, returnDate,
    adults = 1, cabinClass = 'economy',
    minLayoverMins = 60, maxLayoverMins = null,
    currency = 'CAD',
  }) {
    // Duffel accepted cabin_class values
    const cabinMap = {
      economy:         'economy',
      premium_economy: 'premium_economy',
      business:        'business',
      first:           'first',
    }
    const cabin = cabinMap[cabinClass] || 'economy'

    const slices = [{ origin, destination, departure_date: departureDate }]
    if (returnDate) slices.push({ origin: destination, destination: origin, departure_date: returnDate })

    // Step 1: Create offer request
    let offerReq
    try {
      offerReq = await this.request('POST', '/offer_requests', {
        data: {
          slices,
          passengers: Array(Math.max(1, adults)).fill({ type: 'adult' }),
          cabin_class: cabin,
          return_offers: false,
          supplier_timeout: 14000,
        },
      })
    } catch (err) {
      throw new Error(`Duffel offer_request: ${err.message}`)
    }

    const requestId = offerReq.data?.id
    if (!requestId) throw new Error('Duffel: offer request returned no ID')

    // Step 2: Fetch offers
    let offersRes
    try {
      offersRes = await this.request('GET',
        `/offers?offer_request_id=${requestId}&sort=total_amount&limit=30`
      )
    } catch (err) {
      throw new Error(`Duffel offers fetch: ${err.message}`)
    }

    const raw = offersRes.data || []
    console.log(`[Duffel] Got ${raw.length} raw offers`)

    return this.normalizeOffers(raw, minLayoverMins, maxLayoverMins, currency)
  }

  normalizeOffers(offers, minLayoverMins, maxLayoverMins, outputCurrency) {
    const results = []

    for (const offer of offers) {
      try {
        const slice    = offer.slices?.[0]
        if (!slice) continue
        const segments = slice.segments || []
        if (!segments.length) continue

        const first = segments[0]
        const last  = segments[segments.length - 1]
        const stops = segments.length - 1

        // Validate layovers
        let minLay = Infinity, maxLay = 0, layoverOk = true
        for (let i = 0; i < segments.length - 1; i++) {
          const arr = new Date(segments[i].arriving_at)
          const dep = new Date(segments[i + 1].departing_at)
          const m   = (dep - arr) / 60000
          if (m < minLayoverMins) { layoverOk = false; break }
          if (maxLayoverMins && m > maxLayoverMins) { layoverOk = false; break }
          if (m < minLay) minLay = m
          if (m > maxLay) maxLay = m
        }
        if (!layoverOk) continue

        // Parse Duffel's ISO 8601 duration format (e.g. "PT16H30M")
        // Duffel returns LOCAL times without timezone offsets, so we cannot
        // subtract timestamps across different airport timezones.
        // Use Duffel's pre-computed duration for per-segment values.
        function parseDur(d) {
          if (!d) return 0
          if (typeof d === 'number') return Math.round(d / 60)
          const m = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
          if (!m) return 0
          return (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0) + Math.round(parseInt(m[3] || 0) / 60)
        }

        // Segments — durationMins computed via UTC conversion using airport timezones
        // Layovers from timestamp diff — valid because both timestamps are at same airport
        const segs = segments.map((seg, i) => {
          const fromCode = seg.origin?.iata_code      || seg.origin?.id      || ''
          const toCode   = seg.destination?.iata_code || seg.destination?.id || ''
          return {
            from:        fromCode,
            to:          toCode,
            dep:         seg.departing_at?.slice(11,16) || '',
            arr:         seg.arriving_at?.slice(11,16)  || '',
            airline:     seg.marketing_carrier?.name    || '',
            flight:      `${seg.marketing_carrier?.iata_code || ''}${seg.marketing_carrier_flight_designation || ''}`,
            durationMins: segmentDurMins(seg, fromCode, toCode),
            layoverMins: i > 0
              ? Math.round((new Date(seg.departing_at) - new Date(segments[i-1].arriving_at)) / 60000)
              : 0,
          }
        })

        // Total = sum of all segment flight times + all layovers
        // This is timezone-correct: each segment duration comes from Duffel's
        // pre-computed value, and layovers are same-airport timestamp diffs
        const segFlightMins  = segs.reduce((s, seg) => s + (seg.durationMins || 0), 0)
        const segLayoverMins = segs.reduce((s, seg) => s + (seg.layoverMins  || 0), 0)
        const durMins = segFlightMins + segLayoverMins || parseDur(slice.duration)
        const durStr  = durMins > 0 ? `${Math.floor(durMins/60)}h ${durMins%60}m` : '—'

        const via = stops > 0
          ? segments.slice(0,-1).map(s => s.destination?.iata_code || '').join('+')
          : null

        const airline  = first.marketing_carrier?.name || first.operating_carrier?.name || '—'
        const code     = first.marketing_carrier?.iata_code || '—'
        const rawPrice = parseFloat(offer.total_amount || 0)
        const rawCurr  = offer.total_currency || 'GBP'

        const rates    = { GBP:1.74, USD:1.37, EUR:1.48, AED:0.37, INR:0.016, SGD:1.01, AUD:0.89 }
        const price    = rawCurr === outputCurrency
          ? rawPrice
          : Math.round(rawPrice * (rates[rawCurr] || 1))

        results.push({
          id:            offer.id,
          airline,
          code,
          flightNumber:  segs.map(s => s.flight).filter(Boolean).join('+'),
          departure:     first.departing_at?.slice(11,16) || '—',
          arrival:       last.arriving_at?.slice(11,16)   || '—',
          duration:      durStr,
          durationMins:  durMins,
          stops,
          via,
          segments:      segs,
          minLayoverMins: stops > 0 && minLay !== Infinity ? Math.round(minLay) : null,
          maxLayoverMins: stops > 0 && maxLay > 0 ? Math.round(maxLay) : null,
          price,
          currency:      outputCurrency,
          seatsLeft:     offer.available_seats ?? null,
          refundable:    offer.conditions?.refund_before_departure?.allowed ?? false,
          changeable:    offer.conditions?.change_before_departure?.allowed ?? false,
          rating:        airlineRating(code),
          // /api/book will try to create a Duffel Links session for this offer ID
          // If that fails (test mode limitation), it falls back to Duffel-hosted search
          bookUrl:       null,
          offerId:       offer.id,
          expiresAt:     offer.expires_at,
          source:        'duffel',
        })
      } catch (e) {
        console.error('[Duffel] normalizeOffers row error:', e.message)
      }
    }

    console.log(`[Duffel] Normalized: ${results.length} valid offers from ${offers.length} raw`)
    return results.sort((a, b) => a.price - b.price)
  }
}

function airlineRating(code = '') {
  const r = {
    QR:4.7, SQ:4.8, EK:4.6, CX:4.6, NH:4.5, JL:4.5, EY:4.4,
    KE:4.3, LH:4.3, TK:4.2, BA:4.2, OZ:4.2, VS:4.3, MH:4.0,
    AF:4.0, GA:4.1, KL:4.1, AI:3.8, AC:3.9, UA:3.8, DL:4.0,
    AA:3.7, WS:3.7, TG:3.9, '6E':3.6, SG:3.4, FZ:3.6,
  }
  return r[code] || 3.8
}
