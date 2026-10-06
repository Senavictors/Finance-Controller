---
id: FC2-F6-01
title: Motion com springs, transições de aba, gesto de fechar sheet e performance 120 Hz
status: backlog
type: feature
phase: F6
wave: 1
owner: ui-design-system
depends_on: [FC2-F3-04]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [components-fc, app-shell, styles]
related_use_cases: []
related_adrs: [ADR-017, ADR-018]
---

# FC2-F6-01 — Motion com springs, transições de aba, gesto de fechar sheet e performance 120 Hz

## Contexto
O produto é iOS-like e roda como PWA no iPhone 13 Pro, tela ProMotion de 120 Hz (spec §2 e §8). Os tokens já definem curvas (`--fc-ease`, `--fc-spring: cubic-bezier(0.2, 0.9, 0.25, 1.12)`) e durações (`--fc-dur-fast`, `--fc-dur-base`, `--fc-dur-slow`, `--fc-dur-count`) em `src/styles/tokens.css`, com redução para 1 ms em `prefers-reduced-motion`. Esta task transforma isso em comportamento: springs reais, transições entre abas, sheets que fecham arrastando, e uma disciplina de performance para manter 120 Hz sem custo de layout ou pintura.

## Problema
Até a F3-04 as animações são simples (cross-fade da aura, abertura da sheet por `transform`/`opacity`, count-up). Faltam: física de spring (cubic-bezier não dá overshoot controlado nem se adapta à velocidade do gesto), transição entre as 4 abas, gesto de arrastar para fechar nas sheets (captura da F2-04, pagar fatura da F3-06, edição da F2-05, metas e recorrência da F3-05), e uma medição objetiva de quadros. Também não há política para `prefers-reduced-motion` no JavaScript, nem para o fato de a Vibration API não existir no Safari iOS.

## Objetivo
1. Sistema de motion: tokens de spring, utilitário `spring` e hook de movimento reduzido.
2. Transição de aba direcional (entrada), sem atrasar a navegação.
3. Primitivo de sheet com gesto de arrastar para fechar (rubber band, velocidade, snap com spring), usado por todas as sheets.
4. Feedback de toque visual (press) sem depender de haptics.
5. Regras e verificação de 120 Hz: só `transform` e `opacity` animam; medidor de quadros em dev.
6. `prefers-reduced-motion` respeitado em CSS e JS.

## Fora de escopo
- Celebrações e conteúdo de ritual (FC2-F6-02).
- Auditoria de acessibilidade completa (FC2-F6-04).
- Animações de gráficos além do que já existe (entrada simples por `opacity`).
- Haptics: a Vibration API não funciona no Safari iOS; nenhum comportamento depende dela.
- Transição de saída entre páginas (o App Router não oferece saída confiável; só entrada).

## Comportamento atual
- `src/styles/tokens.css`: curvas e durações listadas acima; `@media (prefers-reduced-motion: reduce)` zera as durações.
- Sheet da captura (F2-04): `transform`/`opacity` com `--fc-dur-base`, fecha por scrim, botão e Esc; sem arrasto.
- Aura da tela Hoje (F3-04): 3 camadas, cross-fade por `opacity`, movimento lento por `transform`; count-up do número com `requestAnimationFrame`.
- No 1.x o Sheet é `src/components/ui/sheet.tsx` (`@base-ui/react/dialog`), com animações do tema antigo; não é reaproveitado.

## Comportamento esperado

### Tokens de motion (em `src/styles/tokens.css`, mantendo os existentes)
Adicionar, dentro de `:root`, tokens gerados por script (`scripts/gen-spring-tokens.mjs`, resultado commitado):
- `--fc-spring-snappy` e `--fc-spring-gentle`: easing `linear(...)` (função CSS `linear()` aproximando a resposta de uma mola, com amostras suficientes para ficar suave a 120 Hz), com fallback para `--fc-spring` via `@supports not (transition-timing-function: linear(0, 1))`.
- `--fc-dur-spring-snappy: 420ms` e `--fc-dur-spring-gentle: 560ms` (duração para o easing `linear()`).
- `--fc-press-scale: 0.97`.
No `@media (prefers-reduced-motion: reduce)`, as durações novas também viram `1ms` e `--fc-press-scale: 1`.

