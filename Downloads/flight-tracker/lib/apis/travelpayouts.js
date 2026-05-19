/**
 * Travelpayouts / Aviasales Data API
 *
 * Prices from cache based on millions of real user searches.
 * Covers LCCs, Indian carriers, and routes not indexed by GDS.
 * Free with affiliate token — sign up at travelpayouts.com
 *
 * Env var: TRAVELPAYOUTS_TOKEN
 * Docs: https://travelpayouts.github.io/slate/
 */

const BASE = 'https://api.travelpayouts.com'

function airlineName(code) {
  const names = {
    QR:'Qatar Airways', EK:'Emirates', EY:'Etihad Airways',
    AI:'Air India', '6E':'IndiGo', SG:'SpiceJet', UK:'Vistara',
    IX:'Air India Express', G8:'Go First', SQ:'Singapore Airlines',
    LH:'Lufthansa', BA:'British Airways', KL:'KLM', AF:'Air France',
    TK:'Turkish Airlines', CX:'Cathay Pacific', AC:'Air Canada',
    WS:'WestJet', FZ:'flydubai', GF:'Gulf Air', WY:'Oman Air',
    UL:'SriLankan Airlines', MH:'Malaysia Airlines', NH:'ANA',
    OZ:'Asiana Airlines', KE:'Korean Air', TG:'Thai Airways',
    MU:'China Eastern', CA:'Air China', CZ:'China Southern',
  }
  return names[code] || code
}

function airlineRating(code) {
  const r = {
    QR:4.7, SQ:4.8, EK:4.6, CX:4.6, NH:4.5, EY:4.4, KE:4.3,
    LH:4.3, TK:4.2, BA:4.2, AF:4.0, KL:4.1, AI:3.8, AC:3.9,
    '6E':3.6, SG:3.4, FZ:3.6, WS:3.7,
  }
  return r[code] || 3.8
}

// Convert USD to CAD (Travelpayouts returns USD by default in v2, RUB in v1)
const USD_TO_CAD = 1.37

