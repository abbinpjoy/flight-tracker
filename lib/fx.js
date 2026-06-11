/**
 * Centralized FX conversion.
 *
 * Previously: stale hardcoded rates (USD:1.37, GBP:1.74...) were duplicated in
 * duffel.js, serpapi.js, travelpayouts.js and the agent prompt. For a price-
 * comparison tool, stale FX silently mis-ranks "cheapest" across sources.
 *
 * Now: rates are fetched from open.er-api.com (free, no key) and cached in the
 * warm serverless process for 12h. If the fetch fails, we fall back to the
 * static table below so the app keeps working offline.
 */

export const STATIC_RATES_TO_CAD = {
  CAD: 1, USD: 1.37, GBP: 1.74, EUR: 1.48, AED: 0.373, INR: 0.0163,
  SGD: 1.01, AUD: 0.89, QAR: 0.376, JPY: 0.0089, CHF: 1.55, OMR: 3.56,
  BHD: 3.63, KWD: 4.45, TRY: 0.042, LKR: 0.0046, MYR: 0.31, THB: 0.040,
}

let _cache = null // { ts, rates }  rates = CAD per 1 unit of currency
const TTL = 12 * 60 * 60 * 1000

export async function getRatesToCAD() {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.rates
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/CAD', {
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const j = await res.json()
      if (j.result === 'success' && j.rates) {
        // API gives units-per-CAD; invert to CAD-per-unit
        const rates = {}
        for (const [code, perCAD] of Object.entries(j.rates)) {
          if (perCAD > 0) rates[code] = 1 / perCAD
        }
        rates.CAD = 1
        _cache = { ts: Date.now(), rates }
        console.log('[fx] Live rates loaded (', Object.keys(rates).length, 'currencies )')
        return rates
      }
    }
  } catch (e) {
    console.warn('[fx] Live rate fetch failed, using static fallback:', e.message)
  }
  return STATIC_RATES_TO_CAD
}

/** Convert amount from one currency to another using a rates-to-CAD table. */
export function convert(amount, from, to = 'CAD', rates = STATIC_RATES_TO_CAD) {
  if (!amount || !from || from === to) return Math.round(amount || 0)
  const inCAD = amount * (rates[from] ?? STATIC_RATES_TO_CAD[from] ?? 1)
  if (to === 'CAD') return Math.round(inCAD)
  const toRate = rates[to] ?? STATIC_RATES_TO_CAD[to] ?? 1
  return Math.round(inCAD / toRate)
}
