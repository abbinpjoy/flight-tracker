/**
 * /api/grid-book
 *
 * Called when user clicks a price cell in the price grid.
 *
 * Does a live SerpAPI search for that exact date combination, then redirects
 * to the actual googleFlightsUrl SerpAPI returns — which loads the exact same
 * Google Flights search that produced the price shown in the grid.
 *
 * If SerpAPI search fails, falls back to building a Google Flights URL with
 * all params pre-filled (origin, destination, dates, cabin, passengers).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const {
    origin = '', destination = '', date = '', returnDate = '',
    cabin = 'economy', passengers = '1',
  } = req.query

  const o   = origin.toUpperCase().trim()
  const d   = destination.toUpperCase().trim()
  const dt  = date.trim()
  const rdt = returnDate.trim()
  const pax = parseInt(passengers) || 1

  const travelClass = cabin === 'first' ? '4' : cabin === 'business' ? '3' : cabin === 'premium_economy' ? '2' : '1'

  // Build a canonical fallback URL first (used if SerpAPI lookup fails)
  const fallbackParams = new URLSearchParams({
    hl: 'en', gl: 'ca', curr: 'CAD',
    departure_id: o, arrival_id: d,
    outbound_date: dt,
    travel_class: travelClass,
    adults: String(pax),
    type: rdt ? '1' : '2',
  })
  if (rdt) fallbackParams.set('return_date', rdt)
  const fallbackUrl = `https://www.google.com/travel/flights?${fallbackParams}`

  // Try a live SerpAPI lookup to get the exact URL Google uses for this search
  const key = process.env.SERPAPI_KEY
  if (key && !key.includes('YOUR_KEY')) {
    try {
      const cabinMap = { economy: '1', premium_economy: '2', business: '3', first: '4' }
      const params = new URLSearchParams({
        engine:        'google_flights',
        api_key:       key,
        departure_id:  o,
        arrival_id:    d,
        outbound_date: dt,
        type:          rdt ? '1' : '2',
        travel_class:  cabinMap[cabin] || '1',
        adults:        String(pax),
        currency:      'CAD',
        hl:            'en',
        gl:            'ca',
      })
      if (rdt) params.set('return_date', rdt)

      const r = await fetch(`https://serpapi.com/search?${params}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const data = await r.json()
        const gUrl = data?.search_metadata?.google_flights_url
        if (gUrl && gUrl.startsWith('https://www.google.com/travel/flights')) {
          console.log(`[grid-book] SerpAPI URL ${o}→${d} ${dt}${rdt?' / '+rdt:''}`)
          return res.redirect(302, gUrl)
        }
      } else {
        console.warn('[grid-book] SerpAPI status', r.status)
      }
    } catch (e) {
      console.warn('[grid-book] SerpAPI error:', e.message)
    }
  }

  console.log(`[grid-book] Fallback URL ${o}→${d} ${dt}${rdt?' / '+rdt:''}`)
  return res.redirect(302, fallbackUrl)
}
