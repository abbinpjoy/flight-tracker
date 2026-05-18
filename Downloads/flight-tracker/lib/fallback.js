/**
 * Dynamic fallback price estimator.
 *
 * Instead of 7 fixed airlines, this builds a realistic market snapshot
 * based on typical carriers for the route, with noise to simulate
 * live market fluctuation. Layover constraints are enforced.
 */

import { markCategories } from './agent.js'

// Known carriers by region pair — used to pick realistic airlines for the route
const REGION_CARRIERS = {
  'CA-IN': [
    { airline:'Air India',          code:'AI',  stops:1, via:'DEL',     baseLayover:120, mult:1.00, rating:3.8, url:'https://www.airindia.com',       ref:false },
    { airline:'Etihad Airways',     code:'EY',  stops:1, via:'AUH',     baseLayover:150, mult:1.14, rating:4.4, url:'https://www.etihad.com',         ref:true  },
    { airline:'Qatar Airways',      code:'QR',  stops:1, via:'DOH',     baseLayover:140, mult:1.18, rating:4.7, url:'https://www.qatarairways.com',   ref:true  },
    { airline:'Emirates',           code:'EK',  stops:1, via:'DXB',     baseLayover:160, mult:1.27, rating:4.6, url:'https://www.emirates.com',       ref:false },
    { airline:'Singapore Airlines', code:'SQ',  stops:1, via:'SIN',     baseLayover:180, mult:1.26, rating:4.8, url:'https://www.singaporeair.com',   ref:true  },
    { airline:'Air Canada + AI',    code:'AC',  stops:2, via:'LHR+DEL', baseLayover:90,  mult:1.05, rating:3.9, url:'https://www.aircanada.com',      ref:false },
    { airline:'KLM + IndiGo',       code:'KL',  stops:2, via:'AMS+DEL', baseLayover:100, mult:1.07, rating:4.1, url:'https://www.klm.com',            ref:false },
    { airline:'Lufthansa + AI',     code:'LH',  stops:2, via:'FRA+DEL', baseLayover:120, mult:1.10, rating:4.3, url:'https://www.lufthansa.com',      ref:true  },
    { airline:'British Airways+AI', code:'BA',  stops:2, via:'LHR+BOM', baseLayover:110, mult:1.13, rating:4.2, url:'https://www.britishairways.com', ref:true  },
    { airline:'Oman Air',           code:'WY',  stops:1, via:'MCT',     baseLayover:130, mult:1.09, rating:4.0, url:'https://www.omanair.com',        ref:false },
    { airline:'Gulf Air',           code:'GF',  stops:1, via:'BAH',     baseLayover:140, mult:1.11, rating:3.9, url:'https://www.gulfair.com',        ref:false },
    { airline:'Flydubai + AI',      code:'FZ',  stops:2, via:'DXB+BOM', baseLayover:90,  mult:0.95, rating:3.5, url:'https://www.flydubai.com',       ref:false },
  ],
  'CA-EU': [
    { airline:'Air Canada',         code:'AC',  stops:0, via:null,      baseLayover:0,   mult:1.00, rating:3.9, url:'https://www.aircanada.com',      ref:true  },
    { airline:'British Airways',    code:'BA',  stops:0, via:null,      baseLayover:0,   mult:1.15, rating:4.2, url:'https://www.britishairways.com', ref:true  },
    { airline:'WestJet + BA',       code:'WS',  stops:1, via:'LHR',     baseLayover:90,  mult:0.90, rating:3.7, url:'https://www.westjet.com',        ref:false },
    { airline:'Lufthansa',          code:'LH',  stops:1, via:'FRA',     baseLayover:110, mult:1.05, rating:4.3, url:'https://www.lufthansa.com',      ref:true  },
    { airline:'KLM',                code:'KL',  stops:1, via:'AMS',     baseLayover:100, mult:1.02, rating:4.1, url:'https://www.klm.com',            ref:true  },
  ],
  'CA-AS': [
    { airline:'Air Canada',         code:'AC',  stops:0, via:null,      baseLayover:0,   mult:1.00, rating:3.9, url:'https://www.aircanada.com',      ref:true  },
    { airline:'Cathay Pacific',     code:'CX',  stops:1, via:'HKG',     baseLayover:120, mult:1.10, rating:4.6, url:'https://www.cathaypacific.com',  ref:true  },
    { airline:'Korean Air',         code:'KE',  stops:1, via:'ICN',     baseLayover:130, mult:1.05, rating:4.3, url:'https://www.koreanair.com',      ref:false },
    { airline:'Japan Airlines',     code:'JL',  stops:1, via:'NRT',     baseLayover:140, mult:1.08, rating:4.5, url:'https://www.jal.com',            ref:true  },
    { airline:'Singapore Airlines', code:'SQ',  stops:1, via:'SIN',     baseLayover:150, mult:1.20, rating:4.8, url:'https://www.singaporeair.com',   ref:true  },
    { airline:'ANA',                code:'NH',  stops:1, via:'NRT',     baseLayover:130, mult:1.12, rating:4.5, url:'https://www.ana.co.jp',          ref:true  },
  ],
  'default': [
    { airline:'Carrier A',          code:'CA',  stops:1, via:'HUB',     baseLayover:90,  mult:1.00, rating:3.9, url:'https://www.google.com/travel/flights', ref:false },
    { airline:'Carrier B',          code:'CB',  stops:1, via:'HUB2',    baseLayover:120, mult:1.10, rating:4.2, url:'https://www.google.com/travel/flights', ref:true  },
    { airline:'Carrier C',          code:'CC',  stops:2, via:'HUB+HB2', baseLayover:90,  mult:0.95, rating:3.7, url:'https://www.google.com/travel/flights', ref:false },
  ],
}

