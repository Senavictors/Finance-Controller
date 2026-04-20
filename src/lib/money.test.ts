import { describe, expect, it } from 'vitest'
import { formatCentsToInput, parseMoneyToCents } from './money'

describe('parseMoneyToCents', () => {
  it('returns 0 for null, undefined or empty string', () => {
    expect(parseMoneyToCents(null)).toBe(0)
    expect(parseMoneyToCents(undefined)).toBe(0)
    expect(parseMoneyToCents('')).toBe(0)
    expect(parseMoneyToCents('   ')).toBe(0)
  })

  it('converts decimal string with dot to cents', () => {
    expect(parseMoneyToCents('150.75')).toBe(15075)
    expect(parseMoneyToCents('0.01')).toBe(1)
    expect(parseMoneyToCents('10')).toBe(1000)
  })

  it('accepts decimal string with comma separator', () => {
    expect(parseMoneyToCents('150,75')).toBe(15075)
    expect(parseMoneyToCents('0,99')).toBe(99)
  })

  it('rounds sub-cent inputs to the nearest integer cent', () => {
    expect(parseMoneyToCents('1.234')).toBe(123)
    expect(parseMoneyToCents('1.236')).toBe(124)
  })

  it('clamps negative values to zero', () => {
    expect(parseMoneyToCents('-10')).toBe(0)
    expect(parseMoneyToCents('-0.01')).toBe(0)
  })

  it('returns 0 for non numeric input', () => {
    expect(parseMoneyToCents('abc')).toBe(0)
    expect(parseMoneyToCents('R$ ?')).toBe(0)
  })
})

describe('formatCentsToInput', () => {
  it('renders two decimal string suitable for an input field', () => {
    expect(formatCentsToInput(15075)).toBe('150.75')
    expect(formatCentsToInput(1)).toBe('0.01')
    expect(formatCentsToInput(0)).toBe('0.00')
  })

  it('returns empty string for nullish input', () => {
    expect(formatCentsToInput(null)).toBe('')
    expect(formatCentsToInput(undefined)).toBe('')
  })

  it('clamps negative cents to zero', () => {
    expect(formatCentsToInput(-500)).toBe('0.00')
  })
})