export async function searchTravelpayouts({
  origin, destination, date, returnDate,
  cabin, passengers, currency = 'CAD',
}) {
  const token = process.env.TRAVELPAYOUTS_TOKEN
  if (!token || token.length < 10) return null

  const month = date ? date.slice(0, 7) : null // YYYY-MM
  if (!month) return null

  try {
    // Use v1/prices/cheap — returns cheapest tickets for route + month
    // No MD5 signature required, just token
    const params = new URLSearchParams({
      origin,
      destination,
      depart_date: month,
      currency: 'USD', // v1 supports USD directly
      token,
    })
    if (returnDate) params.set('return_date', returnDate.slice(0, 7))

    const res = await fetch(
      `${BASE}/v1/prices/cheap?${params}`,
      {
        headers: { 'x-access-token': token, 'Accept-Encoding': 'gzip' },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) {
      console.warn('[Travelpayouts] HTTP', res.status)
      return null
    }
    const json = await res.json()
    if (!json.success || !json.data) {
      console.warn('[Travelpayouts] No data:', json.error)
      return null
    }

    // json.data = { "COK": { "0": { price, airline, flight_number, departure_at, return_at }, ... } }
    const destData = json.data[destination] || {}
    const flights = []

    for (const [, ticket] of Object.entries(destData)) {
      if (!ticket.price || ticket.price <= 0) continue

      // Filter to only tickets near our target date (within 5 days)
      const depAt   = ticket.departure_at ? ticket.departure_at.slice(0, 10) : null
      const targetD = date
      if (depAt && targetD) {
        const diff = Math.abs(new Date(depAt) - new Date(targetD)) / 86400000
        if (diff > 5) continue
      }

      const priceUSD = ticket.price
      const priceCAD = Math.round(priceUSD * USD_TO_CAD)

      const code    = ticket.airline || '??'
      const name    = airlineName(code)
      const depDate = ticket.departure_at ? ticket.departure_at.slice(0, 10) : date
      const retDate = ticket.return_at   ? ticket.return_at.slice(0, 10)   : null

      // Build Aviasales booking deep link
      // Format: https://www.aviasales.com/search/{ORIGIN}{DD}{MM}{DEST}{PAX}1
      const [y, m, d2] = depDate.split('-')
      const bookUrl = `https://www.aviasales.com/search/${origin}${d2}${m}${destination}1`

      flights.push({
        id:           `tp-${code}-${ticket.flight_number || Math.random().toString(36).slice(2)}`,
        airline:      name,
        code,
        flightNumber: ticket.flight_number ? `${code}${ticket.flight_number}` : '',
        departure:    ticket.departure_at ? ticket.departure_at.slice(11, 16) : '—',
        arrival:      '—', // v1 cache data doesn't include arrival time
        duration:     '—',
        durationMins: 0,
        stops:        0,   // /v1/prices/cheap includes 0-2 stop options; exact count not in v1
        via:          null,
        segments:     [],
        minLayoverMins: null,
        maxLayoverMins: null,
        price:        priceCAD,
        currency:     'CAD',
        seatsLeft:    null,
        refundable:   false,
        changeable:   false,
        rating:       airlineRating(code),
        bookUrl,
        aviasalesUrl: bookUrl,
        depDate,
        retDate,
        source:       'travelpayouts',
      })
    }

    // Also fetch via v2/prices/latest for richer data (actual depart_date field)
    const v2params = new URLSearchParams({
      origin,
      destination,
      currency: 'USD',
      period_type: 'month',
      beginning_of_period: `${month}-01`,
      one_way: returnDate ? 'false' : 'true',
      sorting: 'price',
      limit: '20',
      show_to_affiliates: 'true',
      token,
    })

    const v2res = await fetch(`${BASE}/v2/prices/latest?${v2params}`, {
      headers: { 'x-access-token': token, 'Accept-Encoding': 'gzip' },
      signal: AbortSignal.timeout(8000),
    })

    if (v2res.ok) {
      const v2json = await v2res.json()
      if (v2json.success && Array.isArray(v2json.data)) {
        for (const item of v2json.data) {
          if (!item.value || item.value <= 0) continue

          // Filter to target date ±5 days
          if (item.depart_date && date) {
            const diff = Math.abs(new Date(item.depart_date) - new Date(date)) / 86400000
            if (diff > 5) continue
          }

          const priceCAD = Math.round(item.value * USD_TO_CAD)
          const code     = item.airline || '??'
          const depDate  = item.depart_date || date
          const [y2, m2, d3] = depDate.split('-')
          const bookUrl  = `https://www.aviasales.com/search/${origin}${d3}${m2}${destination}1`

          // Skip if we already have a flight with same code and similar price
          const duplicate = flights.some(f => f.code === code && Math.abs(f.price - priceCAD) < 50)
          if (duplicate) continue

          flights.push({
            id:           `tp2-${code}-${item.distance || Math.random().toString(36).slice(2)}`,
            airline:      airlineName(code),
            code,
            flightNumber: item.flight_number ? `${code}${item.flight_number}` : '',
            departure:    '—',
            arrival:      '—',
            duration:     '—',
            durationMins: 0,
            stops:        item.number_of_changes ?? 1,
            via:          null,
            segments:     [],
            minLayoverMins: null,
            maxLayoverMins: null,
            price:        priceCAD,
            currency:     'CAD',
            seatsLeft:    null,
            refundable:   false,
            changeable:   false,
            rating:       airlineRating(code),
            bookUrl,
            aviasalesUrl: bookUrl,
            depDate,
            retDate:      item.return_date || null,
            source:       'travelpayouts',
          })
        }
      }
    }

    console.log(`[Travelpayouts] ${flights.length} flights for ${origin}→${destination}`)
    return flights.length > 0 ? flights : null

  } catch (err) {
    console.error('[Travelpayouts] Error:', err.message)
    return null
  }
}
