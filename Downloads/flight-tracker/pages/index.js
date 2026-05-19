import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { requestNotificationPermission, sendBrowserNotification, sendEmailAlert } from '../lib/notify.js'

const ls = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}

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
  { code:'SIN', name:'Changi',             country:'Singapore',   city:'Singapore'         },
  { code:'BKK', name:'Suvarnabhumi',       country:'Thailand',    city:'Bangkok'           },
  { code:'KUL', name:'KLIA',               country:'Malaysia',    city:'Kuala Lumpur'      },
  { code:'HKG', name:'Hong Kong Intl',     country:'Hong Kong',   city:'Hong Kong'         },
  { code:'NRT', name:'Narita',             country:'Japan',       city:'Tokyo'             },
  { code:'ICN', name:'Incheon',            country:'South Korea', city:'Seoul'             },
  { code:'SYD', name:'Kingsford Smith',    country:'Australia',   city:'Sydney'            },
  { code:'JFK', name:'John F Kennedy',     country:'USA',         city:'New York'          },
  { code:'LAX', name:'Los Angeles Intl',   country:'USA',         city:'Los Angeles'       },
  { code:'ORD', name:"O'Hare",             country:'USA',         city:'Chicago'           },
  { code:'SFO', name:'San Francisco Intl', country:'USA',         city:'San Francisco'     },
  { code:'IST', name:'Istanbul',           country:'Turkey',      city:'Istanbul'          },
  { code:'CMB', name:'Bandaranaike',       country:'Sri Lanka',   city:'Colombo'           },
]

function searchAirports(q) {
  if (!q || q.length < 2) return []
  const lo = q.toLowerCase()
  return AIRPORTS.filter(a =>
    a.code.toLowerCase().includes(lo) || a.city.toLowerCase().includes(lo) ||
    a.name.toLowerCase().includes(lo) || a.country.toLowerCase().includes(lo)
  ).slice(0, 6)
}