### Springs em JavaScript (`src/components/fc/motion/spring.ts`)
Configurações: `snappy { stiffness: 520, damping: 38, mass: 1 }` e `gentle { stiffness: 260, damping: 28, mass: 1 }` (tempo de acomodação por 2% de aproximadamente `4 / (zeta * omega_n)`, cerca de 0,21 s e 0,29 s). `animateSpring({ from, to, velocity, config, onUpdate })` devolve cancelamento; usa `requestAnimationFrame` e integra por passo fixo de 1/240 s para estabilidade; cada quadro escreve apenas `transform` e `opacity` via ref (sem `setState` por quadro). Alternativa permitida: biblioteca `motion` carregada sob demanda apenas para gestos, se reduzir código; a escolha vai para "Decisões".

### Transição de aba (`src/app/(app)/template.tsx` + `src/components/fc/motion/tab-transition.tsx`)
- Entrada do conteúdo da aba: `opacity 0 -> 1` e `translateX(±12px) -> 0`, direção pela diferença de índice entre a aba anterior e a atual (Hoje 0, Lançamentos 1, Planejar 2, Cartões 3; "Mais" é 4), usando `--fc-spring-gentle`.
- Sem exit; a navegação não espera animação. Em primeira carga, sem animação.
- A TabBar não anima o container, apenas o indicador ativo (translação do indicador por `transform`, `--fc-spring-snappy`).

### Sheet com gesto de arrastar (`src/components/fc/sheet.tsx`, primitivo único)
- Hook `useSheetDrag` com Pointer Events: `pointerdown` no handle e no cabeçalho; no corpo da sheet só inicia o arrasto quando `scrollTop === 0` e o movimento inicial é para baixo; `setPointerCapture`; `touch-action: none` no handle e `overscroll-behavior: contain` no corpo rolável.
- Durante o arrasto: `transform: translateY(y)` na sheet e `opacity` do scrim proporcional a `1 - y / altura`. Arrasto para cima usa rubber band: `rubber(x) = (1 - 1 / (x * 0.55 / d + 1)) * d` com `d = 120`.
- Soltar: `decideSheetRelease({ distance, velocity, height })`: fecha se `velocity >= 0.5` px/ms para baixo, ou se `distance >= 0.30 * height`, a menos que `velocity <= -0.3` (flick para cima mantém aberta); caso contrário volta com `snappy`. Fechar anima com `gentle` a partir da velocidade do gesto e então desmonta/oculta.
- `pointercancel` e perda de captura voltam ao estado aberto. Esc, scrim e botão continuam fechando (animados).
- Foco: ao fechar, devolve o foco ao elemento que abriu (importante para o FAB).
- Sheet da captura (F2-04): manter o `<input>` sempre montado e focado sincronamente no toque; o arrasto não pode roubar o foco nem fechar o teclado ao iniciar.

### Feedback de toque sem haptics
`PressFeedback` (CSS + classe utilitária `fc-press`): `transform: scale(var(--fc-press-scale))` em `:active` com `transition` de `--fc-dur-fast`; checkmark e pulso do chip ao salvar. Helper `feedback(kind)` em `src/components/fc/motion/feedback.ts`: sempre faz o visual; chama `navigator.vibrate?.(10)` apenas como melhoria progressiva (no-op no Safari iOS, nunca como único feedback). Som opcional (WebAudio, um clique curto) desligado por padrão, controlado por configuração do usuário, só após gesto.

### Regras de 120 Hz (documentar em `docs/ui/motion.md` e verificar)
1. Animar somente `transform` e `opacity`. Proibido animar `width`, `height`, `top`, `left`, `margin`, `box-shadow`, `filter`, `backdrop-filter` e o raio de blur.
2. Blur (`--fc-aura-blur`, `--fc-blur-*`) só em elementos estáticos; elementos animados são camadas já posicionadas.
3. `will-change: transform` apenas durante a animação (aplicar e remover); nunca permanente em listas.
4. Nenhum `setState` por quadro em árvores grandes; valores em ref e escrita direta de `style.transform`.
5. Pausar animações contínuas (aura) quando `document.hidden` ou fora da viewport (`IntersectionObserver`).
6. Listas longas com `content-visibility: auto` quando possível; sem sombra pesada em itens de lista.
7. O Modo de Pouca Energia do iOS limita a 60 Hz; isso é esperado e nunca deve alterar a lógica.

### Medidor de quadros (somente dev)
`src/lib/perf/frame-meter.ts`: com `?perf=1`, mede o intervalo entre `requestAnimationFrame`s durante uma interação e mostra um selo com FPS médio, p95 do intervalo e quadros acima de 20 ms. Fica fora do bundle de produção (`process.env.NODE_ENV !== 'production'`).

