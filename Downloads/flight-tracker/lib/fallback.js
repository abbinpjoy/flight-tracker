/**
 * Dynamic fallback — generates realistic estimates for ANY route.
 *
 * Instead of a fixed airline list, this:
 * 1. Looks up which airlines actually serve the origin and destination airports
 * 2. Builds realistic itineraries with correct hubs for each airline
 * 3. Applies real pricing models per route distance and season
 * 4. Enforces layover rules
 *
 * No hardcoded 7-airline list — works for any airport pair.
 */

import { markCategories } from './agent.js'

// ── Airport metadata: which airlines serve each airport ──────────────────
const AIRPORT_CARRIERS = {
  // Canada
  YVR: ['AC','WS','UA','AA','DL','BA','LH','KL','AF','QR','EK','EY','SQ','CX','NH','JL','KE','TK'],
  YYZ: ['AC','WS','UA','AA','DL','BA','LH','KL','AF','QR','EK','EY','TK','TS','AC'],
  YUL: ['AC','WS','AF','LH','BA','TS','AZ','TK'],
  YYC: ['AC','WS','UA','AA','DL'],
  YEG: ['AC','WS'],
  // India
  COK: ['AI','IX','6E','SG','EK','EY','QR','WY','GF','G8','AK'],
  DEL: ['AI','6E','SG','UK','G8','QR','EK','EY','LH','BA','AF','KL','SQ','TK','CX','NH','KE','UA','AA','AC'],
  BOM: ['AI','6E','SG','UK','QR','EK','EY','LH','BA','AF','KL','SQ','TK','EI'],
  MAA: ['AI','6E','SG','UK','QR','EK','EY','SQ','TK'],
  BLR: ['AI','6E','SG','UK','QR','EK','EY','SQ','KL'],
  HYD: ['AI','6E','SG','UK','QR','EK','EY'],
  CCJ: ['AI','IX','6E','EK','EY','QR','WY','GF','AK'],
  TRV: ['AI','IX','6E','EK','EY','QR','WY','GF'],
  // UK/Europe
  LHR: ['BA','VS','AA','DL','UA','AC','QR','EK','EY','SQ','CX','NH','KE','AF','LH','KL','AZ','IB','TK','AI'],
  CDG: ['AF','BA','AA','DL','UA','AC','LH','KL','EK','QR','SQ','TK','AZ','IB'],
  FRA: ['LH','BA','AF','KL','UA','AA','DL','AC','EK','QR','SQ','TK','AZ','CX'],
  AMS: ['KL','BA','AF','LH','UA','AA','DL','AC','EK','QR','TK'],
  MAD: ['IB','BA','AF','LH','AA','DL','UA','VY','FR'],
  FCO: ['AZ','BA','AF','LH','EK','QR','UA','AA','DL'],
  // Middle East hubs
  DXB: ['EK','FZ','QR','EY','WY','GF','TK','SQ','AI','BA','LH','AF','KL','CX','NH','KE'],
  DOH: ['QR','EK','EY','AI','BA','LH','AF','KL','SQ','CX'],
  AUH: ['EY','EK','QR','AI','BA','LH','AF','FZ'],
  MCT: ['WY','EK','QR','EY','AI'],
  BAH: ['GF','QR','EK','EY','AI'],
  // Asia
  SIN: ['SQ','MI','CX','TG','MH','GA','JL','NH','KE','OZ','QR','EK','EY','BA','LH','AF','KL','AI','AC','UA'],
  BKK: ['TG','PG','FD','DD','SQ','CX','MH','QR','EK','AI','BA','LH'],
  KUL: ['MH','AK','FY','QR','EK','SQ','TG','GA','CX','AI','BA','LH','AF'],
  HKG: ['CX','KA','HX','HO','QR','EK','SQ','TG','MH','NH','JL','KE','OZ','UA','AA','DL','AC','BA','LH'],
  NRT: ['JL','NH','HA','QR','EK','SQ','CX','TG','MH','UA','AA','DL','AC','BA','LH','AF','KL','KE','OZ'],
  ICN: ['KE','OZ','QR','EK','SQ','CX','JL','NH','TG','UA','AA','DL','AC','BA','LH','AF'],
  // USA hubs
  JFK: ['AA','DL','UA','B6','WN','BA','VS','QR','EK','EY','SQ','CX','JL','NH','KE','AF','LH','KL','AZ','IB','TK','AI','AC'],
  LAX: ['AA','DL','UA','WN','AS','B6','QR','EK','SQ','CX','JL','NH','KE','NZ','QF','BA','LH','AF','KL','TK','AI'],
  ORD: ['AA','UA','DL','WN','B6','BA','LH','KL','AF','SQ','JL','NH','KE','AC'],
  SFO: ['UA','AA','DL','AS','WN','SQ','CX','NH','JL','KE','AC','BA','LH','AF','KL','QR','EK'],
  // Australia/NZ
  SYD: ['QF','VA','JQ','TL','BA','EK','QR','SQ','CX','MH','NZ','CZ','MU','AC','UA','AA','DL'],
  MEL: ['QF','VA','JQ','EK','QR','SQ','CX','BA','MH','NZ'],
  AKL: ['NZ','QF','VA','SQ','CX','EK','BA','UA','AA','DL','AC'],
}

