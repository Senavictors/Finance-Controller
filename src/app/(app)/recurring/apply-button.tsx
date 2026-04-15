'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Play } from 'lucide-react'

export function ApplyButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleApply() {
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/recurring-rules/apply', { method: 'POST' })
      const { data } = await res.json()

      if (data.created > 0) {
        setResult(`${data.created} transacao(oes) criada(s)`)
      } else {
        setResult('Nenhuma transacao pendente')
      }

      router.refresh()
    } catch {
      setResult('Erro ao aplicar')
    } finally {
      setLoading(false)
      setTimeout(() => setResult(null), 4000)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-muted-foreground text-xs font-medium">{result}</span>}
      <Button
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={handleApply}
        disabled={loading}
      >
        <Play className="mr-1.5 size-3.5" />
        {loading ? 'Aplicando...' : 'Aplicar'}
      </Button>
    </div>
  )
}
