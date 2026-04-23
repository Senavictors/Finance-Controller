'use client'

import * as React from 'react'
import { Popover } from '@base-ui/react/popover'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type DatePickerProps = {
  id?: string
  name: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

function dateFromInputValue(value?: string) {
  if (!value) return new Date()

  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return new Date()

  return new Date(year, month - 1, day)
}

function inputValueFromDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(date.getDate() + days)

  return nextDate
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function isSameDay(left: Date, right: Date) {
  return inputValueFromDate(left) === inputValueFromDate(right)
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth()
}

function formatDateLabel(value: string, placeholder: string) {
  if (!value) return placeholder

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dateFromInputValue(value))
}

function formatFullDateLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
    .format(date)
    .slice(0, 3)
    .replace('.', '')
}

function getCalendarDays(month: Date) {
  const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  const gridStart = addDays(firstDayOfMonth, -firstDayOfMonth.getDay())

  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

function DatePicker({
  id,
  name,
  defaultValue = inputValueFromDate(new Date()),
  placeholder = 'Selecionar data',
  required,
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(defaultValue)

  React.useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  const selectedDate = React.useMemo(() => dateFromInputValue(value), [value])
  const [visibleMonth, setVisibleMonth] = React.useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  )
  const calendarDays = React.useMemo(() => getCalendarDays(visibleMonth), [visibleMonth])
  const weekdays = React.useMemo(() => calendarDays.slice(0, 7), [calendarDays])

  React.useEffect(() => {
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [selectedDate])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <input
        id={id ? `${id}-value` : undefined}
        name={name}
        type="hidden"
        required={required}
        value={value}
        readOnly
      />
      <Popover.Trigger
        id={id}
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="choice"
            className={cn('h-8 w-full justify-between px-2.5 font-normal', className)}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-4 shrink-0" />
          <span className={cn('truncate', value && 'capitalize')}>
            {formatDateLabel(value, placeholder)}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-sky-700/80 dark:text-sky-100/80" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={8} className="isolate z-[60]">
          <Popover.Popup
            className={cn(
              'bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 w-72 rounded-2xl p-3 shadow-xl ring-1 duration-100 outline-none',
              'via-popover to-popover border border-[#38BDF8]/20 bg-gradient-to-br from-[#38BDF8]/10',
            )}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="choice"
                  size="icon-sm"
                  onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <p className="text-sm font-semibold capitalize">{formatMonthLabel(visibleMonth)}</p>
                <Button
                  type="button"
                  variant="choice"
                  size="icon-sm"
                  onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-y-1">
                {weekdays.map((day) => (
                  <span
                    key={day.toISOString()}
                    className="text-muted-foreground flex h-7 items-center justify-center text-[0.68rem] font-semibold uppercase"
                  >
                    {formatWeekday(day)}
                  </span>
                ))}

                {calendarDays.map((day) => {
                  const selected = isSameDay(day, selectedDate)
                  const today = isSameDay(day, new Date())
                  const outsideMonth = !isSameMonth(day, visibleMonth)

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      aria-label={formatFullDateLabel(day)}
                      aria-pressed={selected}
                      onClick={() => {
                        setValue(inputValueFromDate(day))
                        setOpen(false)
                      }}
                      className={cn(
                        'mx-auto flex size-8 items-center justify-center rounded-xl text-sm font-medium transition-all outline-none',
                        'hover:bg-[#38BDF8]/15 hover:text-sky-800 focus-visible:ring-3 focus-visible:ring-[#38BDF8]/40',
                        'dark:hover:bg-[#38BDF8]/20 dark:hover:text-white',
                        today && 'ring-1 ring-[#38BDF8]/45',
                        selected &&
                          'bg-[#38BDF8] text-white shadow-md shadow-[#38BDF8]/30 hover:bg-[#29ABE2] hover:text-white',
                        outsideMonth && 'text-muted-foreground/30',
                      )}
                    >
                      {day.getDate()}
                    </button>
                  )
                })}
              </div>

              {!required && value && (
                <Button
                  type="button"
                  variant="choice"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setValue('')
                    setOpen(false)
                  }}
                >
                  Limpar data
                </Button>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export { DatePicker }
