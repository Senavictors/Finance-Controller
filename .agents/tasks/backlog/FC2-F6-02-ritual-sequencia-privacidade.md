---
id: FC2-F6-02
title: Ritual, sequência, celebrações e modo privacidade
status: backlog
type: feature
phase: F6
wave: 1
owner: telas-produto
depends_on: [FC2-F3-04, FC2-F4-05]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [ritual, app-hoje, components-fc, settings]
related_use_cases: []
related_adrs: [ADR-017, ADR-018]
---

# FC2-F6-02 — Ritual, sequência, celebrações e modo privacidade

## Contexto
Princípio 7 da spec (§3): "Hábito saudável: ritual diário de 30 s, inbox zero, sequência de dias; nada de dark patterns." A métrica de hábito é app aberto em 5 de 7 dias (§11). A FC2-F3-04 entregou a versão base: anel de 2 passos (revisar inbox, registrar gastos), sequência de 7 pontos e a tabela `RitualDay` (`openedApp`, `inboxDone`, `loggedDone`, `noSpend`). A Inbox funcional chega com a FC2-F4-05. Esta task completa o hábito: regras da sequência com folga, celebrações discretas e o modo privacidade (ocultar valores), útil porque o app é usado em público, no celular.

## Problema
Sem regras claras, a sequência vira pressão (perde tudo por um dia falho) ou é inócua. Não há celebração do inbox zero nem de metas. E todos os valores aparecem sempre; ao mostrar a tela ou ao alternar apps no iPhone, o saldo fica exposto. O 1.x não tem nenhuma dessas ideias (`src/app/(app)/dashboard/widgets/score-widget.tsx` e `insights-widget.tsx` eram o mais próximo de "gamificação" e não são reaproveitados; spec §9 manda reavaliar score/insights na F6 sem bloquear).

## Objetivo
1. Regras da sequência (streak) com folga automática, sem punição, e métrica semanal "dias abertos de 7".
2. Celebrações discretas e opcionais: ritual completo, inbox zero, meta atingida e dia sem gastos, uma vez por evento.
3. Modo privacidade: ocultar valores em todo o app, com alternância rápida e opção de ocultar ao ir para segundo plano.

## Fora de escopo
- Notificações push e lembretes (qualquer nudge de culpa está proibido; lembrete via Telegram é da F5-05).
- Pontuação financeira (score) e insights (reavaliação própria, não bloqueia).
- Motion do sistema (F6-01): as celebrações usam os springs e as regras de 120 Hz da F6-01.
- Autenticação por biometria.

## Comportamento atual
- Hoje (F3-04): `ritual-card.tsx` com anel de 2 passos e 7 pontos; `RitualDay` com `openedApp` marcado no primeiro carregamento do dia.
- Valores são formatados diretamente com `formatCurrency` de `src/lib/format.ts` (1.x) ou helpers equivalentes em vários componentes; não existe um ponto único.
- Nenhuma celebração, nenhum estado de privacidade.

## Comportamento esperado

### Sequência (domínio puro `src/server/modules/ritual/domain/streak.ts`)
`computeStreak(days, today, options): { streak: number; graceUsed: number; todayState: 'DONE' | 'PENDING'; weekOpened: number; weekDone: number }`
- Um dia está completo quando `inboxDone && (loggedDone || noSpend)`.
- A sequência conta dias completos consecutivos terminando em ontem ou hoje. O dia de hoje incompleto não quebra a sequência (o dia ainda não acabou); aparece como `PENDING`.
- Folga automática: 1 dia sem ritual a cada janela móvel de 7 dias é coberto (a sequência continua, o dia coberto não soma, e `graceUsed` conta). Dois dias sem ritual dentro de 7 dias quebram a sequência.
- `weekOpened` = dias com `openedApp` nos últimos 7 dias (inclui hoje); `weekDone` = dias completos nos últimos 7 dias. A UI mostra "5 de 7 dias" como meta suave, sem alarmes.
- Sem texto de perda ("você perdeu"). Quando a sequência recomeça: "Recomeçando: dia 1".

