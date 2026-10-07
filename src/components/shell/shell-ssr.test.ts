import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({ pathname: '/hoje' }))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}))

import CartoesPage from '@/app/(app)/cartoes/page'
import HojePage from '@/app/(app)/hoje/page'
import LancamentosPage from '@/app/(app)/lancamentos/page'
import MaisPage from '@/app/(app)/mais/page'
import PlanejarPage from '@/app/(app)/planejar/page'

import { CaptureProvider } from './capture-provider'
import { ScreenHeader } from './screen-header'
import { ShellAura } from './shell-aura'
import { TabBar } from './tab-bar'

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node)
const renderTabBar = (pathname: string) => {
  navigation.pathname = pathname
  return render(createElement(CaptureProvider, null, createElement(TabBar)))
}

beforeEach(() => {
  navigation.pathname = '/hoje'
})

describe('TabBar (CA-02, RN-01, RN-02)', () => {
  it('mostra os 5 slots na ordem Hoje, Lançamentos, +, Planejar, Cartões', () => {
    const html = renderTabBar('/hoje')
    const order = [
      'href="/hoje"',
      'href="/lancamentos"',
      'aria-label="Novo lançamento"',
      'href="/planejar"',
      'href="/cartoes"',
    ].map((needle) => html.indexOf(needle))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it.each([
    ['/hoje', 'Hoje'],
    ['/lancamentos', 'Lançamentos'],
    ['/planejar', 'Planejar'],
    ['/cartoes/abc', 'Cartões'],
  ])('em %s só a aba "%s" tem aria-current="page"', (pathname, label) => {
    const html = renderTabBar(pathname)
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>.*?<\/a>/)?.[0] ?? ''
    expect(current).toContain(`>${label}<`)
  })

  it('em /mais e fora do app nenhuma aba fica ativa', () => {
    expect(renderTabBar('/mais')).not.toContain('aria-current')
    expect(renderTabBar('/login')).not.toContain('aria-current')
  })

  it('o "+" é um botão que abre diálogo, sem href; Mais não está na barra', () => {
    const html = renderTabBar('/hoje')
    expect(html).toMatch(/<button[^>]*aria-label="Novo lançamento"[^>]*aria-haspopup="dialog"/)
    expect(html).not.toContain('href="/mais"')
    expect(html).toContain('aria-label="Principal"')
  })
})

describe('ScreenHeader', () => {
  it('título em h1 e botão Mais apontando para /mais', () => {
    const html = render(createElement(ScreenHeader, { title: 'Hoje' }))
    expect(html).toContain('<h1')
    expect(html).toContain('>Hoje<')
    expect(html).toMatch(
      /<a [^>]*href="\/mais"[^>]*aria-label="Mais"|aria-label="Mais"[^>]*href="\/mais"/,
    )
    expect(html).toContain('pt-safe')
  })

  it('showMore=false esconde o botão (rota /mais)', () => {
    const html = render(createElement(ScreenHeader, { title: 'Mais', showMore: false }))
    expect(html).not.toContain('href="/mais"')
  })
})

describe('ShellAura', () => {
  it('aparece só em /hoje', () => {
    navigation.pathname = '/hoje'
    expect(render(createElement(ShellAura))).toContain('data-slot="shell-aura"')
    for (const other of ['/lancamentos', '/planejar', '/cartoes', '/mais']) {
      navigation.pathname = other
      expect(render(createElement(ShellAura))).toBe('')
    }
  })
})

describe('páginas (CA-01, RN-06)', () => {
  it.each([
    ['Hoje', HojePage],
    ['Lançamentos', LancamentosPage],
    ['Planejar', PlanejarPage],
    ['Cartões', CartoesPage],
  ])('%s: ScreenHeader + empty state "Em breve", sem valores monetários', (title, Page) => {
    const html = render(createElement(Page))
    expect(html).toContain(`>${title}</h1>`)
    expect(html).toContain('data-slot="empty-state"')
    expect(html).toContain('Em breve')
    expect(html).not.toMatch(/R\$/)
  })

  it('Mais: lista os 7 destinos futuros sem rota', () => {
    const html = render(createElement(MaisPage))
    for (const label of [
      'Relatórios',
      'Contas',
      'Categorias',
      'Regras',
      'Importar',
      'Integrações',
      'Conta',
    ]) {
      expect(html).toContain(`>${label}<`)
    }
    expect(html.match(/Em breve/g)).toHaveLength(7)
    expect(html).not.toContain('href="/mais')
  })
})