function detectRegionKey(origin, destination) {
  const CA = ['YVR','YYZ','YUL','YEG','YYC','YOW','YHZ']
  const IN = ['COK','DEL','BOM','MAA','BLR','HYD','CCU','AMD','GOI','CCJ','TRV','IXE','JAI','PNQ']
  const EU = ['LHR','CDG','FRA','AMS','MAD','FCO','ZRH','VIE','BCN','MUC','DUB','ARN','CPH','OSL','BRU','LIS','ATH']
  const AS = ['NRT','HND','ICN','GMP','HKG','SIN','BKK','KUL','CGK','MNL','TPE','PEK','PVG','CAN']

  const inSet = s => arr => arr.includes(s)
  const isCA_o = CA.includes(origin),   isCA_d = CA.includes(destination)
  const isIN_o = IN.includes(origin),   isIN_d = IN.includes(destination)
  const isEU_o = EU.includes(origin),   isEU_d = EU.includes(destination)
  const isAS_o = AS.includes(origin),   isAS_d = AS.includes(destination)

  if ((isCA_o && isIN_d) || (isIN_o && isCA_d)) return 'CA-IN'
  if ((isCA_o && isEU_d) || (isEU_o && isCA_d)) return 'CA-EU'
  if ((isCA_o && isAS_d) || (isAS_o && isCA_d)) return 'CA-AS'
  return 'default'
}

const ROUTE_BASE = {
  'YVR-COK':1380,'YVR-DEL':1080,'YVR-BOM':1150,'YVR-MAA':1200,'YVR-BLR':1220,
  'YVR-HYD':1180,'YVR-CCJ':1350,'YVR-TRV':1400,'YVR-LHR':920,'YVR-CDG':970,
  'YVR-SIN':1200,'YVR-DXB':1050,'YVR-NRT':850,'YVR-ICN':820,'YVR-BKK':1100,
  'YVR-HKG':900,'YYZ-COK':1450,'YYZ-DEL':1050,'YYZ-LHR':780,'YYZ-CDG':800,
  'YYZ-DXB':1000,'YYZ-BOM':1100,'YUL-LHR':750,'YUL-CDG':760,'default':1100,
}

