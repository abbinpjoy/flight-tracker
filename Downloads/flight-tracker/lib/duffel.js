/**
 * Duffel API Client
 * The best Amadeus alternative — real NDC content, live bookable fares,
 * 300+ airlines, no fixed airline list.
 *
 * Sign up FREE: https://app.duffel.com/join
 * Docs: https://duffel.com/docs/api
 *
 * Key advantages over Amadeus:
 * - Modern REST API, no SOAP
 * - Real-time availability from airlines directly
 * - Covers budget airlines (Ryanair, easyJet, IndiGo, etc.)
 * - No per-search fees on test mode
 * - Layover filtering built-in
 */

export class DuffelClient {
  constructor(accessToken) {
    this.token   = accessToken
    this.base    = 'https://api.duffel.com'
    this.version = 'v1'
  }

  async request(method, path, body = null) {
    const res = await fetch(`${this.base}/${this.version}${path}`, {
      method,
      headers: {
        'Authorization':    `Bearer ${this.token}`,
        'Duffel-Version':   'v1',
        'Content-Type':     'application/json',
        'Accept':           'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ errors: [{ message: res.statusText }] }))
      const msg = err.errors?.[0]?.message || `HTTP ${res.status}`
      throw new Error(`Duffel API: ${msg}`)
    }
    return res.json()
  }

  /**
   * Search for offer requests — Duffel's equivalent of flight search.
   * Returns ALL available offers from all airlines on the route.
   */
  async searchOffers({
    origin,
    destination,
    departureDate,
    returnDate,
    adults       = 1,
    cabinClass   = 'economy',   // economy | premium_economy | business | first
    maxLayoverMins = null,      // null = no limit; e.g. 180 for max 3h layover
    minLayoverMins = 60,        // minimum layover in minutes (default 1hr)
    currency     = 'CAD',
  }) {
    const slices = [
      { origin, destination, departure_date: departureDate },
    ]
    if (returnDate) {
      slices.push({ origin: destination, destination: origin, departure_date: returnDate })
    }

    // Create offer request
    const offerReq = await this.request('POST', '/air/offer_requests', {
      data: {
        slices,
        passengers: [{ type: 'adult' }].concat(
          Array(Math.max(0, adults - 1)).fill({ type: 'adult' })
        ),
        cabin_class:       cabinClass,
        return_offers:     false,
        supplier_timeout:  16000,
      },
    })

    const requestId = offerReq.data?.id
    if (!requestId) throw new Error('Duffel: no offer request ID returned')

    // Fetch offers for this request
    const offersRes = await this.request('GET',
      `/air/offers?offer_request_id=${requestId}&sort=total_amount&limit=50&currency=${currency}`
    )

    const rawOffers = offersRes.data || []
    return this.normalizeOffers(rawOffers, minLayoverMins, maxLayoverMins, currency)
  }

  normalizeOffers(offers, minLayoverMins, maxLayoverMins, currency) {
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

        // ── Layover validation ────────────────────────────────────────
        let minLayover = Infinity
        let maxLayover = 0
        let layoverValid = true

        for (let i = 0; i < segments.length - 1; i++) {
          const arrTime  = new Date(segments[i].arriving_at)
          const depTime  = new Date(segments[i + 1].departing_at)
          const layMins  = (depTime - arrTime) / 60000

          if (layMins < minLayoverMins) { layoverValid = false; break }
          if (maxLayoverMins && layMins > maxLayoverMins) { layoverValid = false; break }
          if (layMins < minLayover) minLayover = layMins
          if (layMins > maxLayover) maxLayover = layMins
        }

        if (!layoverValid) continue

        // ── Duration ──────────────────────────────────────────────────
        const durMins = Math.round(slice.duration / 60) // Duffel gives seconds
        const durH    = Math.floor(durMins / 60)
        const durM    = durMins % 60
        const durStr  = `${durH}h ${durM}m`

        // ── Via airports ──────────────────────────────────────────────
        const via = stops > 0
          ? segments.slice(0, -1).map(s => s.destination.iata_code).join('+')
          : null

        // ── Airline name ──────────────────────────────────────────────
        const airline = first.marketing_carrier?.name || first.operating_carrier?.name || first.marketing_carrier?.iata_code || '—'
        const code    = first.marketing_carrier?.iata_code || '—'

        // ── Price ─────────────────────────────────────────────────────
        const price    = parseFloat(offer.total_amount)
        const currency = offer.total_currency || currency

        // ── Book URL ──────────────────────────────────────────────────
        const bookUrl = `https://www.duffel.com` // In production use offer booking flow

        results.push({
          id:           offer.id,
          airline,
          code,
          flightNumber: `${code}${first.marketing_carrier_flight_designation || ''}`,
          aircraft:     first.aircraft?.name || '',
          departure:    first.departing_at?.slice(11, 16) || '—',
          arrival:      last.arriving_at?.slice(11, 16)   || '—',
          departureDate:first.departing_at?.slice(0, 10)  || '',
          arrivalDate:  last.arriving_at?.slice(0, 10)    || '',
          duration:     durStr,
          durationMins: durMins,
          stops,
          via,
          minLayoverMins: stops > 0 ? Math.round(minLayover) : null,
          maxLayoverMins: stops > 0 ? Math.round(maxLayover) : null,
          price,
          currency,
          seatsLeft:    offer.available_seats ?? 9,
          refundable:   offer.conditions?.refund_before_departure?.allowed ?? false,
          changeable:   offer.conditions?.change_before_departure?.allowed ?? false,
          cabinClass:   first.passengers?.[0]?.cabin_class || 'economy',
          bookUrl,
          source:       'duffel',
          offerId:      offer.id,
          expiresAt:    offer.expires_at,
        })
      } catch {}
    }

    return results.sort((a, b) => a.price - b.price)
  }
}
