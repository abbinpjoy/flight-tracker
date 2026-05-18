/**
 * /api/search
 *
 * Priority chain:
 *   1. Duffel API         — real live fares, 300+ airlines, built-in layover filtering
 *   2. Claude AI agent    — web search across Google Flights / Kayak / Skyscanner / Expedia
 *   3. Calibrated fallback — regional carrier estimates with layover enforcement
 *
 * All API keys stay server-side. Never exposed to browser.
 */

import { DuffelClient } from '../../lib/duffel.js'
import { agentSearch, markCategories } from '../../lib/agent.js'
import { generateFallback } from '../../lib/fallback.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    origin,
    destination,
    date,
    returnDate,
    cabin         = 'economy',
    passengers    = 1,
    minLayoverMins = 60,   // default minimum 1 hour layover
    maxLayoverMins = null,
    currency      = 'CAD',
  } = req.body

  if (!origin || !destination || !date) {
    return res.status(400).json({ error: 'origin, destination and date are required' })
  }

  const orig = origin.toUpperCase().trim()
  const dest = destination.toUpperCase().trim()
  const minLay = parseInt(minLayoverMins) || 60
  const maxLay = maxLayoverMins ? parseInt(maxLayoverMins) : null

  // ── 1. Try Duffel ─────────────────────────────────────────────────────
  if (process.env.DUFFEL_ACCESS_TOKEN && process.env.DUFFEL_ACCESS_TOKEN !== 'duffel_test_YOUR_TOKEN') {
    try {
      console.log(`[search] Trying Duffel: ${orig}→${dest} on ${date}`)
      const duffel  = new DuffelClient(process.env.DUFFEL_ACCESS_TOKEN)
      const flights = await duffel.searchOffers({
        origin:          orig,
        destination:     dest,
        departureDate:   date,
        returnDate:      returnDate || undefined,
        adults:          parseInt(passengers),
        cabinClass:      cabin,
        minLayoverMins:  minLay,
        maxLayoverMins:  maxLay,
        currency,
      })

      if (flights.length > 0) {
        markCategories(flights)
        const prices       = flights.map(f => f.price)
        const cheapest     = Math.min(...prices)
        const directFlight = flights.find(f => f.stops === 0)
        return res.status(200).json({
          flights,
          directAvailable: !!directFlight,
          cheapestDirect:  directFlight?.price || null,
          summary: `Duffel found ${flights.length} live offers. Cheapest: ${flights[0].airline} CA$${flights[0].price.toLocaleString()}${flights[0].via ? ` via ${flights[0].via}` : ' (direct)'}. All layovers ≥ ${minLay} min.`,
          priceLevel:     detectPriceLevel(date),
          recommendation: recommendAction(date, cheapest),
          source:         'duffel',
          webSearches:    0,
          fetchedAt:      new Date().toISOString(),
        })
      }
      console.log('[search] Duffel returned 0 offers, falling back to agent')
    } catch (err) {
      console.error('[search] Duffel error:', err.message)
    }
  }

  // ── 2. Try Claude agent with web search ───────────────────────────────
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      console.log(`[search] Trying Claude agent: ${orig}→${dest}`)
      const result = await agentSearch({
        origin:         orig,
        destination:    dest,
        date,
        returnDate,
        cabin,
        passengers,
        minLayoverMins: minLay,
        maxLayoverMins: maxLay,
        apiKey:         process.env.ANTHROPIC_API_KEY,
      })

      if (result.flights?.length > 0) {
        return res.status(200).json({
          ...result,
          fetchedAt: new Date().toISOString(),
        })
      }
      console.log('[search] Agent returned 0 flights, using fallback')
    } catch (err) {
      console.error('[search] Agent error:', err.message)
      // Return error message to UI
      if (err.message.includes('401') || err.message.includes('403')) {
        return res.status(200).json({
          flights: [],
          source:  'api_key_error',
          summary: `API key error: ${err.message}. Check your ANTHROPIC_API_KEY in Vercel environment variables.`,
          error:   err.message,
          fetchedAt: new Date().toISOString(),
        })
      }
    }
  }

  // ── 3. Calibrated fallback ────────────────────────────────────────────
  console.log('[search] Using calibrated fallback')
  const fallback = generateFallback(orig, dest, date, cabin, passengers, minLay)
  return res.status(200).json({ ...fallback, fetchedAt: new Date().toISOString() })
}

function detectPriceLevel(date) {
  const m = new Date(date).getMonth() + 1
  return [12,1].includes(m) ? 'peak' : [7,8].includes(m) ? 'high' : 'normal'
}

function recommendAction(date, cheapest) {
  const pl = detectPriceLevel(date)
  return pl === 'peak' ? 'Book now — peak season' : pl === 'high' ? 'Book soon' : 'Monitor prices'
}
