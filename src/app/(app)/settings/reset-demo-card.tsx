'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'

export function ResetDemoCard() {
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const [resetting, setResetting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleReset() {
    const ok = await confirm({
      title: 'Resetar dados demo?',
      description:
        'Todos os seus dados (contas, categorias, transações, dashboard) serão apagados e substituídos por um cenário de demonstração.',
      confirmText: 'Resetar dados',
      destructive: true,
    })
    if (!ok) return

    setResetting(true)
    setResult(null)
    try {
      const res = await fetch('/api/settings/reset-demo', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setResult('Dados demo recriados com sucesso')
        router.refresh()
      } else {
        setResult(data.error ?? 'Erro ao resetar')
      }
    } catch {
      setResult('Erro ao resetar dados')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/40">
        <AlertTriangle className="size-4 text-amber-600" />
      </div>
      <div className="flex-1">
        <h3 className="text-foreground text-sm font-medium">Resetar dados demo</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Apaga todos os seus dados e recria um cenário de demonstração completo, incluindo
          dashboard populado, recorrências e cartão com fatura paga e outra em aberto.
        </p>
        {result && <p className="mt-2 text-sm font-medium text-emerald-600">{result}</p>}
        <Button
          variant="outline"
          size="sm"
          className="mt-3 rounded-full"
          onClick={handleReset}
          disabled={resetting}
        >
          <RotateCcw className="mr-1.5 size-3.5" />
          {resetting ? 'Resetando...' : 'Resetar dados demo'}
        </Button>
      </div>
      {ConfirmDialog}
    </div>
  )
}
