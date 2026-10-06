---
id: FC2-F3-01
title: Recorrências como série RRULE, PLANNED, cron diário, matching e atrasados
status: backlog
type: feature
phase: F3
wave: 1
owner: dominio-financeiro
depends_on: [FC2-F1-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [recurring, ledger, capture]
related_use_cases: []
related_adrs: [ADR-002, ADR-019, ADR-020, ADR-030]
---

# FC2-F3-01 — Recorrências como série RRULE, PLANNED, cron diário, matching e atrasados

## Contexto
"Futuro é dado" (spec §3, princípio 4): contas fixas, assinaturas, renda, DAS e parcelas de empréstimo são lançamentos previstos (PLANNED) que casam com os reais quando chegam. A engine Disponível (FC2-F3-02) depende disso para saber o que vence e o que entra. A decisão é o ADR-020: recorrência como série RRULE com materialização de PLANNED e matching (substitui o ADR-006, o modelo "regra + botão Aplicar" do 1.x).

## Problema
No 1.x (`src/app/api/recurring-rules/apply/route.ts`):
- É manual: o usuário aperta "Aplicar" (`src/app/(app)/recurring/apply-button.tsx`); nada roda sozinho.
- Só materializa até hoje (`today.setHours(23, 59, 59, 999)`), então o futuro nunca existe como dado; a previsão é recalculada à parte em `finance/application/forecast/project-recurrences.ts` (função `listProjectedRecurringDates`), duplicando a lógica.
- Bug do dia 29/30/31: o caso MONTHLY compara `current.getDate() === rule.dayOfMonth`, então uma regra "dia 31" não gera nada em abril, junho, setembro e novembro, e "dia 30" não gera em fevereiro. Também usa `getDay()`, `getDate()` e `setHours()` no fuso local do servidor (risco de deslocar o dia em UTC-3), e o caso YEARLY compara `current.getMonth() === rule.startDate.getMonth()`.
- Não há matching: o lançamento real (digitado ou importado) não se liga ao previsto, causando dupla contagem; não há conceito de atrasado.
- `lastApplied` é um ponteiro único; se o usuário não abre o app por semanas, `if (dates.length > 365) break` pode truncar e pular ocorrências.

## Objetivo
1. Modelar `RecurringSeries` com `rrule` (RFC 5545 subset), incluindo regra correta para o último dia do mês.
2. Materializar ocorrências PLANNED até `hoje + 90 dias` por cron diário idempotente (Vercel Cron, ADR-030).
3. Matching de lançamentos reais com PLANNED por conta, janela de datas, valor (percentual ou faixa) e similaridade de merchant; ambíguo vai para a Inbox; sem match após o vencimento vira OUTSTANDING.
4. Expor atrasados para a tela Hoje (FC2-F3-04) e para a engine (FC2-F3-02).

## Fora de escopo
- UI de cadastro/edição de séries (entra na FC2-F3-05, seção "Fixas e assinaturas").
- Matching de importados e conciliação com extrato (FC2-F4-04); aqui o engine é puro e reaproveitável por ela.
- Detecção automática de recorrências a partir do histórico (backlog).
- Parcelas de empréstimo (modelo `LoanInstallment`, F1-05): uma série `LOAN_INSTALLMENT` pode ser criada por ela chamando o use-case desta task; a geração do cronograma não é daqui.

## Comportamento atual
Ver Problema. Arquivos do 1.x que NÃO são reaproveitados: `src/app/api/recurring-rules/apply/route.ts`, `src/app/api/recurring-rules/route.ts`, `src/app/api/recurring-rules/[id]/route.ts`, `src/server/modules/finance/application/forecast/project-recurrences.ts`, modelos `RecurringRule` e `RecurringLog` de `prisma/schema.prisma`. Reaproveitar apenas a ideia do log de execução (resultado por ocorrência) e o padrão `requireAuth`/`AuthError`.

## Comportamento esperado

### Modelo
`RecurringSeries` (criado na FC2-F0-02; conferir `prisma/schema.prisma`): `id, userId, kind (BILL | SUBSCRIPTION | INCOME | TRANSFER | LOAN_INSTALLMENT | TAX), name, accountId, toAccountId?, categoryId?, merchantKey?, amountCents, amountMinCents?, amountMaxCents?, rrule (string), dtstart (YYYY-MM-DD meio-dia UTC), until?, dateToleranceDays (default 3), amountTolerancePct (default 5), autoConfirm (default false), isActive, materializedUntil`. Cada ocorrência materializada é uma `Transaction` com `status = PLANNED`, `source = RECURRING`, `seriesId` e `occurrenceDate`, única por `(seriesId, occurrenceDate)`.

### RRULE suportado (subset, implementação própria e pura)
`FREQ` = DAILY | WEEKLY | MONTHLY | YEARLY, `INTERVAL`, `BYDAY` (ex.: `MO,WE`), `BYMONTHDAY` (inclui negativos), `BYMONTH`, `BYSETPOS`, `COUNT`, `UNTIL`. Parser e expansor em `src/server/modules/recurring/domain/rrule.ts`: `parseRRule(str)`, `expandRRule({ rrule, dtstart }, from, to): string[]` (datas `YYYY-MM-DD`, aritmética de calendário em UTC, sem `Date` local). Biblioteca externa só se o subset acima passar a tabela de testes; a decisão padrão é implementação própria (sem dependência, sem armadilha de fuso).

Construtores: `buildMonthlyRRule(dayOfMonth | 'LAST')`:
- `LAST` gera `FREQ=MONTHLY;BYMONTHDAY=-1`.
- Dia 1 a 28 gera `FREQ=MONTHLY;BYMONTHDAY=<d>`.
- Dia 29, 30 ou 31 gera `FREQ=MONTHLY;BYMONTHDAY=28,29,<...>,<d>;BYSETPOS=-1` (ex.: dia 31 usa `28,29,30,31`; dia 30 usa `28,29,30`; dia 29 usa `28,29`), de forma que em meses curtos a ocorrência cai no último dia disponível (31 em abril vira 30; 30 em fevereiro vira 28 ou 29). Isso corrige o bug do 1.x.

### Materialização
`materializeSeries(series, { today, horizonDays = 90 })` calcula as ocorrências de `max(dtstart, materializedUntil + 1)` até `today + 90 d`, cria as ausentes (idempotente por `(seriesId, occurrenceDate)`), aplica `amountCents` da série e atualiza `materializedUntil`. Se a série foi editada, `rematerializeFuture(seriesId, fromDate)` apaga PLANNED futuros ainda sem match (status PLANNED, sem `matchedTransactionId`) e recria.

Cron: `GET /api/cron/recurring` (Route Handler fino) chamado diariamente pela Vercel (`vercel.json`: `{"crons":[{"path":"/api/cron/recurring","schedule":"0 9 * * *"}]}`, que corresponde a 06:00 em Brasília). Autenticação por `Authorization: Bearer ${CRON_SECRET}` (a Vercel envia esse header quando a variável existe); sem o header correto, `401`. O job percorre todas as séries ativas de todos os usuários (single-user, mas por `userId`), materializa, aplica `autoConfirm`, marca vencidos e devolve contagens `{ series, created, confirmed, outstanding }`. Execuções repetidas no mesmo dia não criam nada novo.

`autoConfirm = true`: ao chegar a data da ocorrência, o job converte o PLANNED em CLEARED (valor da série) com `review = NEEDS_REVIEW` para o usuário conferir na Inbox (débito automático de telefonia, por exemplo). `autoConfirm = false`: fica PLANNED até haver match ou confirmação manual.

### Matching
Função pura `matchPlanned(incoming, candidates, opts): MatchDecision`:
- Candidatos: PLANNED do mesmo `userId` e mesma conta (para TRANSFER, mesma conta de origem).
- Critérios e pontuação (0 a 1): data dentro de `±dateToleranceDays` (peso 0.30 x `1 - dias / (tolerância + 1)`; fora da janela vale 0 e elimina o candidato); valor dentro de `±amountTolerancePct` do previsto ou dentro de `[amountMinCents, amountMaxCents]` quando a série é de valor variável (peso 0.40 inteiro dentro da tolerância, 0 fora); similaridade de merchant entre `normalizeMerchantKey(incoming.description)` e `series.merchantKey`/`name` por Jaccard de tokens e prefixo comum (peso 0.30).
- Decisão: `MATCHED` se o melhor score é maior ou igual a 0.75 e a diferença para o segundo é maior ou igual a 0.15; `AMBIGUOUS` se o melhor score está entre 0.50 e 0.75, ou se há empate de dois candidatos acima de 0.50; `NO_MATCH` abaixo de 0.50.
- `applyMatch(incomingId, plannedId)`: o PLANNED é atualizado para CLEARED com valor, data e descrição reais, `matchedAt` preenchido, e a transação recém-criada é removida (sem dupla contagem), tudo em `$transaction`. `AMBIGUOUS` não altera nada e marca a transação nova como `review = NEEDS_REVIEW`, guardando os ids candidatos para a Inbox (F4-05). Conectar ao gancho `afterCreate` da FC2-F2-03 via `registerAfterCreate`.

### Atrasados
Estado derivado, não coluna: `OUTSTANDING` = `status = PLANNED` e `date < today - dateToleranceDays`. `listOutstanding(userId, today)` devolve itens com `daysOverdue`, ordenados do mais antigo. Séries INCOME atrasadas aparecem com a ação "confirmar recebimento". Atrasados continuam entrando no cálculo de caixa (spec §5.1: "pendentes (inclui atrasadas)").

## Regras de negócio
- RN-01: valores em centavos (ADR-002); datas de calendário ao meio-dia UTC, expansão do RRULE em UTC puro.
- RN-02: horizonte de materialização fixo em hoje + 90 dias (configurável por constante `MATERIALIZATION_HORIZON_DAYS`).
- RN-03: o cron é idempotente: unicidade `(seriesId, occurrenceDate)`; reexecutar não duplica (ADR-030).
- RN-04: dia 29/30/31 nunca "pula" mês: cai no último dia disponível (regra de `buildMonthlyRRule`).
- RN-05: matching nunca casa PLANNED de outra conta, de outro usuário, nem de série inativa.
- RN-06: um PLANNED só casa uma vez; uma transação real só casa um PLANNED.
- RN-07: ambíguo nunca é resolvido automaticamente; vai para a Inbox.
- RN-08: `OUTSTANDING` é derivado de `PLANNED` e data; nada é apagado nem alterado só por estar atrasado.
- RN-09: editar a série afeta só ocorrências futuras sem match; ocorrências já casadas permanecem.
- RN-10: desativar a série apaga PLANNED futuros sem match e mantém o histórico.
- RN-11: o cron exige `CRON_SECRET`; sem a variável configurada, o endpoint recusa (nunca executa aberto).
- RN-12: séries `INCOME` usam `IncomeRule` (F1-06) como fonte do valor quando `seriesId` aponta para renda MEI; esta task só materializa e casa o que a regra informar.

## Critérios de aceitação
- [ ] CA-01: `expandRRule` passa a tabela de testes de RRULE abaixo, incluindo último dia do mês e dias 29/30/31.
- [ ] CA-02: uma série mensal no dia 31 gera 31/01, 28/02, 31/03, 30/04 (datas do exemplo), e dia 30 gera 28/02 (2026) e 29/02 (2028, ano bissexto).
- [ ] CA-03: `materializeSeries` cria PLANNED até hoje + 90 dias e rodar duas vezes cria zero novos.
- [ ] CA-04: `GET /api/cron/recurring` responde 401 sem o header e 200 com `Bearer CRON_SECRET`; `vercel.json` define o cron diário.
- [ ] CA-05: `matchPlanned` casa o caso feliz (mesma conta, 1 dia de diferença, 2% de variação, merchant igual) com `MATCHED`.
- [ ] CA-06: dois PLANNED parecidos geram `AMBIGUOUS` e a transação nova fica NEEDS_REVIEW sem alterar nenhum PLANNED.
- [ ] CA-07: PLANNED vencido há mais de a tolerância e sem match aparece em `listOutstanding` com `daysOverdue` correto.
- [ ] CA-08: com `autoConfirm = true`, o job converte o PLANNED do dia em CLEARED com NEEDS_REVIEW.
- [ ] CA-09: a lógica do 1.x (`apply/route.ts`, `project-recurrences.ts`, `recurring-rules/**`) não é importada em nenhum código novo.
- [ ] CA-10: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
- `src/server/modules/recurring/domain/rrule.ts` (+ `rrule.test.ts`), `materialize.ts` (função pura que devolve as ocorrências a criar; + teste), `match-planned.ts` (+ teste), `outstanding.ts` (+ teste).
- `src/server/modules/recurring/application/create-series.ts`, `update-series.ts`, `deactivate-series.ts`, `materialize-series.ts`, `run-daily-job.ts`, `apply-match.ts`, `list-outstanding.ts`, `confirm-planned.ts` (confirmação manual de um PLANNED, usado por "confirmar recebimento").
- `src/server/modules/recurring/infra/series-repository.ts`.
- `src/server/modules/recurring/http/schemas.ts` (Zod) e rotas finas `src/app/api/recurring/route.ts` (GET/POST), `src/app/api/recurring/[id]/route.ts` (PATCH/DELETE), `src/app/api/cron/recurring/route.ts`.
- `vercel.json` na raiz com a entrada de cron.
### Frontend
Nenhum aqui (FC2-F3-05 traz o cadastro; FC2-F3-04 traz os atrasados).
### Banco de dados
`RecurringSeries` e a coluna `Transaction.seriesId`/`occurrenceDate` vêm da FC2-F0-02. Conferir e, se faltar, migration aditiva: `@@unique([seriesId, occurrenceDate])` em `Transaction`, `matchedTransactionId String?`, `matchedAt DateTime?`, `matchCandidates Json?` (ids candidatos para a Inbox). Índice `@@index([userId, status, date])` para a consulta de atrasados e da engine.
### Integrações
Vercel Cron (header `Authorization: Bearer ${CRON_SECRET}`). Variável de ambiente `CRON_SECRET` documentada em `docs/` e na Vercel (não versionar o valor).
### Segurança
Endpoint de cron protegido por segredo; comparação em tempo constante (`crypto.timingSafeEqual`); sem dados em logs além de contagens; todas as consultas por `userId`.

## Plano de implementação
- [ ] Etapa 1: `rrule.ts` (parse, validação, expansão) e a tabela de testes.
- [ ] Etapa 2: `buildMonthlyRRule` e testes de dias 29/30/31 e último dia.
- [ ] Etapa 3: `materialize.ts` puro (ocorrências a criar dado o estado) e testes.
- [ ] Etapa 4: `match-planned.ts` (pontuação, decisão) e testes.
- [ ] Etapa 5: `outstanding.ts` e testes.
- [ ] Etapa 6: repositório e use-cases (`create/update/deactivate`, `materialize-series`, `apply-match`, `confirm-planned`).
- [ ] Etapa 7: `run-daily-job.ts`, rota de cron, `vercel.json`, segredo.
- [ ] Etapa 8: registrar o matching no gancho `afterCreate` da FC2-F2-03.
- [ ] Etapa 9: rotas finas de CRUD e `docs/domain/` (recorrências, ADR-020 referenciado), `.agents/context/CONTEXT.md`.

## Estratégia de testes
Fixture: `today = '2026-10-05'`.
- [ ] Unitários, RRULE (série, janela, resultado esperado):
  - `FREQ=MONTHLY;BYMONTHDAY=5`, dtstart 2026-01-05, janela 2026-10-01 a 2026-12-31: 2026-10-05, 2026-11-05, 2026-12-05.
  - `FREQ=MONTHLY;BYMONTHDAY=-1`, dtstart 2026-01-31, janela 2026-01-01 a 2026-05-31: 01-31, 02-28, 03-31, 04-30, 05-31.
  - `buildMonthlyRRule(31)` janela 2026-01 a 2026-06: 01-31, 02-28, 03-31, 04-30, 05-31, 06-30.
  - `buildMonthlyRRule(30)` janela 2028-01 a 2028-03: 01-30, 02-29, 03-30; mesma janela em 2026: 01-30, 02-28, 03-30.
  - `buildMonthlyRRule(29)` em 2026: 01-29, 02-28, 03-29.
  - `FREQ=WEEKLY;BYDAY=MO,WE`, dtstart 2026-10-05 (segunda), janela 2026-10-05 a 2026-10-14: 10-05, 10-07, 10-12, 10-14.
  - `FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=10` dtstart 2025-03-10, janela 2026: 2026-03-10.
  - `FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15` dtstart 2026-01-15: 01-15, 03-15, 05-15.
  - `FREQ=MONTHLY;BYMONTHDAY=10;COUNT=3` dtstart 2026-01-10: exatamente 3 ocorrências.
  - `UNTIL=20260331` corta a série; `until` inclusivo.
  - dtstart no futuro (2027-01-01) com janela em 2026: lista vazia.
  - RRULE inválido (`FREQ=FOO`) lança erro de validação tipado (`InvalidRRuleError`).
  - Virada de ano: janela 2026-12-01 a 2027-02-28 com `BYMONTHDAY=31`: 12-31, 01-31, 02-28.
- [ ] Unitários, materialização: série com `materializedUntil = 2026-10-01` e hoje 2026-10-05 materializa de 10-02 até 2027-01-03; segunda chamada vazia; série com `until` antes do horizonte não passa do `until`.
- [ ] Unitários, matching: (a) feliz: previsto R$ 100,00 em 08/10, real R$ 102,00 em 09/10, merchant igual: score 0.225 + 0.40 + 0.30 = 0.925, MATCHED; (b) valor fora da tolerância (R$ 120,00 contra R$ 100,00 com 5%) com data e merchant perfeitos: score 0.60, AMBIGUOUS; (c) faixa [R$ 80,00; R$ 150,00] aceita R$ 120,00; (d) data a 4 dias (tolerância 3): NO_MATCH; (e) conta diferente: nunca casa; (f) dois previstos iguais (assinaturas gêmeas): AMBIGUOUS; (g) merchant diferente mas valor e data idênticos: score 0.70, AMBIGUOUS; (h) PLANNED já casado não volta a ser candidato.
- [ ] Unitários, atrasados: previsto 2026-10-01, hoje 2026-10-05, tolerância 3: `daysOverdue = 4`, OUTSTANDING; previsto 2026-10-03: 2 dias, ainda não OUTSTANDING; previsto futuro: nunca.
- [ ] Integração: job completo duas vezes seguidas (segunda cria 0); cron sem segredo (401) e com segredo (200); `autoConfirm`; `applyMatch` remove a transação duplicada e preserva saldo; usuário B não é tocado pelo job do usuário A (isolamento).
- [ ] E2E: não aplicável nesta task.
- [ ] Manual: criar série "dia 31" e conferir os PLANNED dos próximos 90 dias em `npx prisma studio`.

## Riscos e rollback
- Risco: implementação própria de RRULE ter lacuna. Mitigação: subset documentado e rejeição explícita do resto (`InvalidRRuleError`); a tabela cobre o uso real (mensal, semanal, anual, último dia).
- Risco: matching errado casar um lançamento real com o previsto errado. Mitigação: limiares altos, margem sobre o segundo candidato e ambiguidade para a Inbox; sempre reversível via desfazer de match (`unmatch`) a ser exposto na F4-05.
- Risco: cron falhar silenciosamente. Mitigação: resposta com contagens, log estruturado de falha e `materializedUntil` por série (o job seguinte recupera o atraso).
- Rollback: tabelas e colunas aditivas; remover a entrada de cron em `vercel.json` desliga a materialização; PLANNED gerados podem ser apagados por `deactivate`.

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
