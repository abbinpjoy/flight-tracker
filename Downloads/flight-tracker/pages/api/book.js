/**
 * /api/book — server-side booking redirect
 *
 * DUFFEL:
 *   POST /links/sessions with exact format from Duffel docs
 *   → redirect to links.duffel.com?token=...  (Duffel hosted checkout)
 *   → if session fails, redirect to airline site with route pre-filled
 *
 * SERPAPI:
 *   → redirect to google_flights_url from SerpAPI metadata
 *
 * Add ?debug=1 to see the raw Duffel error instead of redirecting
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const {
    source, offerId, googleUrl,
    airline = '', code = '', flightNumber = '',
    origin = '', destination = '', date = '',
    cabin = 'economy', debug = '',
  } = req.query

  const o    = origin.toUpperCase().trim()
  const d    = destination.toUpperCase().trim()
  const dt   = date.trim()
  const name = airline.toLowerCase()
  const ac   = code.toUpperCase()

  // ── DUFFEL: Create a Links session ──────────────────────────────────
  if (source === 'duffel' && offerId) {
    const token = process.env.DUFFEL_ACCESS_TOKEN
    if (!token) {
      return res.status(500).json({ error: 'DUFFEL_ACCESS_TOKEN not set' })
    }

    const proto = req.headers['x-forwarded-proto'] || 'https'
    const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
    const base  = `${proto}://${host}`

    // Exact body format from Duffel documentation
    const body = {
      data: {
        reference:       `ft-${Date.now()}`,
        success_url:     `${base}?booked=success`,
        failure_url:     `${base}?booked=failed`,
        abandonment_url: `${base}?booked=abandoned`,
        flights: {
          enabled: true,   // boolean not string — "true" breaks it
        },
        stays: {
          enabled: false,
        },
      },
    }

    let sessionStatus, sessionBody
    try {
      const sessionRes = await fetch('https://api.duffel.com/links/sessions', {
        method: 'POST',
        headers: {
          'Authorization':   `Bearer ${token}`,
          'Duffel-Version':  'v2',
          'Content-Type':    'application/json',
          'Accept':          'application/json',
          'Accept-Encoding': 'gzip',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })

      sessionStatus = sessionRes.status
      sessionBody   = await sessionRes.text()

      if (sessionRes.ok) {
        const json = JSON.parse(sessionBody)
        const url  = json?.data?.url
        if (url) {
          console.log(`[book/duffel] Session OK → ${url.slice(0, 70)}`)
          return res.redirect(302, url)
        }
        if (debug) return res.json({ error: 'No URL in response', body: json })
      } else {
        console.warn(`[book/duffel] Session ${sessionStatus}: ${sessionBody.slice(0, 300)}`)
        // Return error details in debug mode so you can see exactly what Duffel says
        if (debug) {
          return res.status(sessionStatus).json({
            error:        'Duffel session failed',
            status:       sessionStatus,
            duffel_error: JSON.parse(sessionBody),
            request_body: body,
          })
        }
      }
    } catch (e) {
      console.warn(`[book/duffel] Exception: ${e.message}`)
      if (debug) return res.status(500).json({ error: e.message })
    }

    // Session failed — fall through to airline deep link
    console.log(`[book/duffel] Falling back to airline deep link (${airline}/${ac})`)
  }

  // ── SERPAPI: Exact Google Flights URL from SerpAPI metadata ─────────
  if (source === 'serpapi_google_flights') {
    const gUrl = googleUrl ? decodeURIComponent(googleUrl) : ''
    if (gUrl.startsWith('https://www.google.com/travel/flights')) {
      return res.redirect(302, gUrl)
    }
    return res.redirect(302,
      `https://www.google.com/travel/flights?hl=en&gl=ca&curr=CAD&q=Flights+from+${o}+to+${d}+on+${dt}`)
  }

  // ── AIRLINE DEEP LINKS (route + date pre-filled) ────────────────────

  if (name.includes('qatar') || ac === 'QR')
    return res.redirect(302,
      `https://www.qatarairways.com/en-ca/flights/find-flights.html?bookingClass=E&tripType=O&from=${o}&to=${d}&departing=${dt}&adults=1&flexibleDate=off`)

  if (name.includes('emirates') || ac === 'EK')
    return res.redirect(302,
      `https://www.emirates.com/ca/english/book/flights/#/searchFlights?from=${o}&to=${d}&departureDate=${dt}&adults=1&cabinClass=economy&tripType=oneway`)

  if (name.includes('etihad') || ac === 'EY')
    return res.redirect(302,
      `https://www.etihad.com/en-ca/book/flights?tripType=OneWay&from=${o}&to=${d}&departureDate=${dt}&adults=1&cabin=economy`)

  if (name.includes('air india') || ac === 'AI')
    return res.redirect(302,
      `https://www.airindia.com/book-flights.htm?origin=${o}&destination=${d}&departDate=${dt}&adults=1&class=E&tripType=O`)

  if (name.includes('singapore') || ac === 'SQ')
    return res.redirect(302,
      `https://www.singaporeair.com/en_UK/ppsb/travelshop/flight-search.form?tripType=O&departureCity=${o}&arrivalCity=${d}&departureDate=${dt}&adults=1&cabinClass=Y`)

  if (name.includes('lufthansa') || ac === 'LH')
    return res.redirect(302,
      `https://www.lufthansa.com/ca/en/flight-search?origin=${o}&destination=${d}&outboundDate=${dt}&adults=1&cabinClass=economy&tripType=ONE_WAY`)

  if (name.includes('british airways') || ac === 'BA')
    return res.redirect(302,
      `https://www.britishairways.com/travel/book/public/en_ca?from=${o}&to=${d}&depart=${dt}&class=M&adult=1`)

  if (name.includes('air canada') || ac === 'AC')
    return res.redirect(302,
      `https://www.aircanada.com/ca/en/aco/home.html#/search?org0=${o}&dest0=${d}&departDate0=${dt}&ADT=1&lang=en-CA&tripType=O&cabin=lowest`)

  if (name.includes('klm') || ac === 'KL')
    return res.redirect(302,
      `https://www.klm.com/travel/ca_en/apps/ebt/ebt_home.htm?lang=en&selectedJourney=ONE_WAY&origin=${o}&destination=${d}&outboundDate=${dt}&adults=1`)

  if (name.includes('air france') || ac === 'AF')
    return res.redirect(302,
      `https://wwws.airfrance.ca/search/offers?pax=1:0:0:0:0:0:0:0&cabin=EC&tripType=ONE_WAY&code=OW&segments=0::${o}:${d}:${dt}`)

  if (name.includes('turkish') || ac === 'TK')
    return res.redirect(302,
      `https://www.turkishairlines.com/en-ca/flights/?fromPort=${o}&toPort=${d}&tripType=O&departure=${dt}&adult=1&cabin=Economy`)

  if (name.includes('cathay') || ac === 'CX')
    return res.redirect(302,
      `https://www.cathaypacific.com/cx/en_CA/book-a-trip/flights/overview.html?origin=${o}&destination=${d}&departureDate=${dt}&tripType=oneWay&adults=1`)

  if (name.includes('oman') || ac === 'WY')
    return res.redirect(302,
      `https://www.omanair.com/en/book/flights?type=OW&from=${o}&to=${d}&date=${dt}&adults=1`)

  if (name.includes('gulf air') || ac === 'GF')
    return res.redirect(302,
      `https://www.gulfair.com/book/flights?tripType=O&orig=${o}&dest=${d}&depDate=${dt}&adults=1`)

  if (name.includes('indigo') || ac === '6E')
    return res.redirect(302,
      `https://www.goindigo.in/?from=${o}&to=${d}&date=${dt}&adults=1&tripType=O`)

  if (name.includes('flydubai') || ac === 'FZ')
    return res.redirect(302,
      `https://www.flydubai.com/en/book/search-flights?from=${o}&to=${d}&date=${dt}&adults=1&tripType=OW`)

  if (name.includes('spicejet') || ac === 'SG')
    return res.redirect(302,
      `https://www.spicejet.com/?src=${o}&dst=${d}&dd=${dt}&ad=1&tripType=O`)

  if (name.includes('westjet') || ac === 'WS')
    return res.redirect(302,
      `https://www.westjet.com/en-ca/flights/search?origin=${o}&destination=${d}&departDate=${dt}&adults=1&tripType=OW`)

  if (name.includes('sri lankan') || ac === 'UL')
    return res.redirect(302,
      `https://www.srilankan.com/en_uk/fly-with-us/book-a-flight?origin=${o}&destination=${d}&departureDate=${dt}&tripType=OW&adults=1`)

  if (name.includes('ana') || name.includes('all nippon') || ac === 'NH')
    return res.redirect(302,
      `https://www.ana.co.jp/en/ca/booking/reserve/roundTrip.do?oneWayOrRoundTrip=1&depAirportCD=${o}&arrAirportCD=${d}&depDate=${dt.replace(/-/g,'')}&adultNum=1`)

  // Final fallback
  console.log(`[book] Unknown airline "${airline}"(${ac}) — Google Flights fallback`)
  return res.redirect(302,
    `https://www.google.com/travel/flights?hl=en&gl=ca&curr=CAD&q=Flights+from+${o}+to+${d}+on+${dt}`)
}