### Celebrações (`src/components/fc/ritual/celebration.tsx`)
Disparos, cada um uma única vez por evento e com tempo máximo de 1,2 s:
- Ritual completo do dia: anel fecha, brilho `--fc-glow-iris` por `opacity`, check central; marca `RitualDay.celebratedAt`.
- Inbox zero: transição de contagem maior que 0 para 0 dentro da mesma sessão (não ao abrir com 0); texto "Inbox zerada".
- Meta atingida: ao `GoalProgress.percent` chegar a 100 (F3-07), uma vez (`Goal.celebratedAt`).
- Dia sem gastos: ao tocar "Sem gastos hoje", feedback curto.
Visual: apenas `transform` e `opacity`, tokens `--fc-*` (`--fc-in` para sucesso, `--fc-iris-hi` para brilho), sem confete, sem som por padrão, sem bloquear a tela (toast não modal). Configuração "Celebrações" (padrão ligada) em Mais; com `prefers-reduced-motion` aparece só o estado final estático (check e texto) sem animação.
Lógica pura `shouldCelebrate(event, prev, next, alreadyCelebrated): boolean` (testável).

### Modo privacidade
- `PrivacyProvider` (`src/components/fc/privacy/privacy-provider.tsx`) e `usePrivacy()`; estado inicial lido do servidor (`UserSetting.privacyMode`) para evitar piscar valores, com espelho em `localStorage` (try/catch) apenas como conveniência.
- Componente único `Money` (`src/components/fc/money.tsx`): `<Money cents={...} />`. Em privacidade mostra `R$ ••••` com largura reservada (para não deslocar layout) e `aria-label="valor oculto"`; fora dela, formata em reais com `tabular-nums` e `--fc-font-num`. Variantes: `signed`, `compact`, `size`.
- Todo valor monetário do app passa por `Money`. Gráficos mantêm a forma, mas rótulos de eixo e tooltips numéricos ficam ocultos; resumos textuais ("Menor saldo: R$ X") usam `Money`. Percentuais e datas não são ocultados.
- Alternância rápida: botão de olho de 44 px no cabeçalho da Hoje e em Mais; toque simples alterna e persiste (`PATCH /api/settings` com Zod).
- Opção "Ocultar ao ir para segundo plano": ao `visibilitychange` para `hidden` (e `pagehide`), liga uma máscara de tela inteira (`--fc-ink` opaco) para o instantâneo do alternador de apps do iOS não mostrar valores; ao voltar, remove (com a privacidade escolhida preservada). Melhor esforço: o iOS não garante que o instantâneo espere a renderização; documentar.
- Cobertura obrigatória: teste de varredura que falha se `formatCurrency(` ou `Intl.NumberFormat(... currency` aparecer em `src/components` e `src/app` fora de `Money`, dos formatadores e de uma lista de exceções justificada (por exemplo, exportação).

## Regras de negócio
- RN-01: nenhum dark pattern: sem contagem regressiva de perda, sem notificação de culpa, sem sequência perdida com mensagem negativa, folga automática.
- RN-02: celebrações e sequência são opcionais; desligar não afeta nenhuma funcionalidade financeira.
- RN-03: a privacidade nunca altera dados, apenas a exibição; nenhum cálculo depende dela.
- RN-04: `Money` é a única forma de exibir valor monetário; centavos inteiros como entrada (ADR-002).
- RN-05: `RitualDay` tem uma linha por `(userId, date)`; datas calculadas no fuso America/Sao_Paulo.
- RN-06: eventos de celebração são idempotentes (`celebratedAt`), mesmo com várias abas ou recarregamentos.
- RN-07: alvos de toque de no mínimo 44 px; só tokens `--fc-*`; `prefers-reduced-motion` respeitado.
- RN-08: dados de exemplo e testes fictícios.

