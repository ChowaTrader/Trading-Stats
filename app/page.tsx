'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import AuthModal from '../components/AuthModal'

interface Trade {
  id: string
  date: string
  ticker: string
  action: string
  shares: number
  price: number
  pnl: number
  rMultiple: number
  trader: string
  tag?: string
  initialRisk?: number
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

  const [availableTags, setAvailableTags] = useState<string[]>(['Breakout', 'DipBuy', 'Momentum', 'Reversal', 'A+ Setup'])
  const [newTagInput, setNewTagInput] = useState('')
  const [selectedTradeIds, setSelectedTradeIds] = useState<string[]>([])
  
  const [filterTicker, setFilterTicker] = useState('')
  const [filterTag, setFilterTag] = useState('ALL')
  const [filterSide, setFilterSide] = useState('ALL')

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
        const mapped = data.map((t: any) => {
          const rawDate = t.date || t.trade_date || new Date().toISOString()
          const cleanDate = rawDate.split('T')[0].split(' ')[0]
          const risk = t.initial_risk || t.initialRisk || dailyRisk
          return {
            ...t,
            date: cleanDate,
            ticker: t.ticker || t.symbol || 'UNKNOWN',
            rMultiple: t.r_multiple ?? (t.pnl ? t.pnl / risk : 0),
            tag: t.tag || t.tags || 'General',
            initialRisk: risk
          }
        })
        setTrades(mapped)

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

  const handleDeleteTrade = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta operación?")) return
    const { error } = await supabase.from('trades').delete().eq('id', id)
    if (!error) {
      setTrades(trades.filter(t => t.id !== id))
      setSelectedTradeIds(selectedTradeIds.filter(i => i !== id))
    } else {
      alert("Error al eliminar la operación.")
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedTradeIds.length === 0) return
    if (!confirm(`¿Eliminar los ${selectedTradeIds.length} trades seleccionados?`)) return

