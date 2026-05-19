/**
 * Duffel API Client — fixed version
 *
 * Fixes:
 * - cabin_class mapping (Duffel uses 'economy' | 'premium_economy' | 'business' | 'first')
 * - currency variable shadowing in normalizeOffers
 * - better error detail logging
 * - supplier_timeout reduced to avoid Duffel's own 15s limit
 */

export class DuffelClient {
  constructor(accessToken) {
    this.token = accessToken
    this.base  = 'https://api.duffel.com'
  }

  async request(method, path, body = null) {
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
      let detail = `HTTP ${res.status}`
      try {
        const j = await res.json()
        detail = j.errors?.[0]?.message || j.errors?.[0]?.title || detail
      } catch {}
      throw new Error(`Duffel ${res.status}: ${detail}`)
    }
    return res.json()
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

        // Duration — Duffel returns seconds
        const durMins = Math.round((slice.duration || 0) / 60)
        const durStr  = `${Math.floor(durMins/60)}h ${durMins%60}m`

        const via = stops > 0
          ? segments.slice(0,-1).map(s => s.destination?.iata_code || '').join('+')
          : null

        const airline  = first.marketing_carrier?.name || first.operating_carrier?.name || '—'
        const code     = first.marketing_carrier?.iata_code || '—'
        const rawPrice = parseFloat(offer.total_amount || 0)
        const rawCurr  = offer.total_currency || 'GBP'

        // Convert to CAD if needed
        const rates    = { GBP:1.74, USD:1.37, EUR:1.48, AED:0.37, INR:0.016, SGD:1.01, AUD:0.89 }
        const price    = rawCurr === outputCurrency
          ? rawPrice
          : Math.round(rawPrice * (rates[rawCurr] || 1))

        // Segments for timeline display
        const segs = segments.map((seg, i) => ({
          from:        seg.origin?.iata_code      || seg.origin?.id      || '',
          to:          seg.destination?.iata_code || seg.destination?.id || '',
          dep:         seg.departing_at?.slice(11,16) || '',
          arr:         seg.arriving_at?.slice(11,16)  || '',
          airline:     seg.marketing_carrier?.name    || '',
          flight:      `${seg.marketing_carrier?.iata_code || ''}${seg.marketing_carrier_flight_designation || ''}`,
          durationMins:Math.round((seg.duration || 0) / 60),
          layoverMins: i > 0
            ? Math.round((new Date(seg.departing_at) - new Date(segments[i-1].arriving_at)) / 60000)
            : 0,
        }))

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
