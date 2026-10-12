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
  const [selectedMonth, setSelectedMonth] = useState<number>(9) // 9 = October
  const [trades, setTrades] = useState<Trade[]>([
    { id: '1', date: '2026-10-01', ticker: 'AAPL', action: 'BUY', shares: 500, price: 180, pnl: -5.72, rMultiple: -0.2, trader: 'ChowaTrader' },
    { id: '2', date: '2026-10-02', ticker: 'TSLA', action: 'SELL', shares: 300, price: 240, pnl: 66.36, rMultiple: 2.1, trader: 'ChowaTrader' },
    { id: '3', date: '2026-10-06', ticker: 'NVDA', action: 'BUY', shares: 400, price: 120, pnl: 80.44, rMultiple: 1.8, trader: 'ChowaTrader' },
    { id: '4', date: '2026-10-07', ticker: 'AMD', action: 'BUY', shares: 600, price: 105, pnl: 104.80, rMultiple: 2.5, trader: 'ChowaTrader' },
    { id: '5', date: '2026-10-08', ticker: 'SPY', action: 'SELL', shares: 200, price: 570, pnl: 5.61, rMultiple: 0.1, trader: 'Trader2' },
    { id: '6', date: '2026-10-09', ticker: 'META', action: 'BUY', shares: 250, price: 580, pnl: -264.87, rMultiple: -3.0, trader: 'ChowaTrader' },
    { id: '7', date: '2026-10-10', ticker: 'AMZN', action: 'BUY', shares: 400, price: 190, pnl: 102.12, rMultiple: 2.2, trader: 'Trader3' },
  ])

  // Importar CSV de DAS Trader Pro
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return
      const lines = text.split('\n')
      const newTrades: Trade[] = []
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

  const monthsNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

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

  // Generar semanas exactas para el calendario mensual estilo TraderSync
  const calendarWeeks = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1)
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0)
    
    let currentDay = new Date(firstDay)
    currentDay.setDate(currentDay.getDate() - currentDay.getDay()) // Empezar en Domingo

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

  // P&L total del mes
  const monthlyPnl = useMemo(() => {
    return calendarWeeks.reduce((acc, w) => acc + w.weekPnl, 0)
  }, [calendarWeeks])

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 font-sans antialiased">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-[#121620] px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            ChowaTrader <span className="text-slate-400 font-normal text-sm">Small Caps Journal</span>
          </h1>
          <nav className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-slate-800">
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
          <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-md transition-colors shadow">
            📂 Importar CSV DAS Trader
            <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
          </label>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-[1500px] mx-auto space-y-6">

        {/* SELECTOR DE MESES Y AÑOS */}
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

        {/* VISTA CALENDAR (Estilo TraderSync exacto) */}
        {activeTab === 'calendar' && (
          <div className="bg-[#121620] border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold text-white">
                {monthsNames[selectedMonth]}, {selectedYear}
              </h2>
            </div>

            {/* Cabecera de días y columna Total */}
            <div className="grid grid-cols-8 gap-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Total'].map((d, i) => (
                <div key={i} className="text-center text-xs font-semibold text-slate-400 py-2 bg-[#161b22] rounded border border-slate-800">
                  {d}
                </div>
              ))}
            </div>

            {/* Filas de Semanas */}
            <div className="space-y-2">
              {calendarWeeks.map((week, wIdx) => (
                <div key={wIdx} className="grid grid-cols-8 gap-2">
                  {/* 7 Días de la semana */}
                  {week.days.map((day, dIdx) => (
                    <div 
                      key={dIdx} 
                      className={`border rounded-lg p-2.5 flex flex-col justify-between min-h-[95px] ${
                        !day.isCurrenMonth 
                          ? 'bg-[#0b0e14]/50 border-slate-900 text-slate-600' 
                          : day.data 
                            ? day.data.pnl >= 0 
                              ? 'bg-[#12221c] border-emerald-900/50 hover:border-emerald-500' 
                              : 'bg-[#261519] border-rose-900/50 hover:border-rose-500' 
                            : 'bg-[#161b22] border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex justify-between items-start text-xs">
                        <span className={`font-semibold ${day.isCurrenMonth ? 'text-slate-200' : 'text-slate-600'}`}>
                          {day.dayNum}
                        </span>
                        <span className="text-[10px] text-slate-500">📋</span>
                      </div>
                      
                      {day.isCurrenMonth && day.data ? (
                        <div className="text-right">
                          <span className={`block text-xs font-bold ${day.data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {day.data.pnl >= 0 ? `+$${day.data.pnl.toFixed(2)}` : `-$${Math.abs(day.data.pnl).toFixed(2)}`}
                          </span>
                          <span className="text-[10px] text-slate-400">{day.data.count} trades</span>
                        </div>
                      ) : (
                        <div className="text-right text-[10px] text-slate-500">
                          {day.isCurrenMonth ? <>$0<br/>0 trades</> : ''}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Columna Total Semanal */}
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
        )}

        {/* VISTA DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#121620] border border-slate-800 p-5 rounded-xl shadow">
                <span className="text-xs text-slate-400 font-medium">P&L Total Net</span>
