import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkFixtureFilename } from '../guards/no-real-data'
import { FIXTURES_DIR, readFixture } from './fixtures'

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full) : [full]
  })
}

describe('fixtures sintéticas (CA-05)', () => {
  it('os arquivos obrigatórios existem e têm prefixo sintetico-', () => {
    const required = [
      'ofx/sintetico-conta-corrente.ofx',
      'csv/sintetico-extrato.csv',
      'telegram/sintetico-update-texto.json',
      'openai/sintetico-resposta-categoria.json',
    ]
    for (const rel of required) {
      expect(existsSync(path.join(FIXTURES_DIR, rel)), rel).toBe(true)
      expect(path.basename(rel).startsWith('sintetico-')).toBe(true)
    }
    expect(existsSync(path.join(FIXTURES_DIR, 'pdf/.gitkeep'))).toBe(true)
  })

  it('todo arquivo de tests/fixtures respeita a regra de nomes', () => {
    for (const full of listFiles(FIXTURES_DIR)) {
      const rel = path.relative(FIXTURES_DIR, full).split(path.sep).join('/')
      expect(checkFixtureFilename(rel), rel).toBeNull()
    }
  })

  it('OFX: 12 transações (3 créditos, 9 débitos), FITID duplicado e par de transferência', () => {
    const ofx = readFixture('ofx/sintetico-conta-corrente.ofx')
    const blocks = ofx.split('<STMTTRN>').slice(1)
    const txns = blocks.map((b) => ({
      type: /<TRNTYPE>(\w+)/.exec(b)?.[1],
      date: /<DTPOSTED>(\d{8})/.exec(b)?.[1],
      amount: /<TRNAMT>(-?[\d.]+)/.exec(b)?.[1],
      fitid: /<FITID>(\S+)/.exec(b)?.[1],
    }))
    expect(txns).toHaveLength(12)
    expect(txns.filter((t) => t.type === 'CREDIT')).toHaveLength(3)
    expect(txns.filter((t) => t.type === 'DEBIT')).toHaveLength(9)

    const fitids = txns.map((t) => t.fitid)
    expect(new Set(fitids).size).toBe(11) // exatamente 1 duplicata
    expect(fitids.filter((id, i) => fitids.indexOf(id) !== i)).toHaveLength(1)

    const pair = txns.filter((t) =>
      txns.some(
        (o) =>
          o !== t &&
          o.date === t.date &&
          o.type !== t.type &&
          Number(o.amount) === -Number(t.amount),
      ),
    )
    expect(pair.length).toBeGreaterThanOrEqual(2) // débito e crédito de mesmo valor/data

    expect(ofx).toContain('AGENCIA-EXEMPLO')
    expect(ofx).toContain('CONTA-EXEMPLO')
    expect(ofx).toContain('&amp;')
    expect(ofx).toMatch(/[ÁÉÍÓÚÂÊÔÃÕÇ]/)
  })

  it('CSV: separador ;, cabeçalho, 10 linhas, valor negativo, 31/12/2026, aspas e linha final em branco', () => {
    const csv = readFixture('csv/sintetico-extrato.csv')
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Data;Descrição;Valor')
    expect(lines.slice(1).filter((l) => l.trim() !== '')).toHaveLength(10)
    expect(csv.endsWith('\n\n')).toBe(true)
    expect(csv).toMatch(/;-\d/)
    expect(csv).toContain('31/12/2026')
    expect(csv).toMatch(/"[^"]*;[^"]*"/)
  })

  it('payloads Telegram e OpenAI: chat.id 1 e texto "uber 18 nubank"', () => {
    const tg = JSON.parse(readFixture('telegram/sintetico-update-texto.json'))
    expect(tg.message.chat.id).toBe(1)
    expect(tg.message.text).toBe('uber 18 nubank')
    const ai = JSON.parse(readFixture('openai/sintetico-resposta-categoria.json'))
    expect(ai.input_text).toBe('uber 18 nubank')
  })
})
