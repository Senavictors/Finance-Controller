'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Wallet } from 'lucide-react'

import { AmountText, Button, Chip, EmptyState, GlassCard, toast } from '@/components/fc'
import { ScreenHeader } from '@/components/shell'
import type { AccountTotals, AccountView } from '@/server/modules/accounts'

import { AccountCard } from './account-card'
import { AccountSheet } from './account-sheet'
import { callApi } from './api-client'

export type AccountsViewProps = {
  accounts: AccountView[]
  totals: AccountTotals
}

/**
 * Tela `Mais > Contas`: lista, cria, edita e arquiva contas. Os dados chegam prontos do
 * servidor (saldos e uso do limite do ledger); depois de cada mutação a página é recarregada
 * por `router.refresh()`. Ponto de extensão da conferência de saldo (F1-04): `AccountCard`.
 */
export function AccountsView({ accounts, totals }: AccountsViewProps) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<AccountView | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const active = accounts.filter((account) => !account.isArchived)
  const archived = accounts.filter((account) => account.isArchived)

  function openCreate() {
    setEditing(null)
    setSheetOpen(true)
  }

  function openEdit(account: AccountView) {
    setEditing(account)
    setSheetOpen(true)
  }

  async function toggleArchive(account: AccountView) {
    setBusyId(account.id)
    try {
      const action = account.isArchived ? 'unarchive' : 'archive'
      const result = await callApi('POST', `/api/accounts/${account.id}/${action}`)
      if (!result.ok) {
        toast({ message: result.error, tone: 'error' })
        return
      }
      const warnings = Array.isArray(result.data.warnings) ? result.data.warnings : []
      toast({
        message: account.isArchived
          ? 'Conta reaberta.'
          : warnings.includes('ARCHIVED_WITH_BALANCE')
            ? 'Conta arquivada. Ela ainda tem saldo.'
            : 'Conta arquivada.',
        tone: 'success',
        action: {
          label: 'Desfazer',
          onPress: () => {
            void callApi(
              'POST',
              `/api/accounts/${account.id}/${account.isArchived ? 'archive' : 'unarchive'}`,
            ).then(() => router.refresh())
          },
        },
      })
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <ScreenHeader
        title="Contas"
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" className="size-4" />
            Nova conta
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="Nenhuma conta ainda"
          description="Cadastre suas contas e cartões com o saldo de hoje para acompanhar tudo em um lugar."
          action={<Button onClick={openCreate}>Criar primeira conta</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <GlassCard as="section" aria-label="Resumo das contas" className="flex flex-col gap-2">
            <p className="fc-text-label text-fc-text-2">Em caixa</p>
            <AmountText cents={totals.cash} size="hero" />
            {totals.investments !== 0 || totals.cardDebt !== 0 ? (
              <p className="fc-text-sub text-fc-text-2 flex flex-wrap gap-x-4 gap-y-1">
                {totals.investments !== 0 ? (
                  <span>
                    Investido{' '}
                    <AmountText cents={totals.investments} tone="neutral" className="fc-text-sub" />
                  </span>
                ) : null}
                {totals.cardDebt !== 0 ? (
                  <span>
                    Dívida nos cartões{' '}
                    <AmountText cents={totals.cardDebt} tone="debt" className="fc-text-sub" />
                  </span>
                ) : null}
              </p>
            ) : null}
          </GlassCard>

          <GlassCard as="section" aria-label="Contas" padding="none" className="px-4 py-1">
            <ul>
              {active.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  busy={busyId === account.id}
                  onEdit={openEdit}
                  onToggleArchive={toggleArchive}
                />
              ))}
            </ul>
            {active.length === 0 ? (
              <p className="fc-text-sub text-fc-text-2 py-4">Todas as contas estão arquivadas.</p>
            ) : null}
          </GlassCard>

          {archived.length > 0 ? (
            <section aria-label="Contas arquivadas" className="flex flex-col gap-2">
              <div>
                <Chip selected={showArchived} onPress={() => setShowArchived((value) => !value)}>
                  Arquivadas ({archived.length})
                </Chip>
              </div>
              {showArchived ? (
                <GlassCard padding="none" className="px-4 py-1">
                  <ul>
                    {archived.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        busy={busyId === account.id}
                        onEdit={openEdit}
                        onToggleArchive={toggleArchive}
                      />
                    ))}
                  </ul>
                </GlassCard>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      <AccountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        account={editing}
        onSaved={(message) => {
          toast({ message, tone: 'success' })
          router.refresh()
        }}
      />
    </>
  )
}
