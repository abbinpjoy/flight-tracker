/**
 * Aviationstack API — real-time flight schedules & routes
 *
 * Used to discover which airlines actually operate a route,
 * then we combine with price data from other sources.
 *
 * Sign up FREE: https://aviationstack.com (100 req/month free)
 * Paid: $49/month for 10,000 requests
 *
 * Env var: AVIATIONSTACK_KEY
 */

export async function getRouteAirlines({ origin, destination }) {
  const key = process.env.AVIATIONSTACK_KEY
  if (!key || key.includes('YOUR_KEY')) return null

  try {
    const params = new URLSearchParams({
      access_key:          key,
      dep_iata:            origin,
      arr_iata:            destination,
      limit:               '100',
      flight_status:       'scheduled',
    })

    const res  = await fetch(`http://api.aviationstack.com/v1/flights?${params}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`Aviationstack ${res.status}`)
    const data = await res.json()

    if (!data.data?.length) return null

    // Extract unique airlines on this route
    const airlines = new Map()
    for (const flight of data.data) {
      const code = flight.airline?.iata
      const name = flight.airline?.name
      if (code && name && !airlines.has(code)) {
        airlines.set(code, { code, name })
      }
    }

    console.log(`[Aviationstack] ${airlines.size} airlines on ${origin}→${destination}`)
    return [...airlines.values()]

  } catch (err) {
    console.error('[Aviationstack] Error:', err.message)
    return null
  }
}
