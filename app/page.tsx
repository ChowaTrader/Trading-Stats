'use client'

import React, { useState } from 'react'
import { Upload, Calendar, BarChart3, Users, TrendingUp, Award, FileText } from 'lucide-react'

interface TradeRecord {
  symbol: string
  side: string
  type: string
  price: number
  qty: number
  time: string
  route: string
  pnl: number
  pnlR: number
  account: string
  cloid: string
}

export default function TradingJournalApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'community'>('dashboard')
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [fileName, setFileName] = useState<string>('')

  // Parse DAS Trader CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return

      const lines = text.split('\n')
      const parsedTrades: TradeRecord[] = []

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        
        const cols = line.split(',').map(c => c.trim())
        if (cols.length >= 9) {
          const symbol = cols[0]
          const side = cols[1]
          const type = cols[2]
          const price = parseFloat(cols[3]) || 0
          const qty = parseInt(cols[4]) || 0
          const time = cols[5]
          const route = cols[6]
          const pnl = parseFloat(cols[7]) || 0
          
          let rStr = cols[8] || '0'
          rStr = rStr.replace('R', '').trim()
          const pnlR = parseFloat(rStr) || 0

          const account = cols[9] || ''
          const cloid = cols[10] || ''

          parsedTrades.push({
            symbol,
            side,
            type,
            price,
            qty,
            time,
            route,
            pnl,
            pnlR,
            account,
            cloid
          })
        }
      }
      setTrades(parsedTrades)
    }
    reader.readAsText(file)
  }

  const totalPnL = trades.reduce((acc, t) => acc + t.pnl, 0)
  const totalR = trades.reduce((acc, t) => acc + t.pnlR, 0)
  const winningTrades = trades.filter(t => t.pnl > 0).length
  const winRate = trades.length > 0 ? ((winningTrades / trades.length) * 100).toFixed(1) : '0'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-xl text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-white">ChowaTrader <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-normal">Community</span></h1>
              <p className="text-xs text-slate-400">DAS Trader Pro Journal & Analytics</p>
            </div>
          </div>
          <nav className="flex space-x-1">
            <button 
              onClick={() => setActiveTab('dashboard')} 
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
            <button 
              onClick={() => setActiveTab('calendar')} 
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${activeTab === 'calendar' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Calendar className="w-4 h-4" />
              <span>Calendario</span>
            </button>
            <button 
              onClick={() => setActiveTab('community')} 
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${activeTab === 'community' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Users className="w-4 h-4" />
              <span>Comunidad</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-slate-800 rounded-xl text-emerald-400">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Importar Ejecuciones (DAS Trader Pro CSV)</h2>
              <p className="text-sm text-slate-400">Sube tu archivo CSV diario para actualizar tus métricas y calendario.</p>
            </div>
          </div>
          <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/20 flex items-center space-x-2">
            <Upload className="w-5 h-5" />
            <span>Seleccionar CSV</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {fileName && (
          <div className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-4 py-2 rounded-lg flex items-center justify-between">
            <span>Archivo cargado: <strong>{fileName}</strong> ({trades.length} ejecuciones procesadas)</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <p className="text-sm font-medium text-slate-400">P&L Neto ($)</p>
            <div className={`text-2xl font-bold mt-2 ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalPnL >= 0 ? `+$${totalPnL.toFixed(2)}` : `-$${Math.abs(totalPnL).toFixed(2)}`}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <p className="text-sm font-medium text-slate-400">Riesgo Total ($R$)</p>
            <div className={`text-2xl font-bold mt-2 ${totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalR >= 0 ? `+${totalR.toFixed(2)}R` : `${totalR.toFixed(2)}R`}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <p className="text-sm font-medium text-slate-400">Win Rate</p>
            <div className="text-2xl font-bold text-white mt-2">{winRate}%</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <p className="text-sm font-medium text-slate-400">Total Ejecuciones</p>
            <div className="text-2xl font-bold text-white mt-2">{trades.length}</div>
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <span>Desglose de Operaciones (DAS Trader)</span>
            </h3>
            {trades.length === 0 ? (
              <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Sube tu archivo CSV de DAS Trader (`09102026.csv`) para ver los trades en detalle.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-xs tracking-wider">
                    <tr>
                      <th className="p-3">Símbolo</th>
                      <th className="p-3">Side</th>
                      <th className="p-3">Precio</th>
                      <th className="p-3">Qty</th>
                      <th className="p-3">Hora</th>
                      <th className="p-3">P&L ($)</th>
                      <th className="p-3">P&L (R)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {trades.map((t, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/50">
                        <td className="p-3 font-semibold text-white">{t.symbol}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${t.side === 'B' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {t.side}
                          </span>
                        </td>
                        <td className="p-3">${t.price.toFixed(2)}</td>
                        <td className="p-3">{t.qty}</td>
                        <td className="p-3 text-slate-400">{t.time}</td>
                        <td className={`p-3 font-semibold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnl >= 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`}
                        </td>
                        <td className={`p-3 font-semibold ${t.pnlR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnlR >= 0 ? `+${t.pnlR}R` : `${t.pnlR}R`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              <span>Calendario Mensual de Resultados</span>
            </h3>
            <div className="grid grid-cols-7 gap-3 pt-4 text-center">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                <div key={d} className="text-xs font-bold text-slate-500 uppercase">{d}</div>
              ))}
              {Array.from({ length: 31 }).map((_, i) => {
                const dayNum = i + 1;
                const isSampleDay = dayNum === 9;
                return (
                  <div 
                    key={i} 
                    className={`h-24 rounded-xl border p-2 flex flex-col justify-between transition-all ${isSampleDay ? 'bg-emerald-950/20 border-emerald-500/40 shadow-lg' : 'bg-slate-950/50 border-slate-800'}`}
                  >
                    <span className="text-xs font-bold text-slate-400">{dayNum}</span>
                    {isSampleDay && trades.length > 0 ? (
                      <div>
                        <div className="text-xs font-extrabold text-emerald-400">+${totalPnL.toFixed(2)}</div>
                        <div className="text-[10px] text-emerald-500 font-bold">+{totalR.toFixed(2)}R</div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-600">-</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'community' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <Award className="w-5 h-5 text-emerald-400" />
              <span>Leaderboard de la Comunidad (5-10 Traders)</span>
            </h3>
            <div className="space-y-3 pt-2">
              {[
                { name: 'ChowaTrader (Tú)', r: '+4.31R', pnl: '+$101.95', winRate: '65.2%', rank: 1 },
                { name: 'Trader_Alex', r: '+12.40R', pnl: '+$840.00', winRate: '58.0%', rank: 2 },
                { name: 'SmallCapKing', r: '-1.50R', pnl: '-$120.50', winRate: '42.1%', rank: 3 }
              ].map((member) => (
                <div key={member.rank} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${member.rank === 1 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-300'}`}>
                      #{member.rank}
                    </span>
                    <div>
                      <h4 className="font-semibold text-white">{member.name}</h4>
                      <p className="text-xs text-slate-400">Win Rate: {member.winRate}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-400">{member.r}</div>
                    <div className="text-xs text-slate-400">{member.pnl}</div>
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
