/**
 * Kiwi.com Tequila API
 *
 * Excellent for:
 * - Budget/low-cost carriers (IndiGo, SpiceJet, AirAsia, flydubai)
 * - Complex multi-city routes
 * - Finding cheapest combinations across airlines
 * - Often finds cheaper options than Google Flights
 *
 * Sign up FREE: https://tequila.kiwi.com
 * Go to: Solutions → Tequila → Create account → get API key
 * Free tier: unlimited searches in test mode
 *
 * Env var: KIWI_API_KEY
 */

export async function searchKiwi({
  origin, destination, date, returnDate,
  cabin, passengers, currency = 'CAD', minLayoverMins = 60, maxLayoverMins = null,
}) {
  const key = process.env.KIWI_API_KEY
  if (!key || key.includes('YOUR_KEY')) return null

  const cabinMap = { economy: 'M', premium_economy: 'W', business: 'C', first: 'F' }

  // Date range: search ±0 days (exact date)
  const d     = new Date(date)
  const dStr  = d.toISOString().slice(0, 10)

  const params = new URLSearchParams({
    fly_from:        origin,
    fly_to:          destination,
    date_from:       dStr,
    date_to:         dStr,
    adults:          String(passengers),
    selected_cabins: cabinMap[cabin] || 'M',
    curr:            currency,
    max_stopovers:   '3',
    limit:           '20',
    sort:            'price',
    asc:             '1',
    flight_type:     returnDate ? 'round' : 'oneway',
    ...(minLayoverMins > 0 ? { stopover_from: `${Math.floor(minLayoverMins/60)}:${String(minLayoverMins%60).padStart(2,'0')}` } : {}),
    ...(maxLayoverMins    ? { stopover_to:   `${Math.floor(maxLayoverMins/60)}:${String(maxLayoverMins%60).padStart(2,'0')}` } : {}),
  })

  if (returnDate) {
    params.set('return_from', returnDate)
    params.set('return_to',   returnDate)
  }

  try {
    const res = await fetch(`https://tequila.kiwi.com/v2/search?${params}`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) throw new Error(`Kiwi ${res.status}: ${await res.text()}`)
    const data = await res.json()

    if (!data.data?.length) {
      console.log('[Kiwi] No results')
      return null
    }

    const flights = []

    for (const offer of data.data) {
      try {
        const routes   = offer.route || []
        if (!routes.length) continue

        const first    = routes[0]
        const last     = routes[routes.length - 1]
        const stops    = routes.length - 1

        // Validate layovers
        let validLayover = true
        let minLay = Infinity
        let maxLay = 0

        for (let i = 0; i < routes.length - 1; i++) {
          const arrTs  = routes[i].utc_arrival
          const depTs  = routes[i + 1].utc_departure
          const layMin = Math.round((new Date(depTs) - new Date(arrTs)) / 60000)
          if (layMin < minLayoverMins) { validLayover = false; break }
          if (maxLayoverMins && layMin > maxLayoverMins) { validLayover = false; break }
          if (layMin < minLay) minLay = layMin
          if (layMin > maxLay) maxLay = layMin
        }
        if (!validLayover) continue

        const durMins = Math.round(offer.duration?.departure / 60) || 0
        const durH    = Math.floor(durMins / 60)
        const durM    = durMins % 60

        const via = stops > 0
          ? routes.slice(0, -1).map(r => r.flyTo).join('+')
          : null

        const segments = routes.map((r, i) => ({
          from:        r.flyFrom,
          to:          r.flyTo,
          dep:         new Date(r.local_departure).toISOString().slice(11, 16),
          arr:         new Date(r.local_arrival).toISOString().slice(11, 16),
          airline:     r.airline,
          flight:      `${r.airline}${r.flight_no}`,
          durationMins:Math.round(r.duration / 60),
          layoverMins: i > 0 ? Math.round((new Date(r.utc_departure) - new Date(routes[i-1].utc_arrival)) / 60000) : 0,
        }))

        // Calculate arrival day offset
        const depTime = new Date(first.local_departure)
        const arrTime = new Date(last.local_arrival)
        const dayDiff = Math.floor((arrTime - depTime) / 86400000)
        const arrStr  = `${arrTime.toISOString().slice(11,16)}${dayDiff > 0 ? `+${dayDiff}` : ''}`

        flights.push({
          id:            `kiwi-${offer.id}`,
          airline:       first.airline,
          code:          first.airline,
          flightNumber:  routes.map(r => `${r.airline}${r.flight_no}`).join('+'),
          departure:     new Date(first.local_departure).toISOString().slice(11, 16),
          arrival:       arrStr,
          duration:      `${durH}h ${durM}m`,
          durationMins:  durMins,
          stops,
          via,
          segments,
          minLayoverMins: stops > 0 && minLay !== Infinity ? minLay : null,
          maxLayoverMins: stops > 0 && maxLay > 0 ? maxLay : null,
          price:         Math.round(offer.price),
          currency:      currency,
          seatsLeft:     offer.availability?.seats || null,
          refundable:    false,
          changeable:    false,
          rating:        airlineRating(first.airline),
          bookUrl:       offer.deep_link || `https://www.kiwi.com`,
          priceCategory: '',
          source:        'kiwi',
        })
      } catch {}
    }

    console.log(`[Kiwi] ${flights.length} valid flights`)
    return flights.length > 0 ? flights : null

  } catch (err) {
    console.error('[Kiwi] Error:', err.message)
    return null
  }
}

function airlineRating(code = '') {
  const ratings = {
    QR:4.7, SQ:4.8, EK:4.6, CX:4.6, NH:4.5, JL:4.5, EY:4.4,
    KE:4.3, LH:4.3, TK:4.2, BA:4.2, OZ:4.2, VS:4.3, MH:4.0,
    AF:4.0, GA:4.1, KL:4.1, AI:3.8, AC:3.9, UA:3.8, DL:4.0,
    AA:3.7, WS:3.7, TG:3.9, '6E':3.6, SG:3.4, IX:3.4, AK:3.5,
    FZ:3.6, G8:3.2, FR:3.0, VY:3.4, U2:3.3,
  }
  return ratings[code] || 3.7
}
