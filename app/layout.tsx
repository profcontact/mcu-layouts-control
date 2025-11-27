import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import WebSocketProvider from '@/components/WebSocketProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MCU Layout - Управление видеоконференциями',
  description: 'Система управления раскладкой участников видеоконференций',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        <WebSocketProvider>
          {children}
        </WebSocketProvider>
      </body>
    </html>
  )
}

