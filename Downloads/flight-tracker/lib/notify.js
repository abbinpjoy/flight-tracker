/**
 * Notification utilities
 *
 * Browser: uses the Web Notifications API (works on desktop + Android Chrome)
 * Email:   uses Resend (https://resend.com — free tier: 100 emails/day)
 *          Sign up free, get API key, add RESEND_API_KEY to env vars
 */

// ── Browser push notification ─────────────────────────────────────────────
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result
}

export function sendBrowserNotification(title, body, url = null) {
  if (typeof window === 'undefined') return
  if (Notification.permission !== 'granted') return
  const n = new Notification(title, {
    body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✈</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✈</text></svg>',
    tag:   'flighttrack-alert',
    requireInteraction: true,
  })
  if (url) n.onclick = () => { window.open(url, '_blank'); n.close() }
  return n
}

// ── Email notification via server ─────────────────────────────────────────
export async function sendEmailAlert({ to, airline, price, route, date, bookUrl, threshold }) {
  try {
    const res = await fetch('/api/notify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, airline, price, route, date, bookUrl, threshold }),
    })
    return res.ok
  } catch {
    return false
  }
}
