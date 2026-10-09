'use client'

import { AmountText, Button, ListRow, ProgressBar } from '@/components/fc'
import { BrandIcon } from '@/lib/brands'
import type { AccountView } from '@/server/modules/accounts'

import { summarizeUsage, typeLabel } from './account-ui'

export type AccountCardProps = {
  account: AccountView
  busy?: boolean
  onEdit: (account: AccountView) => void
  onToggleArchive: (account: AccountView) => void
}

/**
 * Linha de conta dentro do único `GlassCard` da lista: marca, nome, tipo, saldo atual (tom
 * automático), pendente/previsto quando existirem e a barra de uso do limite. Tudo o que é
 * número vem do ledger; aqui só se apresenta.
 */
export function AccountCard({ account, busy, onEdit, onToggleArchive }: AccountCardProps) {
  const usage = summarizeUsage(account)
  const { pending, planned, current } = account.balance
  const hasSecondary = pending !== 0 || planned !== 0

  return (
    <li
      data-slot="account-card"
      data-account-id={account.id}
      className="border-fc-divider border-b py-2 last:border-b-0"
    >
      <ListRow
        divider={false}
        leading={
          <BrandIcon
            brandKey={account.issuerKey}
            fallbackLabel={account.name}
            size={40}
            radius="md"
          />
        }
        title={account.name}
        subtitle={typeLabel(account.type)}
        trailing={<AmountText cents={current} />}
      />

      {hasSecondary ? (
        <p className="fc-text-sub text-fc-text-2 flex flex-wrap gap-x-4 gap-y-1 pb-2">
          {pending !== 0 ? (
            <span>
              Pendente <AmountText cents={pending} tone="pend" className="fc-text-sub" />
            </span>
          ) : null}
          {planned !== 0 ? (
            <span>
              Previsto{' '}
              <AmountText
                cents={account.balance.projected}
                tone="neutral"
                className="fc-text-sub"
              />
            </span>
          ) : null}
        </p>
      ) : null}

      {usage ? (
        <div className="flex flex-col gap-1 pb-2">
          <ProgressBar value={usage.ratio} tone={usage.tone} label={usage.label} />
          <p className="fc-text-sub text-fc-text-2">{usage.text}</p>
          {usage.excessText ? (
            <p role="status" className="fc-text-sub text-fc-out">
              {usage.excessText}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => onEdit(account)}>
          Editar
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => onToggleArchive(account)}>
          {account.isArchived ? 'Desarquivar' : 'Arquivar'}
        </Button>
      </div>
    </li>
  )
}
