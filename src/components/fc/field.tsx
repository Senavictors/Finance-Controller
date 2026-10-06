'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { MoneyInput } from '@/components/ui/money-input'
import { formatCentsToInput, parseMoneyToCents } from '@/lib/money'

export type FieldControlProps = {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

export type FieldProps = {
  label: React.ReactNode
  error?: string
  hint?: string
  /** Controle: nó fixo (use `htmlFor`) ou função que recebe `id`/`aria-*` prontos. */
  children: React.ReactNode | ((control: FieldControlProps) => React.ReactNode)
  htmlFor?: string
  className?: string
}

/** Rótulo + controle + dica/erro, ligados por `aria-describedby`. */
export function Field({ label, error, hint, children, htmlFor, className }: FieldProps) {
  const generatedId = React.useId()
  const id = htmlFor ?? generatedId
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  const control: FieldControlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
  }

  return (
    <div data-slot="field" className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="fc-text-label text-fc-text-2">
        {label}
      </label>
      {typeof children === 'function' ? children(control) : children}
      {error ? (
        <p id={errorId} role="alert" className="fc-text-sub text-fc-out">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="fc-text-sub text-fc-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export type MoneyFieldProps = Omit<FieldProps, 'children' | 'htmlFor'> & {
  /** Valor em centavos (Int, ADR-002). */
  valueCents: number
  onChangeCents: (cents: number) => void
  name?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
}

/**
 * Campo de valor em reais que expõe centavos. Envolve `ui/money-input` (`inputMode="decimal"`),
 * fonte >= 16px (sem zoom do iOS), prefixo "R$" e número tabular. Valores negativos não são
 * digitáveis (o tipo do lançamento define o sinal).
 */
export function MoneyField({
  valueCents,
  onChangeCents,
  label,
  error,
  hint,
  className,
  name,
  placeholder = '0,00',
  disabled,
  required,
  autoFocus,
}: MoneyFieldProps) {
  const [text, setText] = React.useState(() => (valueCents ? formatCentsToInput(valueCents) : ''))
  const [lastExternal, setLastExternal] = React.useState(valueCents)

  // Sincroniza quando o pai muda o valor por fora, sem sobrescrever o que está sendo digitado.
  if (valueCents !== lastExternal) {
    setLastExternal(valueCents)
    if (valueCents !== parseMoneyToCents(text)) {
      setText(valueCents ? formatCentsToInput(valueCents) : '')
    }
  }

  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(control) => (
        <div className="relative">
          <span
            aria-hidden="true"
            className="fc-text-amount text-fc-text-3 pointer-events-none absolute inset-y-0 left-4 flex items-center"
          >
            R$
          </span>
          <MoneyInput
            {...control}
            name={name}
            allowZero
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            autoFocus={autoFocus}
            value={text}
            onChange={(event) => {
              const raw = event.currentTarget.value
              setText(raw)
              const cents = parseMoneyToCents(raw)
              setLastExternal(cents)
              onChangeCents(cents)
            }}
            className={cn(
              'h-fc-touch min-h-fc-touch rounded-fc-sm border-fc-rim bg-fc-glass pr-4 pl-11',
              'fc-text-amount text-fc-text placeholder:text-fc-text-3 md:text-base',
              'focus-visible:border-fc-iris focus-visible:ring-fc-iris-soft',
              'aria-invalid:border-fc-out aria-invalid:ring-fc-out/20',
            )}
          />
        </div>
      )}
    </Field>
  )
}