    const { error } = await supabase.from('trades').delete().in('id', selectedTradeIds)
    if (!error) {
      setTrades(trades.filter(t => !selectedTradeIds.includes(t.id)))
      setSelectedTradeIds([])
    } else {
      alert("Error al eliminar los trades.")
    }
  }

  const handleDeleteAllData = async () => {
    if (!confirm("⚠️ ATENCIÓN: ¿Estás completamente seguro de borrar TODOS tus datos de trading?")) return
    
    const { error } = await supabase.from('trades').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (!error) {
      setTrades([])
      setSelectedTradeIds([])
      alert("Todos los datos han sido eliminados correctamente.")
      setShowImportModal(false)
    } else {
      alert("Error al vaciar la base de datos: " + error.message)
    }
  }

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
              
              // Leer R de Tradervue si existe, o calcularlo
              const rawR = rIdx >= 0 ? cols[rIdx] : '0'
              const parsedR = rawR ? parseFloat(rawR.replace('R', '')) : (dailyRisk > 0 ? pnlVal / dailyRisk : 0)
              
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
                r_multiple: isNaN(parsedR) ? 0 : parsedR,
                tag: parsedTag,
                initial_risk: dailyRisk,
                trader: session?.user?.email?.split('@')[0] || 'Trader'
              })
            }
          }
        } else {
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
                initial_risk: dailyRisk,
                trader: session?.user?.email?.split('@')[0] || 'Trader'
              })
            }
          }
        }

        if (newTradesToInsert.length > 0) {
          const { data, error } = await supabase.from('trades').insert(newTradesToInsert).select()
          if (!error && data) {
            const mappedNew = data.map((t: any) => {
              const rawDate = t.date || t.trade_date || new Date().toISOString()
              const cleanDate = rawDate.split('T')[0].split(' ')[0]
              const risk = t.initial_risk || dailyRisk
              return {
                ...t,
                date: cleanDate,
                ticker: t.ticker || t.symbol || 'UNKNOWN',
                rMultiple: t.r_multiple ?? (risk > 0 ? t.pnl / risk : 0),
                tag: t.tag || 'General',
                initialRisk: risk
              }
            })
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

    for (const id of selectedTradeIds) {
      const target = updatedTrades.find(t => t.id === id)
      if (target) {
        await supabase.from('trades').update({
          tag: target.tag,
          initial_risk: target.initialRisk,
          r_multiple: target.rMultiple
        }).eq('id', id)
      }
    }

    setSelectedTradeIds([])
    alert('¡Actualización masiva realizada correctamente!')
  }

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
      if (!d) return
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
        const parts = t.date.split('-')
        if (parts.length === 3) {
          const tradeYear = parseInt(parts[0], 10)
          const tradeMonth = parseInt(parts[1], 10) - 1
          if (tradeYear === selectedYear && tradeMonth === monthIdx) {
            pnlAcc += t.pnl
            const risk = t.initialRisk || dailyRisk
            rAcc += (t.rMultiple || (risk > 0 ? t.pnl / risk : 0))
            countAcc += 1
          }
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
    const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1)
    const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0)
    
    let currentDay = new Date(firstDayOfMonth)
    let dayOfWeek = (currentDay.getDay() + 6) % 7
    currentDay.setDate(currentDay.getDate() - dayOfWeek)

    const weeks = []
    while (currentDay <= lastDayOfMonth || weeks.length < 6) {
      const weekDays = []
      let weekPnl = 0, weekR = 0, weekTradesCount = 0

      for (let i = 0; i < 7; i++) {
        const isWeekend = i === 5 || i === 6
        const year = currentDay.getFullYear()
        const month = String(currentDay.getMonth() + 1).padStart(2, '0')
        const day = String(currentDay.getDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`

        const isCurrentMonth = currentDay.getMonth() === selectedMonth
        const dayNum = currentDay.getDate()
        const data = tradesByDate[dateStr]

        if (!isWeekend && isCurrentMonth && data) {
          weekPnl += data.pnl
          weekR += data.r
          weekTradesCount += data.count
        }

        if (!isWeekend) {
          weekDays.push({ dateStr, dayNum, isCurrentMonth, data: isCurrentMonth ? data : null })
        }

        currentDay.setDate(currentDay.getDate() + 1)
      }

      weeks.push({ weekNum: weeks.length + 1, days: weekDays, weekPnl, weekR, weekTradesCount })
      if (currentDay > lastDayOfMonth && weeks.length >= 5) break
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
            <span>📂</span> Importar / Gestionar CSV
          </button>
          <div className="flex items-center gap-3 border-l border-slate-800 pl-4">
            <span className="text-xs text-slate-400 font-medium">{user.email}</span>
            <button onClick={handleLogout} className="text-xs bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 px-3 py-1.5 rounded-md border border-slate-700 transition-colors">Salir</button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1500px] mx-auto space-y-6">

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

            <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><span>📅</span> {monthsFullNames[selectedMonth]} {selectedYear}</h2>

              <div className="grid grid-cols-6 gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Total'].map((d, i) => (
                  <div key={i} className="text-center text-xs font-semibold text-slate-400 py-2 bg-[#161b22] rounded border border-slate-800">{d}</div>
                ))}
              </div>

              <div className="space-y-2">
                {calendarWeeks.map((week, wIdx) => (
                  <div key={wIdx} className="grid grid-cols-6 gap-2">
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
                <div className="text-2xl font-bold text-white mt-1">{winRate}%</div>
              </div>
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">Profit Factor</span>
                <div className="text-2xl font-bold text-white mt-1">{profitFactor}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trades' && (
          <div className="space-y-6">
            <div className="bg-[#121620] border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input 
                  type="text" 
                  placeholder="Nueva etiqueta..." 
                  value={newTagInput} 
                  onChange={(e) => setNewTagInput(e.target.value)}
                  className="bg-[#161b22] border border-slate-700 text-xs text-white px-3 py-2 rounded-lg focus:outline-none"
                />
                <button 
                  onClick={() => {
                    if (newTagInput.trim() && !availableTags.includes(newTagInput.trim())) {
                      setAvailableTags([...availableTags, newTagInput.trim()])
                      setNewTagInput('')
                    }
                  }} 
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg"
                >
                  ➕ Crear Tag
                </button>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto">
                <input 
                  type="text" 
                  placeholder="Filtrar Ticker..." 
                  value={filterTicker} 
                  onChange={(e) => setFilterTicker(e.target.value)}
                  className="bg-[#161b22] border border-slate-700 text-xs text-white px-3 py-2 rounded-lg focus:outline-none w-32"
                />
                <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="bg-[#161b22] border border-slate-700 text-xs text-white px-3 py-2 rounded-lg">
                  <option value="ALL">Todas las Etiquetas</option>
                  {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={filterSide} onChange={(e) => setFilterSide(e.target.value)} className="bg-[#161b22] border border-slate-700 text-xs text-white px-3 py-2 rounded-lg">
                  <option value="ALL">Lados (Todos)</option>
                  <option value="LONG">Long</option>
                  <option value="SHORT">Short</option>
                </select>
              </div>
            </div>

            {selectedTradeIds.length > 0 && (
              <div className="bg-emerald-950/60 border border-emerald-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
                <span className="text-xs text-emerald-300 font-bold">{selectedTradeIds.length} trades seleccionados</span>
                <div className="flex items-center gap-3">
                  <select 
                    onChange={(e) => e.target.value && handleBatchUpdate({ tag: e.target.value })} 
                    className="bg-[#161b22] border border-slate-700 text-xs text-white px-3 py-1.5 rounded-lg"
                    defaultValue=""
                  >
                    <option value="" disabled>Asignar etiqueta masiva...</option>
                    {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button 
                    onClick={() => {
                      const val = prompt("Nuevo riesgo inicial (1R $):", String(dailyRisk))
                      if (val && !isNaN(Number(val))) handleBatchUpdate({ initialRisk: Number(val) })
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                  >
                    Establecer Riesgo 1R
                  </button>
                  <button onClick={handleDeleteSelected} className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                    🗑️ Eliminar Seleccionados
                  </button>
                  <button onClick={() => setSelectedTradeIds([])} className="text-xs text-slate-400 hover:text-white">Deseleccionar</button>
                </div>
              </div>
            )}

            <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#161b22] text-slate-400 uppercase">
                    <tr>
                      <th className="p-3">
                        <input 
                          type="checkbox" 
                          onChange={(e) => {
                            if (e.target.checked) setSelectedTradeIds(filteredTrades.map(t => t.id))
                            else setSelectedTradeIds([])
                          }} 
                          checked={selectedTradeIds.length === filteredTrades.length && filteredTrades.length > 0}
                        />
                      </th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Ticker</th>
                      <th className="p-3">Acción</th>
                      <th className="p-3">Shares</th>
                      <th className="p-3">Precio</th>
                      <th className="p-3">Etiqueta (Tag)</th>
                      <th className="p-3">P&L ($)</th>
                      <th className="p-3">R-Multiple</th>
                      <th className="p-3 text-center">Gráfico 📈</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredTrades.length > 0 ? (
                      filteredTrades.map(t => (
                        <tr key={t.id} className="hover:bg-[#161b22]/50">
                          <td className="p-3">
                            <input 
                              type="checkbox" 
                              checked={selectedTradeIds.includes(t.id)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedTradeIds([...selectedTradeIds, t.id])
                                else setSelectedTradeIds(selectedTradeIds.filter(id => id !== t.id))
                              }}
                            />
                          </td>
                          <td className="p-3">{t.date}</td>
                          <td className="p-3 font-bold text-white">{t.ticker}</td>
                          <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.action.includes('L') || t.action === 'B' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>{t.action}</span></td>
                          <td className="p-3">{t.shares}</td>
                          <td className="p-3">${t.price}</td>
                          <td className="p-3">
                            <select 
                              value={t.tag || 'General'} 
                              onChange={async (e) => {
                                const newTag = e.target.value
                                setTrades(trades.map(item => item.id === t.id ? { ...item, tag: newTag } : item))
                                await supabase.from('trades').update({ tag: newTag }).eq('id', t.id)
                              }}
                              className="bg-[#161b22] border border-slate-700 text-xs text-white rounded px-2 py-1"
                            >
                              {availableTags.map(tagOpt => <option key={tagOpt} value={tagOpt}>{tagOpt}</option>)}
                            </select>
                          </td>
                          <td className={`p-3 font-semibold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${t.pnl.toFixed(2)}</td>
                          <td className={`p-3 font-semibold ${t.rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.rMultiple >= 0 ? `+${t.rMultiple.toFixed(2)}R` : `${t.rMultiple.toFixed(2)}R`}</td>
                          <td className="p-3 text-center">
                            <button onClick={() => setActiveChartTrade(t)} className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded text-xs text-emerald-400 font-semibold shadow">Ver Gráfico</button>
                          </td>
                          <td className="p-3 text-center">
                            <button onClick={() => handleDeleteTrade(t.id)} className="text-rose-400 hover:text-rose-300 px-2 py-1 rounded text-xs font-bold" title="Eliminar trade">🗑️</button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={11} className="p-6 text-center text-slate-500">No hay operaciones que coincidan con los filtros.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'journal' && (
          <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <h3 className="text-md font-bold text-white">📝 Diario de Trading & Notas Psicológicas</h3>
            <textarea value={journalNote} onChange={(e) => setJournalNote(e.target.value)} placeholder="Escribe tus notas..." className="w-full bg-[#161b22] border border-slate-700 rounded-lg p-4 text-xs text-slate-200 h-32 focus:outline-none"></textarea>
            <button onClick={() => alert('Nota guardada')} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-md">Guardar Nota</button>
          </div>
        )}

        {activeTab === 'community' && (
          <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 max-w-2xl mx-auto shadow-xl text-center">
            <h3 className="text-lg font-bold text-white mb-2">🏆 Leaderboard Comunitario</h3>
            <p className="text-xs text-slate-400">Win Rate: {winRate}% | P&L: ${totalPnl.toFixed(2)}</p>
          </div>
        )}

      </main>

      {dayTradesModalDate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#121620] border border-slate-800 rounded-2xl p-6 max-w-4xl w-full shadow-2xl relative space-y-4 max-h-[85vh] overflow-y-auto">
            <button onClick={() => setDayTradesModalDate(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm">✕</button>
            <h3 className="text-lg font-bold text-white">Operaciones del día: {dayTradesModalDate}</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#161b22] text-slate-400 uppercase">
                  <tr>
                    <th className="p-3">Ticker</th>
                    <th className="p-3">Acción</th>
                    <th className="p-3">Shares</th>
                    <th className="p-3">Precio</th>
                    <th className="p-3">Tag</th>
                    <th className="p-3">P&L ($)</th>
                    <th className="p-3 text-center">Gráfico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tradesByDate[dayTradesModalDate]?.trades.map(t => (
                    <tr key={t.id} className="hover:bg-[#161b22]/50">
                      <td className="p-3 font-bold text-white">{t.ticker}</td>
                      <td className="p-3">{t.action}</td>
                      <td className="p-3">{t.shares}</td>
                      <td className="p-3">${t.price}</td>
                      <td className="p-3">{t.tag}</td>
                      <td className={`p-3 font-semibold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${t.pnl.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => { setActiveChartTrade(t); setDayTradesModalDate(null); }} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs">Ver Gráfico 📊</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeChartTrade && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#121620] border border-slate-800 rounded-2xl p-6 max-w-3xl w-full shadow-2xl relative space-y-5">
            <button onClick={() => setActiveChartTrade(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm">✕</button>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">Gráfico de Ejecución: {activeChartTrade.ticker}</h3>
                <span className="text-xs text-slate-400">Fecha: {activeChartTrade.date} | Tag: <strong className="text-emerald-400">{activeChartTrade.tag}</strong></span>
              </div>
              <div className="text-right">
                <span className={`text-base font-bold ${activeChartTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${activeChartTrade.pnl.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-6 h-72 relative flex flex-col justify-between overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]"></div>
              
              <div className="flex justify-between text-[11px] text-slate-500 z-10">
                <span>Precio: ${activeChartTrade.price}</span>
                <span>P&L: {activeChartTrade.rMultiple.toFixed(2)}R</span>
              </div>

              <div className="relative w-full h-36 flex items-center justify-center z-10">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150">
                  <path d="M 20 120 Q 100 40 200 90 T 380 50 L 480 80" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="4 4" />
                  <path d="M 20 120 Q 100 40 200 90 T 380 50 L 480 80" fill="none" stroke="#38bdf8" strokeWidth="2" />
                  
                  <polygon points="190,105 200,90 210,105" fill={activeChartTrade.action.includes('L') || activeChartTrade.action === 'B' ? '#10b981' : '#f43f5e'} />
                  <text x="185" y="125" fill="#94a3b8" fontSize="10">Entrada</text>

                  <polygon points="370,35 380,50 390,35" fill={activeChartTrade.pnl >= 0 ? '#10b981' : '#f43f5e'} />
                  <text x="365" y="25" fill="#94a3b8" fontSize="10">Salida</text>
                </svg>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-400 z-10 border-t border-slate-800/80 pt-3">
                <span>Shares: {activeChartTrade.shares}</span>
                <span className="text-emerald-400 font-semibold">Triángulos: Verde (Entrada/Salida óptima) / Rojo (Stoploss/Pérdida)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#121620] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative space-y-4">
            <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm">✕</button>
            <h3 className="text-lg font-bold text-white mb-1">Importar / Gestionar Datos</h3>
            <p className="text-xs text-slate-400 mb-4">Selecciona tu plataforma o vacía tu base de datos</p>
            
            <div className="space-y-3 mb-4">
              {[
                { id: 'tradervue', name: 'Tradervue', desc: 'Archivo trades.csv (importa tags automáticamente)' },
                { id: 'das', name: 'DAS Trader Pro', desc: 'Exportación diaria CSV' },
                { id: 'sage', name: 'Sage Pro (Sterling)', desc: 'Transactions.csv' },
              ].map((p) => (
                <div key={p.id} onClick={() => setSelectedPlatform(p.id as PlatformType)} className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer ${selectedPlatform === p.id ? 'bg-emerald-950/40 border-emerald-500 text-white' : 'bg-[#161b22] border-slate-800 text-slate-400'}`}>
                  <input type="radio" checked={selectedPlatform === p.id} readOnly className="mt-1 accent-emerald-500" />
                  <div>
                    <div className="text-xs font-bold text-slate-200">{p.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {importStatus && <div className={`p-3.5 rounded-lg text-xs mb-4 text-center border ${importStatus.type === 'success' ? 'bg-emerald-950/65 border-emerald-800 text-emerald-300' : 'bg-rose-950/65 border-rose-800 text-rose-300'}`}>{importStatus.message}</div>}

            <label className={`block text-center bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-xs cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {isUploading ? 'Procesando...' : 'Seleccionar archivo CSV e Importar'}
              <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" disabled={isUploading} />
            </label>

            <div className="border-t border-slate-800 pt-4 mt-4">
              <button 
                onClick={handleDeleteAllData}
                className="w-full bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold py-2.5 rounded-lg transition-colors shadow"
              >
                ⚠️ Eliminar todos los datos introducidos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
