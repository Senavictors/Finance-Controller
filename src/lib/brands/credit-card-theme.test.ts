import { describe, expect, it } from 'vitest'
import {
  getCreditCardBrandAccentStyle,
  getCreditCardBrandSurfaceStyle,
  getCreditCardBrandTheme,
  withOpacity,
} from './credit-card-theme'

describe('brands/credit-card-theme', () => {
  it('retorna null para emissores sem paleta mapeada', () => {
    expect(getCreditCardBrandTheme(null)).toBeNull()
    expect(getCreditCardBrandTheme('visa')).toBeNull()
    expect(getCreditCardBrandTheme('marca-inexistente')).toBeNull()
  })

  it('retorna a paleta configurada para bancos suportados', () => {
    expect(getCreditCardBrandTheme('itau')).toEqual({
      brandKey: 'itau',
      primary: '#FF6200',
      secondary: '#000066',
      tertiary: '#FFFFFF',
    })
  })

  it('aplica opacidade sobre hex RGB de 3 e 6 digitos', () => {
    expect(withOpacity('#8A05BE', 0.5)).toBe('#8A05BE80')
    expect(withOpacity('#ABC', 0.25)).toBe('#AABBCC40')
  })

  it('gera styles coerentes para o card e a faixa de destaque', () => {
    const theme = getCreditCardBrandTheme('nubank')
    const surface = getCreditCardBrandSurfaceStyle(theme)
    const accent = getCreditCardBrandAccentStyle(theme)

    expect(surface).toBeDefined()
    expect(surface?.borderColor).toBe('#8A05BE47')
    expect(String(surface?.backgroundImage)).toContain('#8A05BE38')
    expect(accent?.backgroundImage).toContain('#8A05BE')
  })
})
