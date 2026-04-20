'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type BaseProps = Omit<React.ComponentProps<'input'>, 'type' | 'inputMode' | 'onWheel' | 'onKeyDown'>

function blockInvalidNumericKeys(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'e' || event.key === 'E' || event.key === '+' || event.key === '-') {
    event.preventDefault()
  }
}

function blurOnWheel(event: React.WheelEvent<HTMLInputElement>) {
  if (document.activeElement === event.currentTarget) {
    event.currentTarget.blur()
  }
}

export type MoneyInputProps = BaseProps & {
  allowZero?: boolean
}

export function MoneyInput({ allowZero = false, min, step, className, ...props }: MoneyInputProps) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step ?? '0.01'}
      min={min ?? (allowZero ? '0' : '0.01')}
      onWheel={blurOnWheel}
      onKeyDown={blockInvalidNumericKeys}
      className={cn('[appearance:textfield] [&::-webkit-inner-spin-button]:hidden', className)}
      {...props}
    />
  )
}

export type IntegerInputProps = BaseProps

export function IntegerInput({ min, step, className, ...props }: IntegerInputProps) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      step={step ?? '1'}
      min={min ?? '0'}
      onWheel={blurOnWheel}
      onKeyDown={blockInvalidNumericKeys}
      className={cn('[appearance:textfield] [&::-webkit-inner-spin-button]:hidden', className)}
      {...props}
    />
  )
}