### Movimento reduzido
`useReducedMotion()` (`matchMedia('(prefers-reduced-motion: reduce)')` com assinatura de mudança): com redução ativa, `animateSpring` aplica o valor final imediatamente; a transição de aba vira sem movimento; a aura fica estática (uma camada visível, sem drift); o count-up exibe o valor final; o arrasto da sheet continua funcionando (é conduzido pelo usuário), sem overshoot.

## Regras de negócio
- RN-01: nenhuma duração, curva ou escala literal nos componentes; só os tokens `--fc-*` (ADR-018). Valores numéricos das configurações de spring ficam centralizados em `spring.ts`.
- RN-02: nenhuma funcionalidade depende de haptics, vibração ou áudio (Safari iOS não suporta Vibration API).
- RN-03: animações só em `transform` e `opacity` (regra 1); exceção documentada: o texto do count-up muda por conteúdo, em elemento de largura fixa com `font-variant-numeric: tabular-nums` para não causar reflow.
- RN-04: toda animação respeita `prefers-reduced-motion`, em CSS e em JS.
- RN-05: o gesto de arrastar nunca fecha uma sheet com mudança não salva sem o mesmo comportamento do botão fechar (rascunho preservado, F2-04).
- RN-06: o primeiro quadro de abertura da sheet continua em menos de 100 ms (critério da F2-04); o motion não pode regredir isso.
- RN-07: nenhuma dependência nova sem registro em "Decisões" (tamanho do bundle e uso real).

## Critérios de aceitação
- [ ] CA-01: tokens novos em `tokens.css`, com `@supports` de fallback e redução para `prefers-reduced-motion`; script gerador commitado.
- [ ] CA-02: `spring.ts` converge (tempo de acomodação de `snappy` menor que 0,3 s e de `gentle` menor que 0,4 s, medido em teste unitário) e não escreve nada além de `transform`/`opacity`.
- [ ] CA-03: transição de aba com direção correta nas 5 trocas testadas e sem atraso perceptível na navegação (rota troca imediatamente).
- [ ] CA-04: toda sheet do app usa o primitivo `src/components/fc/sheet.tsx` e fecha por arrasto com rubber band, velocidade e snap; `decideSheetRelease` cobre a tabela de casos abaixo.
- [ ] CA-05: o arrasto não inicia a partir do corpo quando `scrollTop > 0`, e a rolagem interna continua normal.
- [ ] CA-06: no iPhone 13 Pro (PWA instalada, Modo de Pouca Energia desligado), abrir/fechar a sheet, trocar de aba e rolar a Hoje mantêm p95 do intervalo de quadros menor que 10 ms (alvo de 120 Hz com folga; aceitável até 12 ms) e nenhum quadro acima de 25 ms nas 3 interações, medido com o medidor `?perf=1` e confirmado na Timeline do Safari Web Inspector.
- [ ] CA-07: com `prefers-reduced-motion: reduce` não há movimento: aura estática, aba sem translação, count-up final imediato, springs instantâneas; sheet ainda arrasta.
- [ ] CA-08: nenhum código novo usa `navigator.vibrate` como único feedback; o helper `feedback()` é no-op seguro no Safari iOS.
- [ ] CA-09: busca por propriedades animadas proibidas nos CSS/JS novos (`transition: .*(width|height|top|left|margin|box-shadow|filter|backdrop-filter)`, `animate\(.*(width|height)`) retorna vazio.
- [ ] CA-10: `docs/ui/motion.md` documenta tokens, springs, regras de 120 Hz e como medir.
- [ ] CA-11: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
Nenhum.
### Frontend
- `src/styles/tokens.css` (tokens de spring e redução) e `scripts/gen-spring-tokens.mjs`.
- `src/components/fc/motion/`: `spring.ts` (+ `spring.test.ts`), `use-reduced-motion.ts` (+ teste), `use-sheet-drag.ts`, `sheet-release.ts` (`decideSheetRelease`, `rubber`, + teste), `tab-transition.tsx`, `feedback.ts`, `press-feedback.css` ou utilitário no Tailwind, `index.ts`.
- `src/components/fc/sheet.tsx` (primitivo) e migração das sheets existentes: captura (`src/components/fc/capture/capture-sheet.tsx`), pagar fatura e mover (`src/components/fc/cartoes/*`), edição de lançamento (`src/components/fc/lancamentos/transaction-edit-sheet.tsx`), recorrência e metas (`src/components/fc/planejar/*`).
- `src/app/(app)/template.tsx`, TabBar (indicador animado), `src/components/fc/hoje/hero-aura.tsx` (pausa por visibilidade e movimento reduzido), `count-up.tsx`.
- `src/lib/perf/frame-meter.ts` (dev).
### Banco de dados
Nenhum.
### Integrações
Nenhuma.
### Segurança
Nenhuma superfície nova; o medidor de quadros não envia dados.