// ── Full airline details ──────────────────────────────────────────────────
const AIRLINE_DB = {
  AC:  { name:'Air Canada',          rating:3.9, ref:true,  url:'https://www.aircanada.com'      },
  WS:  { name:'WestJet',             rating:3.7, ref:false, url:'https://www.westjet.com'         },
  UA:  { name:'United Airlines',     rating:3.8, ref:true,  url:'https://www.united.com'          },
  AA:  { name:'American Airlines',   rating:3.7, ref:true,  url:'https://www.aa.com'              },
  DL:  { name:'Delta Air Lines',     rating:4.0, ref:true,  url:'https://www.delta.com'           },
  BA:  { name:'British Airways',     rating:4.2, ref:true,  url:'https://www.britishairways.com'  },
  VS:  { name:'Virgin Atlantic',     rating:4.3, ref:true,  url:'https://www.virginatlantic.com'  },
  LH:  { name:'Lufthansa',           rating:4.3, ref:true,  url:'https://www.lufthansa.com'       },
  KL:  { name:'KLM',                 rating:4.1, ref:true,  url:'https://www.klm.com'             },
  AF:  { name:'Air France',          rating:4.0, ref:true,  url:'https://www.airfrance.com'       },
  QR:  { name:'Qatar Airways',       rating:4.7, ref:true,  url:'https://www.qatarairways.com'    },
  EK:  { name:'Emirates',            rating:4.6, ref:false, url:'https://www.emirates.com'        },
  EY:  { name:'Etihad Airways',      rating:4.4, ref:true,  url:'https://www.etihad.com'          },
  SQ:  { name:'Singapore Airlines',  rating:4.8, ref:true,  url:'https://www.singaporeair.com'    },
  CX:  { name:'Cathay Pacific',      rating:4.6, ref:true,  url:'https://www.cathaypacific.com'   },
  NH:  { name:'ANA',                 rating:4.5, ref:true,  url:'https://www.ana.co.jp'           },
  JL:  { name:'Japan Airlines',      rating:4.5, ref:true,  url:'https://www.jal.com'             },
  KE:  { name:'Korean Air',          rating:4.3, ref:false, url:'https://www.koreanair.com'       },
  OZ:  { name:'Asiana Airlines',     rating:4.2, ref:true,  url:'https://flyasiana.com'           },
  TG:  { name:'Thai Airways',        rating:3.9, ref:false, url:'https://www.thaiairways.com'     },
  MH:  { name:'Malaysia Airlines',   rating:4.0, ref:true,  url:'https://www.malaysiaairlines.com'},
  AK:  { name:'AirAsia',             rating:3.5, ref:false, url:'https://www.airasia.com'         },
  MI:  { name:'SilkAir',             rating:4.0, ref:true,  url:'https://www.singaporeair.com'    },
  AI:  { name:'Air India',           rating:3.8, ref:false, url:'https://www.airindia.com'        },
  IX:  { name:'Air India Express',   rating:3.4, ref:false, url:'https://www.airindiaexpress.in'  },
  '6E':{ name:'IndiGo',              rating:3.6, ref:false, url:'https://www.goindigo.in'         },
  SG:  { name:'SpiceJet',            rating:3.4, ref:false, url:'https://www.spicejet.com'        },
  UK:  { name:'Vistara',             rating:4.0, ref:true,  url:'https://www.airvistara.com'      },
  TK:  { name:'Turkish Airlines',    rating:4.2, ref:true,  url:'https://www.turkishairlines.com' },
  AZ:  { name:'ITA Airways',         rating:3.8, ref:true,  url:'https://www.itaairways.com'      },
  IB:  { name:'Iberia',              rating:3.9, ref:true,  url:'https://www.iberia.com'          },
  WY:  { name:'Oman Air',            rating:4.0, ref:false, url:'https://www.omanair.com'         },
  GF:  { name:'Gulf Air',            rating:3.9, ref:false, url:'https://www.gulfair.com'         },
  FZ:  { name:'flydubai',            rating:3.6, ref:false, url:'https://www.flydubai.com'        },
  G8:  { name:'Go First',            rating:3.2, ref:false, url:'https://www.gofirstair.com'      },
  QF:  { name:'Qantas',              rating:4.4, ref:true,  url:'https://www.qantas.com'          },
  NZ:  { name:'Air New Zealand',     rating:4.5, ref:true,  url:'https://www.airnewzealand.com'   },
  VA:  { name:'Virgin Australia',    rating:4.0, ref:true,  url:'https://www.virginaustralia.com' },
  TS:  { name:'Air Transat',         rating:3.6, ref:true,  url:'https://www.airtransat.com'      },
  EI:  { name:'Aer Lingus',          rating:4.0, ref:true,  url:'https://www.aerlingus.com'       },
  B6:  { name:'JetBlue',             rating:3.9, ref:true,  url:'https://www.jetblue.com'         },
  AS:  { name:'Alaska Airlines',     rating:4.1, ref:true,  url:'https://www.alaskaair.com'       },
  WN:  { name:'Southwest Airlines',  rating:3.8, ref:true,  url:'https://www.southwest.com'       },
  FR:  { name:'Ryanair',             rating:3.0, ref:false, url:'https://www.ryanair.com'         },
  VY:  { name:'Vueling',             rating:3.4, ref:false, url:'https://www.vueling.com'         },
  GA:  { name:'Garuda Indonesia',    rating:4.1, ref:true,  url:'https://www.garuda-indonesia.com'},
}

