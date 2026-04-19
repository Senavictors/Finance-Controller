import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRANDS, getBrand, listBrands, matchBrand, resolveBrand } from './registry'

describe('brands/registry', () => {
  describe('getBrand', () => {
    it('retorna a marca quando a chave existe', () => {
      expect(getBrand('nubank')?.name).toBe('Nubank')
      expect(getBrand('visa')?.category).toBe('network')
    })

    it('retorna null para chaves desconhecidas, vazias ou nulas', () => {
      expect(getBrand(null)).toBeNull()
      expect(getBrand(undefined)).toBeNull()
      expect(getBrand('')).toBeNull()
      expect(getBrand('marca-inexistente')).toBeNull()
    })
  })

  describe('listBrands', () => {
    it('filtra por categoria quando informada', () => {
      const banks = listBrands('bank')
      expect(banks.length).toBeGreaterThan(0)
      expect(banks.every((brand) => brand.category === 'bank')).toBe(true)
    })

    it('retorna todas as marcas quando nenhuma categoria e informada', () => {
      expect(listBrands().length).toBe(Object.keys(BRANDS).length)
    })
  })

  describe('matchBrand', () => {
    it('reconhece bancos, bandeiras, pagamentos e assinaturas no texto', () => {
      expect(matchBrand('Compra no Nubank')).toBe('nubank')
      expect(matchBrand('ITAUCARD BR')).toBe('itau')
      expect(matchBrand('pagamento via PagSeguro')).toBe('pagbank')
      expect(matchBrand('cartao VISA infinite')).toBe('visa')
      expect(matchBrand('MASTERCARD platinum')).toBe('mastercard')
      expect(matchBrand('Netflix assinatura')).toBe('netflix')
      expect(matchBrand('Amazon Prime Video')).toBe('primevideo')
      expect(matchBrand('Disney+ familia')).toBe('disneyplus')
    })

    it('normaliza acentos e caixa antes de comparar', () => {
      expect(matchBrand('ITAÚ')).toBe('itau')
      expect(matchBrand('itaú UNIBANCO')).toBe('itau')
      expect(matchBrand('Assinatura Spotify Família')).toBe('spotify')
    })

    it('respeita limites de palavra para siglas curtas', () => {
      expect(matchBrand('transferencia via BB')).toBe('bb')
      expect(matchBrand('Abba Pizza')).toBeNull()
    })

    it('retorna null para entradas vazias ou nao mapeadas', () => {
      expect(matchBrand(null)).toBeNull()
      expect(matchBrand(undefined)).toBeNull()
      expect(matchBrand('')).toBeNull()
      expect(matchBrand('Padaria do bairro')).toBeNull()
    })
  })

  describe('resolveBrand', () => {
    it('prioriza a chave explicita sobre o texto', () => {
      expect(resolveBrand('netflix', 'Compra na Itau')?.key).toBe('netflix')
    })

    it('cai para matchBrand quando a chave e invalida', () => {
      expect(resolveBrand(null, 'Fatura Spotify')?.key).toBe('spotify')
      expect(resolveBrand('inexistente', 'Gastei no iFood com Nubank')?.key).toBe('nubank')
    })

    it('retorna null quando nada pode ser inferido', () => {
      expect(resolveBrand(null, 'Padaria do bairro')).toBeNull()
      expect(resolveBrand(undefined, null)).toBeNull()
    })
  })

  describe('asset inventory (phase 28)', () => {
    const BRANDS_WITHOUT_ASSET = new Set(['neon', 'pix'])

    it('toda marca fora da lista de fallback possui asset local', () => {
      for (const brand of Object.values(BRANDS)) {
        if (BRANDS_WITHOUT_ASSET.has(brand.key)) continue
        expect(brand.asset, `asset ausente para ${brand.key}`).toBeDefined()
      }
    })

    it('asset.src aponta para arquivo existente em public/brands', () => {
      for (const brand of Object.values(BRANDS)) {
        if (!brand.asset) continue
        expect(brand.asset.src.startsWith('/brands/')).toBe(true)
        expect(['svg', 'png', 'jpeg']).toContain(brand.asset.kind)
        const absolute = resolve(process.cwd(), 'public', brand.asset.src.replace(/^\//, ''))
        expect(existsSync(absolute), `arquivo nao encontrado: ${absolute}`).toBe(true)
      }
    })

    it('neon e pix mantem svg inline como fallback enquanto nao ha asset real', () => {
      for (const key of BRANDS_WITHOUT_ASSET) {
        const brand = BRANDS[key]
        expect(brand).toBeDefined()
        expect(brand.asset).toBeUndefined()
        expect(brand.svg, `svg fallback ausente para ${key}`).toBeTruthy()
      }
    })
  })
})
