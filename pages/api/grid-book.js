/**
 * /api/grid-book
 *
 * Called when user clicks a price cell in the price grid.
 * Redirects to a canonical Google Flights URL with origin, destination,
 * dates, cabin and passengers pre-filled. (SerpAPI live lookup removed.)
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

  // Build a canonical fallback URL — type=2 one-way, type=1 round-trip
  // Use departure_id/arrival_id/outbound_date params which Google Flights uses to pre-fill
  const fallbackParams = new URLSearchParams({
    hl: 'en', gl: 'ca', curr: 'CAD',
    departure_id:  o,
    arrival_id:    d,
    outbound_date: dt,
    travel_class:  travelClass,
    adults:        String(pax),
    type:          rdt ? '1' : '2',
  })
  if (rdt) fallbackParams.set('return_date', rdt)
  const fallbackUrl = `https://www.google.com/travel/flights?${fallbackParams}`

  console.log(`[grid-book] Redirect ${o}→${d} ${dt}${rdt?' / '+rdt:''}`)
  return res.redirect(302, fallbackUrl)
}
