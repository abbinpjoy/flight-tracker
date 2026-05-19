import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { requestNotificationPermission, sendBrowserNotification, sendEmailAlert } from '../lib/notify.js'

// ── localStorage ──────────────────────────────────────────────────────────
const ls = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}

// ── Airport database for autocomplete ────────────────────────────────────
const AIRPORTS = [
  { code:'YVR', name:'Vancouver',          country:'Canada',      city:'Vancouver'         },
  { code:'YYZ', name:'Toronto Pearson',    country:'Canada',      city:'Toronto'           },
  { code:'YUL', name:'Montreal Trudeau',   country:'Canada',      city:'Montreal'          },
  { code:'YYC', name:'Calgary',            country:'Canada',      city:'Calgary'           },
  { code:'YEG', name:'Edmonton',           country:'Canada',      city:'Edmonton'          },
  { code:'YOW', name:'Ottawa',             country:'Canada',      city:'Ottawa'            },
  { code:'YHZ', name:'Halifax',            country:'Canada',      city:'Halifax'           },
  { code:'COK', name:'Cochin / Kochi',     country:'India',       city:'Kochi'             },
  { code:'DEL', name:'Indira Gandhi',      country:'India',       city:'New Delhi'         },
  { code:'BOM', name:'Chhatrapati Shivaji',country:'India',       city:'Mumbai'            },
  { code:'MAA', name:'Chennai',            country:'India',       city:'Chennai'           },
  { code:'BLR', name:'Kempegowda',         country:'India',       city:'Bengaluru'         },
  { code:'HYD', name:'Rajiv Gandhi',       country:'India',       city:'Hyderabad'         },
  { code:'CCJ', name:'Calicut',            country:'India',       city:'Kozhikode'         },
  { code:'TRV', name:'Trivandrum',         country:'India',       city:'Thiruvananthapuram'},
  { code:'GOI', name:'Goa',               country:'India',       city:'Goa'               },
  { code:'AMD', name:'Ahmedabad',          country:'India',       city:'Ahmedabad'         },
  { code:'PNQ', name:'Pune',              country:'India',       city:'Pune'              },
  { code:'JAI', name:'Jaipur',            country:'India',       city:'Jaipur'            },
  { code:'CCU', name:'Kolkata',           country:'India',       city:'Kolkata'           },
  { code:'LHR', name:'Heathrow',           country:'UK',          city:'London'            },
  { code:'LGW', name:'Gatwick',            country:'UK',          city:'London'            },
  { code:'CDG', name:'Charles de Gaulle',  country:'France',      city:'Paris'             },
  { code:'FRA', name:'Frankfurt',          country:'Germany',     city:'Frankfurt'         },
  { code:'AMS', name:'Schiphol',           country:'Netherlands', city:'Amsterdam'         },
  { code:'MAD', name:'Barajas',            country:'Spain',       city:'Madrid'            },
  { code:'FCO', name:'Fiumicino',          country:'Italy',       city:'Rome'              },
  { code:'MUC', name:'Munich',             country:'Germany',     city:'Munich'            },
  { code:'ZRH', name:'Zurich',             country:'Switzerland', city:'Zurich'            },
  { code:'BCN', name:'Barcelona',          country:'Spain',       city:'Barcelona'         },
  { code:'DXB', name:'Dubai Intl',         country:'UAE',         city:'Dubai'             },
  { code:'DOH', name:'Hamad Intl',         country:'Qatar',       city:'Doha'              },
  { code:'AUH', name:'Zayed Intl',         country:'UAE',         city:'Abu Dhabi'         },
  { code:'MCT', name:'Muscat',             country:'Oman',        city:'Muscat'            },
  { code:'BAH', name:'Bahrain Intl',       country:'Bahrain',     city:'Manama'            },
  { code:'KWI', name:'Kuwait Intl',        country:'Kuwait',      city:'Kuwait City'       },
  { code:'RUH', name:'King Khalid',        country:'Saudi Arabia',city:'Riyadh'            },
  { code:'JED', name:'King Abdulaziz',     country:'Saudi Arabia',city:'Jeddah'            },
  { code:'SIN', name:'Changi',             country:'Singapore',   city:'Singapore'         },
  { code:'BKK', name:'Suvarnabhumi',       country:'Thailand',    city:'Bangkok'           },
  { code:'KUL', name:'KLIA',               country:'Malaysia',    city:'Kuala Lumpur'      },
  { code:'HKG', name:'Hong Kong Intl',     country:'Hong Kong',   city:'Hong Kong'         },
  { code:'NRT', name:'Narita',             country:'Japan',       city:'Tokyo'             },
  { code:'HND', name:'Haneda',             country:'Japan',       city:'Tokyo'             },
  { code:'ICN', name:'Incheon',            country:'South Korea', city:'Seoul'             },
  { code:'PEK', name:'Capital Intl',       country:'China',       city:'Beijing'           },
  { code:'PVG', name:'Pudong',             country:'China',       city:'Shanghai'          },
  { code:'CAN', name:'Baiyun',             country:'China',       city:'Guangzhou'         },
  { code:'SYD', name:'Kingsford Smith',    country:'Australia',   city:'Sydney'            },
  { code:'MEL', name:'Melbourne',          country:'Australia',   city:'Melbourne'         },
  { code:'BNE', name:'Brisbane',           country:'Australia',   city:'Brisbane'          },
  { code:'AKL', name:'Auckland',           country:'New Zealand', city:'Auckland'          },
  { code:'JFK', name:'John F Kennedy',     country:'USA',         city:'New York'          },
  { code:'LAX', name:'Los Angeles Intl',   country:'USA',         city:'Los Angeles'       },
  { code:'ORD', name:"O'Hare",             country:'USA',         city:'Chicago'           },
  { code:'SFO', name:'San Francisco Intl', country:'USA',         city:'San Francisco'     },
  { code:'MIA', name:'Miami Intl',         country:'USA',         city:'Miami'             },
  { code:'BOS', name:'Logan Intl',         country:'USA',         city:'Boston'            },
  { code:'SEA', name:'Seattle-Tacoma',     country:'USA',         city:'Seattle'           },
  { code:'DFW', name:'Dallas Fort Worth',  country:'USA',         city:'Dallas'            },
  { code:'ATL', name:'Hartsfield-Jackson', country:'USA',         city:'Atlanta'           },
  { code:'CDG', name:'Charles de Gaulle',  country:'France',      city:'Paris'             },
  { code:'IST', name:'Istanbul',           country:'Turkey',      city:'Istanbul'          },
  { code:'CAI', name:'Cairo Intl',         country:'Egypt',       city:'Cairo'             },
  { code:'NBO', name:'Jomo Kenyatta',      country:'Kenya',       city:'Nairobi'           },
  { code:'JNB', name:'OR Tambo',           country:'S. Africa',   city:'Johannesburg'      },
  { code:'CPT', name:'Cape Town Intl',     country:'S. Africa',   city:'Cape Town'         },
  { code:'GRU', name:'Guarulhos',          country:'Brazil',      city:'São Paulo'         },
  { code:'GIG', name:'Galeão',             country:'Brazil',      city:'Rio de Janeiro'    },
  { code:'MEX', name:'Benito Juárez',      country:'Mexico',      city:'Mexico City'       },
  { code:'YMX', name:'Mirabel',            country:'Canada',      city:'Montreal'          },
  { code:'CMB', name:'Bandaranaike',       country:'Sri Lanka',   city:'Colombo'           },
  { code:'DAC', name:'Hazrat Shahjalal',   country:'Bangladesh',  city:'Dhaka'             },
  { code:'KTM', name:'Tribhuvan',          country:'Nepal',       city:'Kathmandu'         },
  { code:'MLE', name:'Velana Intl',        country:'Maldives',    city:'Malé'              },
]

