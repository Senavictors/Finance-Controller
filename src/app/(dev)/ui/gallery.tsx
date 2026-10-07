'use client'

import * as React from 'react'
import { Inbox, Plus, Settings, Trash2 } from 'lucide-react'

import {
  AmountText,
  Aura,
  Banner,
  Button,
  CATEGORY_ICONS,
  CategoryIcon,
  Chip,
  EmptyState,
  Field,
  GlassCard,
  IconButton,
  ListRow,
  MoneyField,
  ProgressBar,
  ProgressRing,
  Segmented,
  Sheet,
  Skeleton,
  Toaster,
  toast,
  type AuraState,
} from '@/components/fc'

const AURA_STATES: AuraState[] = ['calm', 'tense', 'hot']
const AURA_LABEL: Record<AuraState, string> = {
  calm: 'Tranquilo',
  tense: 'Atenção',
  hot: 'Aperto',
}

const CATEGORY_SAMPLES = [
  { icon: 'car', colorKey: 'cat-1', name: 'Transporte' },
  { icon: 'shopping-cart', colorKey: 'cat-2', name: 'Mercado' },
  { icon: 'utensils', colorKey: 'cat-3', name: 'Restaurantes' },
  { icon: 'pizza', colorKey: 'cat-4', name: 'Delivery' },
  { icon: 'gamepad', colorKey: 'cat-5', name: 'Lazer' },
  { icon: 'shopping-bag', colorKey: 'cat-6', name: 'Compras' },
  { icon: 'repeat', colorKey: 'cat-7', name: 'Assinaturas' },
  { icon: 'home', colorKey: 'cat-8', name: 'Moradia' },
  { icon: 'heart-pulse', colorKey: 'cat-9', name: 'Saúde' },
  { icon: 'tag', colorKey: 'cat-10', name: 'Outros' },
] as const