function AirportInput({ label, value, onChange }) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useEffect(() => {
    if (value) {
      const a = AIRPORTS.find(x => x.code === value)
      if (a) setQuery(`${a.code} — ${a.city}`)
      else setQuery(value)
    }
  }, [value])
  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  function handleInput(e) {
    const val = e.target.value; setQuery(val)
    if (/^[A-Za-z]{3}$/.test(val.trim())) {
      const exact = AIRPORTS.find(a => a.code === val.toUpperCase())
      if (exact) { select(exact); return }
    }
    const found = searchAirports(val); setResults(found); setOpen(found.length > 0)
    if (!found.length) onChange(val.toUpperCase().trim().slice(0, 3))
  }
  function select(a) { setQuery(`${a.code} — ${a.city}`); setResults([]); setOpen(false); onChange(a.code) }
  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      {label && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{label}</div>}
      <input value={query} onChange={handleInput} onFocus={() => { setQuery(''); setResults([]) }}
        onKeyDown={e => { if (e.key==='Escape') setOpen(false); if (e.key==='Enter'&&results.length>0) select(results[0]) }}
        placeholder="City or IATA code"
        style={{ width:'100%', height:34, padding:'0 10px', background:'var(--card)', border:'0.5px solid var(--border-hi)', borderRadius:7, color:'var(--text)', fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box' }} />
      {open && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--card)', border:'0.5px solid var(--border-hi)', borderRadius:8, zIndex:99, marginTop:3, boxShadow:'0 8px 32px rgba(0,0,0,.5)', overflow:'hidden' }}>
          {results.map(a => (
            <div key={a.code} onClick={() => select(a)}
              style={{ padding:'8px 12px', cursor:'pointer', display:'flex', gap:10, alignItems:'center' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(110,231,183,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <span style={{ fontFamily:'DM Mono,monospace', fontSize:13, fontWeight:800, color:'var(--accent)', minWidth:36 }}>{a.code}</span>
              <div><div style={{ fontSize:12, fontWeight:600 }}>{a.city}</div><div style={{ fontSize:10, color:'var(--muted)' }}>{a.name}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const Divider = () => <div style={{ height:'0.5px', background:'var(--border)', margin:'14px 0' }} />
const SLabel = ({ children }) => <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.09em', textTransform:'uppercase', color:'var(--hint)', marginBottom:9 }}>{children}</div>
function Field({ label, children }) { return <div style={{ marginBottom:9 }}>{label&&<div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{label}</div>}{children}</div> }
const inputStyle = { width:'100%', height:34, padding:'0 10px', background:'var(--card)', border:'0.5px solid var(--border-hi)', borderRadius:7, color:'var(--text)', fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box' }
const primaryBtn = { background:'var(--accent)', color:'#07080f', border:'none', borderRadius:7, fontWeight:800, cursor:'pointer', fontFamily:'inherit', fontSize:13 }
const ghostBtn   = { background:'transparent', color:'var(--muted)', border:'0.5px solid var(--border-hi)', borderRadius:7, fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:12 }
const card       = { background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:10, marginBottom:10 }

function Badge({ children, color='green', small=false }) {
  const bg = { green:'var(--green-dim)', amber:'var(--amber-dim)', red:'var(--red-dim)', blue:'var(--blue-dim)', purple:'var(--purple-dim)', grey:'rgba(55,65,81,.15)' }[color]||'var(--green-dim)'
  const fg = { green:'var(--green)', amber:'var(--amber)', red:'var(--red)', blue:'var(--blue)', purple:'var(--purple)', grey:'var(--hint)' }[color]||'var(--green)'
  return <span style={{ fontSize:small?9:10, fontWeight:700, padding:small?'1px 6px':'2px 8px', borderRadius:99, background:bg, color:fg, whiteSpace:'nowrap' }}>{children}</span>
}
function PriceDelta({ cur, prev }) {
  if (!prev||cur===prev) return null
  const diff=cur-prev, up=diff>0
  return <span style={{ fontSize:10, fontFamily:'DM Mono,monospace', fontWeight:700, padding:'1px 6px', borderRadius:4, marginLeft:5, background:up?'var(--red-dim)':'var(--green-dim)', color:up?'var(--red)':'var(--green)' }}>{up?'▲':'▼'} CA${Math.abs(diff).toLocaleString()}</span>
}
function Sparkline({ data }) {
  if (!data||data.length<2) return null
  const pts=data.map((d,i)=>({i,p:d.p})), prices=data.map(d=>d.p)
  const last=prices[prices.length-1], prev=prices[prices.length-2]
  const stroke=last>prev?'var(--red)':last<prev?'var(--green)':'var(--muted)'
  return <div style={{ width:90, height:26 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={pts}><Line type="monotone" dataKey="p" stroke={stroke} strokeWidth={1.5} dot={false}/><YAxis domain={[Math.min(...prices)*.997,Math.max(...prices)*1.003]} hide/><XAxis dataKey="i" hide/></LineChart></ResponsiveContainer></div>
}
function SegmentTimeline({ segments }) {
  if (!segments?.length) return null
  return (
    <div style={{ marginTop:10, paddingTop:10, borderTop:'0.5px solid var(--border)' }}>
      {segments.map((seg,i) => (
        <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:i<segments.length-1?6:0 }}>
          <div style={{ width:36, fontSize:10, fontFamily:'DM Mono,monospace', color:'var(--accent)', flexShrink:0, paddingTop:2 }}>{seg.from}</div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
              <span style={{ fontWeight:700 }}>{seg.dep}</span>
              <span style={{ color:'var(--muted)', fontSize:10 }}>{seg.airline} {seg.flight}</span>
              <span style={{ fontWeight:700 }}>{seg.arr}</span>
            </div>
            {seg.layoverMins>0 && <div style={{ fontSize:10, color:'var(--amber)', marginTop:2, textAlign:'center' }}>↕ {Math.floor(seg.layoverMins/60)}h {seg.layoverMins%60}m at {seg.to}</div>}
          </div>
          <div style={{ width:36, fontSize:10, fontFamily:'DM Mono,monospace', color:'var(--accent)', flexShrink:0, paddingTop:2, textAlign:'right' }}>{seg.to}</div>
        </div>
      ))}
    </div>
  )
}

// ── Price Grid Component ──────────────────────────────────────────────────
// One-way  (retDate empty): 7 outbound dates centred on depDate, airlines as rows
// Round-trip (retDate set): 7×7 matrix — outbound dates (X) × return dates (Y)
// Clicking a cell redirects to Google Flights / airline for that specific combo
function PriceGrid({ origin, destination, baseDate, retDate, cabin, passengers }) {
  const isRoundTrip = !!retDate

  const [gridData,    setGridData]    = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [loadingMsg,  setLoadingMsg]  = useState('')
  const [error,       setError]       = useState('')

  // 7 dates centred on a given date — parse as local date to avoid UTC timezone shift
  function week(center) {
    // Parse YYYY-MM-DD manually so no timezone conversion occurs
    const [y, m, d] = center.split('-').map(Number)
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(y, m - 1, d + i - 3) // local date arithmetic
      const yy = dt.getFullYear()
      const mm = String(dt.getMonth() + 1).padStart(2, '0')
      const dd = String(dt.getDate()).padStart(2, '0')
      return `${yy}-${mm}-${dd}`
    })
  }

  const outDates = useMemo(() => baseDate ? week(baseDate) : [], [baseDate])
  const inDates  = useMemo(() => retDate  ? week(retDate)  : [], [retDate])

  function fmt(dt) {
    // Parse YYYY-MM-DD as local date to avoid UTC midnight → local yesterday shift
    const [y, m, d] = dt.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return {
      short: date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
      day:   date.toLocaleDateString('en-CA', { weekday: 'short' }),
    }
  }

  function cellBg(price, minP, maxP) {
    if (!price) return 'transparent'
    const r = maxP === minP ? 0.5 : (price - minP) / (maxP - minP)
    if (r < 0.2)  return 'rgba(34,197,94,0.30)'
    if (r < 0.45) return 'rgba(34,197,94,0.14)'
    if (r < 0.7)  return 'rgba(245,158,11,0.13)'
    return 'rgba(239,68,68,0.18)'
  }

  // Build Google Flights redirect URL for a specific out+return date
  function bookUrl(outDt, retDt) {
    const params = new URLSearchParams({
      source: 'serpapi_google_flights',
      origin, destination, date: outDt,
      ...(retDt ? { returnDate: retDt } : {}),
      cabin,
    })
    return `/api/book?${params.toString()}`
  }

  async function fetchGrid() {
    if (!baseDate) return
    setLoading(true); setError(''); setGridData(null)

    try {
      if (!isRoundTrip) {
        // ── ONE WAY: fetch 7 outbound dates, build airlines × dates grid ──
        setLoadingMsg('Fetching 7 outbound dates…')
        const results = await Promise.allSettled(outDates.map(date =>
          fetch('/api/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, destination, date, returnDate: '', cabin, passengers: parseInt(passengers) || 1, minLayoverMins: 60, currency: 'CAD' }),
          }).then(r => r.json())
        ))

        // airlineMap: name → { code, prices: { date → {price, googleUrl} } }
        const airlineMap = {}
        results.forEach((res, i) => {
          if (res.status !== 'fulfilled') return
          ;(res.value?.flights || []).filter(f => f.price > 0).forEach(f => {
            const key = f.airline || 'Unknown'
            if (!airlineMap[key]) airlineMap[key] = { code: f.code || '??', cells: {} }
            const ex = airlineMap[key].cells[outDates[i]]
            if (!ex || f.price < ex.price) {
              airlineMap[key].cells[outDates[i]] = {
                price: f.price,
                googleUrl: f.googleFlightsUrl || '',
                airline: f.airline, code: f.code,
              }
            }
          })
        })

        const rows = Object.entries(airlineMap)
          .map(([name, info]) => {
            const vals = Object.values(info.cells).map(c => c.price).filter(Boolean)
            return { name, code: info.code, cells: info.cells, minP: vals.length ? Math.min(...vals) : Infinity }
          })
          .sort((a, b) => a.minP - b.minP)

        const allPrices = rows.flatMap(r => Object.values(r.cells).map(c => c.price))
        setGridData({ mode: 'oneway', outDates, rows, minP: Math.min(...allPrices), maxP: Math.max(...allPrices) })

      } else {
        // ── ROUND TRIP: 7×7 matrix, only valid pairs (out < in) ──────────
        const combos = []
        outDates.forEach(out => inDates.forEach(ret => { if (ret > out) combos.push({ out, ret }) }))
        setLoadingMsg(`Fetching ${combos.length} date combinations…`)

        const results = await Promise.allSettled(combos.map(({ out, ret }) =>
          fetch('/api/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, destination, date: out, returnDate: ret, cabin, passengers: parseInt(passengers) || 1, minLayoverMins: 60, currency: 'CAD' }),
          }).then(r => r.json())
        ))

        // matrix: out → ret → { price, googleUrl }
        const matrix = {}
        outDates.forEach(o => { matrix[o] = {} })

        results.forEach((res, i) => {
          if (res.status !== 'fulfilled') return
          const { out, ret } = combos[i]
          const flights = (res.value?.flights || []).filter(f => f.price > 0)
          if (!flights.length) return
          const best = flights.reduce((a, b) => a.price < b.price ? a : b)
          const ex = matrix[out][ret]
          if (!ex || best.price < ex.price) {
            matrix[out][ret] = { price: best.price, googleUrl: best.googleFlightsUrl || '', airline: best.airline, code: best.code }
          }
        })

        const allPrices = outDates.flatMap(o => Object.values(matrix[o]).map(c => c.price).filter(Boolean))
        setGridData({ mode: 'roundtrip', outDates, inDates, matrix, minP: Math.min(...allPrices), maxP: Math.max(...allPrices) })
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const thBase = { padding: '7px 8px', fontSize: 10, fontWeight: 700, borderBottom: '0.5px solid var(--border)', whiteSpace: 'nowrap', textAlign: 'center', minWidth: 82 }

  function PriceCell({ cell, outDt, retDt, minP, maxP, isSelectedOut, isSelectedRet }) {
    const isEmpty = !cell
    const isSelected = isSelectedOut && (retDt ? isSelectedRet : true)

    function handleClick() {
      // Route through /api/grid-book which does a live SerpAPI lookup
      // to get the exact Google Flights URL for this date combo
      const params = new URLSearchParams({
        origin, destination,
        date: outDt,
        cabin,
        passengers: String(passengers),
      })
      if (retDt) params.set('returnDate', retDt)
      window.open(`/api/grid-book?${params}`, '_blank')
    }

    if (isEmpty) return (
      <td style={{ padding: '6px 8px', textAlign: 'center', background: 'transparent',
        border: isSelected ? '2px solid rgba(110,231,183,0.7)' : '1px solid transparent' }}>
        <span style={{ color: 'var(--hint)' }}>—</span>
      </td>
    )

    const isMin = cell.price === minP
    return (
      <td onClick={handleClick}
        style={{ padding: '6px 8px', textAlign: 'center', cursor: 'pointer',
          background: cellBg(cell.price, minP, maxP),
          border: isSelected ? '2px solid rgba(110,231,183,0.8)' : '1px solid transparent',
          position: 'relative' }}
        title={`Click to view ${origin}→${destination} on ${outDt}${retDt ? ` returning ${retDt}` : ''} in Google Flights`}>
        {isSelected && (
          <div style={{ position: 'absolute', top: 2, right: 3, fontSize: 8, color: 'var(--accent)', fontWeight: 900, lineHeight: 1 }}>★</div>
        )}
        <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'DM Mono,monospace', color: isMin ? 'var(--green)' : 'var(--text)' }}>
          ${cell.price.toLocaleString()}
        </div>
        {isMin && <div style={{ fontSize: 8, color: 'var(--green)', fontWeight: 700 }}>BEST</div>}
      </td>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {isRoundTrip
            ? <><span style={{ color: 'var(--accent)', fontWeight: 700 }}>Outbound</span> (X) × <span style={{ color: 'var(--blue)', fontWeight: 700 }}>Return</span> (Y) — ±3 days each · click any cell to view flights</>
            : <><span style={{ color: 'var(--accent)', fontWeight: 700 }}>One-way</span> — 7 outbound dates centred on {baseDate} · click any price to view flights</>
          }
        </div>
        <button onClick={fetchGrid} disabled={loading}
          style={{ ...primaryBtn, height: 30, padding: '0 14px', fontSize: 12, opacity: loading ? 0.6 : 1 }}>
          {loading ? '⟳ Loading…' : '🔍 Load Grid'}
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--red)' }}>{error}</span>}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 10, color: 'var(--muted)', alignItems: 'center' }}>
        {[['rgba(34,197,94,0.30)', 'Cheapest'], ['rgba(34,197,94,0.14)', 'Low'], ['rgba(245,158,11,0.13)', 'Mid'], ['rgba(239,68,68,0.18)', 'High']].map(([bg, lbl]) => (
          <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: bg, display: 'inline-block', border: '0.5px solid var(--border-hi)' }} />{lbl}
          </span>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)', fontSize: 13 }}>
          <div className="anim-spin" style={{ fontSize: 26, display: 'inline-block', marginBottom: 10 }}>⟳</div>
          <div>{loadingMsg}</div>
        </div>
      )}

      {!gridData && !loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--hint)', fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
          <div>Click <strong>Load Grid</strong> to fetch prices</div>
          {!isRoundTrip && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--hint)' }}>Tip: set a return date in config to enable the round-trip 7×7 matrix</div>}
        </div>
      )}

      {/* ONE WAY TABLE: airlines × outbound dates */}
      {gridData?.mode === 'oneway' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...thBase, textAlign: 'left', padding: '7px 10px', position: 'sticky', left: 0, background: 'var(--surface)', minWidth: 140 }}>Airline</th>
                {gridData.outDates.map(dt => {
                  const { short, day } = fmt(dt)
                  const isSel = dt === baseDate
                  return (
                    <th key={dt} style={{ ...thBase, color: isSel ? 'var(--accent)' : 'var(--muted)', background: isSel ? 'rgba(110,231,183,0.10)' : 'transparent', borderBottom: isSel ? '2px solid var(--accent)' : '0.5px solid var(--border)' }}>
                      <div style={{ fontSize: isSel ? 11 : 9, color: 'var(--accent)', marginBottom: 1, fontWeight: 900 }}>{isSel ? '★ selected' : ''}</div>
                      <div style={{ fontWeight: 800 }}>{short}</div>
                      <div style={{ fontSize: 9, color: 'var(--hint)' }}>{day}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {gridData.rows.length === 0
                ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--hint)' }}>No flights found</td></tr>
                : gridData.rows.map(row => (
                  <tr key={row.name} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', position: 'sticky', left: 0, background: 'var(--surface)', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, fontWeight: 800, color: 'var(--accent)', marginRight: 6 }}>{row.code}</span>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{row.name}</span>
                    </td>
                    {gridData.outDates.map(dt => (
                      <PriceCell key={dt} cell={row.cells[dt]} outDt={dt} minP={gridData.minP} maxP={gridData.maxP} isSelectedOut={dt === baseDate} />
                    ))}
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* ROUND TRIP TABLE: outbound dates (X cols) × return dates (Y rows) */}
      {gridData?.mode === 'roundtrip' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...thBase, position: 'sticky', left: 0, background: 'var(--surface)', borderRight: '0.5px solid var(--border)', minWidth: 90 }}>
                  <div style={{ fontSize: 9, color: 'var(--blue)', fontWeight: 700 }}>↩ Return</div>
                  <div style={{ fontSize: 8, color: 'var(--hint)' }}>↓ \ Outbound →</div>
                </th>
                {gridData.outDates.map(dt => {
                  const { short, day } = fmt(dt)
                  const isSel = dt === baseDate
                  return (
                    <th key={dt} style={{ ...thBase, color: isSel ? 'var(--accent)' : 'var(--muted)', background: isSel ? 'rgba(110,231,183,0.10)' : 'transparent', borderBottom: isSel ? '2px solid var(--accent)' : '0.5px solid var(--border)' }}>
                      <div style={{ fontSize: isSel ? 10 : 9, color: 'var(--accent)', marginBottom: 1, fontWeight: 900 }}>{isSel ? '★ out' : ''}</div>
                      <div style={{ fontWeight: 800, color: 'var(--accent)' }}>{short}</div>
                      <div style={{ fontSize: 9, color: 'var(--hint)' }}>{day}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {gridData.inDates.map(inDt => {
                const { short, day } = fmt(inDt)
                const isSel = inDt === retDate
                return (
                  <tr key={inDt} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', position: 'sticky', left: 0, background: isSel ? 'rgba(59,130,246,0.10)' : 'var(--surface)', borderRight: isSel ? '2px solid var(--blue)' : '0.5px solid var(--border)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: isSel ? 10 : 9, color: 'var(--blue)', marginBottom: 1, fontWeight: 900 }}>{isSel ? '★ ret' : ''}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--blue)' }}>{short}</div>
                      <div style={{ fontSize: 9, color: 'var(--hint)' }}>{day}</div>
                    </td>
                    {gridData.outDates.map(outDt => {
                      if (outDt >= inDt) return (
                        <td key={outDt} style={{ padding: '6px 8px', textAlign: 'center', background: 'rgba(0,0,0,0.12)' }}>
                          <span style={{ color: 'var(--hint)', fontSize: 10 }}>✕</span>
                        </td>
                      )
                      return (
                        <PriceCell key={outDt} cell={gridData.matrix[outDt]?.[inDt]} outDt={outDt} retDt={inDt}
                          minP={gridData.minP} maxP={gridData.maxP} isSelectedOut={outDt === baseDate} isSelectedRet={inDt === retDate} />
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Single route tracker ──────────────────────────────────────────────────
function RouteTracker({ route, onUpdate, alerts, alertEmail, addLog, firedAlertsRef }) {
  const { id, origin, destination, depDate, retDate, cabin, passengers, minLayover, refreshSecs } = route

  const [flights,    setFlights]    = useState([])
  const [history,    setHistory]    = useState({})
  const [prevPrices, setPrevPrices] = useState({})
  const [meta,       setMeta]       = useState(null)
  const [isTracking, setIsTracking] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [tickCount,  setTickCount]  = useState(0)
  const [lastFetch,  setLastFetch]  = useState(null)
  const [countdown,  setCountdown]  = useState(0)
  const [sortBy,     setSortBy]     = useState('price')
  const [activeTab,  setActiveTab]  = useState('flights')
  const [expandedFlight, setExpandedFlight] = useState(null)
  const [flashMap,   setFlashMap]   = useState({})

  const timerRef = useRef(null)
  const cdRef    = useRef(null)

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
      returnDate:   retDate || '',
      cabin,
      passengers:   String(passengers),
    })
    return `/api/book?${params.toString()}`
  }

  const doFetch = useCallback(async () => {
    setLoading(true)
    addLog('info', `[${origin}→${destination}] Tick #${tickCount+1} searching…`)
    try {
      const res = await fetch('/api/search', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ origin, destination, date:depDate, returnDate:retDate||null,
          cabin, passengers:parseInt(passengers)||1, minLayoverMins:parseInt(minLayover)||60,
          maxLayoverMins:null, currency:'CAD' }),
      })
      const result = await res.json()
      if (!res.ok||result.error) throw new Error(result.error||`HTTP ${res.status}`)
      const newFlights = (result.flights||[]).filter(f=>f.price>0).sort((a,b)=>(a.price||0)-(b.price||0))

      if (result.sourceStats?.length) {
        const activeCount = result.sourceStats.filter(s=>s.status==='ok').length
        result.sourceStats.forEach(s => {
          if (s.status==='ok') addLog('ok', `[${origin}→${destination}] ${s.name}: ${s.count}`)
          else if (s.status==='error') addLog('warn', `[${origin}→${destination}] ${s.name}: ${s.error||'error'}`)
          else if (s.status==='skipped'&&s.name==='Agent'&&activeCount>0) addLog('info', `[${origin}→${destination}] Agent: not needed`)
        })
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
          f._stableKey = k
          if (prevMap[k] && f.price < prevMap[k]) flashes[k] = 'g'
          else if (prevMap[k] && f.price > prevMap[k]) flashes[k] = 'r'
        })
        if (Object.keys(flashes).length) { setFlashMap(flashes); setTimeout(()=>setFlashMap({}),800) }

        // Check alerts
        const email = alertEmail
        for (const f of newFlights) {
          for (const a of alerts) {
            const airlineMatch = !a.airline||a.airline==='any'||f.code===a.airline||(f.airline||'').toLowerCase().includes((a.airline||'').toLowerCase())
            if (!airlineMatch) continue
            if (f.price<=0||f.price>a.threshold) continue
            const fireKey = `${id}-${a.id}-${f.code}-${f.stops}-${f.via||'direct'}`
            if (firedAlertsRef.current.has(fireKey)) continue
            firedAlertsRef.current.add(fireKey)
            addLog('ok', `🔔 ALERT [${origin}→${destination}]: ${f.airline} CA$${f.price.toLocaleString()} ≤ CA$${a.threshold.toLocaleString()}`)
            sendBrowserNotification(`✈ Price Drop! ${origin}→${destination}`, `${f.airline}: CA$${f.price.toLocaleString()}`)
            if (email) {
              const bookUrl = f.bookUrl||`https://www.google.com/travel/flights?q=flights+${origin}+to+${destination}+${depDate}`
              sendEmailAlert({ to:email, airline:f.airline, price:f.price, route:`${origin} → ${destination}`, date:depDate, bookUrl, threshold:a.threshold })
                .then(sent => { if (sent) addLog('ok',`📧 Email sent to ${email}`); else addLog('warn','📧 Email failed — check RESEND_API_KEY') })
            }
          }
        }
        return newFlights
      })

      setHistory(prev => {
        const now = Date.now(), upd = {...prev}
        newFlights.forEach(f => {
          const k = f._stableKey||f.code||f.id
          if (!upd[k]) upd[k] = []
          upd[k] = [...upd[k].slice(-29), { p:f.price, t:now, airline:f.airline }]
        })
        return upd
      })
      setMeta(result); setLastFetch(new Date()); setTickCount(t=>t+1)
    } catch(err) { addLog('err', `[${origin}→${destination}] ${err.message}`) }
    setLoading(false)
  }, [origin, destination, depDate, retDate, cabin, passengers, minLayover, tickCount, alerts, alertEmail, id])

  const startTracking = useCallback(async () => {
    setIsTracking(true); setTickCount(0)
    const rl = refreshSecs<60?`${refreshSecs}s`:refreshSecs<3600?`${Math.round(refreshSecs/60)}m`:`${(refreshSecs/3600).toFixed(1).replace(/\.0$/,'')}h`
    addLog('info', `▶ Tracking ${origin}→${destination} · refresh ${rl}`)
    await doFetch()
    setCountdown(refreshSecs)
    cdRef.current    = setInterval(()=>setCountdown(c=>c<=1?refreshSecs:c-1), 1000)
    timerRef.current = setInterval(doFetch, refreshSecs*1000)
  }, [origin, destination, refreshSecs, doFetch, addLog])

  const stopTracking = useCallback(() => {
    clearInterval(timerRef.current); clearInterval(cdRef.current)
    setIsTracking(false); setCountdown(0); addLog('warn', `⏹ Paused ${origin}→${destination}`)
  }, [addLog, origin, destination])

  useEffect(() => () => { clearInterval(timerRef.current); clearInterval(cdRef.current) }, [])

  const sorted = useMemo(() => [...flights].sort((a,b) => {
    if (sortBy==='price')    return (a.price||0)-(b.price||0)
    if (sortBy==='duration') return (a.durationMins||0)-(b.durationMins||0)
    if (sortBy==='stops')    return (a.stops||0)-(b.stops||0)
    if (sortBy==='rating')   return (b.rating||0)-(a.rating||0)
    return (a.price||0)-(b.price||0)
  }), [flights, sortBy])

  const cheapest = flights.length ? Math.min(...flights.map(f=>f.price)) : null
  const histChartData = (() => {
    const codes = Object.keys(history)
    if (!codes.length) return []
    const maxLen = Math.max(...codes.map(c=>(history[c]||[]).length))
    return Array.from({length:maxLen},(_,i)=>Object.fromEntries(codes.map(c=>[c,history[c]?.[i]?.p])))
  })()
  const chartColors = ['#6ee7b7','#3b82f6','#f59e0b','#a855f7','#ef4444','#22c55e','#0ea5e9']

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Route header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:15, fontWeight:800 }}>{origin} → {destination}</span>
          <span style={{ fontSize:11, color:'var(--muted)' }}>{depDate}{retDate?` ↩ ${retDate}`:''}</span>
          {isTracking && <Badge color="green" small>● LIVE</Badge>}
          {isTracking && countdown>0 && <span style={{ fontSize:10, color:'var(--muted)', fontFamily:'DM Mono,monospace' }}>next {countdown}s</span>}
          {tickCount>0 && <span style={{ fontSize:10, color:'var(--hint)', fontFamily:'DM Mono,monospace' }}>#{tickCount}</span>}
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {meta?.sourceStats?.filter(s=>s.status==='ok').map(s=>(
            <Badge key={s.name} color={s.name==='SerpAPI'?'green':s.name==='Duffel'?'blue':'amber'} small>{s.name} {s.count}</Badge>
          ))}
          {cheapest && <span style={{ fontSize:12, fontWeight:800, color:'var(--green)', fontFamily:'DM Mono,monospace' }}>from CA${cheapest.toLocaleString()}</span>}
          {!isTracking
            ? <button onClick={startTracking} disabled={loading} style={{ ...primaryBtn, height:30, padding:'0 14px', fontSize:12, opacity:loading?0.6:1 }}>{loading?'⟳':'▶'} Track</button>
            : <button onClick={stopTracking} style={{ ...ghostBtn, height:30, padding:'0 14px', fontSize:12 }}>⏹ Stop</button>
          }
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:12, flexWrap:'wrap' }}>
        {[['flights',`Flights (${flights.length})`],['grid','Price Grid'],['history','History']].map(([tid,lbl])=>(
          <button key={tid} onClick={()=>setActiveTab(tid)} style={{ padding:'5px 12px', fontSize:11, fontWeight:700, fontFamily:'inherit', borderRadius:7, cursor:'pointer', background:activeTab===tid?'var(--accent-dim)':'transparent', border:`0.5px solid ${activeTab===tid?'rgba(110,231,183,.3)':'var(--border)'}`, color:activeTab===tid?'var(--accent)':'var(--muted)' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Flights tab */}
      {activeTab==='flights' && (
        <>
          {flights.length>0 && (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{flights.length} options</span>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ height:26, padding:'0 6px', background:'var(--card)', border:'0.5px solid var(--border-hi)', borderRadius:6, color:'var(--text)', fontFamily:'inherit', fontSize:11, outline:'none' }}>
                {[['price','Price ↑'],['duration','Duration ↑'],['stops','Stops ↑'],['rating','Rating ↓']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          )}
          {sorted.length===0
            ? <div style={{ textAlign:'center', padding:'3rem 1rem', color:'var(--hint)' }}>
                {isTracking||loading
                  ? <><div className="anim-spin" style={{ fontSize:28, display:'inline-block', marginBottom:10 }}>⟳</div><div style={{ fontSize:13 }}>Searching…</div></>
                  : <><div style={{ fontSize:36, marginBottom:10 }}>✈</div><div style={{ fontSize:13 }}>Press Track to start</div></>}
              </div>
            : sorted.map(f => {
                const k = f._stableKey||f.code
                const prev = prevPrices[k]
                const isBest = f.price === cheapest
                const isExp  = expandedFlight === (f.id||k)
                const flashClass = flashMap[k]==='g'?'anim-flash-g':flashMap[k]==='r'?'anim-flash-r':''
                return (
                  <div key={f.id||k} className={flashClass} onClick={()=>setExpandedFlight(isExp?null:(f.id||k))}
                    style={{ ...card, padding:'12px 14px', cursor:'pointer', border:isBest?'0.5px solid rgba(34,197,94,0.3)':'0.5px solid var(--border)' }}>
                    <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                      <div style={{ width:40, height:40, borderRadius:8, background:isBest?'var(--green-dim)':'var(--surface)', border:'0.5px solid var(--border-hi)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:isBest?'var(--green)':'var(--muted)', fontFamily:'DM Mono,monospace', flexShrink:0 }}>{f.code||'??'}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:700, truncate:true }}>{f.airline}</span>
                          <span style={{ fontSize:10, color:'var(--muted)', fontFamily:'DM Mono,monospace', flexShrink:0 }}>{f.flightNumber}</span>
                        </div>
                        <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:4, flexWrap:'wrap' }}>
                          <span style={{ fontSize:12, fontFamily:'DM Mono,monospace' }}>{f.departure} → {f.arrival}</span>
                          <span style={{ fontSize:10, color:'var(--muted)' }}>{f.duration}</span>
                          {f.stops===0 ? <Badge color="green" small>Direct</Badge> : <Badge color="amber" small>{f.stops} stop{f.stops>1?'s':''}{f.via?` via ${f.via}`:''}</Badge>}
                          {f.seatsLeft!==null && f.seatsLeft<=5 && <Badge color="red" small>⚡ {f.seatsLeft} left</Badge>}
                          <Sparkline data={history[k]} />
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        {isBest && <div style={{ fontSize:9, fontWeight:800, color:'var(--green)', marginBottom:2 }}>★ Cheapest</div>}
                        <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-.03em' }}>CA${f.price.toLocaleString()}</div>
                        <PriceDelta cur={f.price} prev={prev} />
                        <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{cabin}</div>
                        <div style={{ marginTop:6 }}>
                          <a href={getBookUrl(f)} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()}
                            style={{ padding:'4px 10px', fontSize:11, fontWeight:700, background:'var(--accent-dim)', border:'0.5px solid rgba(110,231,183,.25)', borderRadius:6, color:'var(--accent)', textDecoration:'none', fontFamily:'inherit', display:'inline-block' }}>
                            {f.source==='serpapi_google_flights'?'🔍 Google Flights':`✈ Book ${f.airline?.split(' ')[0]||''}`}
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

      {/* Price Grid tab */}
      {activeTab==='grid' && (
        <PriceGrid origin={origin} destination={destination} baseDate={depDate} retDate={retDate} cabin={cabin} passengers={passengers} />
      )}

      {/* History tab */}
      {activeTab==='history' && (
        <>
          {histChartData.length>1
            ? <div style={{ ...card, padding:'1rem 1.25rem', marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:12 }}>Price trend</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={histChartData}>
                    <XAxis dataKey="i" hide />
                    <YAxis tickFormatter={v=>`$${Math.round(v/1000)}k`} tick={{ fontSize:10, fill:'#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={v=>[`CA$${v?.toLocaleString()}`]} contentStyle={{ background:'#13161f', border:'0.5px solid rgba(255,255,255,.1)', borderRadius:8, fontSize:12 }} />
                    {Object.keys(history).map((key,i)=>(
                      <Line key={key} type="monotone" dataKey={key} stroke={chartColors[i%chartColors.length]} strokeWidth={1.5} dot={false} name={history[key]?.[0]?.airline||key} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            : <div style={{ textAlign:'center', padding:'2rem', color:'var(--hint)', fontSize:13 }}>Chart appears after 2+ refresh ticks</div>
          }
        </>
      )}
    </div>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────
const DEFAULT_ROUTE = { id:1, origin:'YVR', destination:'COK', depDate:'2026-12-14', retDate:'', cabin:'economy', passengers:'1', minLayover:60, refreshSecs:30 }

export default function FlightTracker() {
  const [routes,       setRoutes]       = useState([{ ...DEFAULT_ROUTE }])
  const [activeRoute,  setActiveRoute]  = useState(1)
  const [logs,         setLogs]         = useState([])
  const [alerts,       setAlerts]       = useState([])
  const [alertEmail,   setAlertEmail]   = useState('')
  const [newAlertThresh,  setNewAlertThresh]  = useState('')
  const [newAlertAirline, setNewAlertAirline] = useState('')
  const [notifPerm,    setNotifPerm]    = useState('default')
  const [sideTab,      setSideTab]      = useState('config') // 'config' | 'alerts' | 'notifications' | 'log'
  const [showAddRoute, setShowAddRoute] = useState(false)
  // New route form
  const [newOrigin,    setNewOrigin]    = useState('YVR')
  const [newDest,      setNewDest]      = useState('')
  const [newDepDate,   setNewDepDate]   = useState('2026-12-14')
  const [newRetDate,   setNewRetDate]   = useState('')
  const [newCabin,     setNewCabin]     = useState('economy')

  const logRef        = useRef(null)
  const firedAlerts   = useRef(new Set())

  useEffect(() => {
    setAlerts(ls.get('ft_alerts', []))
    setAlertEmail(ls.get('ft_email', ''))
    if (typeof window!=='undefined'&&'Notification' in window) setNotifPerm(Notification.permission)
    addLog('ok','FlightTrack v3 ready — multi-route edition')
    addLog('info','Add up to 5 routes and track them simultaneously')
  }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logs])

  const addLog = useCallback((type, msg) => {
    const ts = new Date().toLocaleTimeString('en-GB',{hour12:false})
    setLogs(l => [...l.slice(-150), { id:Date.now()+Math.random(), ts, type, msg }])
  }, [])

  const cur = routes.find(r=>r.id===activeRoute)||routes[0]

  function updateRoute(field, val) {
    setRoutes(rs => rs.map(r => r.id===activeRoute ? {...r,[field]:val} : r))
  }

  function addRoute() {
    if (!newDest||routes.length>=5) return
    const id = Date.now()
    const r = { id, origin:newOrigin, destination:newDest, depDate:newDepDate, retDate:newRetDate, cabin:newCabin, passengers:'1', minLayover:60, refreshSecs:30 }
    setRoutes(rs => [...rs, r]); setActiveRoute(id); setShowAddRoute(false)
    setNewDest(''); setNewRetDate('')
    addLog('ok', `Route added: ${newOrigin} → ${newDest}`)
  }

  function removeRoute(id) {
    if (routes.length===1) return
    setRoutes(rs => rs.filter(r=>r.id!==id))
    if (activeRoute===id) setActiveRoute(routes.find(r=>r.id!==id)?.id||routes[0].id)
  }

  const addAlert = () => {
    if (!newAlertThresh) return
    const a = { id:Date.now(), airline:newAlertAirline||'any', threshold:parseInt(newAlertThresh), route:`${cur.origin}→${cur.destination}`, created:new Date().toISOString() }
    const upd = [...alerts,a]; setAlerts(upd); ls.set('ft_alerts',upd)
    addLog('ok', `Alert: below CA$${a.threshold.toLocaleString()} on ${a.route}`)
    setNewAlertThresh(''); setNewAlertAirline('')
  }
  const removeAlert = id => { const upd=alerts.filter(a=>a.id!==id); setAlerts(upd); ls.set('ft_alerts',upd) }
  const enableNotifications = async () => {
    const perm = await requestNotificationPermission(); setNotifPerm(perm)
    if (perm==='granted') addLog('ok','Browser notifications enabled')
    else addLog('warn','Notification permission denied')
  }

  const logTypeColor = { ok:'var(--green)', warn:'var(--amber)', err:'var(--red)', info:'var(--muted)' }

  return (
    <div style={{ fontFamily:"'Syne','DM Sans',system-ui,sans-serif", background:'var(--bg)', minHeight:'100vh', color:'var(--text)' }}>

      {/* Topbar */}
      <header style={{ background:'var(--surface)', borderBottom:'0.5px solid var(--border)', padding:'0 1.5rem', height:52, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>✈</span>
          <span style={{ fontSize:16, fontWeight:800, letterSpacing:'-.03em' }}>
            Flight<span style={{ color:'var(--accent)' }}>Track</span>
            <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400, marginLeft:8 }}>v3</span>
          </span>
        </div>
        {/* Route tabs */}
        <div style={{ display:'flex', gap:4, alignItems:'center', flex:1, marginLeft:24, overflowX:'auto' }}>
          {routes.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:0 }}>
              <button onClick={()=>setActiveRoute(r.id)}
                style={{ padding:'4px 12px', fontSize:12, fontWeight:700, fontFamily:'inherit', borderRadius:'7px 0 0 7px', cursor:'pointer', whiteSpace:'nowrap',
                  background:activeRoute===r.id?'var(--accent-dim)':'transparent',
                  border:`0.5px solid ${activeRoute===r.id?'rgba(110,231,183,.3)':'var(--border)'}`,
                  color:activeRoute===r.id?'var(--accent)':'var(--muted)' }}>
                {r.origin} → {r.destination}
              </button>
              {routes.length>1 && (
                <button onClick={()=>removeRoute(r.id)}
                  style={{ padding:'4px 7px', fontSize:11, fontWeight:700, fontFamily:'inherit', borderRadius:'0 7px 7px 0', cursor:'pointer',
                    background:activeRoute===r.id?'var(--accent-dim)':'transparent',
                    border:`0.5px solid ${activeRoute===r.id?'rgba(110,231,183,.3)':'var(--border)'}`,
                    borderLeft:'none', color:'var(--hint)' }}>×</button>
              )}
            </div>
          ))}
          {routes.length<5 && (
            <button onClick={()=>setShowAddRoute(v=>!v)}
              style={{ padding:'4px 10px', fontSize:12, fontWeight:700, fontFamily:'inherit', borderRadius:7, cursor:'pointer', background:showAddRoute?'var(--accent-dim)':'transparent', border:`0.5px solid ${showAddRoute?'rgba(110,231,183,.3)':'var(--border)'}`, color:showAddRoute?'var(--accent)':'var(--hint)', whiteSpace:'nowrap' }}>
              + Add Route
            </button>
          )}
        </div>
      </header>

      {/* Add route panel */}
      {showAddRoute && (
        <div style={{ background:'var(--surface)', borderBottom:'0.5px solid var(--border)', padding:'12px 1.5rem', display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ minWidth:140 }}><AirportInput label="From" value={newOrigin} onChange={setNewOrigin} /></div>
          <div style={{ minWidth:140 }}><AirportInput label="To" value={newDest} onChange={setNewDest} /></div>
          <div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Depart</div>
            <input type="date" value={newDepDate} onChange={e=>setNewDepDate(e.target.value)} style={{ ...inputStyle, width:140 }} />
          </div>
          <div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Return (optional)</div>
            <input type="date" value={newRetDate} onChange={e=>setNewRetDate(e.target.value)} style={{ ...inputStyle, width:140 }} />
          </div>
          <div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Cabin</div>
            <select value={newCabin} onChange={e=>setNewCabin(e.target.value)} style={{ ...inputStyle, width:120 }}>
              {[['economy','Economy'],['premium_economy','Prem Eco'],['business','Business'],['first','First']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button onClick={addRoute} style={{ ...primaryBtn, height:34, padding:'0 18px' }}>Add Route</button>
          <button onClick={()=>setShowAddRoute(false)} style={{ ...ghostBtn, height:34, padding:'0 14px' }}>Cancel</button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', minHeight:'calc(100vh - 52px)' }}>

        {/* Sidebar */}
        <aside style={{ background:'var(--surface)', borderRight:'0.5px solid var(--border)', padding:'1rem', overflowY:'auto', display:'flex', flexDirection:'column', gap:0 }}>

          {/* Side nav */}
          <div style={{ display:'flex', gap:3, marginBottom:14 }}>
            {[['config','⚙ Config'],['alerts',`🔔 Alerts (${alerts.length})`],['notifications','📧 Notify'],['log','📋 Log']].map(([t,l])=>(
              <button key={t} onClick={()=>setSideTab(t)}
                style={{ flex:1, padding:'5px 0', fontSize:10, fontWeight:700, fontFamily:'inherit', borderRadius:6, cursor:'pointer',
                  background:sideTab===t?'var(--accent-dim)':'transparent', border:`0.5px solid ${sideTab===t?'rgba(110,231,183,.3)':'var(--border)'}`,
                  color:sideTab===t?'var(--accent)':'var(--muted)' }}>
                {l}
              </button>
            ))}
          </div>

          {/* Config tab */}
          {sideTab==='config' && cur && (
            <>
              <SLabel>Route Config — {cur.origin} → {cur.destination}</SLabel>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:6, alignItems:'end', marginBottom:10 }}>
                <AirportInput label="From" value={cur.origin} onChange={v=>updateRoute('origin',v)} />
                <div style={{ textAlign:'center', color:'var(--hint)', paddingBottom:4, fontSize:18, paddingTop:20 }}>→</div>
                <AirportInput label="To" value={cur.destination} onChange={v=>updateRoute('destination',v)} />
              </div>
              <Field label="Departure">
                <input type="date" value={cur.depDate} onChange={e=>updateRoute('depDate',e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Return (optional — for round trip)">
                <input type="date" value={cur.retDate} onChange={e=>updateRoute('retDate',e.target.value)} style={inputStyle} />
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                <Field label="Cabin">
                  <select value={cur.cabin} onChange={e=>updateRoute('cabin',e.target.value)} style={inputStyle}>
                    {[['economy','Economy'],['premium_economy','Prem Eco'],['business','Business'],['first','First']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Passengers">
                  <select value={cur.passengers} onChange={e=>updateRoute('passengers',e.target.value)} style={inputStyle}>
                    {[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}
                  </select>
                </Field>
              </div>
              <Divider />
              <SLabel>Filters</SLabel>
              <Field label={`Min layover: ${cur.minLayover}min`}>
                <input type="range" min={0} max={300} step={15} value={cur.minLayover} onChange={e=>updateRoute('minLayover',+e.target.value)} style={{ width:'100%' }} />
              </Field>
              <Divider />
              <SLabel>Live Refresh</SLabel>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <input type="range" min={15} max={21600} step={15} value={cur.refreshSecs} onChange={e=>updateRoute('refreshSecs',+e.target.value)} style={{ flex:1 }} />
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:13, color:'var(--accent)', minWidth:40 }}>
                  {cur.refreshSecs<60?`${cur.refreshSecs}s`:cur.refreshSecs<3600?`${Math.round(cur.refreshSecs/60)}m`:`${(cur.refreshSecs/3600).toFixed(1).replace(/\.0$/,'')}h`}
                </span>
              </div>
            </>
          )}

          {/* Alerts tab */}
          {sideTab==='alerts' && (
            <>
              <SLabel>Price Alerts</SLabel>
              <div style={{ ...card, padding:'12px' }}>
                <Field label="Airline (or leave blank for any)">
                  <input value={newAlertAirline} onChange={e=>setNewAlertAirline(e.target.value)} placeholder="e.g. Qatar Airways" style={inputStyle} />
                </Field>
                <Field label="Alert when price below (CA$)">
                  <input type="number" value={newAlertThresh} onChange={e=>setNewAlertThresh(e.target.value)} placeholder="e.g. 1500" style={inputStyle} />
                </Field>
                <button onClick={addAlert} style={{ ...primaryBtn, width:'100%', height:32, fontSize:12 }}>+ Add Alert</button>
                <div style={{ fontSize:10, color:'var(--hint)', marginTop:6 }}>Alerts apply across all tracked routes</div>
              </div>
              {alerts.length===0
                ? <div style={{ textAlign:'center', padding:'2rem', color:'var(--hint)', fontSize:12 }}>No alerts yet</div>
                : alerts.map(a=>(
                  <div key={a.id} style={{ ...card, padding:'10px 12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700 }}>{a.airline==='any'?'Any airline':a.airline}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>≤ <span style={{ color:'var(--green)', fontWeight:700 }}>CA${a.threshold.toLocaleString()}</span> · {a.route}</div>
                    </div>
                    <button onClick={()=>removeAlert(a.id)} style={{ ...ghostBtn, height:26, padding:'0 8px', fontSize:11 }}>×</button>
                  </div>
                ))
              }
            </>
          )}

          {/* Notifications tab */}
          {sideTab==='notifications' && (
            <>
              <SLabel>Notifications</SLabel>
              <div style={{ ...card, padding:'12px', marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:6 }}>Browser</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>Status: <span style={{ color:notifPerm==='granted'?'var(--green)':notifPerm==='denied'?'var(--red)':'var(--amber)', fontWeight:700 }}>{notifPerm}</span></div>
                {notifPerm!=='granted'
                  ? <button onClick={enableNotifications} style={{ ...primaryBtn, height:32, width:'100%', fontSize:12 }}>Enable browser notifications</button>
                  : <div style={{ display:'flex', gap:8 }}>
                      <Badge color="green">✓ Enabled</Badge>
                      <button onClick={()=>sendBrowserNotification('✈ Test','FlightTrack alerts working!')} style={{ ...ghostBtn, height:28, padding:'0 10px', fontSize:11 }}>Test</button>
                    </div>
                }
              </div>
              <div style={{ ...card, padding:'12px' }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:6 }}>Email (Resend)</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>Requires RESEND_API_KEY in Vercel env vars</div>
                <div style={{ display:'flex', gap:6 }}>
                  <input type="email" value={alertEmail} onChange={e=>{setAlertEmail(e.target.value);ls.set('ft_email',e.target.value)}} placeholder="you@example.com" style={{ ...inputStyle, flex:1 }} />
                  <button onClick={()=>addLog('ok','Email saved: '+alertEmail)} style={{ ...primaryBtn, height:34, padding:'0 12px', fontSize:12 }}>Save</button>
                </div>
                {alertEmail && <div style={{ fontSize:10, color:'var(--green)', marginTop:6 }}>✓ Alerts will email {alertEmail}</div>}
              </div>
            </>
          )}

          {/* Log tab */}
          {sideTab==='log' && (
            <>
              <SLabel>Activity Log</SLabel>
              <div ref={logRef} style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:2, maxHeight:'calc(100vh - 180px)' }}>
                {logs.map(l => (
                  <div key={l.id} style={{ display:'flex', gap:6, fontSize:10, lineHeight:1.5, fontFamily:'DM Mono,monospace', padding:'2px 0', borderBottom:'0.5px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ color:'var(--hint)', flexShrink:0 }}>{l.ts}</span>
                    <span style={{ color:logTypeColor[l.type]||'var(--text)', wordBreak:'break-word' }}>{l.msg}</span>
                  </div>
                ))}
                {!logs.length && <div style={{ color:'var(--hint)', fontSize:11, textAlign:'center', marginTop:20 }}>No activity yet</div>}
              </div>
            </>
          )}
        </aside>

        {/* Main panel */}
        <main style={{ padding:'1.25rem', overflowY:'auto' }}>
          {routes.map(r => (
            <div key={r.id} style={{ display:r.id===activeRoute?'block':'none' }}>
              <RouteTracker
                route={r}
                alerts={alerts}
                alertEmail={alertEmail}
                addLog={addLog}
                firedAlertsRef={firedAlerts}
              />
            </div>
          ))}
        </main>
      </div>
    </div>
  )
}