function searchAirports(query) {
  if (!query || query.length < 2) return []
  const q = query.toLowerCase()
  return AIRPORTS.filter(a =>
    a.code.toLowerCase().includes(q) ||
    a.city.toLowerCase().includes(q) ||
    a.name.toLowerCase().includes(q) ||
    a.country.toLowerCase().includes(q)
  ).slice(0, 6)
}

// ── Airport autocomplete input ────────────────────────────────────────────
function AirportInput({ label, value, onChange }) {
  const [query,    setQuery]    = useState(value)
  const [results,  setResults]  = useState([])
  const [open,     setOpen]     = useState(false)
  const [selected, setSelected] = useState(!!value)
  const wrapRef = useRef(null)

  // Sync external value
  useEffect(() => {
    if (value && value !== query.slice(0, 3)) {
      const airport = AIRPORTS.find(a => a.code === value)
      if (airport) { setQuery(`${airport.code} — ${airport.city}`); setSelected(true) }
      else { setQuery(value) }
    }
  }, [value])

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleInput(e) {
    const val = e.target.value
    setQuery(val)
    setSelected(false)

    // If typed exactly 3 uppercase letters treat as IATA code
    if (/^[A-Za-z]{3}$/.test(val.trim())) {
      const exact = AIRPORTS.find(a => a.code === val.toUpperCase())
      if (exact) {
        select(exact)
        return
      }
    }

    const found = searchAirports(val)
    setResults(found)
    setOpen(found.length > 0)
    // If no match yet, still pass raw value up (user might be typing IATA)
    if (!found.length) onChange(val.toUpperCase().trim().slice(0, 3))
  }

  function select(airport) {
    setQuery(`${airport.code} — ${airport.city}`)
    setResults([])
    setOpen(false)
    setSelected(true)
    onChange(airport.code)
  }

  function handleFocus() {
    setSelected(false)
    setQuery('')
    setResults([])
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Enter' && results.length > 0) select(results[0])
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginBottom: 0 }}>
      {label && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>}
      <input
        value={query}
        onChange={handleInput}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder="City or airport code"
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%', height: 36, padding: '0 10px',
          background: 'var(--card)', border: `0.5px solid ${selected ? 'rgba(110,231,183,.4)' : 'var(--border-hi)'}`,
          borderRadius: 7, color: selected ? 'var(--accent)' : 'var(--text)',
          fontFamily: selected ? 'DM Mono, monospace' : 'inherit',
          fontSize: selected ? 13 : 13, fontWeight: selected ? 700 : 400,
          outline: 'none', boxSizing: 'border-box',
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#0c0e1a', border: '0.5px solid var(--border-hi)',
          borderRadius: 8, marginTop: 4, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {results.map(a => (
            <div key={a.code}
              onMouseDown={() => select(a)}
              style={{
                padding: '9px 12px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 10, borderBottom: '0.5px solid var(--border)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(110,231,183,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 800, color: 'var(--accent)', minWidth: 36 }}>{a.code}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{a.city}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.name} · {a.country}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Small UI components ───────────────────────────────────────────────────
const Divider = () => <div style={{ height: '0.5px', background: 'var(--border)', margin: '14px 0' }} />
const SLabel  = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--hint)', marginBottom: 9 }}>
    {children}
  </div>
)
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 9 }}>
      {label && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>}
      {children}
    </div>
  )
}
const inputStyle = {
  width: '100%', height: 34, padding: '0 10px',
  background: 'var(--card)', border: '0.5px solid var(--border-hi)',
  borderRadius: 7, color: 'var(--text)', fontFamily: 'inherit', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
}
function Badge({ children, color = 'green', small = false }) {
  const bg = color === 'green' ? 'var(--green-dim)' : color === 'amber' ? 'var(--amber-dim)'
    : color === 'red' ? 'var(--red-dim)' : color === 'blue' ? 'var(--blue-dim)'
    : color === 'purple' ? 'var(--purple-dim)' : 'var(--green-dim)'
  const fg = color === 'green' ? 'var(--green)' : color === 'amber' ? 'var(--amber)'
    : color === 'red' ? 'var(--red)' : color === 'blue' ? 'var(--blue)'
    : color === 'purple' ? 'var(--purple)' : 'var(--green)'
  return (
    <span style={{ fontSize: small ? 9 : 10, fontWeight: 700, padding: small ? '1px 6px' : '2px 8px',
      borderRadius: 99, background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}
function PriceDelta({ cur, prev }) {
  if (!prev || cur === prev) return null
  const diff = cur - prev, up = diff > 0
  return (
    <span style={{ fontSize: 10, fontFamily: 'DM Mono,monospace', fontWeight: 700,
      padding: '1px 6px', borderRadius: 4, marginLeft: 5,
      background: up ? 'var(--red-dim)' : 'var(--green-dim)',
      color: up ? 'var(--red)' : 'var(--green)' }}>
      {up ? '▲' : '▼'} CA${Math.abs(diff).toLocaleString()} ({up?'+':''}{((diff/prev)*100).toFixed(1)}%)
    </span>
  )
}
function Sparkline({ data }) {
  if (!data || data.length < 2) return null
  const pts = data.map((d,i) => ({ i, p: d.p }))
  const prices = data.map(d => d.p)
  const last = prices[prices.length-1], prev = prices[prices.length-2]
  const stroke = last > prev ? 'var(--red)' : last < prev ? 'var(--green)' : 'var(--muted)'
  return (
    <div style={{ width:90, height:26 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts}>
          <Line type="monotone" dataKey="p" stroke={stroke} strokeWidth={1.5} dot={false} />
          <YAxis domain={[Math.min(...prices)*.997, Math.max(...prices)*1.003]} hide />
          <XAxis dataKey="i" hide />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
function LayoverInfo({ flight }) {
  if (!flight.stops) return null
  const min = flight.minLayoverMins
  if (!min) return null
  const h = Math.floor(min/60), m = min%60
  const color = min < 90 ? 'amber' : min < 180 ? 'green' : 'blue'
  return <Badge color={color} small>⏱ {h>0?`${h}h `:''}{m>0?`${m}m`:''} layover</Badge>
}
function SegmentTimeline({ segments }) {
  if (!segments?.length) return null
  return (
    <div style={{ marginTop:10, paddingTop:10, borderTop:'0.5px solid var(--border)' }}>
      {segments.map((seg,i) => (
        <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom: i<segments.length-1?6:0 }}>
          <div style={{ width:36, fontSize:10, fontFamily:'DM Mono,monospace', color:'var(--accent)', flexShrink:0, paddingTop:2 }}>{seg.from}</div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
              <span style={{ color:'var(--text)', fontWeight:700 }}>{seg.dep}</span>
              <span style={{ color:'var(--muted)', fontSize:10 }}>{seg.airline} {seg.flight}</span>
              <span style={{ color:'var(--text)', fontWeight:700 }}>{seg.arr}</span>
            </div>
            {seg.layoverMins > 0 && (
              <div style={{ fontSize:10, color:'var(--amber)', marginTop:2, textAlign:'center' }}>
                ↕ layover {Math.floor(seg.layoverMins/60)}h {seg.layoverMins%60}m at {seg.to}
              </div>
            )}
          </div>
          <div style={{ width:36, fontSize:10, fontFamily:'DM Mono,monospace', color:'var(--accent)', flexShrink:0, paddingTop:2, textAlign:'right' }}>{seg.to}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────
export default function FlightTracker() {
  const [origin,          setOrigin]          = useState('YVR')
  const [destination,     setDestination]     = useState('COK')
  const [depDate,         setDepDate]         = useState('2026-12-14')
  const [retDate,         setRetDate]         = useState('')
  const [cabin,           setCabin]           = useState('economy')
  const [passengers,      setPassengers]      = useState('1')
  const [minLayover,      setMinLayover]      = useState(60)
  const [maxLayover,      setMaxLayover]      = useState('')
  const [refreshSecs,     setRefreshSecs]     = useState(30)
  const [isTracking,      setIsTracking]      = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [flights,         setFlights]         = useState([])
  const [meta,            setMeta]            = useState(null)
  const [logs,            setLogs]            = useState([])
  const [history,         setHistory]         = useState({})
  const [prevPrices,      setPrevPrices]      = useState({})
  const [tickCount,       setTickCount]       = useState(0)
  const [lastFetch,       setLastFetch]       = useState(null)
  const [countdown,       setCountdown]       = useState(0)
  const [sortBy,          setSortBy]          = useState('price')
  const [activeTab,       setActiveTab]       = useState('flights')
  const [savedRoutes,     setSavedRoutes]     = useState([])
  const [alerts,          setAlerts]          = useState([])
  const [flashMap,        setFlashMap]        = useState({})
  const [expandedFlight,  setExpandedFlight]  = useState(null)
  const [notifPerm,       setNotifPerm]       = useState('default')
  const [alertEmail,      setAlertEmail]      = useState('')
  const [newAlertThresh,  setNewAlertThresh]  = useState('')
  const [newAlertAirline, setNewAlertAirline] = useState('')

  const timerRef  = useRef(null)
  const cdRef     = useRef(null)
  const logRef    = useRef(null)

  useEffect(() => {
    setHistory(ls.get('ft_history', {}))
    setSavedRoutes(ls.get('ft_routes', []))
    setAlerts(ls.get('ft_alerts', []))
    setAlertEmail(ls.get('ft_email', ''))
    if (typeof window !== 'undefined' && 'Notification' in window) setNotifPerm(Notification.permission)
    addLog('ok',   'FlightTrack v3 ready')
    addLog('info', 'Type a city name or IATA code to search airports')
  }, [])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logs])

  const addLog = useCallback((type, msg) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false })
    setLogs(l => [...l.slice(-120), { id: Date.now() + Math.random(), ts, type, msg }])
  }, [])

  const doFetch = useCallback(async () => {
    setLoading(true)
    addLog('info', `Tick #${tickCount + 1} — searching all airlines for ${origin} → ${destination}...`)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin, destination, date: depDate,
          returnDate: retDate || undefined,
          cabin, passengers,
          minLayoverMins: minLayover,
          maxLayoverMins: maxLayover ? parseInt(maxLayover) : null,
          currency: 'CAD',
        }),
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || `HTTP ${res.status}`)
      const newFlights = (result.flights || []).sort((a, b) => (a.price || 0) - (b.price || 0))

      // Log each API source result individually
      if (result.sourceStats?.length) {
        const activeCount = result.sourceStats.filter(s => s.status === 'ok').length
        result.sourceStats.forEach(s => {
          if (s.status === 'ok')
            addLog('ok',   `${s.name}: ${s.count} flights found`)
          else if (s.status === 'error')
            addLog('warn', `${s.name}: ${s.error || 'error'}`)
          else if (s.status === 'empty')
            addLog('info', `${s.name}: 0 results for this route`)
          else if (s.status === 'skipped') {
            // Agent is intentionally skipped when other APIs are active
            if (s.name === 'Agent' && activeCount > 0)
              addLog('info', `Agent: not needed (${activeCount} API${activeCount>1?'s':''} active)`)
            else
              addLog('info', `${s.name}: not configured`)
          }
        })
        addLog('ok', `Merged ${result.totalMerged || newFlights.length} → deduped ${result.afterDedup || newFlights.length} → shown ${newFlights.length} (${result.elapsed}ms)`)
      } else {
        addLog('ok', `${result.source} — ${newFlights.length} flights · ${result.elapsed || 0}ms`)
      }

      setFlights(prev => {
        const prevMap = {}
        prev.forEach(f => {
          const k = `${(f.airline||'').slice(0,12).replace(/\s/g,'')}-${f.stops}-${f.via||'direct'}`
          prevMap[k] = f.price
        })
        setPrevPrices(prevMap)
        const flashes = {}
        newFlights.forEach(f => {
          const k = `${(f.airline||'').slice(0,12).replace(/\s/g,'')}-${f.stops}-${f.via||'direct'}`
          if (prevMap[k] !== undefined) {
            if (f.price < prevMap[k]) flashes[k] = 'g'
            else if (f.price > prevMap[k]) flashes[k] = 'r'
          }
          f._stableKey = k  // attach for flash lookup
        })
        if (Object.keys(flashes).length) { setFlashMap(flashes); setTimeout(() => setFlashMap({}), 800) }
        const currentAlerts = ls.get('ft_alerts', [])
        const email = ls.get('ft_email', '')
        newFlights.forEach(async f => {
          for (const a of currentAlerts) {
            if (f.price <= a.threshold && (!a.airline || a.airline === 'any' || f.code === a.airline || f.airline.includes(a.airline))) {
              addLog('ok', `🔔 ALERT: ${f.airline} CA$${f.price.toLocaleString()} ≤ threshold CA$${a.threshold.toLocaleString()}`)
              sendBrowserNotification(`✈ Price Drop! ${origin}→${destination}`, `${f.airline}: CA$${f.price.toLocaleString()}`, f.bookUrl)
              if (email) { const sent = await sendEmailAlert({ to: email, airline: f.airline, price: f.price, route: `${origin} → ${destination}`, date: depDate, bookUrl: f.bookUrl, threshold: a.threshold }); if (sent) addLog('ok', `📧 Email sent to ${email}`) }
            }
          }
        })
        return newFlights
      })

      setHistory(prev => {
        const now = Date.now()
        const upd = { ...prev }
        newFlights.forEach(f => {
          // Use stable key: airline+stops+via (not Duffel UUID which changes every tick)
          const stableKey = `${(f.airline||'').slice(0,12).replace(/\s/g,'')}-${f.stops}-${f.via||'direct'}`
          upd[stableKey] = [...(upd[stableKey]||[]).slice(-29), { t: now, p: f.price, airline: f.airline }]
        })
        ls.set('ft_history', upd)
        return upd
      })

      setMeta(result); setLastFetch(new Date()); setTickCount(t => t + 1)
    } catch (err) { addLog('err', err.message) }
    setLoading(false)
  }, [origin, destination, depDate, retDate, cabin, passengers, minLayover, maxLayover, tickCount, addLog])

  const startTracking = useCallback(async () => {
    setIsTracking(true); setTickCount(0)
    addLog('info', `Tracking ${origin} → ${destination} · min layover ${minLayover}min · refresh ${refreshSecs}s`)
    await doFetch()
    setCountdown(refreshSecs)
    cdRef.current    = setInterval(() => setCountdown(c => c <= 1 ? refreshSecs : c - 1), 1000)
    timerRef.current = setInterval(doFetch, refreshSecs * 1000)
  }, [origin, destination, minLayover, refreshSecs, doFetch, addLog])

  const stopTracking = useCallback(() => {
    clearInterval(timerRef.current); clearInterval(cdRef.current)
    setIsTracking(false); setCountdown(0); addLog('warn', 'Tracking paused')
  }, [addLog])

  useEffect(() => () => { clearInterval(timerRef.current); clearInterval(cdRef.current) }, [])

  const saveRoute = () => {
    const r = { id: Date.now(), origin, destination, date: depDate, cabin, minLayover }
    const upd = [r, ...savedRoutes.filter(x => !(x.origin===r.origin && x.destination===r.destination)).slice(0,4)]
    setSavedRoutes(upd); ls.set('ft_routes', upd)
    addLog('ok', `Route saved: ${r.origin} → ${r.destination}`)
  }
  const loadRoute = r => { setOrigin(r.origin); setDestination(r.destination); setDepDate(r.date); setCabin(r.cabin); if (r.minLayover) setMinLayover(r.minLayover) }

  const addAlert = () => {
    if (!newAlertThresh) return
    const a = { id: Date.now(), airline: newAlertAirline || 'any', threshold: parseInt(newAlertThresh), route: `${origin}→${destination}`, date: depDate, created: new Date().toISOString() }
    const upd = [...alerts, a]; setAlerts(upd); ls.set('ft_alerts', upd)
    addLog('ok', `Alert: ${a.airline === 'any' ? 'any airline' : a.airline} below CA$${a.threshold.toLocaleString()}`)
    setNewAlertThresh(''); setNewAlertAirline('')
  }
  const removeAlert = id => { const upd = alerts.filter(a => a.id !== id); setAlerts(upd); ls.set('ft_alerts', upd) }

  const enableNotifications = async () => {
    const perm = await requestNotificationPermission()
    setNotifPerm(perm)
    if (perm === 'granted') addLog('ok', 'Browser notifications enabled')
    else addLog('warn', 'Notification permission denied')
  }

  // Routes through /api/book which:
  // - For Duffel: creates a proper Duffel Links session server-side then redirects
  // - For SerpAPI: redirects to the exact Google Flights URL from metadata
  // - For others: builds airline-specific deep link with route pre-filled
  function getBookUrl(f) {
    const params = new URLSearchParams({
      source:       f.source           || '',
      offerId:      f.offerId          || '',
      googleUrl:    f.googleFlightsUrl || '',
      airline:      f.airline          || '',
      code:         f.code             || '',
      origin:       origin.toUpperCase(),
      destination:  destination.toUpperCase(),
      date:         depDate,
      cabin,
    })
    return `/api/book?${params.toString()}`
  }

  const sorted = useMemo(() => {
    return [...flights].sort((a, b) => {
      if (sortBy === 'price')    return (a.price||0) - (b.price||0)
      if (sortBy === 'duration') return (a.durationMins||0) - (b.durationMins||0)
      if (sortBy === 'stops')    return (a.stops||0) - (b.stops||0)
      if (sortBy === 'layover')  return (a.minLayoverMins||999) - (b.minLayoverMins||999)
      if (sortBy === 'rating')   return (b.rating||0) - (a.rating||0)
      return (a.price||0) - (b.price||0)
    })
  }, [flights, sortBy])

  const cheapest = flights.length ? Math.min(...flights.map(f => f.price)) : null
  const average  = flights.length ? Math.round(flights.reduce((s,f) => s+f.price,0) / flights.length) : null
  const drops    = flights.filter(f => { const k=f.id||f.code; return prevPrices[k] && f.price < prevPrices[k] }).length
  const rises    = flights.filter(f => { const k=f.id||f.code; return prevPrices[k] && f.price > prevPrices[k] }).length
  const directCount = flights.filter(f => f.stops === 0).length

  const histChartData = (() => {
    const codes = Object.keys(history)
    if (!codes.length) return []
    const maxLen = Math.max(...codes.map(c => (history[c]||[]).length))
    return Array.from({ length: maxLen }, (_, i) => {
      const pt = { i }
      codes.forEach(c => { if (history[c]?.[i]) pt[c] = history[c][i].p })
      return pt
    })
  })()
  const chartColors = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#a855f7','#06b6d4','#f97316','#ec4899']

  const card      = { background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 10 }
  const ghostBtn  = { background: 'transparent', border: '0.5px solid var(--border-hi)', borderRadius: 7, color: 'var(--muted)', fontFamily: 'inherit', cursor: 'pointer' }
  const primaryBtn = { background: 'linear-gradient(135deg,#6ee7b7,#3b82f6)', border: 'none', borderRadius: 7, color: '#07080f', fontFamily: 'inherit', fontWeight: 800, cursor: 'pointer' }
  const dangerBtn  = { background: 'var(--red-dim)', border: '0.5px solid rgba(239,68,68,.3)', borderRadius: 7, color: 'var(--red)', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }

  return (
    <div style={{ fontFamily:"'Syne','DM Sans',system-ui,sans-serif", background:'var(--bg)', minHeight:'100vh', color:'var(--text)' }}>

      {/* Topbar */}
      <header style={{ ...card, borderRadius:0, borderLeft:0, borderRight:0, borderTop:0, padding:'0 1.5rem', height:52, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>✈</span>
          <span style={{ fontSize:16, fontWeight:800, letterSpacing:'-.03em' }}>
            Flight<span style={{ color:'var(--accent)' }}>Track</span>
            <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400, marginLeft:8 }}>v3</span>
          </span>
          <span className={isTracking ? 'anim-pulse' : ''} style={{ width:7, height:7, borderRadius:'50%', background:isTracking?'var(--green)':'var(--hint)', boxShadow:isTracking?'0 0 8px var(--green)':'none', display:'inline-block' }} />
          {isTracking && <span style={{ fontSize:10, color:'var(--green)', fontWeight:800, letterSpacing:'.06em' }}>LIVE</span>}
        </div>
        <div style={{ display:'flex', gap:8, fontSize:11, color:'var(--muted)', fontFamily:'DM Mono,monospace', alignItems:'center', flexWrap:'wrap' }}>
          {/* Per-source badges */}
          {meta?.sourceStats?.filter(s => s.status === 'ok').map(s => (
            <Badge key={s.name} color={s.name==='SerpAPI'?'green':s.name==='Duffel'?'blue':s.name==='Kiwi'?'amber':'purple'} small>
              {s.name} {s.count}
            </Badge>
          ))}
          {meta?.sourceStats?.filter(s => s.status === 'error').map(s => (
            <Badge key={s.name} color="red" small>{s.name} ✗</Badge>
          ))}
          {meta?.elapsed && <span style={{ color:'var(--hint)' }}>{meta.elapsed}ms</span>}
          {isTracking && countdown>0 && <span style={{ color:countdown<=5?'var(--amber)':'var(--muted)', marginLeft:4 }}>next {countdown}s</span>}
          {tickCount>0 && <span>#{tickCount}</span>}
          {lastFetch && <span>{lastFetch.toLocaleTimeString('en-GB',{hour12:false})}</span>}
        </div>
      </header>

      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', minHeight:'calc(100vh - 52px)' }}>

        {/* Sidebar */}
        <aside style={{ background:'var(--surface)', borderRight:'0.5px solid var(--border)', padding:'1.25rem', overflowY:'auto' }}>

          <SLabel>Route</SLabel>

          <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:6, alignItems:'end', marginBottom:10 }}>
            <AirportInput label="From" value={origin} onChange={setOrigin} />
            <div style={{ textAlign:'center', color:'var(--hint)', paddingBottom:4, fontSize:18, paddingTop:20 }}>→</div>
            <AirportInput label="To" value={destination} onChange={setDestination} />
          </div>

          <Field label="Departure">
            <input type="date" value={depDate} onChange={e=>setDepDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Return (optional)">
            <input type="date" value={retDate} onChange={e=>setRetDate(e.target.value)} style={inputStyle} />
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
            <Field label="Cabin">
              <select value={cabin} onChange={e=>setCabin(e.target.value)} style={inputStyle}>
                {[['economy','Economy'],['premium_economy','Prem Eco'],['business','Business'],['first','First']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Passengers">
              <select value={passengers} onChange={e=>setPassengers(e.target.value)} style={inputStyle}>
                {[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}
              </select>
            </Field>
          </div>

          <Divider />
          <SLabel>Layover Rules</SLabel>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:4 }}>
            <Field label="Min layover (min)">
              <input type="number" value={minLayover} onChange={e=>setMinLayover(Math.max(0,parseInt(e.target.value)||0))} min={0} max={600} style={inputStyle} />
            </Field>
            <Field label="Max layover (min)">
              <input type="number" value={maxLayover} onChange={e=>setMaxLayover(e.target.value)} placeholder="no limit" min={minLayover} style={inputStyle} />
            </Field>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, lineHeight:1.5 }}>
            Flights with layovers &lt; {minLayover}min excluded{maxLayover ? ` · max ${maxLayover}min` : ''}
          </div>

          <Divider />
          <SLabel>Live Refresh</SLabel>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <input type="range" min={15} max={120} step={5} value={refreshSecs} onChange={e=>setRefreshSecs(+e.target.value)} style={{ flex:1 }} />
            <span style={{ fontFamily:'DM Mono,monospace', fontSize:13, color:'var(--accent)', minWidth:34 }}>{refreshSecs}s</span>
          </div>

          {!isTracking
            ? <button onClick={startTracking} disabled={loading} style={{ ...primaryBtn, width:'100%', height:38, fontSize:14, marginBottom:7, opacity:loading?.5:1 }}>
                {loading ? '⟳ Searching...' : '▶ Start Tracking'}
              </button>
            : <button onClick={stopTracking} style={{ ...dangerBtn, width:'100%', height:38, fontSize:13, marginBottom:7 }}>■ Stop Tracking</button>
          }
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            <button onClick={()=>!isTracking&&!loading&&doFetch()} disabled={isTracking||loading} style={{ ...ghostBtn, height:30, fontSize:11, opacity:(isTracking||loading)?.4:1 }}>↻ Once</button>
            <button onClick={saveRoute} style={{ ...ghostBtn, height:30, fontSize:11 }}>★ Save</button>
          </div>

          {savedRoutes.length > 0 && <>
            <Divider />
            <SLabel>Saved Routes</SLabel>
            {savedRoutes.map(r => (
              <div key={r.id} onClick={()=>loadRoute(r)} style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:7, padding:'8px 10px', marginBottom:5, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:13, fontWeight:800, fontFamily:'DM Mono,monospace', color:'var(--accent)' }}>{r.origin}→{r.destination}</span>
                <span style={{ fontSize:10, color:'var(--muted)' }}>{r.cabin} · {r.minLayover||60}m+</span>
              </div>
            ))}
          </>}

          <Divider />
          <SLabel>Agent Log</SLabel>
          <div ref={logRef} style={{ background:'#05060b', border:'0.5px solid var(--border)', borderRadius:7, padding:'8px 10px', height:160, overflowY:'auto', fontFamily:'DM Mono,monospace', fontSize:10.5 }}>
            {logs.map(l => (
              <div key={l.id} style={{ color:l.type==='ok'?'var(--green)':l.type==='err'?'var(--red)':l.type==='warn'?'var(--amber)':l.type==='info'?'var(--blue)':'var(--muted)', lineHeight:1.65, padding:'1px 0' }}>
                [{l.ts}] {l.msg}
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main style={{ padding:'1.25rem', overflowY:'auto' }}>

          {flights.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:14 }}>
              {[
                { label:'Cheapest', value:`CA$${cheapest?.toLocaleString()}`, sub:flights.find(f=>f.price===cheapest)?.airline, color:'var(--green)' },
                { label:'Average',  value:`CA$${average?.toLocaleString()}`,  sub:`${flights.length} options` },
                { label:'Direct flights', value:String(directCount), sub:`${flights.length-directCount} with stops`, color:directCount>0?'var(--blue)':undefined },
                { label:'Movement', value:drops>0||rises>0?`${drops>0?`▼${drops}`:''} ${rises>0?`▲${rises}`:''}`.trim():'—', sub:'this tick', color:drops>0?'var(--green)':rises>0?'var(--red)':undefined },
                { label:'Signal',   value:meta?.recommendation||'—', sub:`${meta?.priceLevel||'—'} season`, color:meta?.priceLevel==='peak'?'var(--red)':meta?.priceLevel==='high'?'var(--amber)':'var(--green)' },
              ].map(m => (
                <div key={m.label} style={{ ...card, padding:'11px 13px' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{m.label}</div>
                  <div style={{ fontSize:18, fontWeight:800, letterSpacing:'-.03em', color:m.color||'var(--text)', lineHeight:1.2 }}>{m.value}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{m.sub}</div>
                </div>
              ))}
            </div>
          )}

          {meta && (
            <div style={{ background:'rgba(110,231,183,.04)', border:'0.5px solid rgba(110,231,183,.15)', borderRadius:9, padding:'10px 14px', marginBottom:12 }}>
              {/* Source breakdown row */}
              {meta.sourceStats?.length > 0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                  {meta.sourceStats.map(s => {
                    const color = s.status==='ok' ? (s.name==='SerpAPI'?'green':s.name==='Duffel'?'blue':s.name==='Kiwi'?'amber':'purple')
                      : s.status==='error' ? 'red' : 'grey'
                    const icon  = s.status==='ok' ? '✓' : s.status==='error' ? '✗' : s.status==='skipped' ? '—' : '○'
                    const bg    = s.status==='ok'
                      ? (s.name==='SerpAPI'?'rgba(34,197,94,.1)':s.name==='Duffel'?'rgba(59,130,246,.1)':s.name==='Kiwi'?'rgba(245,158,11,.1)':'rgba(168,85,247,.1)')
                      : s.status==='error' ? 'rgba(239,68,68,.1)' : 'rgba(55,65,81,.15)'
                    const fg    = s.status==='ok'
                      ? (s.name==='SerpAPI'?'var(--green)':s.name==='Duffel'?'var(--blue)':s.name==='Kiwi'?'var(--amber)':'var(--purple)')
                      : s.status==='error' ? 'var(--red)' : 'var(--hint)'
                    return (
                      <span key={s.name} style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:bg, color:fg, fontFamily:'DM Mono,monospace' }}>
                        {icon} {s.name}{s.count > 0 ? ` ${s.count}` : ''}
                      </span>
                    )
                  })}
                  {meta.elapsed && <span style={{ fontSize:10, color:'var(--hint)', padding:'2px 4px' }}>{meta.elapsed}ms total</span>}
                  {meta.totalMerged > flights.length && (
                    <span style={{ fontSize:10, color:'var(--muted)', padding:'2px 4px' }}>
                      {meta.totalMerged} merged → {meta.afterDedup} deduped → {flights.length} shown
                    </span>
                  )}
                </div>
              )}
              {/* Summary text */}
              {meta.summary && (
                <div style={{ fontSize:12, color:'#9ca3af', lineHeight:1.7 }}>
                  <span style={{ color:'var(--accent)', fontWeight:800 }}>Summary: </span>
                  {meta.summary}
                  {meta.source==='estimate' && <span style={{ color:'var(--hint)', fontSize:11 }}> (estimated — live APIs returning no data for this route)</span>}
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:12, flexWrap:'wrap' }}>
            {[['flights',`Flights (${flights.length})`],['history','Price History'],['alerts',`Alerts (${alerts.length})`],['notifications','Notifications']].map(([id,lbl]) => (
              <button key={id} onClick={()=>setActiveTab(id)} style={{ padding:'6px 13px', fontSize:12, fontWeight:700, fontFamily:'inherit', borderRadius:7, cursor:'pointer', background:activeTab===id?'var(--accent-dim)':'transparent', border:`0.5px solid ${activeTab===id?'rgba(110,231,183,.3)':'var(--border)'}`, color:activeTab===id?'var(--accent)':'var(--muted)' }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Flights tab */}
          {activeTab==='flights' && (
            <>
              {flights.length > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--muted)' }}>
                    <span>{flights.length} options · {origin} → {destination} · min {minLayover}min layover</span>
                    {isTracking && <Badge color="green" small>● LIVE</Badge>}
                    {meta?.directAvailable && <Badge color="blue" small>Direct available</Badge>}
                  </div>
                  <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ height:28, padding:'0 8px', background:'var(--card)', border:'0.5px solid var(--border-hi)', borderRadius:6, color:'var(--text)', fontFamily:'inherit', fontSize:11, outline:'none' }}>
                    {[['price','Price ↑'],['duration','Duration ↑'],['stops','Stops ↑'],['layover','Layover ↑'],['rating','Rating ↓']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              )}

              {sorted.length === 0
                ? <div style={{ textAlign:'center', padding:'4rem 1rem', color:'var(--hint)' }}>
                    <div style={{ fontSize:52, marginBottom:14 }}>✈</div>
                    <div style={{ fontSize:15, fontWeight:700 }}>Ready to search</div>
                    <div style={{ fontSize:13, marginTop:6 }}>Type a city or airport code in From/To fields, then click Start Tracking</div>
                  </div>
                : sorted.map(f => {
                    const fkey  = f._stableKey || `${(f.airline||'').slice(0,12).replace(/\s/g,'')}-${f.stops}-${f.via||'direct'}`
                    const prev  = prevPrices[fkey]
                    const hist  = history[fkey] || []
                    const flash = flashMap[fkey]
                    const isExp = expandedFlight === fkey
                    const isBest = f.priceCategory === 'cheapest'
                    const isVal  = f.priceCategory === 'best_value'
                    const borderC = isBest?'rgba(34,197,94,.4)':isVal?'rgba(59,130,246,.4)':'var(--border)'
                    const stopC   = f.stops===0?'green':f.stops===1?'amber':'red'
                    const stopLbl = f.stops===0?'Direct':f.stops===1?`1 stop · ${f.via||''}`:`${f.stops} stops · ${f.via||''}`

                    return (
                      <div key={fkey}
                        className={flash==='g'?'anim-flash-g':flash==='r'?'anim-flash-r':'anim-fade'}
                        style={{ background:'var(--surface)', border:`0.5px solid ${borderC}`, borderRadius:10, padding:'13px 15px', marginBottom:8, cursor:'pointer' }}
                        onClick={()=>setExpandedFlight(isExp?null:fkey)}>

                        <div style={{ display:'grid', gridTemplateColumns:'44px 1fr auto', gap:'0 13px', alignItems:'center' }}>
                          <div style={{ width:40, height:40, borderRadius:7, background:'var(--card)', border:'0.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'var(--muted)', fontFamily:'DM Mono,monospace' }}>
                            {f.code}
                          </div>
                          <div>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                              <span style={{ fontSize:15, fontWeight:800, letterSpacing:'-.02em' }}>{f.departure}</span>
                              <div style={{ flex:1, height:'0.5px', background:'var(--border-hi)', position:'relative' }}>
                                <span style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:'var(--surface)', padding:'0 4px', fontSize:9, color:'var(--muted)', whiteSpace:'nowrap' }}>{f.duration}</span>
                              </div>
                              <span style={{ fontSize:15, fontWeight:800, letterSpacing:'-.02em' }}>{f.arrival}</span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                              <Badge color={stopC}>{stopLbl}</Badge>
                              <LayoverInfo flight={f} />
                              <span style={{ fontSize:11, color:'var(--muted)' }}>{f.airline}</span>
                              {f.rating && <span style={{ fontSize:11, color:'var(--muted)' }}>★ {f.rating}</span>}
                              {f.seatsLeft<=4 && f.seatsLeft!=null && <Badge color="red" small>Only {f.seatsLeft} left!</Badge>}
                              {f.refundable  && <Badge color="green" small>✓ Refundable</Badge>}
                              {f.changeable  && <Badge color="blue"  small>✓ Changeable</Badge>}
                              {f.apiSource   && <Badge color={f.apiSource==='SerpAPI'?'green':f.apiSource==='Duffel'?'blue':f.apiSource==='Kiwi'?'amber':'purple'} small>{f.apiSource}</Badge>}
                            </div>
                            {hist.length >= 2 && <div style={{ marginTop:7 }}><Sparkline data={hist} /></div>}
                          </div>
                          <div style={{ textAlign:'right', minWidth:138 }} onClick={e=>e.stopPropagation()}>
                            {(isBest||isVal) && (
                              <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.07em', textTransform:'uppercase', color:isBest?'var(--green)':'var(--blue)', marginBottom:3 }}>
                                {isBest?'★ Cheapest':'⚡ Best Value'}
                              </div>
                            )}
                            <div style={{ fontSize:21, fontWeight:800, letterSpacing:'-.03em' }}>CA${f.price.toLocaleString()}</div>
                            <PriceDelta cur={f.price} prev={prev} />
                            <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>per person · {cabin}</div>
                            <div style={{ display:'flex', gap:5, justifyContent:'flex-end', marginTop:6, flexWrap:'wrap', alignItems:'center' }}>
                              {/* Expiry warning for Duffel offers */}
                              {f.source === 'duffel' && f.expiresAt && (
                                <div style={{ fontSize:9, color:'var(--amber)', fontFamily:'DM Mono,monospace', textAlign:'right', width:'100%', marginBottom:2 }}>
                                  ⏳ offer expires {new Date(f.expiresAt).toLocaleTimeString('en-GB',{hour12:false,hour:'2-digit',minute:'2-digit'})}
                                </div>
                              )}
                              <a href={getBookUrl(f)} target="_blank" rel="noopener"
                                style={{ padding:'4px 11px', fontSize:11, fontWeight:700, background:'var(--accent-dim)', border:'0.5px solid rgba(110,231,183,.25)', borderRadius:6, color:'var(--accent)', textDecoration:'none', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
                                {f.source === 'duffel' ? '🎫 Book via Duffel' : '✈ Book Now'}
                              </a>
                            </div>
                          </div>
                        </div>
                        {isExp && <SegmentTimeline segments={f.segments} />}
                      </div>
                    )
                  })
              }
            </>
          )}

          {/* History tab */}
          {activeTab==='history' && (
            <>
              {histChartData.length > 1 ? (
                <div style={{ ...card, padding:'1rem 1.25rem', marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:12 }}>Price trend — all airlines tracked</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={histChartData}>
                      <XAxis dataKey="i" hide />
                      <YAxis tickFormatter={v=>`$${Math.round(v/1000)}k`} tick={{ fontSize:10, fill:'#6b7280' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={v=>[`CA$${v.toLocaleString()}`,'']} contentStyle={{ background:'#13161f', border:'0.5px solid rgba(255,255,255,.1)', borderRadius:8, fontSize:12 }} />
                      {Object.keys(history).map((key,i) => (
                        <Line key={key} type="monotone" dataKey={key} stroke={chartColors[i%chartColors.length]} strokeWidth={1.5} dot={false} name={history[key]?.[0]?.airline||key} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <div style={{ textAlign:'center', padding:'2rem', color:'var(--hint)', fontSize:13, marginBottom:14 }}>Chart appears after 2+ refresh ticks</div>}
              {Object.entries(history).map(([key, hist]) => {
                const f = flights.find(fl => (fl.id||fl.code)===key)
                if (!hist.length) return null
                const min = Math.min(...hist.map(h=>h.p)), max = Math.max(...hist.map(h=>h.p))
                const last = hist[hist.length-1].p
                const change = hist.length>1 ? last-hist[hist.length-2].p : 0
                return (
                  <div key={key} style={{ ...card, padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:13 }}>
                    <div style={{ width:40, height:40, borderRadius:7, background:'var(--card)', border:'0.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'var(--muted)', fontFamily:'DM Mono,monospace', flexShrink:0 }}>{f?.code||key.slice(0,2)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{f?.airline||hist[0]?.airline||key}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Low CA${min.toLocaleString()} · High CA${max.toLocaleString()} · {hist.length} readings</div>
                    </div>
                    <Sparkline data={hist} />
                    <div style={{ textAlign:'right', minWidth:100 }}>
                      <div style={{ fontSize:19, fontWeight:800 }}>CA${last.toLocaleString()}</div>
                      {change!==0 && <div style={{ fontSize:10, color:change<0?'var(--green)':'var(--red)', fontWeight:700 }}>{change<0?'▼':'▲'} CA${Math.abs(change)}</div>}
                    </div>
                  </div>
                )
              })}
              {!Object.keys(history).length && <div style={{ textAlign:'center', padding:'3rem', color:'var(--hint)', fontSize:13 }}>No history yet — start tracking to record changes</div>}
            </>
          )}

          {/* Alerts tab */}
          {activeTab==='alerts' && (
            <>
              <div style={{ ...card, padding:'1rem 1.25rem', marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Add price threshold alert</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8, alignItems:'end' }}>
                  <Field label="Airline (blank = any)">
                    <input value={newAlertAirline} onChange={e=>setNewAlertAirline(e.target.value)} placeholder="e.g. Qatar Airways" style={inputStyle} />
                  </Field>
                  <Field label="Alert when price below (CA$)">
                    <input type="number" value={newAlertThresh} onChange={e=>setNewAlertThresh(e.target.value)} placeholder="e.g. 1500" style={inputStyle} />
                  </Field>
                  <button onClick={addAlert} style={{ ...primaryBtn, height:34, padding:'0 16px', fontSize:13 }}>+ Add</button>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:8, lineHeight:1.5 }}>
                  Fires browser notification{alertEmail ? ` + email to ${alertEmail}` : ' (set email in Notifications tab for email alerts)'}.
                </div>
              </div>
              {alerts.length === 0
                ? <div style={{ textAlign:'center', padding:'3rem', color:'var(--hint)' }}><div style={{ fontSize:36, marginBottom:10 }}>🔔</div><div>No alerts — add a threshold above</div></div>
                : alerts.map(a => (
                    <div key={a.id} style={{ ...card, padding:'12px 16px', marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700 }}>{a.airline==='any'?'Any airline':a.airline}</div>
                        <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>Alert when ≤ <span style={{ color:'var(--green)', fontWeight:700 }}>CA${a.threshold.toLocaleString()}</span><span style={{ marginLeft:8, color:'var(--hint)' }}>{a.route} · {a.date}</span></div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <Badge color="green">Active</Badge>
                        <button onClick={()=>removeAlert(a.id)} style={{ ...ghostBtn, height:28, padding:'0 10px', fontSize:11 }}>Remove</button>
                      </div>
                    </div>
                  ))
              }
            </>
          )}

          {/* Notifications tab */}
          {activeTab==='notifications' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ ...card, padding:'1rem 1.25rem' }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>Browser notifications</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12, lineHeight:1.6 }}>
                  Instant pop-up when a flight hits your price target. Status: <span style={{ color:notifPerm==='granted'?'var(--green)':notifPerm==='denied'?'var(--red)':'var(--amber)', fontWeight:700 }}>{notifPerm}</span>
                </div>
                {notifPerm !== 'granted'
                  ? <button onClick={enableNotifications} style={{ ...primaryBtn, height:34, padding:'0 18px', fontSize:13 }}>Enable browser notifications</button>
                  : <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <Badge color="green">✓ Enabled</Badge>
                      <button onClick={()=>sendBrowserNotification('✈ Test','FlightTrack alerts are working!')} style={{ ...ghostBtn, height:30, padding:'0 12px', fontSize:11 }}>Send test</button>
                    </div>
                }
              </div>
              <div style={{ ...card, padding:'1rem 1.25rem' }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>Email notifications</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12, lineHeight:1.6 }}>
                  Requires <strong style={{ color:'var(--text)' }}>RESEND_API_KEY</strong> in Vercel env vars. Free at <a href="https://resend.com" target="_blank" rel="noopener" style={{ color:'var(--accent)' }}>resend.com</a>.
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <input type="email" value={alertEmail} onChange={e=>{setAlertEmail(e.target.value);ls.set('ft_email',e.target.value)}} placeholder="you@example.com" style={{ ...inputStyle, flex:1 }} />
                  <button onClick={()=>addLog('ok','Email saved: '+alertEmail)} style={{ ...primaryBtn, height:34, padding:'0 14px', fontSize:12 }}>Save</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