const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`sec-${title}`}>
      <h2 id={`sec-${title}`} className="fc-text-caption text-fc-text-3">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function Gallery() {
  const [segment, setSegment] = React.useState('todos')
  const [period, setPeriod] = React.useState('30d')
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [tallOpen, setTallOpen] = React.useState(false)
  const [cents, setCents] = React.useState(0)
  const [chips, setChips] = React.useState(['Mercado', 'Cartão', 'Hoje'])
  const [selectedChip, setSelectedChip] = React.useState('Cartão')
  const [privacy, setPrivacy] = React.useState(false)
  const [tickerKey, setTickerKey] = React.useState(0)
  const [manyCards, setManyCards] = React.useState(false)

  return (
    <main className="px-fc-gutter mx-auto flex w-full max-w-lg flex-col gap-8 pt-[calc(env(safe-area-inset-top)+var(--fc-space-6))] pb-[calc(var(--fc-space-8)+env(safe-area-inset-bottom))]">
      <Toaster />
      <header className="flex flex-col gap-1">
        <h1 className="fc-text-title text-fc-text">Primitivos</h1>
        <p className="fc-text-sub text-fc-text-2">
          Galeria de desenvolvimento (FC2-F0-04). Valores fictícios. Responde 404 em produção.
        </p>
      </header>

      <Section title="Aura (3 estados)">
        <div className="flex flex-col gap-3">
          {AURA_STATES.map((state) => (
            <div
              key={state}
              className="rounded-fc-xl border-fc-rim bg-fc-ink relative h-36 overflow-hidden border"
            >
              <Aura state={state} />
              <div className="relative flex h-full flex-col justify-end gap-1 p-4">
                <span className="fc-text-caption text-fc-text-2">{AURA_LABEL[state]}</span>
                <AmountText cents={123456} size="hero" tone="neutral" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="AmountText">
        <GlassCard className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="fc-text-sub text-fc-text-2">Positivo (auto)</span>
            <AmountText cents={100000} />
          </div>
          <div className="flex items-center justify-between">
            <span className="fc-text-sub text-fc-text-2">Negativo (auto)</span>
            <AmountText cents={-25000} />
          </div>
          <div className="flex items-center justify-between">
            <span className="fc-text-sub text-fc-text-2">Zero (auto)</span>
            <AmountText cents={0} />
          </div>
          <div className="flex items-center justify-between">
            <span className="fc-text-sub text-fc-text-2">Grande</span>
            <AmountText cents={-123456789} />
          </div>
          <div className="flex items-center justify-between">
            <span className="fc-text-sub text-fc-text-2">showSign</span>
            <AmountText cents={50000} showSign />
          </div>
          <div className="flex items-center justify-between">
            <span className="fc-text-sub text-fc-text-2">Pendente</span>
            <AmountText cents={-8990} tone="pend" />
          </div>
          <div className="flex items-center justify-between">
            <span className="fc-text-sub text-fc-text-2">Dívida</span>
            <AmountText cents={-150000} tone="debt" />
          </div>
          <div className="flex items-center justify-between">
            <span className="fc-text-sub text-fc-text-2">Privacidade</span>
            <AmountText cents={100000} hidden={privacy} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="fc-text-sub text-fc-text-2">animate (hero)</span>
            <AmountText key={tickerKey} cents={250000} size="hero" animate tone="neutral" />
          </div>
          <div className="flex gap-2">
            <Button variant="glass" onClick={() => setPrivacy((value) => !value)}>
              {privacy ? 'Mostrar' : 'Ocultar'}
            </Button>
            <Button variant="glass" onClick={() => setTickerKey((value) => value + 1)}>
              Reanimar
            </Button>
          </div>
        </GlassCard>
      </Section>

      <Section title="Button / IconButton">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primário</Button>
          <Button variant="glass">Vidro</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Excluir</Button>
          <Button loading>Salvando</Button>
          <Button disabled>Desabilitado</Button>
          <Button size="lg">Grande</Button>
          <Button asChild variant="glass">
            <a href="#asChild">asChild (link)</a>
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <IconButton label="Adicionar" icon={<Plus className="size-5" />} variant="primary" />
          <IconButton label="Ajustes" icon={<Settings className="size-5" />} />
          <IconButton label="Excluir" icon={<Trash2 className="size-5" />} variant="danger" />
          <IconButton label="Mais" icon={<Inbox className="size-5" />} variant="ghost" />
        </div>
      </Section>

      <Section title="Chip">
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Chip
              key={chip}
              selected={selectedChip === chip}
              onPress={() => setSelectedChip(chip)}
              onRemove={() => setChips((list) => list.filter((item) => item !== chip))}
              removeLabel={`Remover ${chip}`}
            >
              {chip}
            </Chip>
          ))}
          <Chip tone="pend">Pendente</Chip>
          <Chip tone="out" onPress={() => undefined}>
            Erro
          </Chip>
          <Chip tone="info" leading={<Inbox className="size-3.5" />}>
            Transferência
          </Chip>
        </div>
      </Section>

      <Section title="Segmented">
        <Segmented
          label="Filtro"
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'inbox', label: 'Inbox' },
          ]}
        />
        <Segmented
          label="Período"
          value={period}
          onChange={setPeriod}
          options={[
            { value: '7d', label: '7d' },
            { value: '30d', label: '30d' },
            { value: 'ciclo', label: 'Ciclo' },
          ]}
        />
      </Section>

      <Section title="ListRow + CategoryIcon">
        <GlassCard padding="sm">
          <ListRow
            leading={<CategoryIcon icon="shopping-cart" colorKey="cat-2" />}
            title="Mercado do bairro"
            subtitle="Cartão · Hoje"
            trailing={<AmountText cents={-18990} tone="neutral" />}
            onPress={() => toast({ message: 'Linha tocada' })}
          />
          <ListRow
            leading={<CategoryIcon icon="banknote" colorKey="cat-8" />}
            title="Salário de teste"
            subtitle="Conta corrente"
            trailing={<AmountText cents={500000} tone="in" />}
          />
          <ListRow
            leading={<CategoryIcon icon="inexistente" colorKey="xyz" />}
            title="Ícone e cor inválidos (fallback)"
            trailing={<AmountText cents={-500} />}
            divider={false}
          />
        </GlassCard>
        <div className="flex flex-wrap gap-3">
          {CATEGORY_SAMPLES.map((sample) => (
            <div key={sample.colorKey} className="flex flex-col items-center gap-1">
              <CategoryIcon icon={sample.icon} colorKey={sample.colorKey} />
              <span className="fc-text-caption text-fc-text-3">{sample.colorKey}</span>
            </div>
          ))}
          <CategoryIcon icon="car" colorKey="cat-1" size="sm" />
          <CategoryIcon icon="car" colorKey="cat-1" size="lg" />
        </div>
      </Section>

      <Section title="CategoryIcon: todos os ícones">
        <ul className="grid grid-cols-4 gap-3" aria-label="Ícones de categoria disponíveis">
          {CATEGORY_ICON_NAMES.map((name, index) => (
            <li key={name} className="flex flex-col items-center gap-1 text-center">
              <CategoryIcon icon={name} colorKey={`cat-${(index % 10) + 1}`} />
              <span className="fc-text-caption text-fc-text-3 break-all">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="ProgressRing / ProgressBar">
        <div className="flex items-center gap-4">
          <ProgressRing value={0.72} tone="in" label="Meta de reserva">
            <span className="fc-text-amount">72%</span>
          </ProgressRing>
          <ProgressRing
            value={0.35}
            tone="pend"
            label="Fatura do cartão"
            size={56}
            strokeWidth={6}
          />
          <ProgressRing
            value={1.4}
            tone="out"
            label="Estourou (limitado a 100%)"
            size={56}
            strokeWidth={6}
          />
        </div>
        <GlassCard className="flex flex-col gap-4">
          <ProgressBar value={0.4} markerAt={0.5} tone="in" label="Gasto flex" />
          <ProgressBar value={0.65} markerAt={0.5} tone="pend" label="Gasto acima do ritmo" />
          <ProgressBar value={1} markerAt={0.5} tone="out" label="Teto atingido" />
          <ProgressBar value={0.25} tone="info" label="Sem marcador" />
        </GlassCard>
      </Section>

      <Section title="Field / MoneyField">
        <GlassCard className="flex flex-col gap-4">
          <MoneyField label="Valor" valueCents={cents} onChangeCents={setCents} hint="Em reais" />
          <p className="fc-text-sub text-fc-text-2">
            Centavos: <span className="fc-tabular">{cents}</span>
          </p>
          <MoneyField
            label="Valor com erro"
            valueCents={0}
            onChangeCents={() => undefined}
            error="Informe um valor maior que zero"
          />
          <Field label="Descrição" hint="Texto livre">
            {(control) => (
              <input
                {...control}
                className="fc-text-body min-h-fc-touch rounded-fc-sm border-fc-rim bg-fc-glass text-fc-text focus-visible:border-fc-iris border px-4 outline-none"
                placeholder="Ex.: mercado"
              />
            )}
          </Field>
        </GlassCard>
      </Section>

      <Section title="Banner">
        <Banner tone="info" title="Transferência detectada">
          Parece uma transferência entre contas próprias.
        </Banner>
        <Banner tone="pend" title="Perto do limite do MEI">
          Você usou 82% do teto anual.
        </Banner>
        <Banner tone="out" title="Cheque especial em uso">
          Saldo abaixo de zero.
        </Banner>
        <Banner tone="in" title="Tudo conciliado" />
      </Section>

      <Section title="Skeleton / EmptyState">
        <GlassCard className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton />
          <Skeleton className="w-4/5" />
        </GlassCard>
        <EmptyState
          icon={<Inbox />}
          title="Inbox vazia"
          description="Nada para revisar agora. Importe um extrato ou capture um lançamento."
          action={<Button variant="glass">Importar extrato</Button>}
        />
      </Section>

      <Section title="Sheet / Toast">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setSheetOpen(true)}>Abrir sheet</Button>
          <Button variant="glass" onClick={() => setTallOpen(true)}>
            Sheet alto
          </Button>
          <Button
            variant="glass"
            onClick={() =>
              toast({
                message: 'Lançamento salvo',
                tone: 'success',
                action: { label: 'Desfazer', onPress: () => toast({ message: 'Desfeito' }) },
              })
            }
          >
            Toast com desfazer
          </Button>
          <Button
            variant="glass"
            onClick={() => toast({ message: 'Aviso informativo', tone: 'info' })}
          >
            Toast info
          </Button>
          <Button
            variant="glass"
            onClick={() => toast({ message: 'Falha ao salvar', tone: 'error' })}
          >
            Toast erro
          </Button>
        </div>
      </Section>

      <Section title="GlassCard (variantes + desempenho)">
        <div className="rounded-fc-xl bg-fc-ink relative overflow-hidden p-4">
          <Aura state="calm" />
          <div className="relative flex flex-col gap-3">
            <GlassCard variant="card">card</GlassCard>
            <GlassCard variant="strong">strong</GlassCard>
            <GlassCard variant="bar" padding="sm">
              bar
            </GlassCard>
            <GlassCard variant="sheet">sheet</GlassCard>
          </div>
        </div>
        <Button variant="glass" onClick={() => setManyCards((value) => !value)}>
          {manyCards ? 'Ocultar 50 cards' : 'Renderizar 50 cards (teste de blur)'}
        </Button>
        {manyCards ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 50 }, (_, index) => (
              <GlassCard key={index} padding="sm">
                <span className="fc-text-sub text-fc-text-2">Card {index + 1}</span>
              </GlassCard>
            ))}
          </div>
        ) : null}
      </Section>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Novo lançamento">
        <div className="flex flex-col gap-4">
          <MoneyField label="Valor" valueCents={cents} onChangeCents={setCents} />
          <div className="flex flex-wrap gap-2">
            <Chip selected>Mercado</Chip>
            <Chip>Restaurantes</Chip>
            <Chip>Transporte</Chip>
          </div>
          <Button onClick={() => setSheetOpen(false)}>Salvar</Button>
        </div>
      </Sheet>

      <Sheet open={tallOpen} onOpenChange={setTallOpen} title="Sheet alto" snap="tall">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 30 }, (_, index) => (
            <ListRow key={index} title={`Item ${index + 1}`} subtitle="Rolagem interna" />
          ))}
        </div>
      </Sheet>
    </main>
  )
}
