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
  const [selectedPlatform, setSelectedPlatform] = useState<'tradervue' | 'das' | 'sage'>('tradervue')
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

  // Procesador flexible de archivos CSV segun la plataforma seleccionada
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
