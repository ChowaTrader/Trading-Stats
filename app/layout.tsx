import './globals.css'

export const metadata = {
  title: 'ChowaTrader Community',
  description: 'DAS Trader Pro Journal & Analytics',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
