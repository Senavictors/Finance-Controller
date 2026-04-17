'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RotateCcw, AlertTriangle } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const [resetting, setResetting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleResetDemo() {
    if (
      !confirm(
        'Isso vai apagar TODOS os seus dados (contas, categorias, transacoes, dashboard) e recriar com dados de demonstracao. Continuar?',
      )
    )
      return

    setResetting(true)
    setResult(null)

    try {
      const res = await fetch('/api/settings/reset-demo', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setResult('Dados demo recriados com sucesso!')
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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configuracoes</h1>

      <div className="rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-gray-50 p-8 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">Dados da conta</h2>
        <p className="mt-1 text-sm text-gray-500">Gerencie seus dados e preferencias</p>

        <div className="mt-8 border-t border-gray-100 pt-8">
          <div className="flex items-start gap-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100">
              <AlertTriangle className="size-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900">Resetar dados demo</h3>
              <p className="mt-1 text-sm text-gray-500">
                Apaga todos os seus dados e recria um cenario de demonstracao completo, incluindo
                dashboard populado, recorrencias e cartao com fatura paga e outra em aberto.
              </p>
              {result && <p className="mt-2 text-sm font-medium text-emerald-600">{result}</p>}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 rounded-full"
                onClick={handleResetDemo}
                disabled={resetting}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                {resetting ? 'Resetando...' : 'Resetar dados demo'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
