/**
 * /api/search
 * Delegates to orchestrator — runs SerpAPI + Kiwi + Duffel + Agent in parallel.
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
      apiKey:         process.env.ANTHROPIC_API_KEY,
    })

    return res.status(200).json(result)
  } catch (err) {
    console.error('[search] Fatal:', err.message)
    return res.status(500).json({ error: err.message, flights: [] })
  }
}

// Extend Vercel function timeout to 30s (Hobby: 10s, Pro: 60s)
// This ensures all parallel API calls have time to complete
export const config = {
  api: {
    responseLimit:  false,
    bodyParser:     true,
  },
  maxDuration: 30,
}
