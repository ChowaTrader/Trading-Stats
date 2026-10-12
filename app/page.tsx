const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      if (!text) return

      const lines = text.split('\n')
      if (lines.length < 2) return

      // Leer cabeceras para mapear dinámicamente
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      
      const getIndex = (names: string[]) => {
        return headers.findIndex(h => names.some(n => h.toLowerCase() === n.toLowerCase()))
      }

      const dateIdx = getIndex(['Open Datetime', 'Date', 'Fecha'])
      const symbolIdx = getIndex(['Symbol', 'Ticker'])
      const sideIdx = getIndex(['Side', 'Action', 'Lado'])
      const volumeIdx = getIndex(['Volume', 'Shares', 'Cantidad'])
      const priceIdx = getIndex(['Entry Price', 'Price', 'Precio'])
      const netPnlIdx = getIndex(['Net P&L', 'P&L', 'Gross P&L'])
      const rIdx = getIndex(['P&L (R)', 'rMultiple', 'R'])

      const newTradesToInsert: any[] = []

      lines.forEach((line, idx) => {
        if (idx === 0 || !line.trim()) return
        
        // Split respetando comillas
        const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',')
        const cleanCols = cols.map(c => c.trim().replace(/^"|"$/g, ''))

        if (cleanCols.length >= 5) {
          const rawDate = cleanCols[dateIdx >= 0 ? dateIdx : 0] || ''
          const formattedDate = rawDate.split(' ')[0] || new Date().toISOString().split('T')[0]
          
          const rawR = cleanCols[rIdx >= 0 ? rIdx : 18] || '0'
          const parsedR = parseFloat(rawR.replace('R', '')) || 0

          newTradesToInsert.push({
            user_id: user.id,
            date: formattedDate,
            ticker: cleanCols[symbolIdx >= 0 ? symbolIdx : 2] || 'UNKNOWN',
            action: cleanCols[sideIdx >= 0 ? sideIdx : 3] || 'BUY',
            shares: parseFloat(cleanCols[volumeIdx >= 0 ? volumeIdx : 4]) || 100,
            price: parseFloat(cleanCols[priceIdx >= 0 ? priceIdx : 6]) || 10,
            pnl: parseFloat(cleanCols[netPnlIdx >= 0 ? netPnlIdx : 14]) || 0,
            rMultiple: parsedR,
            trader: user.email?.split('@')[0] || 'Trader'
          })
        }
      })

      if (newTradesToInsert.length > 0) {
        const { data, error } = await supabase.from('trades').insert(newTradesToInsert).select()
        if (!error && data) {
          setTrades(prev => [...prev, ...data])
          alert(`¡Se han importado ${data.length} operaciones con éxito!`)
        } else {
          alert('Error al guardar las operaciones en Supabase')
        }
      }
    }
    reader.readAsText(file)
  }
