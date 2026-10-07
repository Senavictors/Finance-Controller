import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  applicationName: 'Finance Controller',
  title: { default: 'Finance Controller', template: '%s · FC' },
  description: 'Finanças pessoais, no seu bolso.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'FC', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
  // O Next 16 emite só `mobile-web-app-capable`; o iOS ainda lê a tag da Apple.
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

// `viewport-fit=cover` faz o `env(safe-area-inset-*)` valer no iPhone. O zoom do usuário
// não é bloqueado (acessibilidade).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#04060b', // fc-allow-literal-color: valor de --fc-void exigido pelo viewport
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      style={{ colorScheme: 'dark' }}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
    </html>
  )
}
