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

  // Estado para el modal de importación CSV
  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('tradervue')
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Comprobar sesión de usuario con Supabase
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

  // Cargar trades privados del usuario
  useEffect(() => {
    if (!user) return

    const fetchTrades = async () => {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .order('date', { ascending: false })

      if (!error && data) {
        setTrades(data)
      }
    }

    fetchTrades()
  }, [user])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setTrades([])
  }

  // Procesador flexible de archivos CSV según la plataforma seleccionada
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

        if (selectedPlatform === 'tradervue') {
          // Lógica específica Tradervue
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
          
          const getIndex = (names: string[]) => headers.findIndex(h => names.some(n => h.toLowerCase() === n.toLowerCase()))

          const dateIdx = getIndex(['Open Datetime', 'Date'])
          const symbolIdx = getIndex(['Symbol', 'Ticker'])
          const sideIdx = getIndex(['Side', 'Action'])
          const volumeIdx = getIndex(['Volume', 'Shares'])
          const priceIdx = getIndex(['Entry Price', 'Price'])
          const netPnlIdx = getIndex(['Net P&L', 'P&L'])
          const rIdx = getIndex(['P&L (R)', 'rMultiple'])

          lines.slice(1).forEach((line) => {
            const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',')
            const clean = cols.map(c => c.trim().replace(/^"|"$/g, ''))

            if (clean.length >= 5) {
              const rawDate = clean[dateIdx >= 0 ? dateIdx : 0] || ''
              const formattedDate = rawDate.split(' ')[0] || new Date().toISOString().split('T')[0]
              
              const rawR = clean[rIdx >= 0 ? rIdx : 18] || '0'
              const parsedR = parseFloat(rawR.replace('R', '')) || 0

              newTradesToInsert.push({
                user_id: user.id,
                date: formattedDate,
                ticker: clean[symbolIdx >= 0 ? symbolIdx : 2] || 'UNKNOWN',
                action: clean[sideIdx >= 0 ? sideIdx : 3] || 'BUY',
                shares: parseFloat(clean[volumeIdx >= 0 ? volumeIdx : 4]) || 100,
                price: parseFloat(clean[priceIdx >= 0 ? priceIdx : 6]) || 10,
                pnl: parseFloat(clean[netPnlIdx >= 0 ? netPnlIdx : 14]) || 0,
                rMultiple: parsedR,
                trader: user.email?.split('@')[0] || 'Trader'
              })
            }
          })
        } else {
          // Lógica estándar para DAS Trader / Sage Pro
          lines.slice(1).forEach((line) => {
            const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
            if (cols.length >= 5) {
              newTradesToInsert.push({
                user_id: user.id,
                date: cols[0] || new Date().toISOString().split('T')[0],
                ticker: cols[1] || 'UNKNOWN',
                action: cols[2] || 'BUY',
                shares: parseFloat(cols[3]) || 100,
                price: parseFloat(cols[4]) || 10,
                pnl: parseFloat(cols[5]) || 0,
                rMultiple: parseFloat(cols[6]) || 0,
                trader: user.email?.split('@')[0] || 'Trader'
              })
            }
          })
        }

        if (newTradesToInsert.length > 0) {
          const { data, error } = await supabase.from('trades').insert(newTradesToInsert).select()
          if (!error && data) {
            setTrades(prev => [...data, ...prev])
            setImportStatus({
              type: 'success',
              message: `¡Éxito! Se han importado correctamente ${data.length} operaciones.`
            })
          } else {
            throw new Error(error?.message || "Error al insertar en la base de datos.")
          }
        } else {
          throw new Error("No se detectaron operaciones válidas en el formato seleccionado.")
        }
      } catch (err: any) {
        setImportStatus({
          type: 'error',
          message: err?.message || 'Ocurrió un error al procesar el archivo.'
        })
      } finally {
        setIsUploading(false)
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  const monthsNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  const tradesByDate = useMemo(() => {
    const map: { [key: string]: { pnl: number; count: number } } = {}
    trades.forEach(t => {
      if (!map[t.date]) map[t.date] = { pnl: 0, count: 0 }
      map[t.date].pnl += t.pnl
      map[t.date].count += 1
    })
    return map
  }, [trades])

  // Métricas reales
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
                  onChange={(e
