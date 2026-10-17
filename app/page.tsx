'use client'

import React, { useState, useEffect, useMemo } from 'react'

interface Trade {
  id: string
  date: string
  ticker: string
  action: string
  shares: number
  price: number
  pnl: number        // Gross P&L
  commission: number // Comisiones / ECN fees
  rMultiple: number
  tag?: string
  initialRisk?: number // 1R específico para este trade/día
}

type PlatformType = 'tradervue' | 'das' | 'sage'
type DisplayMode = 'currency' | 'r'
type PnlMode = 'gross' | 'net'

export default function TradingJournal() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'reports' | 'trades' | 'journal'>('calendar')
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedMonth, setSelectedMonth] = useState<number>(9) // 9 = Octubre
  
  const [displayMode, setDisplayMode] = useState<DisplayMode>('currency')
  const [pnlMode, setPnlMode] = useState<PnlMode>('net') // Neto por defecto o Bruto
  const [defaultRisk, setDefaultRisk] = useState<number>(100)

  // Riesgo 1R específico por cada día (fecha -> valor de 1R en $)
  const [dateRisks, setDateRisks] = useState<{ [date: string]: number }>({})

  const [trades, setTrades] = useState<Trade[]>([])
  const [journalNote, setJournalNote] = useState('')

  const [availableTags, setAvailableTags] = useState<string[]>(['Breakout', 'DipBuy', 'Momentum', 'Reversal', 'A+ Setup'])
  const [newTagInput, setNewTagInput] = useState('')
  const [selectedTradeIds, setSelectedTradeIds] = useState<string[]>([])
  
  // Acciones masivas seleccionadas
  const [batchActionType, setBatchActionType] = useState<string>('')
  const [batchTagInput, setBatchTagInput] = useState<string>('')
  const [batchRiskInput, setBatchRiskInput] = useState<string>('100')

  const [filterTicker, setFilterTicker] = useState('')
  const [filterTag, setFilterTag] = useState('ALL')
  const [filterSide, setFilterSide] = useState('ALL')

  const [dayTradesModalDate, setDayTradesModalDate] = useState<string | null>(null)
  const [activeChartTrade, setActiveChartTrade] = useState<Trade | null>(null)

  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('tradervue')
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Cargar datos locales al iniciar
  useEffect(() => {
    const savedTrades = localStorage.getItem('local_trading_trades')
    if (savedTrades) {
      try {
        setTrades(JSON.parse(savedTrades))
      } catch (e) {}
    }

    const savedTags = localStorage.getItem('local_trading_tags')
    if (savedTags) {
      try { setAvailableTags(JSON.parse(savedTags)) } catch (e) {}
    }

    const savedNote = localStorage.getItem('local_trading_journal')
    if (savedNote) setJournalNote(savedNote)

    const savedDateRisks = localStorage.getItem('local_trading_date_risks')
    if (savedDateRisks) {
      try { setDateRisks(JSON.parse(savedDateRisks)) } catch (e) {}
    }
  }, [])

  const saveTradesToStorage = (newTrades: Trade[]) => {
    setTrades(newTrades)
    localStorage.setItem('local_trading_trades', JSON.stringify(newTrades))
  }

  const handleSaveDateRisk = (date: string, riskVal: number) => {
    const updated = { ...dateRisks, [date]: riskVal }
    setDateRisks(updated)
    localStorage.setItem('local_trading_date_risks', JSON.stringify(updated))

    // Recalcular rMultiples de los trades de esa fecha
    const recalculated = trades.map(t => {
      if (t.date === date) {
        const r = riskVal > 0 ? getTradePnl(t) / riskVal : 0
        return { ...t, initialRisk: riskVal, rMultiple: r }
      }
      return t
    })
    saveTradesToStorage(recalculated)
  }

  const getRiskForDate = (date: string) => {
    return dateRisks[date] !== undefined ? dateRisks[date] : defaultRisk
  }

  const getTradePnl = (t: Trade) => {
    const gross = t.pnl || 0
    const comm = t.commission || 0
    return pnlMode === 'net' ? gross - comm : gross
  }

  const handleDeleteTrade = (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta operación?")) return
    const updated = trades.filter(t => t.id !== id)
    saveTradesToStorage(updated)
    setSelectedTradeIds(selectedTradeIds.filter(i => i !== id))
  }

  const handleExecuteBatchAction = () => {
    if (selectedTradeIds.length === 0) return

    if (batchActionType === 'delete') {
      if (!confirm(`¿Eliminar los ${selectedTradeIds.length} trades seleccionados?`)) return
      const updated = trades.filter(t => !selectedTradeIds.includes(t.id))
      saveTradesToStorage(updated)
      setSelectedTradeIds([])
      setBatchActionType('')
      return
    }

    if (batchActionType === 'addTag' && batchTagInput.trim()) {
      const updated = trades.map(t => selectedTradeIds.includes(t.id) ? { ...t, tag: batchTagInput.trim() } : t)
      saveTradesToStorage(updated)
      setSelectedTradeIds([])
      setBatchActionType('')
      setBatchTagInput('')
      alert('¡Etiqueta añadida con éxito!')
      return
    }

    if (batchActionType === 'removeTag') {
      const updated = trades.map(t => selectedTradeIds.includes(t.id) ? { ...t, tag: 'General' } : t)
      saveTradesToStorage(updated)
      setSelectedTradeIds([])
      setBatchActionType('')
      alert('¡Etiquetas eliminadas/restablecidas a General!')
      return
    }

    if (batchActionType === 'setRisk') {
      const newRisk = parseFloat(batchRiskInput)
      if (isNaN(newRisk) || newRisk <= 0) {
        alert('Introduce un riesgo válido en $')
        return
      }

      // Actualizamos el riesgo para las fechas de los trades seleccionados
      const affectedDates = new Set(trades.filter(t => selectedTradeIds.includes(t.id)).map(t => t.date))
      const newDateRisks = { ...dateRisks }
      affectedDates.forEach(d => { newDateRisks[d] = newRisk })
      setDateRisks(newDateRisks)
      localStorage.setItem('local_trading_date_risks', JSON.stringify(newDateRisks))

      const updated = trades.map(t => {
        if (selectedTradeIds.includes(t.id)) {
          const risk = newRisk
          const pnlVal = getTradePnl(t)
          return { ...t, initialRisk: risk, rMultiple: risk > 0 ? pnlVal / risk : 0 }
        }
        return t
      })
      saveTradesToStorage(updated)
      setSelectedTradeIds([])
      setBatchActionType('')
      alert('¡Riesgo 1R actualizado para los trades seleccionados!')
      return
    }
  }

  const handleSaveJournal = () => {
    localStorage.setItem('local_trading_journal', journalNote)
    alert("¡Nota guardada localmente con éxito!")
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setImportStatus(null)

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        if (!text) throw new Error("El archivo está vacío.")

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        if (lines.length < 2) throw new Error("El archivo CSV no contiene suficientes datos.")

        const newTradesToInsert: Trade[] = []
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
        const getIdx = (names: string[]) => headers.findIndex(h => names.some(n => h.toLowerCase() === n.toLowerCase()))

        if (selectedPlatform === 'tradervue') {
          const dateIdx = getIdx(['Open Datetime', 'Date'])
          const symbolIdx = getIdx(['Symbol', 'Ticker'])
          const sideIdx = getIdx(['Side', 'Action'])
          const volumeIdx = getIdx(['Volume', 'Shares'])
          const priceIdx = getIdx(['Entry Price', 'Price'])
          const netPnlIdx = getIdx(['Net P&L', 'P&L'])
          const commIdx = getIdx(['Commission', 'Commissions', 'Fees'])
          const tagIdx = getIdx(['Tags', 'Tag'])

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))

            if (cols.length >= 5) {
              const symbolVal = cols[symbolIdx >= 0 ? symbolIdx : 2]?.trim()
              if (!symbolVal || symbolVal === 'Symbol' || symbolVal === 'UNKNOWN') continue

              const rawDate = cols[dateIdx >= 0 ? dateIdx : 0] || ''
              const formattedDate = rawDate.split(' ')[0] || new Date().toISOString().split('T')[0]

              const pnlVal = parseFloat(cols[netPnlIdx >= 0 ? netPnlIdx : 14]) || 0
              const commVal = commIdx >= 0 ? Math.abs(parseFloat(cols[commIdx]) || 0) : 0
              const dayRisk = getRiskForDate(formattedDate)
              const parsedR = dayRisk > 0 ? (pnlVal - commVal) / dayRisk : 0
              const parsedTag = tagIdx >= 0 && cols[tagIdx] ? cols[tagIdx].replace(/^"|"$/g, '') : 'Tradervue'

              newTradesToInsert.push({
                id: 'trade_' + Math.random().toString(36).substr(2, 9),
                date: formattedDate,
                ticker: symbolVal,
                action: cols[sideIdx >= 0 ? sideIdx : 3] || 'L',
                shares: Math.abs(parseFloat(cols[volumeIdx >= 0 ? volumeIdx : 4])) || 100,
                price: parseFloat(cols[priceIdx >= 0 ? priceIdx : 6]) || 0,
                pnl: pnlVal,
                commission: commVal,
                rMultiple: parsedR,
                tag: parsedTag,
                initialRisk: dayRisk
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
              const dayRisk = defaultRisk

              newTradesToInsert.push({
                id: 'trade_' + Math.random().toString(36).substr(2, 9),
                date: new Date().toISOString().split('T')[0],
                ticker: symbolVal,
                action: cols[1] || 'L',
                shares: 100,
                price: 1.0,
                pnl: pnlVal,
                commission: 0,
                rMultiple: dayRisk > 0 ? pnlVal / dayRisk : 0,
                tag: 'General',
                initialRisk: dayRisk
              })
            }
          }
        }

        if (newTradesToInsert.length > 0) {
          const updated = [...newTradesToInsert, ...trades]
          saveTradesToStorage(updated)

          const uniqueTags = Array.from(new Set([...availableTags, ...newTradesToInsert.map(t => t.tag!).filter(Boolean)]))
          setAvailableTags(uniqueTags)
          localStorage.setItem('local_trading_tags', JSON.stringify(uniqueTags))

          setImportStatus({
            type: 'success',
            message: `¡Éxito! Se han importado ${newTradesToInsert.length} operaciones.`
          })
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
      
      const tradePnl = getTradePnl(t)
      const dayRisk = getRiskForDate(d)
      const tradeR = dayRisk > 0 ? tradePnl / dayRisk : (t.rMultiple || 0)

      map[d].pnl += tradePnl
      map[d].r += tradeR
      map[d].count += 1
      map[d].trades.push(t)
    })
    return map
  }, [trades, pnlMode, dateRisks, defaultRisk])

  const sortedDailyData = useMemo(() => {
    const dates = Object.keys(tradesByDate).sort()
    let cumPnl = 0
    let cumR = 0
    let peakPnl = 0
    let peakR = 0

    return dates.map(date => {
      const dPnl = tradesByDate[date].pnl
      const dR = tradesByDate[date].r
      cumPnl += dPnl
      cumR += dR

      if (cumPnl > peakPnl) peakPnl = cumPnl
      if (cumR > peakR) peakR = cumR

      const drawdownPnl = cumPnl - peakPnl
      const drawdownR = cumR - peakR

      return {
        date,
        dailyPnl: dPnl,
        dailyR: dR,
        cumPnl,
        cumR,
        drawdownPnl,
        drawdownR
      }
    })
  }, [tradesByDate])

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
            const tradePnl = getTradePnl(t)
            const dayRisk = getRiskForDate(t.date)
            pnlAcc += tradePnl
            rAcc += (dayRisk > 0 ? tradePnl / dayRisk : 0)
            countAcc += 1
          }
        }
      })
      return { pnl: pnlAcc, r: rAcc, count: countAcc }
    })
  }, [trades, selectedYear, pnlMode, dateRisks, defaultRisk])

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

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 font-sans antialiased">
      <header className="border-b border-slate-800 bg-[#121620] px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            Track Your Edge <span className="text-slate-400 font-normal text-sm">Private Journal</span>
          </h1>
          <nav className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-slate-800">
            {(['calendar', 'reports', 'trades', 'journal'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${activeTab === tab ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                {tab === 'calendar' ? '📅 Calendario' : tab === 'reports' ? '📊 Reports' : tab === 'trades' ? '⚡ Trades' : '📝 Journal'}
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
        </div>
      </header>

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

              <div className="flex items-center gap-4 flex-wrap">
                {/* Selector Bruto / Neto */}
                <div className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-slate-800">
                  <button onClick={() => setPnlMode('net')} className={`px-3 py-1 rounded-md text-xs font-bold ${pnlMode === 'net' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>💼 Neto</button>
                  <button onClick={() => setPnlMode('gross')} className={`px-3 py-1 rounded-md text-xs font-bold ${pnlMode === 'gross' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>🏷️ Bruto</button>
                </div>

                {/* Selector $ / R */}
                <div className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-slate-800">
                  <button onClick={() => setDisplayMode('currency')} className={`px-3 py-1 rounded-md text-xs font-bold ${displayMode === 'currency' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>💵 Dólares ($)</button>
                  <button onClick={() => setDisplayMode('r')} className={`px-3 py-1 rounded-md text-xs font-bold ${displayMode === 'r' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>🎯 R-Multiple (R)</button>
                </div>

                {displayMode === 'r' && (
                  <div className="flex items-center gap-1.5 bg-[#161b22] px-3 py-1.5 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400">R por Defecto ($):</span>
                    <input type="number" value={defaultRisk} onChange={(e) => setDefaultRisk(Math.max(1, parseFloat(e.target.value) || 100))} className="w-16 bg-[#0b0e14] border border-slate-700 text-emerald-400 font-bold text-xs rounded px-1 text-center" />
                  </div>
                )}
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400 mr-2">Net {monthsFullNames[selectedMonth]} ({pnlMode.toUpperCase()}):</span>
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
              <h2 className="text-lg font-bold text-white flex items-center justify-between">
                <span className="flex items-center gap-2"><span>📅</span> {monthsFullNames[selectedMonth]} {selectedYear}</span>
                <span className="text-xs text-slate-400 font-normal">Modo: <strong className="text-emerald-400 uppercase">{pnlMode}</strong></span>
              </h2>

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

        {/* 2. REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center bg-[#121620] border border-slate-800 rounded-xl p-4 shadow-md gap-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2"><span>📊</span> Rendimiento y Estadísticas ({pnlMode.toUpperCase()})</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-slate-800">
                  <button onClick={() => setPnlMode('net')} className={`px-3 py-1 rounded-md text-xs font-bold ${pnlMode === 'net' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>💼 Neto</button>
                  <button onClick={() => setPnlMode('gross')} className={`px-3 py-1 rounded-md text-xs font-bold ${pnlMode === 'gross' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>🏷️ Bruto</button>
                </div>
                <div className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-slate-800">
                  <button onClick={() => setDisplayMode('currency')} className={`px-3 py-1 rounded-md text-xs font-bold ${displayMode === 'currency' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>💵 Dólares ($)</button>
                  <button onClick={() => setDisplayMode('r')} className={`px-3 py-1 rounded-md text-xs font-bold ${displayMode === 'r' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400'}`}>🎯 R-Multiple (R)</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#121620] border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">DAILY {pnlMode.toUpperCase()} {displayMode === 'currency' ? '($)' : '(R)'}</span>
                <div className="h-64 flex items-end gap-1 border-b border-slate-800 pb-2 overflow-x-auto relative px-2">
                  <div className="absolute inset-0 flex items-center pointer-events-none"><div className="w-full border-t border-slate-800/80"></div></div>
                  {sortedDailyData.map((d, i) => {
                    const val = displayMode === 'currency' ? d.dailyPnl : d.dailyR
                    const maxVal = Math.max(...sortedDailyData.map(item => Math.abs(displayMode === 'currency' ? item.dailyPnl : item.dailyR)), 1)
                    const heightPercent = Math.min(Math.abs(val) / maxVal * 100, 100)
                    const isPositive = val >= 0

                    return (
                      <div key={i} className="flex-1 flex flex-col items-center h-full justify-end group relative min-w-[12px]">
                        <div 
                          className={`w-full rounded-t transition-all ${isPositive ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-500 hover:bg-rose-400'}`}
                          style={{ height: `${Math.max(heightPercent, 4)}%` }}
                        ></div>
                        <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col bg-[#161b22] border border-slate-700 text-[10px] text-white p-1.5 rounded z-20 whitespace-nowrap shadow-xl">
                          <span className="font-bold">{d.date}</span>
                          <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>{formatVal(d.dailyPnl, d.dailyR)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-[#121620] border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">CUMULATIVE {pnlMode.toUpperCase()} {displayMode === 'currency' ? '($)' : '(R)'}</span>
                <div className="h-64 border-b border-slate-800 pb-2 relative flex items-end">
                  <svg className="w-full h-full overflow-visible z-10" viewBox="0 0 500 200" preserveAspectRatio="none">
                    {(() => {
                      if (sortedDailyData.length === 0) return null
                      const values = sortedDailyData.map(d => displayMode === 'currency' ? d.cumPnl : d.cumR)
                      const minVal = Math.min(...values, 0)
                      const maxVal = Math.max(...values, 1)
                      const range = maxVal - minVal || 1

                      const points = sortedDailyData.map((d, idx) => {
                        const val = displayMode === 'currency' ? d.cumPnl : d.cumR
                        const x = (idx / (sortedDailyData.length - 1 || 1)) * 500
                        const y = 200 - ((val - minVal) / range) * 180 - 10
                        return `${x},${y}`
                      }).join(' ')

                      return <polyline fill="none" stroke="#10b981" strokeWidth="2.5" points={points} />
                    })()}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. TRADES (Con acciones masivas y configuración de riesgo por día) */}
        {activeTab === 'trades' && (
          <div className="space-y-6">
            <div className="bg-[#121620] border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
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
                      const updatedTags = [...availableTags, newTagInput.trim()]
                      setAvailableTags(updatedTags)
                      localStorage.setItem('local_trading_tags', JSON.stringify(updatedTags))
                      setNewTagInput('')
                    }
                  }} 
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg"
                >
                  ➕ Crear Tag
                </button>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto">
                <div className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-slate-800">
                  <button onClick={() => setPnlMode('net')} className={`px-2.5 py-1 rounded text-xs font-bold ${pnlMode === 'net' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Neto</button>
                  <button onClick={() => setPnlMode('gross')} className={`px-2.5 py-1 rounded text-xs font-bold ${pnlMode === 'gross' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Bruto</button>
                </div>
                <input 
                  type="text" 
                  placeholder="Filtrar Ticker..." 
                  value={filterTicker} 
                  onChange={(e) => setFilterTicker(e.target.value)}
                  className="bg-[#161b22] border border-slate-700 text-xs text-white px-3 py-2 rounded-lg focus:outline-none w-28"
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

            {/* Barra de Acciones Masivas cuando hay trades seleccionados */}
            {selectedTradeIds.length > 0 && (
              <div className="bg-emerald-950/60 border border-emerald-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-lg">
                <span className="text-xs text-emerald-300 font-bold">{selectedTradeIds.length} trades seleccionados</span>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <select 
                    value={batchActionType}
                    onChange={(e) => setBatchActionType(e.target.value)}
                    className="bg-[#161b22] border border-slate-700 text-xs text-white px-3 py-2 rounded-lg"
                  >
                    <option value="">Seleccionar acción masiva...</option>
                    <option value="setRisk">Establecer Riesgo 1R ($)</option>
                    <option value="addTag">Añadir Etiqueta</option>
                    <option value="removeTag">Quitar Etiqueta (a General)</option>
                    <option value="delete">Eliminar trades seleccionados</option>
                  </select>

                  {batchActionType === 'setRisk' && (
                    <div className="flex items-center gap-1">
                      <input 
                        type="number" 
                        value={batchRiskInput} 
                        onChange={(e) => setBatchRiskInput(e.target.value)}
                        placeholder="Riesgo 1R ($)" 
                        className="w-24 bg-[#161b22] border border-slate-700 text-xs text-white px-2 py-2 rounded-lg text-center"
                      />
                      <button onClick={handleExecuteBatchAction} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg">Aplicar</button>
                    </div>
                  )}

                  {batchActionType === 'addTag' && (
                    <div className="flex items-center gap-1">
                      <select 
                        value={batchTagInput} 
                        onChange={(e) => setBatchTagInput(e.target.value)}
                        className="bg-[#161b22] border border-slate-700 text-xs text-white px-2 py-2 rounded-lg"
                      >
                        <option value="" disabled>Elige etiqueta...</option>
                        {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={handleExecuteBatchAction} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg">Aplicar</button>
                    </div>
                  )}

                  {(batchActionType === 'removeTag' || batchActionType === 'delete') && (
                    <button onClick={handleExecuteBatchAction} className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-2 rounded-lg">Confirmar Acción</button>
                  )}

                  <button onClick={() => setSelectedTradeIds([])} className="text-xs text-slate-400 hover:text-white ml-2">Deseleccionar</button>
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
                      <th className="p-3">Riesgo 1R ($)</th>
                      <th className="p-3">Etiqueta</th>
                      <th className="p-3">Comisión</th>
                      <th className="p-3">P&L ({pnlMode.toUpperCase()})</th>
                      <th className="p-3">R-Multiple</th>
                      <th className="p-3 text-center">Gráfico</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredTrades.length > 0 ? (
                      filteredTrades.map(t => {
                        const tradePnl = getTradePnl(t)
                        const currentDayRisk = getRiskForDate(t.date)
                        const tradeR = currentDayRisk > 0 ? tradePnl / currentDayRisk : 0

                        return (
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
                              <input 
                                type="number"
                                value={currentDayRisk}
                                onChange={(e) => handleSaveDateRisk(t.date, parseFloat(e.target.value) || 100)}
                                className="w-20 bg-[#0b0e14] border border-slate-700 text-emerald-400 font-bold text-xs rounded px-1.5 py-1 text-center"
                                title="Riesgo 1R para esta fecha"
                              />
                            </td>
                            <td className="p-3">
                              <select 
                                value={t.tag || 'General'} 
                                onChange={(e) => {
                                  const newTag = e.target.value
                                  const updated = trades.map(item => item.id === t.id ? { ...item, tag: newTag } : item)
                                  saveTradesToStorage(updated)
                                }}
                                className="bg-[#161b22] border border-slate-700 text-xs text-white rounded px-2 py-1"
                              >
                                {availableTags.map(tagOpt => <option key={tagOpt} value={tagOpt}>{tagOpt}</option>)}
                              </select>
                            </td>
                            <td className="p-3 text-slate-400">${(t.commission || 0).toFixed(2)}</td>
                            <td className={`p-3 font-semibold ${tradePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {tradePnl >= 0 ? `+$${tradePnl.toFixed(2)}` : `-$${Math.abs(tradePnl).toFixed(2)}`}
                            </td>
                            <td className={`p-3 font-semibold ${tradeR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {tradeR >= 0 ? `+${tradeR.toFixed(2)}R` : `${tradeR.toFixed(2)}R`}
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => setActiveChartTrade(t)} className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded text-xs text-emerald-400 font-semibold shadow">Ver Gráfico</button>
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => handleDeleteTrade(t.id)} className="text-rose-400 hover:text-rose-300 px-2 py-1 rounded text-xs font-bold" title="Eliminar trade">🗑️</button>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr><td colSpan={13} className="p-6 text-center text-slate-500">No hay operaciones que coincidan con los filtros.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. JOURNAL */}
        {activeTab === 'journal' && (
          <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <h3 className="text-md font-bold text-white">📝 Diario de Trading & Notas Psicológicas</h3>
            <textarea 
              value={journalNote} 
              onChange={(e) => setJournalNote(e.target.value)} 
              placeholder="Escribe tus notas aquí..." 
              className="w-full bg-[#161b22] border border-slate-700 rounded-lg p-4 text-xs text-slate-200 h-64 focus:outline-none"
            ></textarea>
            <button onClick={handleSaveJournal} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-md">Guardar Nota Localmente</button>
          </div>
        )}

      </main>

      {/* MODAL 1: Trades del Día */}
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
                    <th className="p-3">P&L ({pnlMode.toUpperCase()})</th>
                    <th className="p-3 text-center">Gráfico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tradesByDate[dayTradesModalDate]?.trades.map(t => {
                    const tradePnl = getTradePnl(t)
                    return (
                      <tr key={t.id} className="hover:bg-[#161b22]/50">
                        <td className="p-3 font-bold text-white">{t.ticker}</td>
                        <td className="p-3">{t.action}</td>
                        <td className="p-3">{t.shares}</td>
                        <td className="p-3">${t.price}</td>
                        <td className="p-3">{t.tag}</td>
                        <td className={`p-3 font-semibold ${tradePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${tradePnl.toFixed(2)}</td>
                        <td className="p-3 text-center">
                          <button onClick={() => { setActiveChartTrade(t); setDayTradesModalDate(null); }} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs">Ver Gráfico 📊</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Visor Gráfico */}
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
                <span className={`text-base font-bold ${getTradePnl(activeChartTrade) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${getTradePnl(activeChartTrade).toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-6 h-72 relative flex flex-col justify-between overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]"></div>
              
              <div className="flex justify-between text-[11px] text-slate-500 z-10">
                <span>Precio: ${activeChartTrade.price}</span>
                <span>P&L: {(getRiskForDate(activeChartTrade.date) > 0 ? getTradePnl(activeChartTrade) / getRiskForDate(activeChartTrade.date) : 0).toFixed(2)}R</span>
              </div>

              <div className="relative w-full h-36 flex items-center justify-center z-10">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150">
                  <path d="M 20 120 Q 100 40 200 90 T 380 50 L 480 80" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="4 4" />
                  <path d="M 20 120 Q 100 40 200 90 T 380 50 L 480 80" fill="none" stroke="#38bdf8" strokeWidth="2" />
                  
                  <polygon points="190,105 200,90 210,105" fill={activeChartTrade.action.includes('L') || activeChartTrade.action === 'B' ? '#10b981' : '#f43f5e'} />
                  <text x="185" y="125" fill="#94a3b8" fontSize="10">Entrada</text>

                  <polygon points="370,35 380,50 390,35" fill={getTradePnl(activeChartTrade) >= 0 ? '#10b981' : '#f43f5e'} />
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

      {/* Modal de Importación / Gestión */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#121620] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative space-y-4">
            <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm">✕</button>
            <h3 className="text-lg font-bold text-white mb-1">Importar / Gestionar Datos Locales</h3>
            <p className="text-xs text-slate-400 mb-4">Selecciona tu plataforma</p>
            
            <div className="space-y-3 mb-4">
              {[
                { id: 'tradervue', name: 'Tradervue', desc: 'Archivo trades.csv (importa comisiones y tags)' },
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
                onClick={() => {
                  if (confirm("⚠️ ¿Eliminar todos los datos locales?")) {
                    localStorage.removeItem('local_trading_trades')
                    localStorage.removeItem('local_trading_date_risks')
                    setTrades([])
                    setDateRisks({})
                    setShowImportModal(false)
                  }
                }}
                className="w-full bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold py-2.5 rounded-lg transition-colors shadow"
              >
                ⚠️ Eliminar todos los datos locales
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
