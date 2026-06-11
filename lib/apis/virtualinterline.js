/**
 * Virtual Interlining Engine — Phase 2
 *
 * Finds cheaper itineraries by combining two separate tickets
 * across hub airports — routes that no single OTA shows.
 *
 * For YVR→COK: searches YVR→DOH + DOH→COK, YVR→DXB + DXB→COK, etc.
 * Uses Duffel for both legs. Combines cheapest out + cheapest in per hub.
 * Flags as "book separately" with individual booking links per leg.
 */

import { DuffelClient } from '../duffel.js'

// Hub airports by destination region
function selectHubs(origin, destination) {
  const dest = destination.toUpperCase()

  const INDIA = ['COK','DEL','BOM','MAA','BLR','HYD','CCJ','TRV','GOI','AMD','PNQ','JAI','CCU','IXE','IXC']
  const SE_ASIA = ['BKK','KUL','SIN','CGK','MNL']
  const EAST_ASIA = ['HKG','NRT','ICN','PVG','PEK','TPE']
  const EUROPE = ['LHR','LGW','CDG','FRA','AMS','MAD','FCO','MUC','ZRH','BCN','ARN','CPH']

  if (INDIA.includes(dest))    return ['DOH','DXB','AUH','SIN','LHR']
  if (SE_ASIA.includes(dest))  return ['DOH','DXB','SIN','KUL']
  if (EAST_ASIA.includes(dest)) return ['DOH','SIN','HKG']
  if (EUROPE.includes(dest))   return ['LHR','CDG','FRA','ICN']
  return ['DOH','DXB','SIN']
}

