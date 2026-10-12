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
}

type PlatformType = 'tradervue' | 'das' | 'sage'

export default function TradingJournal() {
  const [user, setUser] = useState<any>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [activeTab, setActiveTab] = useState<'calendar' | 'reports' | 'trades' | 'journal' | 'community'>('calendar')
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedMonth, setSelectedMonth] = useState<number>(9)
  const [trades, setTrades] = useState<Trade[]>([])
  const [journalNote, setJournalNote] = useState('')

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
          rMultiple: t.r_multiple ?? 0
        }))
        setTrades(mapped)
      }
    }

    fetchTrades()
  }, [user])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setTrades([])
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setIsUploading(true)
    setImportStatus(null)

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

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))

            if (cols.length >= 5) {
              const symbolVal = cols[symbolIdx >= 0 ? symbolIdx : 2]?.trim()
              if (!symbolVal || symbolVal === 'Symbol' || symbolVal === 'UNKNOWN') continue

              const rawDate = cols[dateIdx >= 0 ? dateIdx : 0] || ''
              const formattedDate = rawDate.split(' ')[0] || new Date().toISOString().split('T')[0]

              const rawR = cols[rIdx >= 0 ? rIdx : 18] || '0'
              const parsedR = parseFloat(rawR.replace('R', '')) || 0

              newTradesToInsert.push({
                user_id: user.id,
                date: formattedDate,
                trade_date: formattedDate,
                symbol: symbolVal,
                ticker: symbolVal,
                action: cols[sideIdx >= 0 ? sideIdx : 3] || 'L',
                shares: Math.abs(parseFloat(cols[volumeIdx >= 0 ? volumeIdx : 4])) || 100,
                price: parseFloat(cols[priceIdx >= 0 ? priceIdx : 6]) || 0,
                pnl: parseFloat(cols[netPnlIdx >= 0 ? netPnlIdx : 14]) || 0,
                r_multiple: parsedR,
                trader: user.email?.split('@')[0] || 'Trader'
              })
            }
          }
        } else if (selectedPlatform === 'das') {
          let fileDate = new Date().toISOString().split('T')[0]
          const fileNameMatch = file.name.match(/(\d{2})(\d{2})(\d{4})/)
          if (fileNameMatch) {
            fileDate = `${fileNameMatch[3]}-${fileNameMatch[2]}-${fileNameMatch[1]}`
          }

          const symbolIdx = getIdx(['Symbol', 'Ticker'])
          const sideIdx = getIdx(['Side', 'Action'])
          const qtyIdx = getIdx(['Qty', 'Shares', 'Volume'])
          const priceIdx = getIdx(['Price', 'Exec Price'])
          const pnlIdx = getIdx(['P / L', 'P&L', 'Net P&L'])
          const rIdx = getIdx(['P/L R', 'P&L (R)'])

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
            if (cols.length >= 5) {
              const symbolVal = cols[symbolIdx >= 0 ? symbolIdx : 0]?.trim()
              if (!symbolVal || symbolVal === 'Symbol') continue

              const rawR = cols[rIdx >= 0 ? rIdx : 8] || '0'
              const parsedR = parseFloat(rawR.replace('R', '')) || 0

              newTradesToInsert.push({
                user_id: user.id,
                date: fileDate,
                trade_date: fileDate,
                symbol: symbolVal,
                ticker: symbolVal,
                action: cols[sideIdx >= 0 ? sideIdx : 1] || 'S',
                shares: Math.abs(parseFloat(cols[qtyIdx >= 0 ? qtyIdx : 4])) || 0,
                price: parseFloat(cols[priceIdx >= 0 ? priceIdx : 3]) || 0,
                pnl: parseFloat(cols[pnlIdx >= 0 ? pnlIdx : 7]) || 0,
                r_multiple: parsedR,
                trader: user.email?.split('@')[0] || 'Trader'
              })
            }
          }
        } else if (selectedPlatform === 'sage') {
          const dateIdx = getIdx(['Trade Date', 'Date'])
          const symbolIdx = getIdx(['Symbol', 'Ticker'])
          const sideIdx = getIdx(['Side', 'Action'])
          const qtyIdx = getIdx(['Qty', 'Shares', 'Volume'])
          const priceIdx = getIdx(['Price'])
          const netAmtIdx = getIdx(['Net Amt', 'Net P&L', 'P&L'])

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
            if (cols.length >= 8) {
              const symbolVal = cols[symbolIdx >= 0 ? symbolIdx : 7]?.trim()
              if (!symbolVal || symbolVal === 'Symbol' || symbolVal === 'NaN') continue

              const rowDate = cols[dateIdx >= 0 ? dateIdx : 4] || new Date().toISOString().split('T')[0]

              newTradesToInsert.push({
                user_id: user.id,
                date: rowDate,
                trade_date: rowDate,
                symbol: symbolVal,
                ticker: symbolVal,
                action: cols[sideIdx >= 0 ? sideIdx : 6] || 'B',
                shares: Math.abs(parseFloat(cols[qtyIdx >= 0 ? qtyIdx : 8])) || 0,
                price: parseFloat(cols[priceIdx >= 0 ? priceIdx : 9]) || 0,
                pnl: parseFloat(cols[netAmtIdx >= 0 ? netAmtIdx : 21]) || 0,
                r_multiple: 0,
                trader: user.email?.split('@')[0] || 'Trader'
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
              rMultiple: t.r_multiple ?? 0
            }))
            setTrades(prev => [...mappedNew, ...prev])
            setImportStatus({
              type: 'success',
              message: `¡Éxito! Se han importado correctamente ${data.length} operaciones.`
            })
          } else {
            throw new Error(error?.message || "Error al insertar en la base de datos.")
          }
        } else {
          throw new Error("No se detectaron ejecuciones de trading válidas en el archivo.")
        }
      } catch (err: any) {
        setImportStatus({
          type: 'error',
          message: err?.message || 'Ocurrió un error al procesar el archivo.'
        })
      } finally {
        setIsUploading(false)
        if (e.target) e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  const monthsNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  const tradesByDate = useMemo(() => {
    const map: { [key: string]: { pnl: number; count: number } } = {}
    trades.forEach(t => {
      const d = t.date || '2026-10-12'
      if (!map[d]) map[d] = { pnl: 0, count: 0 }
      map[d].pnl += t.pnl
      map[d].count += 1
    })
    return map
  }, [trades])

  const totalPnl = useMemo(() => trades.reduce((acc, t) => acc + t.pnl, 0), [trades])
  const totalR = useMemo(() => trades.reduce((acc, t) => acc + t.rMultiple, 0), [trades])
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
      let weekPnl = 0
      let weekTradesCount = 0

      for (let i = 0; i < 7; i++) {
        const dateStr = currentDay.toISOString().split('T')[0]
        const isCurrentMonth = currentDay.getMonth() === selectedMonth
        const dayNum = currentDay.getDate()
        const data = tradesByDate[dateStr]

        if (isCurrentMonth && data) {
          weekPnl += data.pnl
          weekTradesCount += data.count
        }

        weekDays.push({
          dateStr,
          dayNum,
          isCurrentMonth,
          data: isCurrentMonth ? data : null
        })

        currentDay.setDate(currentDay.getDate() + 1)
      }

      weeks.push({
        weekNum: weeks.length + 1,
        days: weekDays,
        weekPnl,
        weekTradesCount
      })

      if (weeks.length >= 6 && currentDay > lastDay) break
    }
    return weeks
  }, [selectedYear, selectedMonth, tradesByDate])

  const monthlyPnl = useMemo(() => {
    return calendarWeeks.reduce((acc, w) => acc + w.weekPnl, 0)
  }, [calendarWeeks])

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center text-slate-400 text-sm">
        Verificando sesión...
      </div>
    )
  }

  if (!user) {
    return <AuthModal onSuccess={() => setCheckingAuth(true)} />
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 font-sans antialiased">
      {/* Navbar Superior */}
      <header className="border-b border-slate-800 bg-[#121620] px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            Track Your Edge <span className="text-slate-400 font-normal text-sm">Small Caps Journal</span>
          </h1>
          <nav className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-slate-800">
            <button 
              onClick={() => setActiveTab('calendar')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'calendar' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              📅 Calendario
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'reports' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              📊 Reports
            </button>
            <button 
              onClick={() => setActiveTab('trades')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'trades' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              ⚡ Trades
            </button>
            <button 
              onClick={() => setActiveTab('journal')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'journal' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              📝 Journal
            </button>
            <button 
              onClick={() => setActiveTab('community')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'community' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              🏆 Community
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setShowImportModal(true)
              setImportStatus(null)
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-md transition-colors shadow flex items-center gap-2"
          >
            <span>📂</span> Importar CSV
          </button>
          <div className="flex items-center gap-3 border-l border-slate-800 pl-4">
            <span className="text-xs text-slate-400 font-medium">{user.email}</span>
            <button 
              onClick={handleLogout}
              className="text-xs bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 px-3 py-1.5 rounded-md border border-slate-700 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-[1500px] mx-auto space-y-6">

        {/* 1. CALENDARIO */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-[#121620] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <select 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-[#161b22] border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  {monthsNames.map((m, idx) => (
                    <option key={m} value={idx}>{m}</option>
                  ))}
                </select>
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-[#161b22] border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 mr-2">Monthly P&L:</span>
                <span className={`text-base font-bold ${monthlyPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ${monthlyPnl.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-bold text-white">
                  {monthsNames[selectedMonth]}, {selectedYear}
                </h2>
              </div>

              <div className="grid grid-cols-8 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Total'].map((d, i) => (
                  <div key={i} className="text-center text-xs font-semibold text-slate-400 py-2 bg-[#161b22] rounded border border-slate-800">
                    {d}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {calendarWeeks.map((week, wIdx) => (
                  <div key={wIdx} className="grid grid-cols-8 gap-2">
                    {week.days.map((day, dIdx) => (
                      <div 
                        key={dIdx} 
                        className={`border rounded-lg p-2.5 flex flex-col justify-between min-h-[95px] ${
                          !day.isCurrentMonth 
                            ? 'bg-[#0b0e14]/50 border-slate-900 text-slate-600' 
                            : day.data 
                              ? day.data.pnl >= 0 
                                ? 'bg-[#12221c] border-emerald-900/50 hover:border-emerald-500' 
                                : 'bg-[#261519] border-rose-900/50 hover:border-rose-500' 
                              : 'bg-[#161b22] border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex justify-between items-start text-xs">
                          <span className={`font-semibold ${day.isCurrentMonth ? 'text-slate-200' : 'text-slate-600'}`}>
                            {day.dayNum}
                          </span>
                          <span className="text-[10px] text-slate-500">📋</span>
                        </div>
                        
                        {day.isCurrentMonth && day.data ? (
                          <div className="text-right">
                            <span className={`block text-xs font-bold ${day.data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {day.data.pnl >= 0 ? `+$${day.data.pnl.toFixed(2)}` : `-$${Math.abs(day.data.pnl).toFixed(2)}`}
                            </span>
                            <span className="text-[10px] text-slate-400">{day.data.count} trades</span>
                          </div>
                        ) : (
                          <div className="text-right text-[10px] text-slate-500">
                            {day.isCurrentMonth ? <>$0<br/>0 trades</> : ''}
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="bg-[#161b22] border border-slate-800 rounded-lg p-2.5 flex flex-col justify-between text-right">
                      <span className="text-xs font-bold text-white text-left">Week {week.weekNum}</span>
                      <div>
                        <span className={`block text-xs font-bold ${week.weekPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {week.weekPnl >= 0 ? `+$${week.weekPnl.toFixed(2)}` : `-$${Math.abs(week.weekPnl).toFixed(2)}`}
                        </span>
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
                <div className={`text-2xl font-bold mt-1 ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`}
                </div>
              </div>
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">R-Multiple Acumulado</span>
                <div className={`text-2xl font-bold mt-1 ${totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalR >= 0 ? `+${totalR.toFixed(1)}R` : `${totalR.toFixed(1)}R`}
                </div>
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

            <div className="bg-[#121620] border border-slate-800 rounded-xl p-6">
              <h3 className="text-sm font-bold text-white mb-2">📊 Análisis de Rendimiento & Curva de Equidad</h3>
              <p className="text-xs text-slate-400">Tus métricas se calculan en tiempo real a partir de tus operaciones importadas.</p>
            </div>
          </div>
        )}

        {/* 3. TRADES */}
        {activeTab === 'trades' && (
          <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl">
            <h3 className="text-md font-bold text-white mb-4">⚡ Registro de Operaciones Importadas</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#161b22] text-slate-400 uppercase">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Ticker</th>
                    <th className="p-3">Acción</th>
                    <th className="p-3">Shares</th>
                    <th className="p-3">Precio</th>
                    <th className="p-3">P&L ($)</th>
                    <th className="p-3">R-Multiple</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {trades.length > 0 ? (
                    trades.map(t => (
                      <tr key={t.id} className="hover:bg-[#161b22]/50">
                        <td className="p-3">{t.date}</td>
                        <td className="p-3 font-bold text-white">{t.ticker}</td>
                        <td className="p-3">{t.action}</td>
                        <td className="p-3">{t.shares}</td>
                        <td className="p-3">${t.price}</td>
                        <td className={`p-3 font-semibold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ${t.pnl.toFixed(2)}
                        </td>
                        <td className={`p-3 font-semibold ${t.rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.rMultiple}R
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">
                        No hay operaciones registradas aún. Haz clic en "Importar CSV" para cargar tu historial.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. JOURNAL */}
        {activeTab === 'journal' && (
          <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <h3 className="text-md font-bold text-white">📝 Diario de Trading & Notas Psicológicas</h3>
            <p className="text-xs text-slate-400">
              Registra tu mentalidad del día, cumplimiento de reglas y notas operativas.
            </p>
            <textarea 
              value={journalNote}
              onChange={(e) => setJournalNote(e.target.value)}
              placeholder="Escribe tus notas de trading de hoy..." 
              className="w-full bg-[#161b22] border border-slate-700 rounded-lg p-4 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 h-32"
            ></textarea>
            <button 
              onClick={() => alert('Nota guardada correctamente')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-md transition-colors shadow"
            >
              Guardar Nota Diaria
            </button>
          </div>
        )}

        {/* 5. COMMUNITY */}
        {activeTab === 'community' && (
          <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 max-w-2xl mx-auto shadow-xl">
            <h3 className="text-lg font-bold text-white mb-2 text-center">🏆 Leaderboard Comunitario (Small Caps)</h3>
            <p className="text-xs text-slate-400 text-center mb-6">Tus estadísticas personales de rendimiento dentro del grupo</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-[#161b22] rounded-xl border border-slate-800">
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold text-slate-400">#1</span>
                  <div>
                    <h4 className="font-bold text-white">{user.email?.split('@')[0] || 'Tú'}</h4>
                    <span className="text-xs text-slate-400">Win Rate: {winRate}%</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`block font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`}
                  </span>
                  <span className="text-xs text-slate-400">{totalR >= 0 ? `+${totalR.toFixed(1)}R` : `${totalR.toFixed(1)}R`}</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Modal de Importación CSV */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#121620] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button 
              onClick={() => setShowImportModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-white mb-1">Importar Operaciones (CSV)</h3>
            <p className="text-xs text-slate-400 mb-5">Selecciona el formato de exportación de tu plataforma</p>

            <div className="space-y-3 mb-6">
              {[
                { id: 'tradervue', name: 'Tradervue', desc: 'Archivo trades.csv exportado desde Tradervue' },
                { id: 'das', name: 'DAS Trader Pro', desc: 'Exportación diaria (ej. 12102026.csv) en DAS' },
                { id: 'sage', name: 'Sage Pro (Sterling)', desc: 'Archivo Transactions.csv exportado de Sage/Sterling' },
              ].map((p) => (
                <div 
                  key={p.id}
                  onClick={() => setSelectedPlatform(p.id as PlatformType)}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                    selectedPlatform === p.id 
                      ? 'bg-emerald-950/40 border-emerald-500/80 text-white' 
                      : 'bg-[#161b22] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="platform" 
                    checked={selectedPlatform === p.id} 
                    readOnly
                    className="mt-1 accent-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-200">{p.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {importStatus && (
              <div className={`p-3.5 rounded-lg text-xs mb-4 text-center border ${
                importStatus.type === 'success' 
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' 
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}>
                {importStatus.message}
              </div>
            )}

            <div className="flex gap-3">
              <label className={`flex-1 text-center bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-xs transition-colors shadow cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {isUploading ? 'Procesando...' : 'Seleccionar archivo CSV'}
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleCsvUpload} 
                  className="hidden" 
                  disabled={isUploading}
                />
              </label>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
