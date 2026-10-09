'use client'

import { useEffect, useRef, useState } from 'react'

import { Banner, Button, Chip, Field, MoneyField, Segmented, Sheet } from '@/components/fc'
import { BrandPicker } from '@/lib/brands'
import type { AccountView } from '@/server/modules/accounts'

import {
  EMPTY_FORM,
  TYPE_OPTIONS,
  buildCreateBody,
  buildPatchBody,
  formFromAccount,
  hasOverdraft,
  type AccountFormState,
} from './account-ui'
import { callApi } from './api-client'

const INPUT_CLASS =
  'fc-text-body min-h-fc-touch w-full rounded-fc-sm border border-fc-rim bg-fc-glass px-4 text-fc-text outline-none placeholder:text-fc-text-3 focus-visible:border-fc-iris aria-invalid:border-fc-out'

type FieldErrors = Partial<Record<string, string[]>>

export type AccountSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null`: criar conta; conta existente: editar. */
  account: AccountView | null
  onSaved: (message: string) => void
}

/**
 * Formulário de conta num `Sheet`. Os campos mudam com o tipo (cartão: limite e dias de
 * fatura; corrente/PJ: cheque especial). A validação de verdade é da API; o sheet mostra as
 * mensagens por campo que ela devolve.
 */
export function AccountSheet({ open, onOpenChange, account, onSaved }: AccountSheetProps) {
  // O pai remonta o formulário (key) a cada abertura; o estado nasce da conta editada.
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={account ? 'Editar conta' : 'Nova conta'}
      snap="tall"
    >
      <AccountForm
        key={account?.id ?? 'new'}
        account={account}
        onCancel={() => onOpenChange(false)}
        onSaved={(message) => {
          onOpenChange(false)
          onSaved(message)
        }}
      />
    </Sheet>
  )
}

function AccountForm({
  account,
  onCancel,
  onSaved,
}: {
  account: AccountView | null
  onCancel: () => void
  onSaved: (message: string) => void
}) {
  const editing = account !== null
  const [form, setForm] = useState<AccountFormState>(() =>
    account ? formFromAccount(account) : EMPTY_FORM,
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const bannerRef = useRef<HTMLDivElement>(null)
  // Leva o aviso de erro à vista (o formulário é longo e o botão fica no fim).
  useEffect(() => {
    if (message) bannerRef.current?.scrollIntoView({ block: 'nearest' })
  }, [message])

  const set = <K extends keyof AccountFormState>(key: K, value: AccountFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const isCard = form.type === 'CREDIT_CARD'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setMessage(null)
    setSaving(true)
    try {
      const result = account
        ? await callApi('PATCH', `/api/accounts/${account.id}`, buildPatchBody(form, account))
        : await callApi('POST', '/api/accounts', buildCreateBody(form))
      if (!result.ok) {
        setErrors(result.details ?? {})
        setMessage(result.details ? 'Corrija os campos destacados.' : result.error)
        return
      }
      onSaved(account ? 'Conta atualizada.' : 'Conta criada.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!account) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const result = await callApi('DELETE', `/api/accounts/${account.id}`)
      if (!result.ok) {
        setMessage(result.error)
        setConfirmDelete(false)
        return
      }
      onSaved('Conta excluída.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {message ? (
        <div ref={bannerRef}>
          <Banner tone="out" title="Não foi possível salvar">
            {message}
          </Banner>
        </div>
      ) : null}

      <Field label="Nome" error={errors.name?.[0]}>
        {(control) => (
          <input
            {...control}
            name="name"
            type="text"
            autoComplete="off"
            maxLength={60}
            required
            value={form.name}
            onChange={(event) => set('name', event.currentTarget.value)}
            placeholder="Ex.: Conta Exemplo"
            className={INPUT_CLASS}
          />
        )}
      </Field>

      <Field label="Tipo" error={errors.type?.[0]} htmlFor="account-type">
        <div
          id="account-type"
          role="group"
          aria-label="Tipo de conta"
          className="flex flex-wrap gap-2"
        >
          {TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              selected={form.type === option.value}
              onPress={() => set('type', option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </Field>

      {hasOverdraft(form.type) ? (
        <MoneyField
          label="Cheque especial (limite)"
          hint="Deixe em branco se não tiver."
          error={errors.overdraftLimit?.[0]}
          valueCents={form.overdraftCents}
          onChangeCents={(cents) => set('overdraftCents', cents)}
        />
      ) : null}

      {isCard ? (
        <>
          <MoneyField
            label="Limite do cartão"
            error={errors.creditLimit?.[0]}
            valueCents={form.creditCents}
            onChangeCents={(cents) => set('creditCents', cents)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia do fechamento" error={errors.closingDay?.[0]}>
              {(control) => (
                <input
                  {...control}
                  name="closingDay"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={form.closingDay}
                  onChange={(event) => set('closingDay', event.currentTarget.value)}
                  placeholder="1 a 31"
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            <Field label="Dia do vencimento" error={errors.dueDay?.[0]}>
              {(control) => (
                <input
                  {...control}
                  name="dueDay"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={form.dueDay}
                  onChange={(event) => set('dueDay', event.currentTarget.value)}
                  placeholder="1 a 31"
                  className={INPUT_CLASS}
                />
              )}
            </Field>
          </div>
        </>
      ) : null}

      {!editing ? (
        isCard ? (
          <MoneyField
            label="Dívida atual do cartão"
            hint="Quanto já está devendo hoje. Deixe em branco se estiver zerado."
            error={errors.openingBalance?.[0]}
            valueCents={form.openingCents}
            onChangeCents={(cents) => set('openingCents', cents)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <MoneyField
              label="Saldo inicial"
              hint="O saldo que a conta tem hoje no banco."
              error={errors.openingBalance?.[0]}
              valueCents={form.openingCents}
              onChangeCents={(cents) => set('openingCents', cents)}
            />
            <Segmented
              label="Sinal do saldo"
              options={[
                { value: 'positive', label: 'Positivo' },
                { value: 'negative', label: 'Negativo' },
              ]}
              value={form.openingNegative ? 'negative' : 'positive'}
              onChange={(value) => set('openingNegative', value === 'negative')}
            />
          </div>
        )
      ) : null}

      <Field label="Banco ou emissor" error={errors.issuerKey?.[0]} htmlFor="account-issuer">
        <div id="account-issuer">
          <BrandPicker
            value={form.issuerKey}
            onChange={(key) => set('issuerKey', key)}
            fallbackLabel={form.name || 'Conta'}
            categories={['bank', 'payment']}
          />
        </div>
      </Field>

      {isCard ? (
        <Field label="Bandeira" error={errors.networkKey?.[0]} htmlFor="account-network">
          <div id="account-network">
            <BrandPicker
              value={form.networkKey}
              onChange={(key) => set('networkKey', key)}
              fallbackLabel="Bandeira"
              categories={['network']}
            />
          </div>
        </Field>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" loading={saving}>
          {editing ? 'Salvar' : 'Criar conta'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        {editing ? (
          <Button type="button" variant="danger" onClick={remove} disabled={saving}>
            {confirmDelete ? 'Confirmar exclusão' : 'Excluir conta'}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
