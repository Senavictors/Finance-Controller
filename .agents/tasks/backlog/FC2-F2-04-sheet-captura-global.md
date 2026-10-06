---
id: FC2-F2-04
title: Sheet de captura global (FAB, atalhos, chips, desfazer)
status: backlog
type: feature
phase: F2
wave: 3
owner: telas-produto
depends_on: [FC2-F2-03, FC2-F0-05]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [capture, components-fc, app-shell]
related_use_cases: []
related_adrs: [ADR-017, ADR-018, ADR-024, ADR-025]
---

# FC2-F2-04 — Sheet de captura global (FAB, atalhos, chips, desfazer)

## Contexto
Este é o gesto central do produto: "capturar em 5 s" (spec §3, §4.3). A sheet abre de qualquer tela, aceita uma linha de texto, mostra chips editáveis do que foi entendido (FC2-F2-01 e F2-02), mostra para qual fatura a compra vai e se pesa no caixa do ciclo (FC2-F2-03) e salva com Desfazer. É a métrica de saída da F2: lançar um gasto em menos de 5 segundos (mediana do gesto ao salvar).

## Problema
No 1.x, lançar custa 2 digitações e 5 a 9 cliques; o botão só existe em `/transactions` (`src/app/(app)/transactions/transaction-form.tsx`, formulário completo em diálogo) e a conta default é a primeira em ordem alfabética. Não há captura global, atalho, parcelamento rápido nem Desfazer.

## Objetivo
1. FAB central "+" na TabBar (shell da FC2-F0-05), visível em todas as abas.
2. Atalhos `/` e `Cmd/Ctrl+K` no desktop abrem a sheet com o campo focado.
3. Campo único com parser ao vivo (`parseQuickAdd` no cliente) e chips editáveis: tipo, valor, categoria, conta, parcelas, data, tags.
4. Para cartão: bloco "vai para a fatura de DD/MM · vence em N dias" e linha "pesa no caixa deste ciclo" ou "só no flex, não pesa no caixa deste ciclo" (via `previewDraft`).
5. Presets de parcelas: à vista, 2, 3, 6, 10, 12×.
6. "Salvar e outro" (limpa e mantém a conta e a data).
7. Toast com Desfazer após salvar.
8. Abrir em menos de 100 ms entre o toque e a sheet visível com o campo focado.

## Fora de escopo
- Gesto de arrastar para fechar e springs refinados (FC2-F6-01); aqui o fechamento é por scrim, botão e Esc, com transição simples por `transform`/`opacity`.
- Fallback por LLM e voz (F5).
- Edição de lançamento existente (FC2-F2-05).
- Criar nova conta ou categoria dentro da sheet.

## Comportamento atual
- `src/components/ui/sheet.tsx` (1.x) é um Sheet baseado em `@base-ui/react/dialog`, com `SheetContent side=...`; serve de referência de acessibilidade, mas é lateral, usa classes shadcn (cores do tema antigo) e não deve ser usado: a sheet nova usa os primitivos `src/components/fc/` (FC2-F0-04) e tokens `--fc-*`.
- `src/components/ui/money-input.tsx` (1.x): `type="number"` com `inputMode="decimal"`, bloqueia `e + -`. Não serve aqui, pois o campo único é texto livre.
- `src/components/category-picker.tsx` (1.x): referência de seleção de categoria; a sheet nova usa um seletor de bottom sheet próprio.

## Comportamento esperado

### Entradas de abertura e foco
- Toque no FAB, `/` (fora de campos editáveis) ou `Cmd+K` / `Ctrl+K` abrem a sheet. No iOS o teclado só abre se `input.focus()` rodar de forma síncrona dentro do handler do toque: o `<input>` fica sempre montado, fora da tela e invisível (`transform: translateY(100%)`, `visibility` controlada por `opacity` e `pointer-events`), e o `focus()` é chamado no `onPointerUp` do FAB antes de qualquer `setState`. Não usar `autoFocus` nem `setTimeout` para focar.
- `Esc` ou toque no scrim fecham; se houver texto, o rascunho é mantido em `sessionStorage` (com try/catch) e recuperado na próxima abertura por 5 minutos.

### Layout da sheet (390x844, tokens)
```text
[ scrim --fc-scrim ]
+------------------------------------------+  fundo --fc-glass-sheet, raio --fc-radius-sheet
|  --- handle ---                          |
|  [ uber 18 ontem nubank          ]  (campo, fonte --fc-text-h2)
|  chips: [Despesa] [R$ 18,00] [Transporte] [Nubank] [Ontem] [#tag]
|  (cartão) Fatura de 05/11 · vence em 31 dias
|           Pesa no caixa deste ciclo? Não: só entra no flex
|  parcelas: [À vista][2×][3×][6×][10×][12×]   (só em cartão)
|  recentes: [ifood][uber][mercado] ...
|  [ Salvar e outro ]            [ Salvar ]
+------------------------------------------+
```
Chips: cada chip é um botão com alvo mínimo `--fc-touch-min` (44 px). Toque abre um mini-seletor (bottom sheet interno) para trocar categoria, conta, data (calendário curto: hoje, ontem, anteontem, escolher) ou tipo. O valor do chip vindo do texto tem estilo "reconhecido"; um chip editado manualmente tem estilo "travado" e passa a ignorar o parser para aquele campo (vira `userLockedFields`).
Chips obrigatórios faltantes (`missing`) aparecem como chip vazio tracejado ("valor", "conta") e o botão Salvar fica desabilitado até estarem preenchidos.

