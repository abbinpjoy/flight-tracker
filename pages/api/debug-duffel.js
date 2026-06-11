/**
 * /api/debug-duffel
 *
 * Tests the Duffel Links session creation endpoint directly.
 * Open in browser to see exactly what Duffel returns.
 *
 * Usage: GET /api/debug-duffel
 */
export default async function handler(req, res) {
  const token = process.env.DUFFEL_ACCESS_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'DUFFEL_ACCESS_TOKEN not set in Vercel env vars' })
  }

  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  const base  = `${proto}://${host}`

  const body = {
    data: {
      reference:       `debug-${Date.now()}`,
      success_url:     `${base}?booked=success`,
      failure_url:     `${base}?booked=failed`,
      abandonment_url: `${base}?booked=abandoned`,
      flights: { enabled: true },
      stays:   { enabled: false },
    },
  }

  let status, responseText, responseJson
  try {
    const r = await fetch('https://api.duffel.com/links/sessions', {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${token}`,
        'Duffel-Version':  'v2',
        'Content-Type':    'application/json',
        'Accept':          'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })

    status       = r.status
    responseText = await r.text()
    try { responseJson = JSON.parse(responseText) } catch { responseJson = null }
  } catch (e) {
    return res.status(500).json({ error: e.message, token_prefix: token.slice(0, 20) + '...' })
  }

  return res.status(200).json({
    duffel_status:   status,
    success:         status >= 200 && status < 300,
    token_prefix:    token.slice(0, 25) + '...',
    session_url:     responseJson?.data?.url || null,
    request_body:    body,
    duffel_response: responseJson || responseText,
  })
}
