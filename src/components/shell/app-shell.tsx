import * as React from 'react'

import { Toaster } from '@/components/fc'

import { CaptureProvider } from './capture-provider'
import { CaptureSheetStub } from './capture-sheet-stub'
import { ShellAura } from './shell-aura'
import { TabBar } from './tab-bar'

/**
 * Moldura do app (grupo `(app)`): conteúdo rolando com o corpo da página (preserva o
 * comportamento da status bar do iOS), tab bar de vidro fixa, sheet de captura e Toaster.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <CaptureProvider>
      <div data-slot="app-shell" className="fc-shell">
        <ShellAura />
        <main className="fc-shell-main">{children}</main>
        <TabBar />
      </div>
      <CaptureSheetStub />
      <Toaster />
    </CaptureProvider>
  )
}
