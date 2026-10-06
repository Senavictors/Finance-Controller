export type ProgressTone = 'iris' | 'in' | 'out' | 'pend' | 'info' | 'debt'

export const TONE_CLASS: Record<ProgressTone, string> = {
  iris: 'text-fc-iris',
  in: 'text-fc-in',
  out: 'text-fc-out',
  pend: 'text-fc-pend',
  info: 'text-fc-info',
  debt: 'text-fc-debt',
}

export type ProgressBaseProps = {
  /** 0..1 (fora do intervalo é limitado). */
  value: number
  tone?: ProgressTone
  /** Rótulo acessível (VoiceOver); descreva o que está sendo medido. */
  label?: string
  className?: string
}
