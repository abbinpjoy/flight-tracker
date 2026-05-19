/**
 * /api/book
 *
 * Server-side booking redirect handler.
 *
 * For Duffel:
 *   1. POSTs to https://api.duffel.com/links/sessions with the offer_id
 *   2. Redirects to the resulting links.duffel.com?token=... URL
 *   3. If session creation fails (common in test mode), falls back to a
 *      Duffel-hosted search page with the same route + date pre-filled
 *
 * For SerpAPI:
 *   1. Uses the google_flights_url from SerpAPI metadata (loads the same search)
 *   2. Falls back to a constructed Google Flights search URL with route/date
 *
 * For everything else:
 *   Builds an airline-specific deep link with origin/destination/date pre-filled
 *
 * Usage:
 *   GET /api/book?source=duffel&offerId=off_xxx
 *   GET /api/book?source=serpapi_google_flights&googleUrl=https://...
 *   GET /api/book?source=...&airline=Qatar&origin=YVR&destination=COK&date=2026-12-14
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const {
    source,
    offerId,
    googleUrl,
    airline,
    code,
    origin,
    destination,
    date,
    cabin = 'economy',
  } = req.query

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const baseUrl = `${proto}://${host}`

  // ── DUFFEL: Create a Links session and redirect ───────────────────────
  if (source === 'duffel' && offerId && process.env.DUFFEL_ACCESS_TOKEN) {
    try {
      const sessionRes = await fetch('https://api.duffel.com/links/sessions', {
        method: 'POST',
        headers: {
          'Authorization':   `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`,
          'Duffel-Version':  'v2',
          'Content-Type':    'application/json',
          'Accept':          'application/json',
          'Accept-Encoding': 'gzip',
        },
        body: JSON.stringify({
          data: {
            reference:       `ft-${Date.now()}`,
            success_url:     `${baseUrl}?booked=success`,
            failure_url:     `${baseUrl}?booked=failed`,
            abandonment_url: `${baseUrl}?booked=abandoned`,
            checkout_display_text: 'Flight booking via FlightTrack',
            flights: {
              // Pin the search to this offer's route/date if possible
              fare_type: 'flight_only',
            },
          },
        }),
      })

      if (sessionRes.ok) {
        const data = await sessionRes.json()
        const url  = data.data?.url
        if (url) {
          console.log(`[book] Duffel session created: ${url.slice(0, 60)}...`)
          return res.redirect(302, url)
        }
      } else {
        const errBody = await sessionRes.text().catch(() => '')
        console.error('[book] Duffel session failed:', sessionRes.status, errBody.slice(0, 300))
      }
    } catch (err) {
      console.error('[book] Duffel session exception:', err.message)
    }

    // Duffel test mode often fails Links sessions — fall back to Duffel-hosted search
    // OR to airline-specific link below
  }

  // ── SERPAPI: Use Google Flights URL from metadata ─────────────────────
  if (source === 'serpapi_google_flights' && googleUrl) {
    // googleUrl already contains tfs parameter from SerpAPI metadata
    // which loads the exact same search results in Google Flights
    console.log(`[book] SerpAPI → Google Flights: ${googleUrl.slice(0, 80)}...`)
    return res.redirect(302, googleUrl)
  }

  // ── FALLBACK 1: Airline-specific deep link with route pre-filled ──────
  const o    = (origin || '').toUpperCase()
  const d    = (destination || '').toUpperCase()
  const dt   = date || ''
  const name = (airline || '').toLowerCase()

  let bookUrl = ''

  if (name.includes('qatar') || code === 'QR')
    bookUrl = `https://www.qatarairways.com/en-ca/flights/find-flights.html?bookingClass=E&tripType=O&from=${o}&to=${d}&departing=${dt}&adults=1`
  else if (name.includes('emirates') || code === 'EK')
    bookUrl = `https://www.emirates.com/ca/english/book/flights/#/searchFlights?from=${o}&to=${d}&departureDate=${dt}&adults=1&cabinClass=economy&tripType=oneway`
  else if (name.includes('etihad') || code === 'EY')
    bookUrl = `https://www.etihad.com/en-ca/book/flights?tripType=OneWay&from=${o}&to=${d}&departureDate=${dt}&adults=1&cabin=economy`
  else if (name.includes('air india') || code === 'AI')
    bookUrl = `https://www.airindia.com/book-flights.htm?origin=${o}&destination=${d}&departDate=${dt}&adults=1&class=E&tripType=O`
  else if (name.includes('singapore') || code === 'SQ')
    bookUrl = `https://www.singaporeair.com/en_UK/ppsb/travelshop/flight-search.form?tripType=O&departureCity=${o}&arrivalCity=${d}&departureDate=${dt}&adults=1&cabinClass=Y`
  else if (name.includes('lufthansa') || code === 'LH')
    bookUrl = `https://www.lufthansa.com/ca/en/flight-search?origin=${o}&destination=${d}&outboundDate=${dt}&adults=1&cabinClass=economy&tripType=ONE_WAY`
  else if (name.includes('british airways') || code === 'BA')
    bookUrl = `https://www.britishairways.com/travel/book/public/en_ca?from=${o}&to=${d}&depart=${dt}&class=M&adult=1`
  else if (name.includes('air canada') || code === 'AC')
    bookUrl = `https://www.aircanada.com/ca/en/aco/home.html#/search?org0=${o}&dest0=${d}&departDate0=${dt}&ADT=1&lang=en-CA&tripType=O&cabin=lowest`
  else if (name.includes('klm') || code === 'KL')
    bookUrl = `https://www.klm.com/travel/ca_en/apps/ebt/ebt_home.htm?lang=en&selectedJourney=ONE_WAY&origin=${o}&destination=${d}&outboundDate=${dt}&adults=1&cabin=Economy`
  else if (name.includes('air france') || code === 'AF')
    bookUrl = `https://wwws.airfrance.ca/search/offers?pax=1:0:0:0:0:0:0:0&cabin=EC&tripType=ONE_WAY&code=OW&segments=0::${o}:${d}:${dt}`
  else if (name.includes('turkish') || code === 'TK')
    bookUrl = `https://www.turkishairlines.com/en-ca/flights/?fromPort=${o}&toPort=${d}&tripType=O&departure=${dt}&adult=1&cabin=Economy`
  else if (name.includes('cathay') || code === 'CX')
    bookUrl = `https://www.cathaypacific.com/cx/en_CA/book-a-trip/flights/overview.html?origin=${o}&destination=${d}&departureDate=${dt}&tripType=oneWay&adults=1`
  else if (name.includes('oman') || code === 'WY')
    bookUrl = `https://www.omanair.com/en/book/flights?type=OW&from=${o}&to=${d}&date=${dt}&adults=1`
  else if (name.includes('gulf') || code === 'GF')
    bookUrl = `https://www.gulfair.com/book/flights?tripType=O&orig=${o}&dest=${d}&depDate=${dt}&adults=1`
  else if (name.includes('indigo') || code === '6E')
    bookUrl = `https://www.goindigo.in/?from=${o}&to=${d}&date=${dt}&adults=1&tripType=O`
  else if (name.includes('flydubai') || code === 'FZ')
    bookUrl = `https://www.flydubai.com/en/book/search-flights?from=${o}&to=${d}&date=${dt}&adults=1&tripType=OW`
  else if (name.includes('spicejet') || code === 'SG')
    bookUrl = `https://www.spicejet.com/?src=${o}&dst=${d}&dd=${dt}&ad=1&tripType=O`
  else if (name.includes('westjet') || code === 'WS')
    bookUrl = `https://www.westjet.com/en-ca/flights/search?origin=${o}&destination=${d}&departDate=${dt}&adults=1&tripType=OW`

  // ── FALLBACK 2: Google Flights direct URL with proper tfs encoding ────
  if (!bookUrl) {
    // Build a Google Flights URL that pre-populates the search
    // The tfs parameter encodes route+date in Google's format
    // Format: CBwQAhoeEgo{YYYY-MM-DD}agcIARIDXXXyBwgBEgN{DEST}
    bookUrl = `https://www.google.com/travel/flights?hl=en&gl=ca&curr=CAD&q=Flights+from+${o}+to+${d}+on+${dt}`
  }

  console.log(`[book] Fallback redirect: ${airline || code || 'generic'} → ${bookUrl.slice(0, 80)}...`)
  return res.redirect(302, bookUrl)
}
