/**
 * /api/search — Flight Search Entry Point
 *
 * Delegates to the orchestrator which runs all available APIs in parallel:
 *   ┌─────────────────────────────────────────────────┐
 *   │  SerpAPI (Google Flights)  ─┐                   │
 *   │  Kiwi Tequila              ─┤──► Merge & Rank   │
 *   │  Duffel NDC                ─┤                   │
 *   │  Claude Agent (web search) ─┘                   │
 *   └─────────────────────────────────────────────────┘
 *
 * Required env vars (add to Vercel):
 *   ANTHROPIC_API_KEY  — always needed (Claude agent + web search)
 *
 * Optional env vars (add any/all for better results):
 *   SERPAPI_KEY         — Google Flights data (serpapi.com, free tier: 100/month)
 *   KIWI_API_KEY        — Budget airlines & combos (tequila.kiwi.com, free)
 *   DUFFEL_ACCESS_TOKEN — NDC live fares (duffel.com, free test account)
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
    console.error('[search] Fatal error:', err.message)
    return res.status(500).json({ error: err.message, flights: [] })
  }
}

// Increase timeout for parallel API calls (Vercel default is 10s)
export const config = { api: { responseLimit: false } }
