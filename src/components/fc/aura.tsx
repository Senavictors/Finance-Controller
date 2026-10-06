import { cn } from '@/lib/utils'

export type AuraState = 'calm' | 'tense' | 'hot'

export type AuraProps = {
  state?: AuraState
  className?: string
}

/**
 * Aura decorativa da tela Hoje: três blobs de gradiente radial com deriva lenta.
 * Posicione dentro de um contêiner `relative overflow-hidden`; ocupa o contêiner inteiro.
 * Estática sob `prefers-reduced-motion` (regra em fc.css). Não carrega informação:
 * o estado do mês também deve aparecer em texto.
 */
export function Aura({ state = 'calm', className }: AuraProps) {
  return (
    <div
      aria-hidden="true"
      data-slot="aura"
      data-state={state}
      className={cn('fc-aura', className)}
    >
      <span className="fc-aura-blob" data-blob="1" />
      <span className="fc-aura-blob" data-blob="2" />
      <span className="fc-aura-blob" data-blob="3" />
    </div>
  )
}
