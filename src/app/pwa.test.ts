import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import manifest from './manifest'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const tokens = read('src/styles/tokens.css')
const voidToken = tokens.match(/--fc-void\s*:\s*(#[0-9a-fA-F]{6})\s*;/)?.[1]?.toLowerCase()

describe('manifest PWA (CA-04, CA-09)', () => {
  const m = manifest()

  it('lê --fc-void do tokens.css', () => {
    expect(voidToken).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('theme_color e background_color são iguais a --fc-void', () => {
    expect(m.theme_color?.toLowerCase()).toBe(voidToken)
    expect(m.background_color?.toLowerCase()).toBe(voidToken)
  })

  it('viewport.themeColor do layout é igual a --fc-void', () => {
    const layout = read('src/app/layout.tsx')
    const themeColor = layout.match(/themeColor:\s*'(#[0-9a-fA-F]{6})'/)?.[1]?.toLowerCase()
    expect(themeColor).toBe(voidToken)
  })

  it('abre em /hoje, standalone, retrato, pt-BR', () => {
    expect(m.start_url).toBe('/hoje')
    expect(m.scope).toBe('/')
    expect(m.display).toBe('standalone')
    expect(m.orientation).toBe('portrait')
    expect(m.lang).toBe('pt-BR')
  })

  it('declara 3 ícones, um deles maskable', () => {
    expect(m.icons).toHaveLength(3)
    expect(m.icons?.filter((icon) => icon.purpose === 'maskable')).toHaveLength(1)
  })

  it('todos os ícones do manifest e o apple-touch-icon existem em public/', () => {
    const files = [...(m.icons ?? []).map((icon) => icon.src), '/icons/apple-touch-icon.png']
    for (const src of files) {
      expect(existsSync(join(ROOT, 'public', src)), src).toBe(true)
    }
  })

  it('não usa dado do usuário nem token na URL de início', () => {
    expect(m.start_url).not.toMatch(/[?#]/)
  })
})

describe('metadados do layout raiz (CA-03)', () => {
  const layout = read('src/app/layout.tsx')

  it('viewport-fit=cover sem bloquear o zoom', () => {
    expect(layout).toContain("viewportFit: 'cover'")
    expect(layout).not.toMatch(/userScalable|maximumScale/)
  })

  it('metadados Apple de PWA', () => {
    expect(layout).toContain("statusBarStyle: 'black-translucent'")
    expect(layout).toContain("'apple-mobile-web-app-capable': 'yes'")
    expect(layout).toContain("manifest: '/manifest.webmanifest'")
    expect(layout).toContain('/icons/apple-touch-icon.png')
  })
})