### Estado e fluxo
Hook `use-capture-draft.ts`: `text` -> `parseQuickAdd` (síncrono, sem debounce) -> `enrichDraft` com a memória de merchant carregada ao abrir (cache em memória, `GET /api/merchants/recent`) -> `previewDraft` com debounce de 150 ms só quando valor+conta mudam (cartão) -> estado final `DraftView`. Salvar: `POST /api/capture` com `clientRequestId = crypto.randomUUID()`; update otimista na lista. Toast: "Salvo · uber R$ 18,00 · Desfazer" por 6 s; Desfazer chama `POST /api/capture/undo`. Falha de rede mantém a sheet aberta com o rascunho e o mesmo `clientRequestId` (retry idempotente).

### Presets de parcelas
Aparecem quando a conta resolvida é CREDIT_CARD ou o texto traz `Nx`. Escolher um preset reescreve o chip e o texto (`10x`). Mostrar o valor da parcela ("10x de R$ 240,00") e o último vencimento.

### Fatura de destino e caixa
Texto derivado de `CaptureResult.statement` e `impactsCycleCash` do preview: "Entra na fatura de 05/11, que vence em 31 dias" e a linha de impacto. Não calcular no cliente.

## Regras de negócio
- RN-01: o parser roda no cliente; nenhuma chamada de rede entre digitar e ver os chips (exceto o preview de cartão).
- RN-02: conta default da sheet = `accountSuggestion` do `enrichDraft`; nunca ordem alfabética. Em "Salvar e outro" mantém a conta e a data do lançamento anterior.
- RN-03: valor, conta e (para transferência) destino são obrigatórios; categoria é opcional. Sem categoria, o lançamento manual nasce REVIEWED e aparece no filtro "sem categoria" da lista (FC2-F2-05); só lançamentos importados vão para a Inbox (F4).
- RN-04: chip editado manualmente trava o campo; o parser não o sobrescreve ao continuar digitando.
- RN-05: nenhum dado financeiro real em placeholders ou exemplos; placeholders usam valores fictícios ("uber 18 nubank").
- RN-06: só tokens `--fc-*`; nenhuma cor, raio, sombra ou blur literal (ADR-018).
- RN-07: haptics via Vibration API não funcionam no Safari iOS; nenhum feedback depende deles (feedback visual: chip pulsa e check no botão).
- RN-08: valores formatados com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`; `formatCurrency` de `src/lib/format.ts` (1.x) pode ser reaproveitada.

## Critérios de aceitação
- [ ] CA-01: FAB central presente nas 4 abas; abre a sheet com o campo focado (no iOS Safari, com teclado visível, verificado em dispositivo).
- [ ] CA-02: `/` e `Cmd+K` abrem a sheet no desktop; `/` é ignorado quando o foco está em input, textarea ou contentEditable.
- [ ] CA-03: digitar `ifood 42,90 nubank` mostra chips Despesa, R$ 42,90, categoria sugerida (quando houver memória), Nubank e Hoje em tempo real, sem rede.
- [ ] CA-04: `tv 2400 10x c6` mostra "10x de R$ 240,00", a fatura de destino e se pesa no caixa do ciclo.
- [ ] CA-05: presets 1/2/3/6/10/12x trocam o parcelamento e reescrevem o texto.
- [ ] CA-06: "Salvar e outro" limpa o campo, mantém conta e data e devolve o foco ao campo sem fechar a sheet nem o teclado.
- [ ] CA-07: toast com Desfazer por 6 s; Desfazer remove o lançamento da lista e do saldo.
- [ ] CA-08: abertura em menos de 100 ms do `pointerup` até o primeiro frame da sheet (medido com `performance.mark`/`measure` em dev e Performance panel no Safari; critério: p95 menor que 100 ms em 20 aberturas, iPhone 13 Pro ou simulação equivalente).
- [ ] CA-09: mediana do gesto ao salvar menor que 5 s em 10 lançamentos de teste (cronometrar manualmente com o fluxo "abrir, digitar linha, Salvar").
- [ ] CA-10: alvos de toque de chips e botões com no mínimo 44 px; nenhuma cor literal (`grep` nos arquivos novos por `#` hexadecimal e `rgb(` retorna vazio).
- [ ] CA-11: `prefers-reduced-motion` desliga a transição da sheet (duração via `--fc-dur-*` já vira 1 ms em `tokens.css`).
- [ ] CA-12: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
Nenhum novo; consome `POST /api/capture`, `/preview`, `/undo` (F2-03) e `GET /api/merchants/recent` (F2-02).
### Frontend
Arquivos-alvo:
- `src/components/fc/capture/capture-provider.tsx` (contexto `useCapture()` com `open()`, `close()`, atalhos globais montados uma vez em `src/app/(app)/layout.tsx`).
- `src/components/fc/capture/capture-fab.tsx` (FAB no slot central da TabBar da F0-05; tamanho 56 px, `--fc-glow-iris`, `--fc-iris`).
- `src/components/fc/capture/capture-sheet.tsx`, `capture-chips.tsx`, `chip-picker.tsx`, `installments-presets.tsx`, `statement-hint.tsx`, `recent-merchants.tsx`.
- `src/components/fc/capture/use-capture-draft.ts` (+ `use-capture-draft.test.ts`).
- `src/components/fc/toast/undo-toast.tsx` (primitivo de toast; se a F0-04 já entregou, reutilizar).
- Estilos com utilitários Tailwind v4 mapeados aos tokens (`bg-[var(--fc-glass-sheet)]` ou classes do `@theme` da F0-03).
Performance < 100 ms: carregar a sheet por `next/dynamic` com pré-carga em `requestIdleCallback` após a hidratação; manter o componente montado (escondido) para não pagar mount; animar apenas `transform` e `opacity`; sem `backdrop-filter` animado (aplicar o blur ao painel já posicionado, não animar o blur).
### Banco de dados
Nenhum.
### Integrações
Nenhuma externa.
### Segurança
Rascunho em `sessionStorage` nunca inclui o histórico; limpar no logout. `clientRequestId` por tentativa de salvar. Nenhuma chamada a terceiros.

