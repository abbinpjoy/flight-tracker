/**
 * /api/search
 * Delegates to orchestrator — runs SerpAPI + Kiwi + Duffel in parallel.
 * Claude Agent (ANTHROPIC_API_KEY) is only used as fallback when NO other
 * flight APIs are configured. If you have SerpAPI + Duffel, you don't need it.
 */
import { orchestrateSearch } from '../../lib/orchestrator.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    origin, destination, date, returnDate,
    cabin = 'economy', passengers = 1,
    minLayoverMins = 60, maxLayoverMins = null,
    currency = 'CAD',
  } = req.body

  if (!origin || !destination || !date) {
    return res.status(400).json({ error: 'origin, destination and date are required' })
  }

  const hasSerpAPI = !!(process.env.SERPAPI_KEY?.length > 10)
  const hasKiwi    = !!(process.env.KIWI_API_KEY?.length > 5)
  const hasDuffel  = !!(process.env.DUFFEL_ACCESS_TOKEN?.length > 10)
  const hasOtherAPIs = hasSerpAPI || hasKiwi || hasDuffel

  // Only pass Anthropic key if no flight APIs are configured
  // This prevents unnecessary token usage and rate limit errors
  const apiKey = hasOtherAPIs ? null : process.env.ANTHROPIC_API_KEY

  try {
    const result = await orchestrateSearch({
      origin:         origin.toUpperCase().trim(),
      destination:    destination.toUpperCase().trim(),
      date,
      returnDate:     returnDate || null,
      cabin,
      passengers:     parseInt(passengers) || 1,
      minLayoverMins: parseInt(minLayoverMins) || 60,
      maxLayoverMins: maxLayoverMins ? parseInt(maxLayoverMins) : null,
      currency,
      apiKey,
    })

    return res.status(200).json(result)
  } catch (err) {
    console.error('[search] Fatal:', err.message)
    return res.status(500).json({ error: err.message, flights: [] })
  }
}

export const config = {
  api: { responseLimit: false, bodyParser: true },
  maxDuration: 30,
}