const CABIN_MULT = { economy:1, premium_economy:2.3, business:5.1, first:8.5 }

function peakMultiplier(date) {
  const m = new Date(date).getMonth() + 1
  return [12,1].includes(m) ? 1.48 : [7,8].includes(m) ? 1.30 : [3,4].includes(m) ? 1.10 : 1.0
}

export function generateFallback(origin, destination, date, cabin, passengers, minLayoverMins = 60) {
  const key      = `${origin}-${destination}`
  const rkey     = `${destination}-${origin}`
  const base     = ROUTE_BASE[key] || ROUTE_BASE[rkey] || ROUTE_BASE.default
  const cm       = CABIN_MULT[cabin] || 1
  const peak     = peakMultiplier(date)
  const regionKey = detectRegionKey(origin, destination)
  const carriers = REGION_CARRIERS[regionKey] || REGION_CARRIERS.default

  // Add flight times based on departure airport timezone heuristic
  const departureTimes = ['00:45','01:30','07:00','08:30','10:15','13:20','14:45','16:20','19:40','22:30','23:55']
  let timeIdx = 0

  const flights = carriers
    .filter(c => {
      // Filter by layover constraint
      if (c.stops === 0) return true
      return c.baseLayover >= minLayoverMins
    })
    .map(c => {
      const noise    = 1 + (Math.random() - 0.5) * 0.06
      const price    = Math.round(base * cm * peak * c.mult * noise)
      const depTime  = departureTimes[timeIdx++ % departureTimes.length]
      // Estimate arrival from duration
      const durMins  = c.stops === 0 ? Math.round(base / 10 * 60)
                     : c.stops === 1 ? Math.round(base / 10 * 60) + c.baseLayover + 90
                     : Math.round(base / 10 * 60) + c.baseLayover * 2 + 120
      const arrMins  = parseInt(depTime.split(':')[0]) * 60 + parseInt(depTime.split(':')[1]) + durMins
      const arrDay   = Math.floor(arrMins / 1440)
      const arrH     = Math.floor((arrMins % 1440) / 60).toString().padStart(2,'0')
      const arrM     = (arrMins % 60).toString().padStart(2,'0')
      const arrTime  = `${arrH}:${arrM}${arrDay > 0 ? `+${arrDay}` : ''}`
      const durH     = Math.floor(durMins / 60)
      const durM2    = durMins % 60
      return {
        id:           `${c.code}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        airline:      c.airline,
        code:         c.code,
        departure:    depTime,
        arrival:      arrTime,
        duration:     `${durH}h ${durM2}m`,
        durationMins: durMins,
        stops:        c.stops,
        via:          c.via,
        minLayoverMins: c.stops > 0 ? c.baseLayover : null,
        maxLayoverMins: c.stops > 0 ? c.baseLayover + 30 : null,
        price,
        currency:     'CAD',
        seatsLeft:    Math.floor(Math.random() * 7) + 1,
        refundable:   c.ref,
        changeable:   c.ref,
        rating:       c.rating,
        bookUrl:      c.url,
        priceCategory:'',
        source:       'estimate',
      }
    })
    .sort((a, b) => a.price - b.price)

  markCategories(flights)

  const pl = peak >= 1.4 ? 'peak' : peak >= 1.2 ? 'high' : 'normal'
  const directFlight = flights.find(f => f.stops === 0)
  return {
    flights,
    directAvailable: !!directFlight,
    cheapestDirect:  directFlight?.price || null,
    summary: `${flights.length} options estimated for ${origin}→${destination}. Cheapest: ${flights[0]?.airline} CA$${flights[0]?.price?.toLocaleString()}${flights[0]?.via ? ` via ${flights[0].via}` : ' (direct)'}. All layovers ≥ ${minLayoverMins} min enforced.`,
    priceLevel:    pl,
    recommendation: pl === 'peak' ? 'Book now — peak season' : 'Monitor prices',
    source:    'estimate',
    fetchedAt: new Date().toISOString(),
  }
}
