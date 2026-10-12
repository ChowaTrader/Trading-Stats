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
        .order('date', { ascending: false })

      if (!error && data) {
        const mapped = data.map((t: any) => ({
          ...t,
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

  // Parser robusto con filtrado estricto de nulos
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
          // 1. TRADERVUE (Open Datetime, Symbol, Side, Volume, Entry Price, Net P&L, P&L (R))
          const dateIdx = getIdx(['Open Datetime', 'Date'])
          const symbolIdx = getIdx(['Symbol', 'Ticker'])
          const sideIdx = getIdx(['Side', 'Action'])
          const volumeIdx = getIdx(['Volume', 'Shares'])
          const priceIdx = getIdx(['Entry Price', 'Price'])
          const netPnlIdx = getIdx(['Net P&L', 'P&L'])
          const rIdx = getIdx(['P&L (R)', 'rMultiple'])

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',')
            const clean = cols.map(c => c.trim().replace(/^"|"$/g, ''))

            if (clean.length >= 5) {
              const ticker = clean[symbolIdx >= 0 ? symbolIdx : 2]?.trim()
              if (!ticker || ticker === 'Symbol' || ticker === 'UNKNOWN') continue

              const rawDate = clean[dateIdx >= 0 ? dateIdx : 0] || ''
              const formattedDate = rawDate.split(' ')[0] || new Date().toISOString().split('T')[0]

              const rawR = clean[rIdx >= 0 ? rIdx : 18] || '0'
              const parsedR = parseFloat(rawR.replace('R', '')) || 0

              newTradesToInsert.push({
                user_id: user.id,
                date: formattedDate,
                ticker: ticker,
                action: clean[sideIdx >= 0 ? sideIdx : 3] || 'L',
                shares: Math.abs(parseFloat(clean[volumeIdx >= 0 ? volumeIdx : 4])) || 100,
                price: parseFloat(clean[priceIdx >= 0 ? priceIdx : 6]) || 0,
                pnl: parseFloat(clean[netPnlIdx >= 0 ? netPnlIdx : 14]) || 0,
                r_multiple: parsedR,
                trader: user.email?.split('@')[0] || 'Trader'
              })
            }
          }
        } else if (selectedPlatform === 'das') {
          // 2. DAS TRADER PRO (Symbol, Side, Type, Price, Qty, Time, Route, P / L, P/L R)
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
              const ticker = cols[symbolIdx >= 0 ? symbolIdx : 0]?.trim()
              if (!ticker || ticker === 'Symbol') continue

              const rawR = cols[rIdx >= 0 ? rIdx : 8] || '0'
              const parsedR = parseFloat(rawR.replace('R', '')) || 0

              newTradesToInsert.push({
                user_id: user.id,
                date: fileDate,
                ticker: ticker,
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
          // 3. SAGE PRO / STERLING (Transactions.csv)
          const dateIdx = getIdx(['Trade Date', 'Date'])
          const symbolIdx = getIdx(['Symbol', 'Ticker'])
          const sideIdx = getIdx(['Side', 'Action'])
          const qtyIdx = getIdx(['Qty', 'Shares', 'Volume'])
          const priceIdx = getIdx(['Price'])
          const netAmtIdx = getIdx(['Net Amt', 'Net P&L', 'P&L'])

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
            if (cols.length >= 8) {
              const ticker = cols[symbolIdx >= 0 ? symbolIdx : 7]?.trim()
              // Ignorar filas de gastos administrativos, cargos DAS o ACH que no tienen Symbol
              if (!ticker || ticker === 'Symbol' || ticker === 'NaN') continue

              newTradesToInsert.push({
                user_id: user.id,
                date: cols[dateIdx >= 0 ? dateIdx : 4] || new Date().toISOString().split('T')[0],
                ticker: ticker,
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
      if (!map[t.date]) map[t.date] = { pnl: 0, count: 0 }
      map[t.date].pnl += t.pnl
      map[t.date].count += 1
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
          <nav className="flex items-center gap-1 bg-[#161b22] p-1 rounded-lg border border-