export async function searchVirtualInterline({
  origin, destination, date, returnDate = null,
  cabin = 'economy', passengers = 1,
  minLayoverMins = 90, currency = 'CAD',
}) {
  const token = process.env.DUFFEL_ACCESS_TOKEN
  if (!token) return null

  // Round trip needs 4 Duffel searches per hub (out×2 + return×2),
  // so cap hubs at 3 to stay within rate limits and function timeout.
  const hubs = returnDate
    ? selectHubs(origin, destination).slice(0, 3)
    : selectHubs(origin, destination).slice(0, 4)
  console.log(`[VI] ${origin}→${destination}${returnDate ? ' (round trip)' : ''} searching ${hubs.length} hubs: ${hubs.join(',')}`)

  const client = new DuffelClient(token)
  const pax = parseInt(passengers) || 1

  const sleep = ms => new Promise(r => setTimeout(r, ms))

  // Batch hub searches to avoid hammering Duffel's rate limit.
  // Process 2 hubs at a time with a small delay between batches.
  // Each hub = 2 Duffel calls (out + in), so 2 hubs = 4 concurrent calls max.
  const BATCH_DELAY = 1500 // ms between request batches (Duffel rate limits)

  // ── TWO-PHASE SEARCH ──────────────────────────────────────────────────
  // Phase 1 finds origin→hub legs on the departure date. Phase 2 searches
  // hub→destination on the date the leg actually ARRIVES at the hub —
  // long-haul eastbound (e.g. YVR→DOH) lands a day or two later, so
  // searching leg 2 on the same calendar date produced zero feasible
  // combos (every leg-2 option departed "before" leg 1 arrived).
  const dayOf  = iso => (iso || '').slice(0, 10)
  const addDay = (ymd, n) => {
    const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  async function searchLeg(o, d, dt, label) {
    try {
      const r = await client.searchOffers({
        origin: o, destination: d,
        departureDate: dt, adults: pax,
        cabinClass: cabin, currency, minLayoverMins: 0,
      })
      return (r || []).filter(x => x.price > 0)
    } catch (e) {
      console.warn(`[VI] ${label}: ${e.message}`)
      return []
    }
  }

  // Given a list of arrival legs at a hub, pick the date to search the next
  // leg on: the arrival DATE of the cheapest leg (falls back to fallbackDate).
  function nextLegDate(legsArr, fallbackDate) {
    const cheapest = [...legsArr].sort((a, b) => a.price - b.price)[0]
    return dayOf(cheapest?.arrivingAtISO) || fallbackDate
  }

  const hubMap = {}

  // ── Stage A: legs ARRIVING at each hub — origin→hub (outbound) and, for
  // round trips, destination→hub (return). These are independent, so they
  // run in the same paced batches instead of sequential phases.
  for (let i = 0; i < hubs.length; i += 2) {
    const pair = hubs.slice(i, i + 2)
    const calls = []
    for (const hub of pair) {
      hubMap[hub] = hubMap[hub] || { out: [], in: [], retOut: [], retIn: [] }
      calls.push(searchLeg(origin, hub, date, `${origin}→${hub}`)
        .then(offers => { hubMap[hub].out = offers }))
      if (returnDate) {
        calls.push(searchLeg(destination, hub, returnDate, `${destination}→${hub} (ret)`)
          .then(offers => { hubMap[hub].retOut = offers }))
      }
    }
    await Promise.all(calls)
    if (i + 2 < hubs.length) await sleep(BATCH_DELAY)
  }

  // ── Stage B: legs DEPARTING each hub, dated by when Stage A actually
  // arrives there (long-haul lands a day or two after departure).
  const liveHubs = hubs.filter(h => hubMap[h].out.length || hubMap[h].retOut.length)
  for (let i = 0; i < liveHubs.length; i += 2) {
    const pair = liveHubs.slice(i, i + 2)
    await sleep(BATCH_DELAY)
    const calls = []
    for (const hub of pair) {
      if (hubMap[hub].out.length) {
        const d2 = nextLegDate(hubMap[hub].out, date)
        calls.push(searchLeg(hub, destination, d2, `${hub}→${destination} (${d2})`)
          .then(offers => { hubMap[hub].in = offers }))
      }
      if (returnDate && hubMap[hub].retOut.length) {
        const d4 = nextLegDate(hubMap[hub].retOut, returnDate)
        calls.push(searchLeg(hub, origin, d4, `${hub}→${origin} (ret ${d4})`)
          .then(offers => { hubMap[hub].retIn = offers }))
      }
    }
    await Promise.all(calls)
  }

  // Self-transfer feasibility — both timestamps are local at the same hub,
  // so the diff is exact. ≥2h (separate tickets, recheck bags), ≤24h.
  const MIN_SELF_TRANSFER_RT = Math.max(120, minLayoverMins)
  function connectMinsAtHub(legA, legB) {
    if (!legA.arrivingAtISO || !legB.departingAtISO) return null
    const m = Math.round((new Date(legB.departingAtISO) - new Date(legA.arrivingAtISO)) / 60000)
    return (m >= MIN_SELF_TRANSFER_RT && m <= 24 * 60) ? m : null
  }
  // Cheapest feasible pair from two leg lists (used for the return direction)
  function cheapestFeasiblePair(legAs, legBs) {
    let best = null
    for (const a of [...legAs].sort((x,y)=>x.price-y.price).slice(0,3)) {
      for (const b of [...legBs].sort((x,y)=>x.price-y.price).slice(0,3)) {
        const cm = connectMinsAtHub(a, b)
        if (cm === null) continue
        const total = a.price + b.price
        if (!best || total < best.price) best = { legA: a, legB: b, connectMins: cm, price: total }
      }
    }
    return best
  }

  // Build combined itineraries — one per hub, cheapest leg each side
  const combos = []
  for (const [hub, legs] of Object.entries(hubMap)) {
    if (!legs.out.length || !legs.in.length) continue

    // ── Round trip: find the cheapest feasible RETURN combo for this hub ──
    // If none exists, skip the hub entirely — otherwise we'd display a
    // one-way price against round-trip fares from other sources.
    let retCombo = null
    if (returnDate) {
      retCombo = cheapestFeasiblePair(legs.retOut, legs.retIn)
      if (!retCombo) { console.log(`[VI] ${hub}: no feasible return combo — hub skipped`); continue }
    }

    // Cheapest per airline pair to avoid duplicate combos
    const cheapOut = legs.out.sort((a,b)=>a.price-b.price)
    const cheapIn  = legs.in.sort((a,b)=>a.price-b.price)

    // Top 2 out × top 2 in per hub = up to 4 combos per hub
    for (const legOut of cheapOut.slice(0,2)) {
      for (const legIn of cheapIn.slice(0,2)) {
        // ── Apply layover filter to each individual leg ──────────────────
        // If a leg has a layover shorter than the user's minimum, skip it
        if (legOut.minLayoverMins !== null && legOut.minLayoverMins < minLayoverMins) continue
        if (legIn.minLayoverMins  !== null && legIn.minLayoverMins  < minLayoverMins) continue

        // ── CRITICAL: temporal feasibility of the self-transfer ──────────
        // Both timestamps are LOCAL at the same hub airport, so the diff is
        // exact. Require ≥ 2h (separate tickets: bags must be collected and
        // re-checked, no protection if leg 1 is late) and ≤ 24h.
        const MIN_SELF_TRANSFER = Math.max(120, minLayoverMins)
        let hubConnectMins = null
        if (legOut.arrivingAtISO && legIn.departingAtISO) {
          hubConnectMins = Math.round(
            (new Date(legIn.departingAtISO) - new Date(legOut.arrivingAtISO)) / 60000
          )
          if (hubConnectMins < MIN_SELF_TRANSFER) continue   // impossible / too risky
          if (hubConnectMins > 24 * 60) continue             // overnight+ — not a same-trip combo
        } else {
          // Without timestamps we cannot prove the combo is bookable — skip it
          continue
        }

        const outTotal = legOut.price + legIn.price
        const total    = outTotal + (retCombo ? retCombo.price : 0)

        // ── Compute real stops count ─────────────────────────────────────
        // Each leg may itself be multi-stop (e.g. YVR→SFO→DOH = 1 stop on leg 1)
        // Total stops = stops on leg 1 + hub transfer (1) + stops on leg 2
        const legOutStops = legOut.stops ?? 0
        const legInStops  = legIn.stops  ?? 0
        const totalStops  = legOutStops + 1 + legInStops  // +1 for the hub self-transfer

        // Dedup: skip if we already have same airline pair at same price
        const key = `${legOut.code}-${legIn.code}-${hub}`
        if (combos.some(c => c._key === key)) continue

        const connectH = (hubConnectMins / 60).toFixed(1).replace(/\.0$/, '')

        combos.push({
          _key:         key,
          id:           `vi-${hub}-${legOut.code}-${legIn.code}-${Math.random().toString(36).slice(2,6)}`,
          airline:      `${legOut.airline} + ${legIn.airline}`,
          code:         legOut.code,
          flightNumber: [legOut.flightNumber, legIn.flightNumber].filter(Boolean).join(' / '),
          departure:    legOut.departure || '—',
          arrival:      legIn.arrival   || '—',
          duration:     '—',
          durationMins: (legOut.durationMins||0) + hubConnectMins + (legIn.durationMins||0),
          stops:        totalStops,
          via:          hub,
          segments:     [
            ...(legOut.segments?.length
              ? legOut.segments
              : [{ from:origin, to:hub, dep:legOut.departure||'—', arr:'—', airline:legOut.airline, flight:legOut.flightNumber||'' }]),
            ...(legIn.segments?.length
              ? legIn.segments
              : [{ from:hub, to:destination, dep:'—', arr:legIn.arrival||'—', airline:legIn.airline, flight:legIn.flightNumber||'' }]),
          ],
          minLayoverMins: Math.min(
            hubConnectMins,
            legOut.minLayoverMins ?? Infinity,
            legIn.minLayoverMins  ?? Infinity,
          ),
          maxLayoverMins: null,
          price:        total,            // round trip: all 4 tickets combined
          outboundPrice: outTotal,
          returnPrice:   retCombo ? retCombo.price : null,
          isRoundTripVI: !!retCombo,
          currency:     'CAD',
          seatsLeft:    null,
          refundable:   false,
          changeable:   false,
          rating:       +( ((legOut.rating||3.8)+(legIn.rating||3.8))/2 ).toFixed(1),
          bookUrl:      null,
          isVirtualInterline: true,
          leg1: {
            airline:  legOut.airline,
            code:     legOut.code,
            from:     origin,
            to:       hub,
            price:    legOut.price,
            offerId:  legOut.offerId  || null,
            bookUrl:  legOut.bookUrl  || null,
          },
          leg2: {
            airline: legIn.airline,
            code:    legIn.code,
            from:    hub,
            to:      destination,
            price:   legIn.price,
            offerId: legIn.offerId  || null,
            bookUrl: legIn.bookUrl  || null,
          },
          retLeg1: retCombo ? {
            airline: retCombo.legA.airline, code: retCombo.legA.code,
            from: destination, to: hub, price: retCombo.legA.price,
            date: returnDate, bookUrl: retCombo.legA.bookUrl || null,
          } : null,
          retLeg2: retCombo ? {
            airline: retCombo.legB.airline, code: retCombo.legB.code,
            from: hub, to: origin, price: retCombo.legB.price,
            date: returnDate, bookUrl: retCombo.legB.bookUrl || null,
          } : null,
          note: retCombo
            ? `Round trip via ${hub} — 4 separate tickets (out ${connectH}h connect, return ${(retCombo.connectMins/60).toFixed(1).replace(/\.0$/,'')}h) · bags not checked through`
            : `Self-transfer at ${hub} (${connectH}h connection, verified) · book each leg separately · bags not checked through`,
          source: 'virtual_interline',
        })
      }
    }
  }

  combos.sort((a,b)=>a.price-b.price)
  console.log(`[VI] ${combos.length} virtual interline options`)
  return combos.length > 0 ? combos.slice(0, 10) : null
}
