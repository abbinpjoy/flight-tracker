/**
 * /api/notify
 * Sends an email alert when a flight price drops below a threshold.
 * Uses Resend (https://resend.com) — free tier: 100 emails/day, no credit card.
 *
 * Setup:
 *   1. Sign up at resend.com (free)
 *   2. Go to API Keys → Create API Key
 *   3. Add RESEND_API_KEY to Vercel environment variables
 *   4. Add ALERT_FROM_EMAIL (e.g. alerts@yourdomain.com or use resend sandbox)
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { to, airline, price, route, date, bookUrl, threshold } = req.body

  if (!process.env.RESEND_API_KEY) {
    // Gracefully skip — browser notification still fires
    return res.status(200).json({ sent: false, reason: 'RESEND_API_KEY not configured' })
  }

  if (!to) {
    return res.status(200).json({ sent: false, reason: 'No email address provided' })
  }

  const fromEmail = process.env.ALERT_FROM_EMAIL || 'FlightTrack <onboarding@resend.dev>'
  const saving    = threshold - price
  const savingPct = ((saving / threshold) * 100).toFixed(1)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font-family:-apple-system,sans-serif;background:#07080f;margin:0;padding:20px}
    .wrap{max-width:560px;margin:0 auto;background:#0c0e1a;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)}
    .header{background:linear-gradient(135deg,#6ee7b7,#3b82f6);padding:28px 32px;text-align:center}
    .header h1{color:#07080f;font-size:22px;font-weight:800;margin:0}
    .header p{color:rgba(0,0,0,0.6);font-size:13px;margin:6px 0 0}
    .body{padding:28px 32px}
    .price-box{background:#111420;border:1px solid rgba(34,197,94,0.3);border-radius:10px;padding:20px 24px;text-align:center;margin:20px 0}
    .price-new{font-size:36px;font-weight:800;color:#22c55e;letter-spacing:-0.03em}
    .price-was{font-size:14px;color:#6b7280;margin-top:4px}
    .saving{background:rgba(34,197,94,0.12);color:#22c55e;font-size:13px;font-weight:700;padding:4px 12px;border-radius:99px;display:inline-block;margin-top:8px}
    .detail{font-size:14px;color:#9ca3af;line-height:1.7;margin:16px 0}
    .detail span{color:#e8eaf2;font-weight:600}
    .cta{display:block;background:linear-gradient(135deg,#6ee7b7,#3b82f6);color:#07080f;text-decoration:none;text-align:center;padding:14px 24px;border-radius:8px;font-weight:800;font-size:15px;margin:24px 0 0}
    .footer{padding:16px 32px;text-align:center;font-size:11px;color:#374151;border-top:1px solid rgba(255,255,255,0.06)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>✈ Price Drop Alert</h1>
      <p>FlightTrack found a cheaper fare for your route</p>
    </div>
    <div class="body">
      <div class="price-box">
        <div class="price-new">CA$${price.toLocaleString()}</div>
        <div class="price-was">Your threshold was CA$${threshold.toLocaleString()}</div>
        <div class="saving">Save CA$${saving.toLocaleString()} (${savingPct}% below target)</div>
      </div>
      <div class="detail">
        <div>✈ <span>Route:</span> ${route}</div>
        <div>📅 <span>Date:</span> ${date}</div>
        <div>🛫 <span>Airline:</span> ${airline}</div>
        <div>💰 <span>Price:</span> CA$${price.toLocaleString()} per person</div>
      </div>
      <a href="${bookUrl}" class="cta">Book This Flight →</a>
    </div>
    <div class="footer">
      You set this alert in FlightTrack. Prices change frequently — book soon!
    </div>
  </div>
</body>
</html>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    fromEmail,
        to:      [to],
        subject: `✈ Price Drop: ${route} now CA$${price.toLocaleString()} — ${airline}`,
        html,
      }),
    })

    const data = await r.json()
    if (!r.ok) {
      console.error('[notify] Resend error:', JSON.stringify(data))
      return res.status(200).json({ sent: false, error: data.message || data.name || 'Resend error', resend: data })
    }

    console.log('[notify] Email sent:', data.id, '→', to)
    return res.status(200).json({ sent: true, id: data.id })
  } catch (err) {
    console.error('Email send failed:', err.message)
    return res.status(200).json({ sent: false, error: err.message })
  }
}