## Critérios de aceitação
- [ ] CA-01: `computeStreak` passa a tabela de casos abaixo (inclui folga, quebra, hoje pendente e ausência de dados).
- [ ] CA-02: o anel de 2 passos da Hoje usa `computeStreak` e mostra "N de 7 dias" (`weekOpened`) e a sequência, sem mensagens de perda.
- [ ] CA-03: celebração de ritual completo dispara uma única vez por dia; recarregar não repete.
- [ ] CA-04: inbox zero celebra apenas na transição de maior que 0 para 0; abrir a tela já com 0 não celebra.
- [ ] CA-05: meta atingida celebra uma vez.
- [ ] CA-06: com "Celebrações" desligada ou `prefers-reduced-motion`, não há animação (apenas estado final).
- [ ] CA-07: o modo privacidade oculta todos os valores monetários em Hoje, Lançamentos, Planejar, Cartões, Mais e Relatórios, em gráficos (rótulos e tooltips) e em toasts; layout não desloca.
- [ ] CA-08: o estado de privacidade persiste no servidor e é aplicado já na primeira renderização (sem piscar valores).
- [ ] CA-09: "Ocultar ao ir para segundo plano" cobre a tela ao ir para o alternador de apps no iPhone (verificação manual) e remove a máscara ao voltar.
- [ ] CA-10: o teste de varredura de `Money` passa (nenhum `formatCurrency(` fora das exceções).
- [ ] CA-11: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
- `src/server/modules/ritual/domain/streak.ts` e `celebrate.ts` (+ testes), `application/get-ritual.ts` (estende o da F3-04), `application/mark-celebrated.ts`.
- `src/server/modules/settings/` (se não existir): `application/get-settings.ts`, `update-settings.ts` com `privacyMode`, `privacyOnBackground`, `celebrations`; rota fina `src/app/api/settings/route.ts` (GET/PATCH, Zod).
### Frontend
- `src/components/fc/money.tsx` (+ teste) e substituição em todos os componentes existentes (Hoje, Lançamentos, Planejar, Cartões, Mais, sheets, toasts, gráficos).
- `src/components/fc/privacy/privacy-provider.tsx`, `privacy-toggle.tsx`, `background-mask.tsx`.
- `src/components/fc/ritual/ritual-card.tsx` (evolui o da F3-04), `celebration.tsx`, `week-dots.tsx`.
- Página de configurações em `src/app/(app)/mais/` (toggles de celebrações e privacidade).
- Teste `tests/privacy-coverage.test.ts` (varredura de código).
### Banco de dados
`RitualDay.celebratedAt DateTime?` e `Goal.celebratedAt DateTime?` (migration aditiva); `UserSetting` com `privacyMode Boolean @default(false)`, `privacyOnBackground Boolean @default(true)`, `celebrations Boolean @default(true)` (ou colunas no `User`, conforme o schema da F0-02). Registrar a escolha em Decisões.
### Integrações
Nenhuma.
### Segurança
Privacidade é de exibição, não de segurança: não substitui autenticação. A máscara em segundo plano é melhor esforço. Nunca registrar valores em logs de cliente. Configurações com `requireAuth` e `userId`.

## Plano de implementação
- [ ] Etapa 1: `streak.ts` e `celebrate.ts` com testes.
- [ ] Etapa 2: migrations aditivas e use-cases de configurações e ritual.
- [ ] Etapa 3: `Money`, `PrivacyProvider` e o teste de varredura; migrar todos os pontos de formatação (inclui gráficos da F3-04).
- [ ] Etapa 4: `PrivacyToggle` e máscara de segundo plano.
- [ ] Etapa 5: evolução do `ritual-card` com `computeStreak` e `week-dots`.
- [ ] Etapa 6: `celebration.tsx`, gatilhos (ritual, inbox zero, meta, sem gastos) e idempotência.
- [ ] Etapa 7: configurações em Mais.
- [ ] Etapa 8: verificação manual no iPhone; docs (`docs/ui/habito.md`, `docs/ui/privacidade.md`) e `.agents/context/CONTEXT.md`.

