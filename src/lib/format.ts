export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function parseCents(reais: string): number {
  const cleaned = reais.replace(/[^\d,.-]/g, '').replace(',', '.')
  return Math.round(parseFloat(cleaned) * 100)
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('pt-BR')
}
