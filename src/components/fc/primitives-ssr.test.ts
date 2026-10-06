import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AmountText } from './amount-text'
import { IconButton } from './icon-button'
import { Segmented } from './segmented'

/** O formato fixado usa espaço não separável entre `R$` e o número. */
const NBSP = String.fromCharCode(160)
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node)

describe('AmountText (SSR) — CA-03', () => {
  it('negativo: -R$ 1.234,56 com a cor de saída', () => {
    const html = render(createElement(AmountText, { cents: -123456 }))
    expect(html).toContain(`-R$${NBSP}1.234,56`)
    expect(html).toContain('text-fc-out')
    expect(html).toContain('fc-text-amount')
  })

  it('positivo usa a cor de entrada e zero (auto) usa texto secundário', () => {
    expect(render(createElement(AmountText, { cents: 100000 }))).toContain('text-fc-in')
    const zero = render(createElement(AmountText, { cents: 0 }))
    expect(zero).toContain('text-fc-text-2')
    expect(zero).toContain(`R$${NBSP}0,00`)
  })

  it('tons explícitos ignoram o sinal', () => {
    expect(render(createElement(AmountText, { cents: -8990, tone: 'pend' }))).toContain(
      'text-fc-pend',
    )
    expect(render(createElement(AmountText, { cents: -8990, tone: 'debt' }))).toContain(
      'text-fc-debt',
    )
  })

  it('hidden: nenhum dígito em nenhum lugar do HTML (texto, aria-label, title)', () => {
    for (const cents of [-123456, 100000, 0, 999999999]) {
      const html = render(createElement(AmountText, { cents, hidden: true }))
      expect(html).toContain(`R$${NBSP}••••`)
      expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/\d/)
      expect(html).not.toMatch(/(?:aria-label|title)="[^"]*\d/)
      // atributos de classe não carregam o valor
      expect(html).not.toContain(String(Math.abs(cents)))
    }
  })

  it('leitor de tela recebe o valor completo; o visual fica aria-hidden', () => {
    const html = render(createElement(AmountText, { cents: -123456 }))
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('menos 1.234 reais e 56 centavos')
  })
})

describe('Segmented (SSR) — CA-07', () => {
  const options = [
    { value: 'a', label: 'Entradas' },
    { value: 'b', label: 'Saídas' },
  ]

  it('expõe role=tablist/tab e aria-selected só na opção ativa', () => {
    const html = render(createElement(Segmented, { options, value: 'b', onChange: () => {} }))
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)).toHaveLength(2)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html.match(/aria-selected="false"/g)).toHaveLength(1)
    // roving tabindex: só a opção ativa entra na ordem de Tab
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/tabindex="-1"/g)).toHaveLength(1)
  })
})

describe('IconButton (SSR) — nome acessível', () => {
  it('label vira aria-label e o alvo usa o token de toque', () => {
    const html = render(createElement(IconButton, { label: 'Adicionar', icon: null }))
    expect(html).toContain('aria-label="Adicionar"')
    expect(html).toContain('size-fc-touch')
    expect(html).toContain('min-h-fc-touch')
    expect(html).toContain('type="button"')
  })
})
