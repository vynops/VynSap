import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VynSAP — SAP ERP Operations Platform',
  description: 'Enterprise SAP ERP database monitoring, performance, and operations platform.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080d1a] text-slate-100 min-h-screen">{children}</body>
    </html>
  )
}
