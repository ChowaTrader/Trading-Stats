'default'
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import AuthModal from '../components/AuthModal'

interface Trade {
  id: string
  date: string
  ticker: string
  action: string // 'L', 'S', 'B', 'SS'
  shares: number
  price: number
  pnl: number
  rMultiple: number
  trader: string
  tag?: string
  initialRisk?: number
  executions?: { price: number; shares: number; side: string; time: string }[]
}

type PlatformType = 'tradervue' | 'das' | 'sage'
type DisplayMode = 'currency' | 'r'

export default function TradingJournal() {
  const [user, setUser] = useState<any>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [activeTab, setActiveTab] = useState<'calendar' | 'reports' | 'trades' | 'journal' | 'community'>('calendar')
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedMonth, setSelectedMonth] = useState<number>(9) // 9 = Octubre
  
  const [displayMode, setDisplayMode] = useState<DisplayMode>('currency')
  const [dailyRisk, setDailyRisk] = useState<number>(100)

  const [trades, setTrades] = useState<Trade[]>([])
  const [journalNote, setJournalNote] = useState('')

  // NUEVOS ESTADOS: Etiquetas, Filtros y Selección Masiva
  const [availableTags, setAvailableTags] = useState<string[]>(['Breakout', 'DipBuy', 'Momentum', 'Reversal', 'A+ Setup'])
  const [newTagInput, setNewTagInput] = useState('')
  const [selectedTradeIds, setSelectedTradeIds] = useState<string[]>([])
  
  // Filtros de Trades
  const [filterTicker, setFilterTicker] = useState('')
  const [filterTag, setFilterTag] = useState('ALL')
  const [filterSide, setFilterSide] = useState('ALL')

  // Modales interactivos
  const [dayTradesModalDate, setDayTradesModalDate] = useState<string | null>(null)
  const [activeChartTrade, setActiveChartTrade] = useState<Trade | null>(null)

  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('tradervue')
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user || null)
      setCheckingAuth(false)
    }

    checkUser()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      setCheckingAuth(false)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) return

    const fetchTrades = async () => {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .order('id', { ascending: false })

      if (!error && data) {
        const mapped = data.map((t: any) => ({
          ...t,
          date: t.date || t.trade_date || new Date().toISOString().split('T')[0],
          ticker: t.ticker || t.symbol || 'UNKNOWN',
          rMultiple: t.r_multiple ?? (t.pnl ? t.pnl / (t.initialRisk || dailyRisk) : 0),
          tag: t.tag || t.tags || 'General',
          initialRisk: t.initialRisk || dailyRisk,
          executions: t.executions || [
            { price: t.price * 0.99, shares: t.shares, side: t.action.includes('L') || t.action === 'B' ? 'BUY' : 'SELL', time: '09:30:00' },
            { price: t.price, shares: t.shares, side: t.action.includes('L') || t.action === 'B' ? 'SELL' : 'BUY', time: '10:15:00' }
          ]
        }))
        setTrades(mapped)

        // Extraer tags únicas detectadas
        const uniqueTags = Array.from(new Set(mapped.map((t: any) => t.tag).filter(Boolean)))
        if (uniqueTags.length > 0) {
          setAvailableTags(prev => Array.from(new Set([...prev, ...uniqueTags])))
        }
      }
    }

    fetchTrades()
  }, [user, dailyRisk])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setTrades([])
  }

  // Importador CSV robusto con lectura de Tags de Tradervue
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setImportStatus(null)

    const { data: { session } } = await supabase.auth.getSession()
    const activeUserId = session?.user?.id || user?.id

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        if (!text) throw new Error("El archivo está vacío.")

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        if (lines.length < 2) throw new Error("El archivo CSV no contiene suficientes datos.")

        const newTradesToInsert: any[] = []
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
        const getIdx = (names: string[]) => headers.findIndex(h => names.some(n => h.toLowerCase() === n.toLowerCase()))

        if (selectedPlatform === 'tradervue') {
          const dateIdx = getIdx(['Open Datetime', 'Date'])
          const symbolIdx = getIdx(['Symbol', 'Ticker'])
          const sideIdx = getIdx(['Side', 'Action'])
          const volumeIdx = getIdx(['Volume', 'Shares'])
          const priceIdx = getIdx(['Entry Price', 'Price'])
          const netPnlIdx = getIdx(['Net P&L', 'P&L'])
          const rIdx = getIdx(['P&L (R)', 'rMultiple'])
          const tagIdx = getIdx(['Tags', 'Tag'])

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))

            if (cols.length >= 5) {
              const symbolVal = cols[symbolIdx >= 0 ? symbolIdx : 2]?.trim()
              if (!symbolVal || symbolVal === 'Symbol' || symbolVal === 'UNKNOWN') continue

              const rawDate = cols[dateIdx >= 0 ? dateIdx : 0] || ''
              const formattedDate = rawDate.split(' ')[0] || new Date().toISOString().split('T')[0]

              const pnlVal = parseFloat(cols[netPnlIdx >= 0 ? netPnlIdx : 14]) || 0
              const rawR = cols[rIdx >= 0 ? cols.length > 18 ? 18 : rIdx : 18] || '0'
              const parsedR = parseFloat(rawR.replace('R', '')) || (dailyRisk > 0 ? pnlVal / dailyRisk : 0)
              const parsedTag = tagIdx >= 0 && cols[tagIdx] ? cols[tagIdx].replace(/^"|"$/g, '') : 'Tradervue'

              newTradesToInsert.push({
                ...(activeUserId ? { user_id: activeUserId } : {}),
                date: formattedDate,
                trade_date: formattedDate,
                symbol: symbolVal,
                ticker: symbolVal,
                action: cols[sideIdx >= 0 ? sideIdx : 3] || 'L',
                shares: Math.abs(parseFloat(cols[volumeIdx >= 0 ? volumeIdx : 4])) || 100,
                price: parseFloat(cols[priceIdx >= 0 ? priceIdx : 6]) || 0,
                pnl: pnlVal,
                r_multiple: parsedR,
                tag: parsedTag,
                initialRisk: dailyRisk,
                trader: session?.user?.email?.split('@')[0] || 'Trader'
              })
            }
          }
        } else {
          // DAS & SAGE parsers básicos
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
            if (cols.length >= 5) {
              const symbolVal = cols[0]?.trim()
              if (!symbolVal || symbolVal === 'Symbol') continue
              const pnlVal = parseFloat(cols[7]) || 0

              newTradesToInsert.push({
                ...(activeUserId ? { user_id: activeUserId } : {}),
                date: new Date().toISOString().split('T')[0],
                trade_date: new Date().toISOString().split('T')[0],
                symbol: symbolVal,
                ticker: symbolVal,
                action: cols[1] || 'L',
                shares: 100,
                price: 1.0,
                pnl: pnlVal,
                r_multiple: pnlVal / dailyRisk,
                tag: 'General',
                initialRisk: dailyRisk,
                trader: session?.user?.email?.split('@')[0] || 'Trader'
              })
            }
          }
        }

        if (newTradesToInsert.length > 0) {
          const { data, error } = await supabase.from('trades').insert(newTradesToInsert).select()
          if (!error && data) {
            const mappedNew = data.map((t: any) => ({
              ...t,
              date: t.date || t.trade_date || new Date().toISOString().split('T')[0],
              ticker: t.ticker || t.symbol || 'UNKNOWN',
              rMultiple: t.r_multiple ?? (dailyRisk > 0 ? t.pnl / dailyRisk : 0),
              tag: t.tag || 'General',
              initialRisk: t.initialRisk || dailyRisk
            }))
            setTrades(prev => [...mappedNew, ...prev])
            setImportStatus({
              type: 'success',
              message: `¡Éxito! Se han importado ${data.length} operaciones.`
            })
          } else {
            throw new Error(error?.message || "Error al insertar en la base de datos.")
          }
        } else {
          throw new Error("No se detectaron operaciones válidas.")
        }
      } catch (err: any) {
        setImportStatus({ type: 'error', message: err?.message || 'Error al procesar archivo.' })
      } finally {
        setIsUploading(false)
        if (e.target) e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  // Actualización masiva de Trades (Etiqueta o Riesgo)
  const handleBatchUpdate = async (updateData: { tag?: string; initialRisk?: number }) => {
    if (selectedTradeIds.length === 0) return

    const updatedTrades = trades.map(t => {
      if (selectedTradeIds.includes(t.id)) {
        const newRisk = updateData.initialRisk !== undefined ? updateData.initialRisk : (t.initialRisk || dailyRisk)
        const newTag = updateData.tag !== undefined ? updateData.tag : t.tag
        const newR = t.pnl / newRisk
        return { ...t, initialRisk: newRisk, tag: newTag, rMultiple: newR }
      }
      return t
    })

    setTrades(updatedTrades)

    // Sincronizar con Supabase
    for (const id of selectedTradeIds) {
      const target = updatedTrades.find(t => t.id === id)
      if (target) {
        await supabase.from('trades').update({
          tag: target.tag,
          initialRisk: target.initialRisk,
          r_multiple: target.rMultiple
        }).eq('id', id)
      }
    }

    setSelectedTradeIds([])
    alert('¡Actualización masiva realizada correctamente!')
  }

  // Filtrado avanzado de trades
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      const matchTicker = filterTicker === '' || t.ticker.toLowerCase().includes(filterTicker.toLowerCase())
      const matchTag = filterTag === 'ALL' || t.tag === filterTag
      const matchSide = filterSide === 'ALL' || 
        (filterSide === 'LONG' && (t.action.includes('L') || t.action === 'B')) ||
        (filterSide === 'SHORT' && (t.action.includes('S') || t.action === 'SS'))
      return matchTicker && matchTag && matchSide
    })
  }, [trades, filterTicker, filterTag, filterSide])

  const monthsShortNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const monthsFullNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  const tradesByDate = useMemo(() => {
    const map: { [key: string]: { pnl: number; r: number; count: number; trades: Trade[] } } = {}
    trades.forEach(t => {
      const d = t.date
      if (!map[d]) map[d] = { pnl: 0, r: 0, count: 0, trades: [] }
      const risk = t.initialRisk || dailyRisk
      map[d].pnl += t.pnl
      map[d].r += (t.rMultiple || (risk > 0 ? t.pnl / risk : 0))
      map[d].count += 1
      map[d].trades.push(t)
    })
    return map
  }, [trades, dailyRisk])

  const monthlySummaries = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIdx) => {
      let pnlAcc = 0, rAcc = 0, countAcc = 0
      trades.forEach(t => {
        if (!t.date) return
        const [yStr, mStr] = t.date.split('-')
        if (parseInt(yStr, 10) === selectedYear && parseInt(mStr, 10) - 1 === monthIdx) {
          pnlAcc += t.pnl
          const risk = t.initialRisk || dailyRisk
          rAcc += (t.rMultiple || (risk > 0 ? t.pnl / risk : 0))
          countAcc += 1
        }
      })
      return { pnl: pnlAcc, r: rAcc, count: countAcc }
    })
  }, [trades, selectedYear, dailyRisk])

  const totalPnl = useMemo(() => trades.reduce((acc, t) => acc + t.pnl, 0), [trades])
  const totalR = useMemo(() => trades.reduce((acc, t) => {
    const risk = t.initialRisk || dailyRisk
    return acc + (t.rMultiple || (risk > 0 ? t.pnl / risk : 0))
  }, 0), [trades, dailyRisk])

  const winCount = useMemo(() => trades.filter(t => t.pnl > 0).length, [trades])
  const winRate = useMemo(() => trades.length > 0 ? ((winCount / trades.length) * 100).toFixed(1) : '0.0', [trades, winCount])
  const profitFactor = useMemo(() => {
    const wins = trades.filter(t => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0)
    const losses = Math.abs(trades.filter(t => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0))
    if (losses === 0) return wins > 0 ? 'Infinite' : '0.00'
    return (wins / losses).toFixed(2)
  }, [trades])

  const calendarWeeks = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1)
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0)
    let currentDay = new Date(firstDay)
    currentDay.setDate(currentDay.getDate() - currentDay.getDay())

    const weeks = []
    while (currentDay <= lastDay || weeks.length < 5) {
      const weekDays = []
      let weekPnl = 0, weekR = 0, weekTradesCount = 0

      for (let i = 0; i < 7; i++) {
        const dateStr = currentDay.toISOString().split('T')[0]
        const isCurrentMonth = currentDay.getMonth() === selectedMonth
        const dayNum = currentDay.getDate()
        const data = tradesByDate[dateStr]

        if (isCurrentMonth && data) {
          weekPnl += data.pnl
          weekR += data.r
          weekTradesCount += data.count
        }

        weekDays.push({ dateStr, dayNum, isCurrentMonth, data: isCurrentMonth ? data : null })
        currentDay.setDate(currentDay.getDate() + 1)
      }

      weeks.push({ weekNum: weeks.length + 1, days: weekDays, weekPnl, weekR, weekTradesCount })
      if (weeks.length >= 6 && currentDay > lastDay) break
    }
    return weeks
  }, [selectedYear, selectedMonth, tradesByDate])

  const monthlyPnl = useMemo(() => calendarWeeks.reduce((acc, w) => acc + w.weekPnl, 0), [calendarWeeks])
  const monthlyR = useMemo(() => calendarWeeks.reduce((acc, w) => acc + w.weekR, 0), [calendarWeeks])

  const formatVal = (pnlAmount: number, rAmount: number, includeSign = true) => {
    if (displayMode === 'currency') {
      const prefix = includeSign ? (pnlAmount >= 0 ? '+$' : '-$') : '$'
      return `${prefix}${Math.abs(pnlAmount).toFixed(2)}`
    } else {
      const prefix = includeSign ? (rAmount >= 0 ? '+' : '') : ''
      return `${prefix}${rAmount.toFixed(2)}R`
    }
  }

  if (checkingAuth) {
    return <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center text-slate-400 text-sm">Verificando sesión...</div>
  }

  if (!user) {
    return <AuthModal onSuccess={() => setCheckingAuth(true)} />
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 font-sans antialiased">
      {/* Navbar */}
      <header className="border-b border-slate-800 bg-[#121620] px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            Track Your Edge <span className="text-slate-400 font-normal text-sm">Small Caps Journal</span>
          </h1>
          <nav className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-slate-800">
            {(['calendar', 'reports', 'trades', 'journal', 'community'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${activeTab === tab ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                {tab === 'calendar' ? '📅 Calendario' : tab === 'reports' ? '📊 Reports' : tab === 'trades' ? '⚡ Trades' : tab === 'journal' ? '📝 Journal' : '🏆 Community'}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { setShowImportModal(true); setImportStatus(null) }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-md transition-colors shadow flex items-center gap-2"
          >
            <span>📂</span> Importar CSV
          </button>
          <div className="flex items-center gap-3 border-l border-slate-800 pl-4">
            <span className="text-xs text-slate-400 font-medium">{user.email}</span>
            <button onClick={handleLogout} className="text-xs bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 px-3 py-1.5 rounded-md border border-slate-700 transition-colors">Salir</button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-6 max-w-[1500px] mx-auto space-y-6">

        {/* 1. CALENDARIO */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between bg-[#121620] border border-slate-800 rounded-xl p-4 gap-4 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 uppercase font-semibold">Año:</span>
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-[#161b22] border border-slate-700 text-white text-sm font-bold rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-[#161b22] p-1 rounded-lg border border-slate-800">
                  <button onClick={() => setDisplayMode('currency')} className={`px-3 py-1 rounded-md text-xs font-bold ${displayMode === 'currency' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>💵 Dólares ($)</button>
                  <button onClick={() => setDisplayMode('r')} className={`px-3 py-1 rounded-md text-xs font-bold ${displayMode === 'r' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>🎯 R-Multiple (R)</button>
                </div>
                {displayMode === 'r' && (
                  <div className="flex items-center gap-1.5 bg-[#161b22] px-3 py-1 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400">1R = $</span>
                    <input type="number" value={dailyRisk} onChange={(e) => setDailyRisk(Math.max(1, parseFloat(e.target.value) || 100))} className="w-16 bg-[#0b0e14] border border-slate-700 text-emerald-400 font-bold text-xs rounded px-1 text-center" />
                  </div>
                )}
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400 mr-2">Net {monthsFullNames[selectedMonth]}:</span>
                <span className={`text-base font-bold ${monthlyPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatVal(monthlyPnl, monthlyR)}</span>
              </div>
            </div>

            {/* Barra compacta de 12 Meses */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2 bg-[#121620] border border-slate-800 rounded-xl p-2 shadow-md">
              {monthsShortNames.map((mShort, idx) => {
                const isActive = selectedMonth === idx
                const summary = monthlySummaries[idx]
                return (
                  <button
                    key={mShort}
                    onClick={() => setSelectedMonth(idx)}
                    className={`flex flex-col items-center justify-between p-2 rounded-lg border text-xs transition-all ${isActive ? 'bg-emerald-950/60 border-emerald-500 text-white shadow ring-1 ring-emerald-500' : 'bg-[#161b22] border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <span className={`font-bold ${isActive ? 'text-emerald-400' : 'text-slate-300'}`}>{mShort}</span>
                    {summary.count > 0 ? (
                      <span className={`text-[10px] font-semibold mt-1 ${summary.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatVal(summary.pnl, summary.r)}</span>
                    ) : <span className="text-[10px] text-slate-600 mt-1">-</span>}
                  </button>
                )
              })}
            </div>

            {/* Cuadrícula del Calendario (Click en día abre modal) */}
            <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><span>📅</span> {monthsFullNames[selectedMonth]} {selectedYear}</h2>

              <div className="grid grid-cols-8 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Total'].map((d, i) => (
                  <div key={i} className="text-center text-xs font-semibold text-slate-400 py-2 bg-[#161b22] rounded border border-slate-800">{d}</div>
                ))}
              </div>

              <div className="space-y-2">
                {calendarWeeks.map((week, wIdx) => (
                  <div key={wIdx} className="grid grid-cols-8 gap-2">
                    {week.days.map((day, dIdx) => (
                      <div 
                        key={dIdx} 
                        onClick={() => day.isCurrentMonth && day.data && setDayTradesModalDate(day.dateStr)}
                        className={`border rounded-lg p-2.5 flex flex-col justify-between min-h-[95px] transition-all ${!day.isCurrentMonth ? 'bg-[#0b0e14]/50 border-slate-900 text-slate-600' : day.data ? 'bg-[#12221c] border-emerald-900/50 hover:border-emerald-500 cursor-pointer shadow hover:shadow-emerald-950' : 'bg-[#161b22] border-slate-800 text-slate-400'}`}
                      >
                        <div className="flex justify-between items-start text-xs">
                          <span className={`font-semibold ${day.isCurrentMonth ? 'text-slate-200' : 'text-slate-600'}`}>{day.dayNum}</span>
                          {day.data && <span className="text-[10px] bg-emerald-950 text-emerald-400 px-1 rounded">Ver 👁️</span>}
                        </div>
                        {day.isCurrentMonth && day.data ? (
                          <div className="text-right">
                            <span className={`block text-xs font-bold ${day.data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatVal(day.data.pnl, day.data.r)}</span>
                            <span className="text-[10px] text-slate-400">{day.data.count} trades</span>
                          </div>
                        ) : <div className="text-right text-[10px] text-slate-500">{day.isCurrentMonth ? '0 trades' : ''}</div>}
                      </div>
                    ))}
                    <div className="bg-[#161b22] border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between text-right">
                      <span className="text-xs font-bold text-white text-left">Week {week.weekNum}</span>
                      <div>
                        <span className={`block text-xs font-bold ${week.weekPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatVal(week.weekPnl, week.weekR)}</span>
                        <span className="text-[10px] text-slate-400">{week.weekTradesCount} trades</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">Net P&L Total</span>
                <div className={`text-2xl font-bold mt-1 ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatVal(totalPnl, totalR)}</div>
              </div>
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">R-Multiple Acumulado</span>
                <div className={`text-2xl font-bold mt-1 ${totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>+{totalR.toFixed(2)}R</div>
              </div>
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">Win Rate</span>
                <div className="
