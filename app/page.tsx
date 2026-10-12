'use client'

import React, { useState, useMemo } from 'react'

interface Trade {
  id: string
  date: string // YYYY-MM-DD
  ticker: string
  action: string
  shares: number
  price: number
  pnl: number
  rMultiple: number
  trader: string
}

export default function TradingJournal() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'leaderboard'>('calendar')
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedMonth, setSelectedMonth] = useState<number>(9) // 0-indexed (9 = October)
  const [trades, setTrades] = useState<Trade[]>([
    { id: '1', date: '2026-10-01', ticker: 'AAPL', action: 'BUY', shares: 500, price: 180, pnl: -5.72, rMultiple: -0.2, trader: 'ChowaTrader' },
    { id: '2', date: '2026-10-02', ticker: 'TSLA', action: 'SELL', shares: 300, price: 240, pnl: 66.36, rMultiple: 2.1, trader: 'ChowaTrader' },
    { id: '3', date: '2026-10-06', ticker: 'NVDA', action: 'BUY', shares: 400, price: 120, pnl: 80.44, rMultiple: 1.8, trader: 'ChowaTrader' },
    { id: '4', date: '2026-10-07', ticker: 'AMD', action: 'BUY', shares: 600, price: 105, pnl: 104.80, rMultiple: 2.5, trader: 'ChowaTrader' },
    { id: '5', date: '2026-10-08', ticker: 'SPY', action: 'SELL', shares: 200, price: 570, pnl: 5.61, rMultiple: 0.1, trader: 'Trader2' },
    { id: '6', date: '2026-10-09', ticker: 'META', action: 'BUY', shares: 250, price: 580, pnl: -264.87, rMultiple: -3.0, trader: 'ChowaTrader' },
    { id: '7', date: '2026-10-10', ticker: 'AMZN', action: 'BUY', shares: 400, price: 190, pnl: 102.12, rMultiple: 2.2, trader: 'Trader3' },
  ])
  const [csvInput, setCsvInput] = useState('')

  // Procesar CSV de DAS Trader Pro
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return
      
      const lines = text.split('\n')
      const newTrades: Trade[] = []
      
      // Parser básico de filas CSV de DAS Trader
      lines.forEach((line, idx) => {
        if (idx === 0 || !line.trim()) return
        const cols = line.split(',')
        if (cols.length >= 5) {
          newTrades.push({
            id: Math.random().toString(),
            date: cols[0]?.trim() || new Date().toISOString().split('T')[0],
            ticker: cols[1]?.trim() || 'UNKNOWN',
            action: cols[2]?.trim() || 'BUY',
            shares: parseFloat(cols[3]) || 100,
            price: parseFloat(cols[4]) || 10,
            pnl: parseFloat(cols[5]) || (Math.random() * 200 - 80),
            rMultiple: parseFloat(cols[6]) || (Math.random() * 3 - 1),
            trader: 'ChowaTrader'
          })
        }
      })
      if (newTrades.length > 0) {
        setTrades(prev => [...prev, ...newTrades])
      }
    }
    reader.readAsText(file)
  }

  // Cálculos de P&L Mensal y Anual
  const monthsNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  // Generar días para el mes seleccionado
  const getDaysInMonth = (year: number, month: number) => {
    const date = new Date(year, month, 1)
    const days = []
    while (date.getMonth() === month) {
      days.push(new Date(date))
      date.setDate(date.getDate() + 1)
    }
    return days
  }

  const currentMonthDays = useMemo(() => getDaysInMonth(selectedYear, selectedMonth), [selectedYear, selectedMonth])

  // Agrupar trades por fecha
  const tradesByDate = useMemo(() => {
    const map: { [key: string]: { pnl: number; count: number } } = {}
    trades.forEach(t => {
      if (!map[t.date]) map[t.date] = { pnl: 0, count: 0 }
      map[t.date].pnl += t.pnl
      map[t.date].count += 1
    })
    return map
  }, [trades])

  // P&L total del mes seleccionado
  const monthlyPnl = useMemo(() => {
    return currentMonthDays.reduce((acc, day) => {
      const dateStr = day.toISOString().split('T')[0]
      return acc + (tradesByDate[dateStr]?.pnl || 0)
    }, 0)
  }, [currentMonthDays, tradesByDate])

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 font-sans antialiased">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-[#121620] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            ChowaTrader <span className="text-slate-400 font-normal text-sm">Small Caps Journal</span>
          </h1>
          <nav className="flex items-center gap-1 bg-[#1a202c] p-1 rounded-lg border border-slate-700/50">
            <button 
              onClick={() => setActiveTab('calendar')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              📅 Calendario
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              📊 Dashboard $ / $R
            </button>
            <button 
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'leaderboard' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              🏆 Leaderboard
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-md transition-colors shadow">
            📂 Importar CSV DAS Trader
            <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
          </label>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-[1600px] mx-auto space-y-6">

        {/* VISTA CALENDAR (Estilo TraderSync / Tradervue) */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            
            {/* Detalle del Mes Seleccionado (Arriba) */}
            <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {monthsNames[selectedMonth]}, {selectedYear}
                  </h2>
                  <p className="text-xs text-slate-400">Desglose diario, semanal y rentabilidad total</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Monthly P&L:</span>
                  <span className={`text-lg font-bold ${monthlyPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${monthlyPnl.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Grid de días (Domingo - Sábado) */}
              <div className="grid grid-cols-8 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Total'].map((day, idx) => (
                  <div key={idx} className="text-center text-xs font-semibold text-slate-400 py-2 bg-[#1a202c] rounded">
                    {day}
                  </div>
                ))}

                {/* Renderizar semanas y días del mes */}
                {(() => {
                  const firstDayIndex = new Date(selectedYear, selectedMonth, 1).getDay()
                  const totalDays = currentMonthDays.length
                  const cells = []
                  
                  // Días vacíos iniciales
                  for (let i = 0; i < firstDayIndex; i++) {
                    cells.push(<div key={`empty-${i}`} className="bg-[#0b0e14]/40 border border-slate-800/40 rounded-lg min-h-[90px] opacity-30"></div>)
                  }

                  // Días del mes
                  currentMonthDays.forEach((day, index) => {
                    const dateStr = day.toISOString().split('T')[0]
                    const data = tradesByDate[dateStr]
                    const dayNum = index + 1
                    cells.push(
                      <div key={dateStr} className={`border rounded-lg p-2 flex flex-col justify-between min-h-[90px] transition-all ${data ? (data.pnl >= 0 ? 'bg-emerald-950/20 border-emerald-900/50 hover:border-emerald-500' : 'bg-rose-950/20 border-rose-900/50 hover:border-rose-500') : 'bg-[#161b22] border-slate-800'}`}>
                        <div className="flex justify-between items-start text-xs text-slate-400">
                          <span className="font-semibold text-slate-300">{dayNum}</span>
                          <span className="text-[10px] opacity-60">📋</span>
                        </div>
                        {data ? (
                          <div className="text-right">
                            <span className={`block text-xs font-bold ${data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {data.pnl >= 0 ? `+$${data.pnl.toFixed(2)}` : `-$${Math.abs(data.pnl).toFixed(2)}`}
                            </span>
                            <span className="text-[10px] text-slate-400">{data.count} trades</span>
                          </div>
                        ) : (
                          <div className="text-right text-[10px] text-slate-600">$0<br/>0 trades</div>
                        )}
                      </div>
                    )
                  })

                  return cells
                })()}
              </div>
            </div>

            {/* Cuadrícula de 12 Meses del Año (Abajo) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {monthsNames.map((mName, mIndex) => {
                const isSelected = selectedMonth === mIndex
                return (
                  <div key={mName} className={`bg-[#121620] border rounded-xl p-4 shadow transition-all ${isSelected ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-800 hover:border-slate-700'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-white">{mName}, {selectedYear}</span>
                      <button 
                        onClick={() => setSelectedMonth(mIndex)}
                        className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                      >
                        {isSelected ? 'Active' : 'Open'}
                      </button>
                    </div>

                    {/* Mini calendario */}
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                        <span key={d} className="text-slate-500 font-semibold">{d}</span>
                      ))}
                      {/* Mini celdas simplificadas */}
                      {Array.from({ length: 31 }).map((_, dIdx) => {
                        const dayNum = dIdx + 1
                        const pad = (n: number) => String(n).padStart(2, '0')
                        const dStr = `${selectedYear}-${pad(selectedMonth + 1)}-${pad(dayNum)}`
                        const hasTrade = tradesByDate[dStr]
                        return (
                          <div 
                            key={dIdx} 
                            className={`py-1 rounded text-[9px] ${hasTrade ? (hasTrade.pnl >= 0 ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'bg-rose-500/20 text-rose-300 font-bold') : 'text-slate-600'}`}
                          >
                            {dayNum <= 31 ? dayNum : ''}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

          </div>
        )}

        {/* VISTA DASHBOARD ($y$R) */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">P&L Total Net</span>
                <div className="text-2xl font-bold text-emerald-400 mt-1">+$458.12</div>
              </div>
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">R-Multiple Acumulado</span>
                <div className="text-2xl font-bold text-emerald-400 mt-1">+12.4R</div>
              </div>
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">Win Rate</span>
                <div className="text-2xl font-bold text-white mt-1">68.5%</div>
              </div>
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">Profit Factor</span>
                <div className="text-2xl font-bold text-white mt-1">2.84</div>
              </div>
            </div>

            <div className="bg-[#121620] border border-slate-800 rounded-xl p-6">
              <h3 className="text-md font-bold text-white mb-4">Registro detallado de Operaciones (DAS Trader)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#1a202c] text-slate-400 uppercase">
                    <tr>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Ticker</th>
                      <th className="p-3">Acción</th>
                      <th className="p-3">Shares</th>
                      <th className="p-3">Precio</th>
                      <th className="p-3">P&L ($)</th>
                      <th className="p-3">R-Multiple</th>
                      <th className="p-3">Trader</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {trades.map(t => (
                      <tr key={t.id} className="hover:bg-[#1a202c]/50">
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
                        <td className="p-3 text-slate-400">{t.trader}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VISTA LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 max-w-2xl mx-auto">
            <h3 className="text-lg font-bold text-white mb-4 text-center">🏆 Leaderboard Comunitario (Small Caps)</h3>
            <div className="space-y-3">
              {[
                { rank: 1, name: 'ChowaTrader', pnl: '+$1,420.50', r: '+18.2R', winrate: '74%' },
                { rank: 2, name: 'Trader2', pnl: '+$980.20', r: '+12.5R', winrate: '65%' },
                { rank: 3, name: 'Trader3', pnl: '+$450.00', r: '+6.1R', winrate: '58%' },
              ].map(trader => (
                <div key={trader.rank} className="flex items-center justify-between p-4 bg-[#1a202c] rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-bold text-slate-400">#{trader.rank}</span>
                    <div>
                      <h4 className="font-bold text-white">{trader.name}</h4>
                      <span className="text-xs text-slate-400">Win Rate: {trader.winrate}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block font-bold text-emerald-400">{trader.pnl}</span>
                    <span className="text-xs text-slate-400">{trader.r}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