## Plano de implementação
- [ ] Etapa 1: `capture-provider.tsx` e atalhos (`keydown` global, checagem de alvo editável, `Cmd/Ctrl+K`), integrado ao layout.
- [ ] Etapa 2: `use-capture-draft.ts` encadeando `parseQuickAdd`, `enrichDraft`, estado de chips travados e preview.
- [ ] Etapa 3: `capture-sheet.tsx` com o input sempre montado e foco síncrono no toque do FAB.
- [ ] Etapa 4: chips e `chip-picker.tsx` (categoria, conta, data, tipo).
- [ ] Etapa 5: presets de parcelas e `statement-hint.tsx`.
- [ ] Etapa 6: salvar, "Salvar e outro", toast com Desfazer, tratamento de erro e retry idempotente.
- [ ] Etapa 7: medição de performance (`performance.measure('capture-open')`) e ajustes até p95 < 100 ms.
- [ ] Etapa 8: acessibilidade básica (`role="dialog"`, `aria-modal`, foco preso, `aria-live` nos chips) e verificação de contraste com tokens.
- [ ] Etapa 9: atualizar `docs/ui/` e `.agents/context/CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários (`use-capture-draft.test.ts`, Vitest + jsdom): digitar `uber 18 ontem nubank` produz chips esperados; editar a categoria trava o campo e o parser não sobrescreve; "Salvar e outro" mantém conta/data; preset `10x` reescreve o texto para `... 10x`; `missing` desabilita salvar; retry reutiliza `clientRequestId`.
- [ ] Unitários de atalho: `/` com foco em `<input>` não abre; `Cmd+K` abre; `Esc` fecha.
- [ ] Integração: com `fetch` simulado, salvar chama `POST /api/capture` com o corpo correto (centavos inteiros, data `YYYY-MM-DD`), Desfazer chama `/undo` com o token.
- [ ] E2E: se a FC2-F0-07 incluir Playwright, um fluxo "abrir, digitar `ifood 42,90 nubank`, salvar, ver na lista"; senão, manual.
- [ ] Manual (iPhone 13 Pro instalado como PWA): teclado abre ao toque no FAB; arrastar a página não fecha a sheet por engano; `Salvar e outro` mantém o teclado; medir 20 aberturas.

Edge cases: texto colado com quebra de linha; sheet aberta com a lista rolada; app em segundo plano com rascunho; compra em cartão sem fechamento/vencimento configurados (mostrar "configure o cartão" no `statement-hint` em vez de falhar); duas toques rápidas no Salvar (um só `POST`, botão desabilitado e mesmo `clientRequestId`).

## Riscos e rollback
- Risco: teclado do iOS não abrir (foco fora do gesto). Mitigação: input sempre montado e `focus()` síncrono; teste obrigatório em dispositivo.
- Risco: `backdrop-filter` custoso derrubar a abertura abaixo de 100 ms. Mitigação: blur só no painel já posicionado e sem animar o blur; fallback sólido com `--fc-ink-raised` quando `prefers-reduced-transparency` ou desempenho baixo.
- Rollback: componentes novos atrás do `CaptureProvider`; remover o provider do layout desativa a captura sem tocar dados.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação
Comandos e resultados.

## Handoff
Link para o handoff ativo, quando aplicável.