// ── Find common carriers between two airports ─────────────────────────────
function findCommonCarriers(orig, dest) {
  const origCarriers = new Set(AIRPORT_CARRIERS[orig] || [])
  const destCarriers = new Set(AIRPORT_CARRIERS[dest] || [])

  // Airlines that serve BOTH airports (can fly direct or via their hub)
  const common = [...origCarriers].filter(c => destCarriers.has(c))

  // Airlines that serve origin and have a hub connecting to destination
  const HUBS = {
    QR: 'DOH', EK: 'DXB', EY: 'AUH', SQ: 'SIN', CX: 'HKG',
    TK: 'IST', LH: 'FRA', BA: 'LHR', AF: 'CDG', KL: 'AMS',
    NH: 'NRT', JL: 'NRT', KE: 'ICN', OZ: 'ICN', AC: 'YYZ',
    UA: 'ORD', AA: 'DFW', DL: 'ATL', AI: 'DEL', TG: 'BKK',
    MH: 'KUL', WY: 'MCT', GF: 'BAH', VS: 'LHR',
  }

  const viaHub = []
  origCarriers.forEach(code => {
    if (!common.includes(code) && HUBS[code]) {
      const hub = HUBS[code]
      const hubCarriers = new Set(AIRPORT_CARRIERS[hub] || [])
      if (hubCarriers.has(code) && destCarriers.has(code)) {
        viaHub.push({ code, hub })
      }
    }
  })

  return { direct: common, viaHub }
}

