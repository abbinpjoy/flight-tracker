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
          bookUrl:       buildGoogleFlightsUrl(origin, destination, date, offer.booking_token, first.airline, first.flight_number),
          bookingToken:  offer.booking_token || null,
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

function buildGoogleFlightsUrl(origin, destination, date, bookingToken, airline, flightNo) {
  // If SerpAPI returned a booking token, use it — this opens the exact flight on Google Flights
  if (bookingToken) {
    return `https://www.google.com/travel/flights?tfs=${bookingToken}&curr=CAD&hl=en`
  }

  // Format date for Google Flights URL (YYYY-MM-DD)
  const d = date || ''

  // Airline-specific direct booking deep links with route pre-filled
  const airlineName = (airline || '').toLowerCase()
  const fNo = (flightNo || '').replace(/\s/g, '')

  if (airlineName.includes('qatar'))
    return `https://www.qatarairways.com/en-ca/flights/find-flights.html?bookingClass=E&tripType=O&from=${origin}&to=${destination}&departing=${d}&adults=1&teenager=0&children=0&infants=0&flexibleDate=off`
  if (airlineName.includes('emirates'))
    return `https://www.emirates.com/ca/english/book/flights/#/searchFlights?from=${origin}&to=${destination}&departureDate=${d}&adults=1&children=0&infants=0&cabinClass=economy&tripType=oneway`
  if (airlineName.includes('etihad'))
    return `https://www.etihad.com/en-ca/book/flights?tripType=OneWay&from=${origin}&to=${destination}&departureDate=${d}&adults=1&children=0&infants=0&cabin=economy`
  if (airlineName.includes('air india'))
    return `https://www.airindia.com/book-flights.htm?origin=${origin}&destination=${destination}&departDate=${d}&adults=1&children=0&infants=0&class=E&tripType=O`
  if (airlineName.includes('singapore'))
    return `https://www.singaporeair.com/en_UK/ppsb/travelshop/flight-search.form?tripType=O&departureCity=${origin}&arrivalCity=${destination}&departureDate=${d}&adults=1&cabinClass=Y`
  if (airlineName.includes('lufthansa'))
    return `https://www.lufthansa.com/ca/en/flight-search?origin=${origin}&destination=${destination}&outboundDate=${d}&adults=1&cabinClass=economy&tripType=ONE_WAY`
  if (airlineName.includes('british airways') || airlineName.includes('ba '))
    return `https://www.britishairways.com/travel/book/public/en_ca?eId=106002&from=${origin}&to=${destination}&depart=${d}&class=M&adult=1&child=0&infant=0`
  if (airlineName.includes('air canada'))
    return `https://www.aircanada.com/ca/en/aco/home.html#/search?org0=${origin}&dest0=${destination}&departDate0=${d}&ADT=1&YTH=0&CHD=0&INF=0&INS=0&lang=en-CA&tripType=O&cabin=lowest`
  if (airlineName.includes('klm'))
    return `https://www.klm.com/travel/ca_en/apps/ebt/ebt_home.htm?lang=en&selectedJourney=ONE_WAY&origin=${origin}&destination=${destination}&outboundDate=${d}&adults=1&cabin=Economy`
  if (airlineName.includes('air france'))
    return `https://www.airfrance.ca/en/flight-search?pax=1:0:0:0:0:0:0:0&cabin=EC&tripType=ONE_WAY&segments=0::${origin}:${destination}:${d}`
  if (airlineName.includes('turkish'))
    return `https://www.turkishairlines.com/en-ca/flights/?fromPort=${origin}&toPort=${destination}&tripType=O&departure=${d}&adult=1&child=0&infant=0&cabin=Economy`
  if (airlineName.includes('cathay'))
    return `https://www.cathaypacific.com/cx/en_CA/book-a-trip/flights/overview.html?origin=${origin}&destination=${destination}&departureDate=${d}&tripType=oneWay&adults=1`

  // Fallback: Google Flights search with origin, destination and date pre-filled
  return `https://www.google.com/travel/flights/search?q=flights+from+${origin}+to+${destination}&tfs=CBwQAhooagwIAxIIL2cvMTJrd3QSCjIwMjYtMTItMTRyDAgDEggvZy8xMmtkeXABAWoA&curr=CAD&hl=en&gl=ca`
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
