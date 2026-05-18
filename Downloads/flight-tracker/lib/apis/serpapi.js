/**
 * SerpAPI — Google Flights data
 *
 * SerpAPI scrapes Google Flights in real-time and returns structured JSON.
 * This is the most reliable source for live flight prices.
 *
 * Sign up FREE: https://serpapi.com (100 free searches/month)
 * Paid plans start at $50/month for 5,000 searches
 *
 * Docs: https://serpapi.com/google-flights-api
 *
 * Env var: SERPAPI_KEY
 */

export async function searchGoogleFlights({
  origin, destination, date, returnDate,
  cabin, passengers, currency = 'CAD', minLayoverMins = 60,
}) {
  const key = process.env.SERPAPI_KEY
  if (!key || key.includes('YOUR_KEY')) return null

  const cabinMap = { economy: '1', premium_economy: '2', business: '3', first: '4' }

  const params = new URLSearchParams({
    engine:           'google_flights',
    api_key:          key,
    departure_id:     origin,
    arrival_id:       destination,
    outbound_date:    date,
    type:             returnDate ? '1' : '2', // 1=round, 2=one-way
    travel_class:     cabinMap[cabin] || '1',
    adults:           String(passengers),
    currency:         currency,
    hl:               'en',
    gl:               'ca',
    stops:            '0', // 0=any, 1=nonstop, 2=1stop, 3=2stops
  })

  if (returnDate) params.set('return_date', returnDate)

  try {
    const res  = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`)
    const data = await res.json()

    const flights = []

    // Best flights
    const allOffers = [
      ...(data.best_flights || []),
      ...(data.other_flights || []),
    ]

    for (const offer of allOffers) {
      try {
        const legs     = offer.flights || []
        if (!legs.length) continue

        const first    = legs[0]
        const last     = legs[legs.length - 1]
        const stops    = legs.length - 1

        // Validate layovers
        let validLayover = true
        const layovers = offer.layovers || []
        for (const lay of layovers) {
          const mins = lay.duration || 0
          if (mins < minLayoverMins) { validLayover = false; break }
        }
        if (!validLayover) continue

        const minLayover = layovers.length > 0
          ? Math.min(...layovers.map(l => l.duration || 999))
          : null

        const via = stops > 0
          ? legs.slice(0, -1).map(l => l.arrival_airport?.id || '').filter(Boolean).join('+')
          : null

        const durMins = offer.total_duration || 0
        const durH    = Math.floor(durMins / 60)
        const durM    = durMins % 60

        // SerpAPI returns prices in the requested currency
        // Only convert if response currency differs from requested
        const responseCurrency = data.search_parameters?.currency || 'USD'
        let price = offer.price || 0
        if (responseCurrency !== currency) {
          const rates = { USD:1.37, GBP:1.74, EUR:1.48, AED:0.37 }
          price = Math.round(price * (rates[responseCurrency] || 1))
        }

        const segments = legs.map((leg, i) => ({
          from:        leg.departure_airport?.id || '',
          to:          leg.arrival_airport?.id   || '',
          dep:         leg.departure_airport?.time?.slice(0, 5) || '',
          arr:         leg.arrival_airport?.time?.slice(0, 5)   || '',
          airline:     leg.airline || '',
          flight:      leg.flight_number || '',
          durationMins:leg.duration || 0,
          layoverMins: i > 0 ? (layovers[i-1]?.duration || 0) : 0,
        }))

        flights.push({
          id:            `serp-${first.flight_number || Math.random().toString(36).slice(2)}`,
          airline:       first.airline || '—',
          code:          first.airline_logo ? extractCode(first.airline_logo) : '',
          flightNumber:  legs.map(l => l.flight_number).filter(Boolean).join('+'),
          departure:     first.departure_airport?.time?.slice(0, 5) || '—',
          arrival:       last.arrival_airport?.time?.slice(0, 5)    || '—',
          duration:      `${durH}h ${durM}m`,
          durationMins:  durMins,
          stops,
          via,
          segments,
          minLayoverMins: minLayover,
          maxLayoverMins: layovers.length > 0 ? Math.max(...layovers.map(l => l.duration || 0)) : null,
          price,
          currency:      'CAD',
          seatsLeft:     null,
          refundable:    false,
          changeable:    false,
          rating:        airlineRating(first.airline),
          bookUrl:       buildGoogleFlightsUrl(origin, destination, date),
          priceCategory: '',
          source:        'serpapi_google_flights',
        })
      } catch {}
    }

    console.log(`[SerpAPI] ${flights.length} flights from Google Flights`)
    return flights.length > 0 ? flights : null

  } catch (err) {
    console.error('[SerpAPI] Error:', err.message)
    return null
  }
}

function buildGoogleFlightsUrl(origin, destination, date) {
  // Build a real Google Flights search URL for the specific route and date
  const d = date || ''
  return `https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI2LTEyLTE0agwIAxIIL2cvMTJrd3RyDAgDEggvZy8xMmtkeXABAWoA&curr=CAD&hl=en&q=flights+${origin}+to+${destination}+${d}`
}

function extractCode(logoUrl) {
  // e.g. https://www.gstatic.com/flights/airline_logos/70px/QR.png
  const m = logoUrl.match(/\/([A-Z]{2})\.png/)
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
    'American Airlines': 3.7,
  }
  for (const [k, v] of Object.entries(ratings)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v
  }
  return 3.8
}