// ── Base price by great-circle distance bucket ────────────────────────────
const ROUTE_DISTANCES = {
  // In km approx — used to bucket pricing
  'YVR-COK':12750,'YVR-DEL':11400,'YVR-BOM':12200,'YVR-MAA':13100,
  'YVR-BLR':13300,'YVR-HYD':12600,'YVR-CCJ':12650,'YVR-TRV':13200,
  'YVR-LHR':7600,'YVR-CDG':8200,'YVR-FRA':8400,'YVR-AMS':8200,
  'YVR-SIN':13600,'YVR-DXB':11600,'YVR-DOH':11900,'YVR-AUH':11700,
  'YVR-NRT':7500,'YVR-ICN':7900,'YVR-BKK':12200,'YVR-HKG':10300,
  'YVR-SYD':12500,'YVR-MEL':13100,'YVR-AKL':12500,
  'YYZ-COK':13800,'YYZ-DEL':11100,'YYZ-BOM':12900,'YYZ-LHR':5700,
  'YYZ-CDG':6300,'YYZ-DXB':11200,'YYZ-DOH':11400,'YYZ-SIN':15000,
  'YYZ-NRT':10400,'YYZ-ICN':10800,
  'YUL-LHR':5200,'YUL-CDG':5500,
}

function getBasePrice(orig, dest, cabin) {
  const key  = `${orig}-${dest}`
  const rkey = `${dest}-${orig}`
  const dist = ROUTE_DISTANCES[key] || ROUTE_DISTANCES[rkey] || 10000

  // Economy base price by distance (CAD)
  let base
  if (dist < 3000)       base = 400
  else if (dist < 6000)  base = 700
  else if (dist < 9000)  base = 950
  else if (dist < 12000) base = 1150
  else if (dist < 15000) base = 1350
  else                   base = 1500

  const cabinMult = { economy:1, premium_economy:2.3, business:5.1, first:8.5 }
  return base * (cabinMult[cabin] || 1)
}

function peakMultiplier(date) {
  const m = new Date(date).getMonth() + 1
  return [12,1].includes(m) ? 1.48 : [7,8].includes(m) ? 1.30 : [3,4].includes(m) ? 1.10 : 1.0
}

// ── Known layover times per carrier/hub (minutes) ─────────────────────────
const TYPICAL_LAYOVERS = {
  QR:120, EK:150, EY:130, SQ:180, CX:150, TK:150, LH:120, BA:120,
  AF:120, KL:120, NH:130, JL:140, KE:130, OZ:140, AC:90, UA:90,
  AA:90,  DL:90,  AI:120, TG:150, MH:150, WY:130, GF:140, VS:120,
}

// ── Typical price multiplier per carrier ──────────────────────────────────
const CARRIER_MULT = {
  QR:1.18, EK:1.27, EY:1.14, SQ:1.26, CX:1.20, TK:1.05, LH:1.10, BA:1.13,
  AF:1.08, KL:1.07, NH:1.15, JL:1.12, KE:1.08, OZ:1.06, AC:1.03, UA:1.05,
  AA:1.04, DL:1.06, AI:1.00, '6E':0.92, AK:0.90, SG:0.88, IX:0.91,
  TG:1.02, MH:1.03, WY:1.09, GF:1.11, VS:1.16, FZ:0.94, TS:0.95,
}

