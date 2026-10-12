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
      <head>
        {/* CDN de Tailwind para asegurar el renderizado inmediato si falla la compilación local */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-[#0b0e14] text-slate-200 min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
