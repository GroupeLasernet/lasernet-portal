import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LaserNet - Client Portal',
  description: 'LaserNet client and admin portal for managing IT services',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