## Plano de implementação
- [ ] Etapa 1: tokens de spring (`linear()`), script gerador, fallback e redução.
- [ ] Etapa 2: `spring.ts`, `use-reduced-motion.ts` e testes.
- [ ] Etapa 3: `sheet-release.ts` (`decideSheetRelease`, `rubber`) e testes.
- [ ] Etapa 4: `use-sheet-drag.ts` e primitivo `sheet.tsx`; migrar todas as sheets.
- [ ] Etapa 5: transição de aba e indicador da TabBar.
- [ ] Etapa 6: `PressFeedback`, `feedback()` e remoção de dependências de haptics.
- [ ] Etapa 7: aura e count-up com pausa por visibilidade e movimento reduzido.
- [ ] Etapa 8: medidor de quadros e medições no aparelho; ajustar até cumprir CA-06.
- [ ] Etapa 9: `docs/ui/motion.md` e `.agents/context/CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários, `decideSheetRelease` (altura 600 px; velocidade em px/ms, positiva para baixo):

| Distância | Velocidade | Esperado |
|---|---|---|
| 100 | 0 | volta (menos de 30%) |
| 179 | 0 | volta |
| 180 | 0 | fecha (30%) |
| 200 | 0 | fecha |
| 40 | 0,8 | fecha (flick para baixo) |
| 40 | 0,49 | volta |
| 500 | -0,4 | volta (flick para cima vence a distância) |
| 0 | 0 | volta |
| -80 | 0 | volta (arrasto para cima) |

- [ ] Unitários, `rubber`: `rubber(0) = 0`; `rubber(120)` próximo de 42,6; `rubber(1000)` menor que 120 e crescente; função monotônica.
- [ ] Unitários, `spring`: convergência dentro de 2% em menos de 0,3 s (`snappy`) e 0,4 s (`gentle`); com `velocity` inicial a trajetória parte dela; com redução de movimento aplica o valor final no primeiro quadro; cancelamento interrompe as chamadas de `onUpdate`.
- [ ] Unitários, `useReducedMotion` (jsdom com `matchMedia` simulado): lê o valor inicial e reage à mudança.
- [ ] Componentes (jsdom): `use-sheet-drag` com eventos de ponteiro simulados: arrasto abaixo do limite volta; acima fecha; `pointercancel` volta; corpo com `scrollTop > 0` não inicia arrasto.
- [ ] Verificação estática: script de teste que varre CSS/TSX novos por propriedades animadas proibidas e por cores literais (falha o teste se encontrar).
- [ ] Integração/E2E: opcional (Playwright, se presente): abrir a sheet, arrastar e fechar.
- [ ] Manual (iPhone 13 Pro, PWA instalada, Pouca Energia desligado): 120 Hz perceptível nas transições e no arrasto; medidor `?perf=1`; Timeline do Safari Web Inspector (Mac conectado) sem quadros longos; repetir com "Reduzir Movimento" ligado em Ajustes de Acessibilidade; arrasto da sheet com teclado aberto; arrasto conflitando com rolagem do corpo.

Edge cases: dois toques rápidos no FAB; arrastar enquanto a sheet ainda anima a abertura (cancelar a animação e seguir o dedo); rotação (bloqueada em retrato no manifest, ainda assim não quebrar); aba trocada durante uma animação de entrada (cancelar e iniciar a nova); aparelhos 60 Hz (a lógica por tempo, não por quadro); sheet aberta e app em segundo plano (retomar sem pular).

## Riscos e rollback
- Risco: `linear()` não suportado em versões antigas do Safari. Mitigação: `@supports` com fallback para `--fc-spring` (cubic-bezier).
- Risco: conflito entre gesto de arrasto e rolagem interna. Mitigação: regra de `scrollTop === 0` e `touch-action`; teste manual dedicado.
- Risco: regressão do tempo de abertura da sheet (< 100 ms). Mitigação: RN-06 e medição obrigatória.
- Rollback: o primitivo de sheet mantém a API; desativar o arrasto é uma flag no hook e o motion novo pode ser desligado sem tocar dados.

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