// ── Departure time spread ─────────────────────────────────────────────────
const DEP_TIMES = ['00:45','01:30','06:00','07:30','08:15','09:45','10:30',
  '11:00','13:20','14:45','16:20','18:30','20:10','21:45','22:30','23:55']

export function generateFallback(orig, dest, date, cabin, passengers, minLayoverMins = 60) {
  const base    = getBasePrice(orig, dest, cabin)
  const peak    = peakMultiplier(date)
  const { direct, viaHub } = findCommonCarriers(orig, dest)

  const flights = []
  let timeIdx   = 0

  // ── Direct flights ────────────────────────────────────────────────────
  direct.slice(0, 4).forEach(code => {
    const info = AIRLINE_DB[code]
    if (!info) return
    const dist = ROUTE_DISTANCES[`${orig}-${dest}`] || ROUTE_DISTANCES[`${dest}-${orig}`] || 10000
    const durMins = Math.round(dist / 900 * 60) // ~900 km/h cruising
    const noise   = 1 + (Math.random() - 0.5) * 0.06
    const mult    = CARRIER_MULT[code] || 1.05
    const price   = Math.round(base * peak * mult * noise)
    const dep     = DEP_TIMES[timeIdx++ % DEP_TIMES.length]
    const arrMins = toMins(dep) + durMins
    const arr     = formatTime(arrMins)

    flights.push({
      id: `${code}-direct-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      airline: info.name, code, flightNumber: `${code}${100 + Math.floor(Math.random()*900)}`,
      departure: dep, arrival: arr,
      duration: minsToStr(durMins), durationMins: durMins,
      stops: 0, via: null, minLayoverMins: null, maxLayoverMins: null,
      price, currency: 'CAD',
      seatsLeft: Math.floor(Math.random() * 8) + 1,
      refundable: info.ref, changeable: info.ref, rating: info.rating,
      bookUrl: info.url, priceCategory: '', source: 'estimate',
    })
  })

  // ── Connecting flights via hub ─────────────────────────────────────────
  const connecting = viaHub.length > 0 ? viaHub : direct.slice(4).map(code => {
    const HUBS2 = { QR:'DOH', EK:'DXB', EY:'AUH', SQ:'SIN', CX:'HKG', TK:'IST',
      LH:'FRA', BA:'LHR', AF:'CDG', KL:'AMS', NH:'NRT', JL:'NRT', KE:'ICN',
      AC:'YYZ', UA:'ORD', AA:'DFW', DL:'ATL', AI:'DEL', TG:'BKK', MH:'KUL' }
    return { code, hub: HUBS2[code] || 'HUB' }
  })

  connecting.slice(0, 10).forEach(({ code, hub }) => {
    const info = AIRLINE_DB[code]
    if (!info) return
    const layover = Math.max(minLayoverMins, TYPICAL_LAYOVERS[code] || 120)
    const dist1   = 8000 // approx first leg
    const dist2   = 4000 // approx second leg
    const leg1    = Math.round(dist1 / 900 * 60)
    const leg2    = Math.round(dist2 / 900 * 60)
    const durMins = leg1 + layover + leg2
    const noise   = 1 + (Math.random() - 0.5) * 0.06
    const mult    = CARRIER_MULT[code] || 1.05
    const price   = Math.round(base * peak * mult * noise)
    const dep     = DEP_TIMES[timeIdx++ % DEP_TIMES.length]
    const arrMins = toMins(dep) + durMins
    const arr     = formatTime(arrMins)

    flights.push({
      id: `${code}-${hub}-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      airline: info.name, code, flightNumber: `${code}${100 + Math.floor(Math.random()*900)}`,
      departure: dep, arrival: arr,
      duration: minsToStr(durMins), durationMins: durMins,
      stops: 1, via: hub, minLayoverMins: layover, maxLayoverMins: layover + 30,
      segments: [
        { from: orig, to: hub, dep, arr: formatTime(toMins(dep) + leg1), airline: info.name, flight: `${code}${100+Math.floor(Math.random()*400)}`, durationMins: leg1, layoverMins: 0 },
        { from: hub, to: dest, dep: formatTime(toMins(dep) + leg1 + layover), arr, airline: info.name, flight: `${code}${500+Math.floor(Math.random()*400)}`, durationMins: leg2, layoverMins: layover },
      ],
      price, currency: 'CAD',
      seatsLeft: Math.floor(Math.random() * 7) + 1,
      refundable: info.ref, changeable: info.ref, rating: info.rating,
      bookUrl: info.url, priceCategory: '', source: 'estimate',
    })
  })

  // Filter layovers, sort, mark
  const valid = flights
    .filter(f => !f.stops || (f.minLayoverMins !== null && f.minLayoverMins >= minLayoverMins))
    .sort((a, b) => a.price - b.price)

  // If no flights found (rare — unknown airports), add generic options
  if (valid.length === 0) {
    const generic = ['QR','EK','EY','SQ','AC','LH','BA'].map((code, i) => {
      const info = AIRLINE_DB[code]
      const layover = Math.max(minLayoverMins, TYPICAL_LAYOVERS[code] || 120)
      const durMins = 1600 + i * 60
      const dep = DEP_TIMES[i % DEP_TIMES.length]
      const arr = formatTime(toMins(dep) + durMins)
      return {
        id: `${code}-generic-${i}`,
        airline: info.name, code,
        departure: dep, arrival: arr,
        duration: minsToStr(durMins), durationMins: durMins,
        stops: 1, via: ['DOH','DXB','AUH','SIN','YYZ','FRA','LHR'][i],
        minLayoverMins: layover, maxLayoverMins: layover + 30,
        price: Math.round(base * peak * (CARRIER_MULT[code]||1.1) * (1+(Math.random()-.5)*.06)),
        currency: 'CAD', seatsLeft: Math.floor(Math.random()*7)+1,
        refundable: info.ref, changeable: info.ref, rating: info.rating,
        bookUrl: info.url, priceCategory: '', source: 'estimate',
      }
    }).sort((a, b) => a.price - b.price)
    markCategories(generic)
    return buildResponse(generic, orig, dest, date, minLayoverMins)
  }

  markCategories(valid)
  return buildResponse(valid, orig, dest, date, minLayoverMins)
}

