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
})