## Estratégia de testes
Fixture: `today = 2026-10-05` (segunda-feira). Dia completo = `inboxDone && (loggedDone || noSpend)`.
- [ ] Unitários, `computeStreak` (dias completos listados; os demais incompletos ou ausentes):

| Cenário | Dias completos | Esperado |
|---|---|---|
| Sem dados | nenhum | streak 0, hoje PENDING |
| Cinco dias seguidos até hoje | 10-01, 10-02, 10-03, 10-04, 10-05 | streak 5, hoje DONE |
| Até ontem, hoje pendente | 10-01 a 10-04 | streak 4, hoje PENDING, não quebra |
| Uma falha (folga) | 10-01, 10-02, 10-04, 10-05 | streak 4, `graceUsed = 1` |
| Duas falhas na janela de 7 dias | 10-01, 10-04, 10-05 | streak 2 (reinicia após a segunda falha), `graceUsed = 0` |
| Falhas separadas por mais de 7 dias | 09-20 a 09-24, 10-02 a 10-05 (falhas em 09-25..10-01 são 7 dias) | streak 4 (quebrou antes) |
| Dia sem gastos conta | 10-04 com `noSpend` e `inboxDone`, 10-05 completo | streak 2 |

  Semana: com `openedApp` em 10-01, 10-02, 10-04, 10-05: `weekOpened = 4`; com os 7 dias: 7.
- [ ] Unitários, `shouldCelebrate`: ritual completo com `alreadyCelebrated = true` não repete; inbox 3 para 0 celebra; inbox 0 para 0 não; meta 99% para 100% celebra uma vez; retirada que volta a 90% e novo 100% não repete se `celebratedAt` existe.
- [ ] Unitários, `Money`: 4290 mostra `R$ 42,90`; privacidade mostra `R$ ••••` com `aria-label="valor oculto"`; negativo com `signed`; zero; valor de 1.000.000,00 sem estourar a largura; a largura reservada é igual com e sem privacidade (classes/estilo de largura mínima).
- [ ] Varredura (`tests/privacy-coverage.test.ts`): falha ao encontrar `formatCurrency(` em `src/components` e `src/app` fora da lista de exceções.
- [ ] Componentes (jsdom): alternar privacidade oculta valores em Hoje, Planejar e Cartões (fixtures); gráfico oculta rótulos numéricos; celebração não renderiza animação com movimento reduzido.
- [ ] Integração: `PATCH /api/settings` persiste e a página seguinte já renderiza oculta (server-rendered); `mark-celebrated` idempotente com chamadas concorrentes.
- [ ] E2E: opcional (Playwright).
- [ ] Manual (iPhone 13 Pro, PWA): alternar privacidade, ir ao alternador de apps com a opção ligada, conferir máscara; completar o ritual e ver a celebração; VoiceOver lê "valor oculto".

Edge cases: virada de dia durante a sessão (recalcular o dia com o fuso de São Paulo); fuso errado no aparelho (usar o do servidor); duas abas abertas; primeiro uso (sem `RitualDay`); privacidade ligada em tela de erro (nunca vazar valor em mensagem de erro).

## Riscos e rollback
- Risco: esquecer algum valor ao migrar para `Money`. Mitigação: teste de varredura e revisão da QA (F6-04).
- Risco: a máscara de segundo plano não pegar o instantâneo do iOS. Mitigação: documentar como melhor esforço e manter o toggle manual como caminho principal.
- Risco: a sequência virar pressão. Mitigação: folga automática, sem textos de perda e opção de desligar.
- Rollback: colunas aditivas; `Money` com privacidade desligada reproduz o formato anterior; reverter o commit restaura a exibição antiga.

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