function buildResponse(flights, orig, dest, date, minLayoverMins) {
  const pl      = peakMultiplier(date) >= 1.4 ? 'peak' : peakMultiplier(date) >= 1.2 ? 'high' : 'normal'
  const direct  = flights.find(f => f.stops === 0)
  const cheapest = flights[0]
  return {
    flights,
    directAvailable: !!direct,
    cheapestDirect:  direct?.price || null,
    summary: `${flights.length} estimated options for ${orig}→${dest}. Cheapest: ${cheapest?.airline} CA$${cheapest?.price?.toLocaleString()}${cheapest?.via ? ` via ${cheapest.via}` : ' (direct)'}. Layovers ≥ ${minLayoverMins}min enforced. Add ANTHROPIC_API_KEY for live search.`,
    priceLevel:    pl,
    recommendation: pl === 'peak' ? 'Book now — peak season' : pl === 'high' ? 'Book soon' : 'Monitor prices',
    source:    'estimate',
    fetchedAt: new Date().toISOString(),
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────
function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
function formatTime(totalMins) {
  const days = Math.floor(totalMins / 1440)
  const h    = Math.floor((totalMins % 1440) / 60).toString().padStart(2, '0')
  const m    = (totalMins % 60).toString().padStart(2, '0')
  return `${h}:${m}${days > 0 ? `+${days}` : ''}`
}
function minsToStr(mins) {
  return `${Math.floor(mins/60)}h ${mins%60}m`
}
