/**
 * /api/book
 *
 * Server-side booking redirect.
 *
 * SERPAPI flights:
 *   → Use the exact googleFlightsUrl returned by SerpAPI which loads the same
 *     search Google ran. This is the most accurate "view this flight" link
 *     since Google Flights doesn't support deep-linking to a specific itinerary.
 *
 * Duffel & others (no booking_token):
 *   → Build the airline's own booking page URL with origin/dest/date/cabin/passengers
 *     pre-filled. Falls back to Google Flights search if airline isn't recognised.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const {
    source, googleUrl,
    airline = '', code = '',
    origin = '', destination = '', date = '',
    returnDate = '', cabin = 'economy', passengers = '1',
  } = req.query

  const o    = origin.toUpperCase().trim()
  const d    = destination.toUpperCase().trim()
  const dt   = date.trim()
  const rdt  = (returnDate || '').trim()
  const pax  = parseInt(passengers) || 1
  const name = airline.toLowerCase()
  const ac   = code.toUpperCase()

  // Map cabin to airline-specific codes
  const cabinCodes = {
    economy:         { Q: 'E',    EK: 'economy',  EY: 'economy', AI: 'E',  SQ: 'Y',  LH: 'economy', BA: 'M',  AC: 'lowest',  KL: 'Economy', AF: 'EC',  TK: 'Economy', CX: 'economy', generic: 'Y' },
    premium_economy: { Q: 'P',    EK: 'premium',  EY: 'premium', AI: 'P',  SQ: 'S',  LH: 'premium_economy', BA: 'W', AC: 'premium', KL: 'Premium Comfort', AF: 'EW', TK: 'Premium Economy', CX: 'premium', generic: 'W' },
    business:        { Q: 'I',    EK: 'business', EY: 'business',AI: 'C',  SQ: 'C',  LH: 'business', BA: 'C',  AC: 'business',  KL: 'Business', AF: 'IC',  TK: 'Business', CX: 'business', generic: 'C' },
    first:           { Q: 'F',    EK: 'first',    EY: 'first',   AI: 'F',  SQ: 'F',  LH: 'first', BA: 'F',  AC: 'first',  KL: 'First', AF: 'FC',  TK: 'First', CX: 'first', generic: 'F' },
  }
  const cabinFor = (airlineKey) => cabinCodes[cabin]?.[airlineKey] || cabinCodes[cabin]?.generic || 'Y'

  const tripType = rdt ? 'roundtrip' : 'oneway'

  // ── SERPAPI: redirect to Google Flights using the URL SerpAPI returned ──
  if (source === 'serpapi_google_flights') {
    const gUrl = googleUrl ? decodeURIComponent(googleUrl) : ''
    if (gUrl.startsWith('https://www.google.com/travel/flights')) {
      return res.redirect(302, gUrl)
    }
    // Fallback: build Google Flights URL with all params
    const gParams = new URLSearchParams({
      hl: 'en', gl: 'ca', curr: 'CAD',
      departure_id: o, arrival_id: d,
      outbound_date: dt,
      travel_class: cabin === 'first' ? '4' : cabin === 'business' ? '3' : cabin === 'premium_economy' ? '2' : '1',
      adults: String(pax),
      type: rdt ? '1' : '2',
    })
    if (rdt) gParams.set('return_date', rdt)
    return res.redirect(302, `https://www.google.com/travel/flights?${gParams}`)
  }

  // ── AIRLINE DEEP LINKS ──────────────────────────────────────────────────
  // Each airline's booking site with origin, destination, dates, cabin, passengers pre-filled

  // Qatar Airways
  if (name.includes('qatar') || ac === 'QR') {
    const u = new URL('https://www.qatarairways.com/en-ca/flights/find-flights.html')
    u.searchParams.set('tripType', rdt ? 'R' : 'O')
    u.searchParams.set('from', o); u.searchParams.set('to', d)
    u.searchParams.set('departing', dt)
    if (rdt) u.searchParams.set('returning', rdt)
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('bookingClass', cabinFor('Q'))
    u.searchParams.set('flexibleDate', 'off')
    return res.redirect(302, u.toString())
  }

  // Emirates
  if (name.includes('emirates') || ac === 'EK') {
    const u = new URL('https://www.emirates.com/ca/english/book/flights/')
    u.hash = `/searchFlights?from=${o}&to=${d}&departureDate=${dt}${rdt?`&returnDate=${rdt}`:''}&adults=${pax}&cabinClass=${cabinFor('EK')}&tripType=${rdt?'return':'oneway'}`
    return res.redirect(302, u.toString())
  }

  // Etihad
  if (name.includes('etihad') || ac === 'EY') {
    const u = new URL('https://www.etihad.com/en-ca/book/flights')
    u.searchParams.set('tripType', rdt ? 'RoundTrip' : 'OneWay')
    u.searchParams.set('from', o); u.searchParams.set('to', d)
    u.searchParams.set('departureDate', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('cabin', cabinFor('EY'))
    return res.redirect(302, u.toString())
  }

  // Air India
  if (name.includes('air india') || ac === 'AI') {
    const u = new URL('https://www.airindia.com/book-flights.htm')
    u.searchParams.set('origin', o); u.searchParams.set('destination', d)
    u.searchParams.set('departDate', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('class', cabinFor('AI'))
    u.searchParams.set('tripType', rdt ? 'R' : 'O')
    return res.redirect(302, u.toString())
  }

  // Singapore Airlines
  if (name.includes('singapore') || ac === 'SQ') {
    const u = new URL('https://www.singaporeair.com/en_UK/ppsb/travelshop/flight-search.form')
    u.searchParams.set('tripType', rdt ? 'R' : 'O')
    u.searchParams.set('departureCity', o); u.searchParams.set('arrivalCity', d)
    u.searchParams.set('departureDate', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('cabinClass', cabinFor('SQ'))
    return res.redirect(302, u.toString())
  }

  // Lufthansa
  if (name.includes('lufthansa') || ac === 'LH') {
    const u = new URL('https://www.lufthansa.com/ca/en/flight-search')
    u.searchParams.set('origin', o); u.searchParams.set('destination', d)
    u.searchParams.set('outboundDate', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('cabinClass', cabinFor('LH'))
    u.searchParams.set('tripType', rdt ? 'ROUND_TRIP' : 'ONE_WAY')
    return res.redirect(302, u.toString())
  }

  // British Airways
  if (name.includes('british airways') || ac === 'BA') {
    const u = new URL('https://www.britishairways.com/travel/book/public/en_ca')
    u.searchParams.set('from', o); u.searchParams.set('to', d)
    u.searchParams.set('depart', dt)
    if (rdt) u.searchParams.set('return', rdt)
    u.searchParams.set('class', cabinFor('BA'))
    u.searchParams.set('adult', String(pax))
    return res.redirect(302, u.toString())
  }

  // Air Canada
  if (name.includes('air canada') || ac === 'AC') {
    const u = new URL('https://www.aircanada.com/ca/en/aco/home.html')
    u.hash = `/search?org0=${o}&dest0=${d}&departDate0=${dt}${rdt?`&org1=${d}&dest1=${o}&departDate1=${rdt}`:''}&ADT=${pax}&lang=en-CA&tripType=${rdt?'R':'O'}&cabin=${cabinFor('AC')}`
    return res.redirect(302, u.toString())
  }

  // KLM
  if (name.includes('klm') || ac === 'KL') {
    const u = new URL('https://www.klm.com/travel/ca_en/apps/ebt/ebt_home.htm')
    u.searchParams.set('lang', 'en')
    u.searchParams.set('selectedJourney', rdt ? 'ROUND_TRIP' : 'ONE_WAY')
    u.searchParams.set('origin', o); u.searchParams.set('destination', d)
    u.searchParams.set('outboundDate', dt)
    if (rdt) u.searchParams.set('inboundDate', rdt)
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('cabin', cabinFor('KL'))
    return res.redirect(302, u.toString())
  }

  // Air France
  if (name.includes('air france') || ac === 'AF') {
    const segs = rdt
      ? `0::${o}:${d}:${dt},1::${d}:${o}:${rdt}`
      : `0::${o}:${d}:${dt}`
    const u = new URL('https://wwws.airfrance.ca/search/offers')
    u.searchParams.set('pax', `${pax}:0:0:0:0:0:0:0`)
    u.searchParams.set('cabin', cabinFor('AF'))
    u.searchParams.set('tripType', rdt ? 'ROUND_TRIP' : 'ONE_WAY')
    u.searchParams.set('code', rdt ? 'RT' : 'OW')
    u.searchParams.set('segments', segs)
    return res.redirect(302, u.toString())
  }

  // Turkish Airlines
  if (name.includes('turkish') || ac === 'TK') {
    const u = new URL('https://www.turkishairlines.com/en-ca/flights/')
    u.searchParams.set('fromPort', o); u.searchParams.set('toPort', d)
    u.searchParams.set('tripType', rdt ? 'R' : 'O')
    u.searchParams.set('departure', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adult', String(pax))
    u.searchParams.set('cabin', cabinFor('TK'))
    return res.redirect(302, u.toString())
  }

  // Cathay Pacific
  if (name.includes('cathay') || ac === 'CX') {
    const u = new URL('https://www.cathaypacific.com/cx/en_CA/book-a-trip/flights/overview.html')
    u.searchParams.set('origin', o); u.searchParams.set('destination', d)
    u.searchParams.set('departureDate', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('tripType', rdt ? 'roundTrip' : 'oneWay')
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('cabinClass', cabin)
    return res.redirect(302, u.toString())
  }

  // Oman Air
  if (name.includes('oman') || ac === 'WY') {
    const u = new URL('https://www.omanair.com/en/book/flights')
    u.searchParams.set('type', rdt ? 'RT' : 'OW')
    u.searchParams.set('from', o); u.searchParams.set('to', d)
    u.searchParams.set('date', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adults', String(pax))
    return res.redirect(302, u.toString())
  }

  // Gulf Air
  if (name.includes('gulf air') || ac === 'GF') {
    const u = new URL('https://www.gulfair.com/book/flights')
    u.searchParams.set('tripType', rdt ? 'R' : 'O')
    u.searchParams.set('orig', o); u.searchParams.set('dest', d)
    u.searchParams.set('depDate', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adults', String(pax))
    return res.redirect(302, u.toString())
  }

  // IndiGo
  if (name.includes('indigo') || ac === '6E') {
    const u = new URL('https://www.goindigo.in/')
    u.searchParams.set('from', o); u.searchParams.set('to', d)
    u.searchParams.set('date', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('tripType', rdt ? 'R' : 'O')
    return res.redirect(302, u.toString())
  }

  // FlyDubai
  if (name.includes('flydubai') || ac === 'FZ') {
    const u = new URL('https://www.flydubai.com/en/book/search-flights')
    u.searchParams.set('from', o); u.searchParams.set('to', d)
    u.searchParams.set('date', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('tripType', rdt ? 'RT' : 'OW')
    return res.redirect(302, u.toString())
  }

  // SpiceJet
  if (name.includes('spicejet') || ac === 'SG') {
    const u = new URL('https://www.spicejet.com/')
    u.searchParams.set('src', o); u.searchParams.set('dst', d)
    u.searchParams.set('dd', dt)
    if (rdt) u.searchParams.set('rd', rdt)
    u.searchParams.set('ad', String(pax))
    u.searchParams.set('tripType', rdt ? 'R' : 'O')
    return res.redirect(302, u.toString())
  }

  // WestJet
  if (name.includes('westjet') || ac === 'WS') {
    const u = new URL('https://www.westjet.com/en-ca/flights/search')
    u.searchParams.set('origin', o); u.searchParams.set('destination', d)
    u.searchParams.set('departDate', dt)
    if (rdt) u.searchParams.set('returnDate', rdt)
    u.searchParams.set('adults', String(pax))
    u.searchParams.set('tripType', rdt ? 'RT' : 'OW')
    return res.redirect(302, u.toString())
  }

  // ── FINAL FALLBACK: Google Flights ──────────────────────────────────────
  // Build canonical Google Flights URL with all params
  const params = new URLSearchParams({
    hl: 'en', gl: 'ca', curr: 'CAD',
    departure_id: o, arrival_id: d,
    outbound_date: dt,
    travel_class: cabin === 'first' ? '4' : cabin === 'business' ? '3' : cabin === 'premium_economy' ? '2' : '1',
    adults: String(pax),
    type: rdt ? '1' : '2',
  })
  if (rdt) params.set('return_date', rdt)
  return res.redirect(302, `https://www.google.com/travel/flights?${params}`)
}
