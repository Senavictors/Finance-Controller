export function parseMoneyToCents(input: string | null | undefined): number {
  if (input == null) return 0
  const trimmed = String(input).trim()
  if (trimmed === '') return 0

  const normalized = trimmed.replace(/\s/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) return 0

  const positive = Math.max(0, parsed)
  return Math.round(positive * 100)
}

export function formatCentsToInput(cents: number | null | undefined): string {
  if (cents == null) return ''
  const value = Math.max(0, Math.round(cents)) / 100
  return value.toFixed(2)
}
