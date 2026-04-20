import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { getInitialTheme, getThemeScript, THEME_COOKIE_NAME } from '@/lib/theme'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Finance Controller',
  description: 'Sistema de gestao financeira pessoal',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const initialTheme = getInitialTheme(cookieStore.get(THEME_COOKIE_NAME)?.value)

  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      data-theme={initialTheme}
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased ${initialTheme === 'dark' ? 'dark' : ''}`}
      style={{ colorScheme: initialTheme }}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  )
}
