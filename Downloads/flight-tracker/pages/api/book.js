/**
 * /api/book
 *
 * Handles booking redirects for both Duffel and SerpAPI flights.
 *
 * For Duffel:
 *   Creates a Duffel Links session server-side (requires DUFFEL_ACCESS_TOKEN)
 *   then redirects to the session URL — a complete hosted booking experience.
 *
 * For SerpAPI / others:
 *   Builds the best possible deep link to the airline's own booking page
 *   with origin, destination, date, and flight number pre-filled.
 *
 * Usage: GET /api/book?source=duffel&offerId=off_xxx&airline=QR&...
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const {
    source,
    offerId,
    airline,
    code,
    origin,
    destination,
    date,
    flightNumber,
    cabin = 'economy',
  } = req.query

  // ── Duffel: create a Links session and redirect ───────────────────────
  if (source === 'duffel' && offerId && process.env.DUFFEL_ACCESS_TOKEN) {
    try {
      const sessionRes = await fetch('https://api.duffel.com/links/sessions', {
        method: 'POST',
        headers: {
          'Authorization':  `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`,
          'Duffel-Version': 'v2',
          'Content-Type':   'application/json',
          'Accept':         'application/json',
        },
        body: JSON.stringify({
          data: {
            offer_id:        offerId,
            success_url:     `${req.headers.origin || 'https://your-app.vercel.app'}?booked=success`,
            failure_url:     `${req.headers.origin || 'https://your-app.vercel.app'}?booked=failed`,
            abandonment_url: `${req.headers.origin || 'https://your-app.vercel.app'}?booked=abandoned`,
          },
        }),
      })

      if (sessionRes.ok) {
        const data = await sessionRes.json()
        const url  = data.data?.url
        if (url) {
          return res.redirect(302, url)
        }
      }

      // If session creation fails, log and fall through to airline fallback
      const errText = await sessionRes.text().catch(() => '')
      console.error('[book] Duffel session error:', sessionRes.status, errText)
    } catch (err) {
      console.error('[book] Duffel session exception:', err.message)
    }
  }

  // ── Build best airline booking URL with route pre-filled ─────────────
  const o    = (origin || '').toUpperCase()
  const d    = (destination || '').toUpperCase()
  const dt   = date || ''
  const name = (airline || '').toLowerCase()
  const fn   = (flightNumber || '').replace(/\s/g, '')
  const cabinCodes = { economy:'Y', premium_economy:'W', business:'C', first:'F' }
  const cabinCode  = cabinCodes[cabin] || 'Y'

  // Airline-specific booking pages with all route params pre-filled
  let bookUrl = ''

  if (name.includes('qatar') || code === 'QR')
    bookUrl = `https://www.qatarairways.com/en-ca/flights/find-flights.html?bookingClass=E&tripType=O&from=${o}&to=${d}&departing=${dt}&adults=1&teenager=0&children=0&infants=0&flexibleDate=off`

  else if (name.includes('emirates') || code === 'EK')
    bookUrl = `https://www.emirates.com/ca/english/book/flights/#/searchFlights?from=${o}&to=${d}&departureDate=${dt}&adults=1&children=0&infants=0&cabinClass=economy&tripType=oneway`

  else if (name.includes('etihad') || code === 'EY')
    bookUrl = `https://www.etihad.com/en-ca/book/flights?tripType=OneWay&from=${o}&to=${d}&departureDate=${dt}&adults=1&children=0&infants=0&cabin=economy`

  else if (name.includes('air india') || code === 'AI')
    bookUrl = `https://www.airindia.com/book-flights.htm?origin=${o}&destination=${d}&departDate=${dt}&adults=1&children=0&infants=0&class=E&tripType=O`

  else if (name.includes('singapore') || code === 'SQ')
    bookUrl = `https://www.singaporeair.com/en_UK/ppsb/travelshop/flight-search.form?tripType=O&departureCity=${o}&arrivalCity=${d}&departureDate=${dt}&adults=1&cabinClass=Y`

  else if (name.includes('lufthansa') || code === 'LH')
    bookUrl = `https://www.lufthansa.com/ca/en/flight-search?origin=${o}&destination=${d}&outboundDate=${dt}&adults=1&cabinClass=economy&tripType=ONE_WAY`

  else if (name.includes('british airways') || code === 'BA')
    bookUrl = `https://www.britishairways.com/travel/book/public/en_ca?from=${o}&to=${d}&depart=${dt}&class=M&adult=1&child=0&infant=0`

  else if (name.includes('air canada') || code === 'AC')
    bookUrl = `https://www.aircanada.com/ca/en/aco/home.html#/search?org0=${o}&dest0=${d}&departDate0=${dt}&ADT=1&lang=en-CA&tripType=O&cabin=lowest`

  else if (name.includes('klm') || code === 'KL')
    bookUrl = `https://www.klm.com/travel/ca_en/apps/ebt/ebt_home.htm?lang=en&selectedJourney=ONE_WAY&origin=${o}&destination=${d}&outboundDate=${dt}&adults=1&cabin=Economy`

  else if (name.includes('air france') || code === 'AF')
    bookUrl = `https://wwws.airfrance.ca/search/offers?pax=1:0:0:0:0:0:0:0&cabin=EC&tripType=ONE_WAY&code=OW&segments=0::${o}:${d}:${dt}`

  else if (name.includes('turkish') || code === 'TK')
    bookUrl = `https://www.turkishairlines.com/en-ca/flights/?fromPort=${o}&toPort=${d}&tripType=O&departure=${dt}&adult=1&child=0&infant=0&cabin=Economy`

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

  // Final fallback: Google Flights with origin, destination, date
  if (!bookUrl) {
    bookUrl = `https://www.google.com/travel/flights/search?q=flights+from+${o}+to+${d}+on+${dt}&curr=CAD&hl=en&gl=ca`
  }

  return res.redirect(302, bookUrl)
}
