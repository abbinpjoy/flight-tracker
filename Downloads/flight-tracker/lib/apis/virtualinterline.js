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

  if (INDIA.includes(dest))    return ['DOH','DXB','AUH','MCT','SIN','KUL','LHR','CMB']
  if (SE_ASIA.includes(dest))  return ['DOH','DXB','SIN','KUL','HKG']
  if (EAST_ASIA.includes(dest)) return ['DOH','SIN','HKG','ICN']
  if (EUROPE.includes(dest))   return ['LHR','CDG','FRA','AMS','ICN','DOH']
  return ['DOH','DXB','SIN','LHR']
}

export async function searchVirtualInterline({
  origin, destination, date,
  cabin = 'economy', passengers = 1,
  minLayoverMins = 90, currency = 'CAD',
}) {
  const token = process.env.DUFFEL_ACCESS_TOKEN
  if (!token) return null

  const hubs = selectHubs(origin, destination)
  console.log(`[VI] ${origin}→${destination} searching ${hubs.length} hubs: ${hubs.join(',')}`)

  const client = new DuffelClient(token)
  const pax = parseInt(passengers) || 1

  // Search all hub legs in parallel
  // outbound: origin → hub  |  inbound: hub → destination
  const searches = []
  for (const hub of hubs) {
    searches.push(
      client.searchOffers({
        origin, destination: hub,
        departureDate: date, adults: pax,
        cabinClass: cabin, currency, minLayoverMins: 0,
      }).then(r => ({ hub, leg: 'out', offers: (r||[]).filter(o=>o.price>0) }))
        .catch(e => { console.warn(`[VI] ${origin}→${hub}: ${e.message}`); return { hub, leg:'out', offers:[] } })
    )
    searches.push(
      client.searchOffers({
        origin: hub, destination,
        departureDate: date, adults: pax,
        cabinClass: cabin, currency, minLayoverMins: 0,
      }).then(r => ({ hub, leg: 'in', offers: (r||[]).filter(o=>o.price>0) }))
        .catch(e => { console.warn(`[VI] ${hub}→${destination}: ${e.message}`); return { hub, leg:'in', offers:[] } })
    )
  }

  const results = await Promise.allSettled(searches)

  // Organise by hub
  const hubMap = {}
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const { hub, leg, offers } = r.value
    if (!hubMap[hub]) hubMap[hub] = { out:[], in:[] }
    hubMap[hub][leg] = offers
  }

  // Build combined itineraries — one per hub, cheapest leg each side
  const combos = []
  for (const [hub, legs] of Object.entries(hubMap)) {
    if (!legs.out.length || !legs.in.length) continue

    // Cheapest per airline pair to avoid duplicate combos
    const cheapOut = legs.out.sort((a,b)=>a.price-b.price)
    const cheapIn  = legs.in.sort((a,b)=>a.price-b.price)

    // Top 2 out × top 2 in per hub = up to 4 combos per hub
    for (const legOut of cheapOut.slice(0,2)) {
      for (const legIn of cheapIn.slice(0,2)) {
        const total = legOut.price + legIn.price

        // Dedup: skip if we already have same airline pair at same price
        const key = `${legOut.code}-${legIn.code}-${hub}`
        if (combos.some(c => c._key === key)) continue

        const estLayoverH = ['DOH','DXB','AUH','SIN'].includes(hub) ? 2 : 3

        combos.push({
          _key:         key,
          id:           `vi-${hub}-${legOut.code}-${legIn.code}-${Math.random().toString(36).slice(2,6)}`,
          airline:      `${legOut.airline} + ${legIn.airline}`,
          code:         legOut.code,
          flightNumber: [legOut.flightNumber, legIn.flightNumber].filter(Boolean).join(' / '),
          departure:    legOut.departure || '—',
          arrival:      legIn.arrival   || '—',
          duration:     '—',
          durationMins: 0,
          stops:        1,
          via:          hub,
          segments:     [
            ...(legOut.segments?.length
              ? legOut.segments
              : [{ from:origin, to:hub, dep:legOut.departure||'—', arr:'—', airline:legOut.airline, flight:legOut.flightNumber||'' }]),
            ...(legIn.segments?.length
              ? legIn.segments
              : [{ from:hub, to:destination, dep:'—', arr:legIn.arrival||'—', airline:legIn.airline, flight:legIn.flightNumber||'' }]),
          ],
          minLayoverMins: estLayoverH * 60,
          maxLayoverMins: null,
          price:        total,
          currency:     'CAD',
          seatsLeft:    null,
          refundable:   false,
          changeable:   false,
          rating:       +( ((legOut.rating||3.8)+(legIn.rating||3.8))/2 ).toFixed(1),
          bookUrl:      null,  // VI flights have two booking links
          // Virtual interline specific fields
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
          note: `Self-transfer at ${hub} · book each leg separately · allow ~${estLayoverH}h+ layover`,
          source: 'virtual_interline',
        })
      }
    }
  }

  combos.sort((a,b)=>a.price-b.price)
  console.log(`[VI] ${combos.length} virtual interline options`)
  return combos.length > 0 ? combos.slice(0, 10) : null
}
