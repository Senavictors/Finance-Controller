---
id: FC2-F2-05
title: Tela Lançamentos (lista, busca, edição inline, aba Inbox)
status: backlog
type: feature
phase: F2
wave: 3
owner: telas-produto
depends_on: [FC2-F2-03]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [ledger, app-lancamentos, components-fc]
related_use_cases: []
related_adrs: [ADR-017, ADR-018, ADR-019, ADR-004, ADR-025]
---

# FC2-F2-05 — Tela Lançamentos (lista, busca, edição inline, aba Inbox)

## Contexto
A aba Lançamentos (spec §4.2) é onde o usuário confere e corrige o que capturou: lista agrupada por dia, busca instantânea, edição inline e Desfazer. A aba Inbox (swipe, sugestões) é da F4 (FC2-F4-05); aqui existe apenas o contêiner com as duas abas ("Todos | Inbox") e a contagem de pendentes, com um estado vazio explicativo na Inbox.

## Problema
`src/app/(app)/transactions/page.tsx` (1.x) é uma tabela de desktop com paginação por página (`pagination.tsx`), filtros em `transaction-filters.tsx`, formulário completo em diálogo (`transaction-form.tsx`) e `transaction-table.tsx`. Não funciona bem em 390 px, não agrupa por dia, não edita inline, mostra transferência como duas linhas e não diferencia lançamentos PLANNED de reais. A API `src/app/api/transactions/route.ts` e `[id]/route.ts` (1.x) acopla filtros e regras aos Route Handlers.

## Objetivo
Entregar `src/app/(app)/lancamentos/page.tsx` mobile-first com:
1. lista agrupada por dia (cabeçalho com data relativa e total do dia), rolagem infinita por cursor;
2. busca instantânea (descrição, categoria, conta, valor, tag);
3. filtros em chips (conta, categoria, tipo, período, "sem categoria", "previstos");
4. edição inline (descrição, valor, categoria, conta, data) em bottom sheet de edição rápida;
5. excluir com Desfazer;
6. transferência exibida como uma linha (`Origem → Destino`);
7. lançamentos PLANNED visualmente distintos ("previsto");
8. abas "Todos | Inbox" com contador (Inbox: estado vazio nesta fase).

## Fora de escopo
- Inbox funcional, swipe e criação de regra (FC2-F4-05).
- Importação (F4), conciliação (F1-04), exportação CSV.
- Edição em massa.
- Gráficos (F6-03).

## Comportamento atual
- `src/app/(app)/transactions/page.tsx`, `transaction-table.tsx`, `transaction-filters.tsx`, `transaction-stats.tsx`, `transaction-form.tsx`, `pagination.tsx` (1.x): tabela com paginação numérica. Ler apenas como referência de filtros úteis; descartar a UI.
- `src/app/api/transactions/route.ts` e `src/app/api/transactions/[id]/route.ts` (1.x): GET/POST/PATCH/DELETE com regras no handler. Reaproveitar a lógica de validação; mover para use-cases.
- `src/app/api/transactions/transfer/route.ts` (1.x): par de transações, tratado agora por `create-transfer` (FC2-F2-03).
- `src/lib/format.ts` (1.x): `formatCurrency(cents)` e `formatDate` (com `timeZone: 'UTC'`, necessário porque as datas são meio-dia UTC) são reaproveitáveis.

## Comportamento esperado

### Use-cases e API (backend desta task)
Em `src/server/modules/ledger/application/`:
- `listTransactions(userId, query)` com `query = { q?, accountIds?, categoryIds?, kinds?, from?, to?, status?: 'ALL'|'PLANNED'|'ACTUAL', uncategorized?: boolean, tags?, cursor?, limit (default 40, máx 100) }` ordenado por `date desc, createdAt desc, id desc` e cursor composto `(date, createdAt, id)`; devolve `{ items: TransactionRow[], nextCursor, dayTotals: Record<string, number> }`.
- `updateTransaction(userId, id, patch)`: aceita descrição, valor, categoria, conta, data, tags e notas. Regras abaixo.
- `deleteTransaction(userId, id)` e `restoreTransaction(userId, id)` (soft delete com `deletedAt`, se o schema da F0-02 tiver; senão adicionar migration aditiva `Transaction.deletedAt DateTime?` e registrar).
Rotas finas: `GET /api/transactions`, `PATCH /api/transactions/[id]`, `DELETE /api/transactions/[id]`, `POST /api/transactions/[id]/restore`. Reaproveitar os caminhos do 1.x e reescrever o conteúdo.

`TransactionRow` (DTO): `id, kind, status, date (YYYY-MM-DD), description, amountCents (com sinal para exibição: saída negativa), category { id, name, colorKey } | null, account { id, name, issuerKey }, toAccount?, statementKey?, installment?: { n, of }, tags, isRefund, review`.

### Tela
```text
Lançamentos                                [buscar]
[ Todos 128 ] [ Inbox 0 ]
chips: [Conta v][Categoria v][Tipo v][Período v][Sem categoria][Previstos]
HOJE, 05 OUT                                -R$ 60,90
  Uber            Transporte · Nubank           -R$ 18,00
  iFood           Delivery · Nubank             -R$ 42,90
ONTEM, 04 OUT                              -R$ 1.200,00
  Aluguel         Moradia · Itaú             -R$ 1.200,00
  Transf. PJ → Itaú                  (info)     R$ 500,00
PREVISTOS
  Internet  (previsto 08/10)  tracejado          -R$ 100,00
```
Cores só por tokens: entrada `--fc-in`, saída em texto normal (`--fc-text`; só relevante/juros usa `--fc-out`), pendente/atrasado `--fc-pend`, transferência `--fc-info`, parcela `--fc-debt`. Valor com `tabular-nums` e fonte `--fc-font-num`.

### Edição inline
Toque na linha abre bottom sheet de edição com os mesmos chips da sheet de captura (reutilizar `chip-picker` da F2-04). Alterar o valor de lançamento de cartão parcelado edita só esta parcela e avisa ("só esta parcela"); lançamento RECONCILED exige confirmação ("este lançamento já foi conciliado"). Excluir mostra toast com Desfazer por 6 s.

### Busca
Campo no topo, filtra instantaneamente os itens já carregados (sem rede) e, após 250 ms de pausa, consulta o servidor com `q`. Normaliza acentos e caixa; busca por valor aceita `42,90` e `42.90` (reaproveitar `parseAmountToken` da F2-01).

## Regras de negócio
- RN-01: todo valor exibido em reais a partir de centavos; nenhuma conta com `number` decimal (ADR-002).
- RN-02: datas exibidas com `timeZone: 'UTC'` (meio-dia UTC); cabeçalhos "Hoje", "Ontem", dia da semana nos últimos 7 dias, data completa depois.
- RN-03: transferência (par ligado, ADR-004) aparece como uma linha só e é editada/excluída em conjunto; excluir apaga as duas pernas na mesma transação.
- RN-04: editar valor, conta ou data atualiza `AccountBalance` na mesma transação (ADR-019); transação RECONCILED não muda de valor sem confirmação explícita e vira CLEARED novamente.
- RN-05: lançamento PLANNED não conta no total do dia de lançamentos reais; aparece no grupo "Previstos" e com estilo tracejado e rótulo "previsto". Editar um PLANNED vindo de série (F3-01) altera só aquela ocorrência.
- RN-06: o total do dia soma saídas e entradas reais; transferências entre contas do usuário não entram no total (efeito nulo).
- RN-07: parcelas de cartão exibem `n/N` e, ao tocar, abrem a compra (F3-06 enriquecerá).
- RN-08: busca e filtros nunca retornam dados de outro `userId`.
- RN-09: lista vazia mostra estado vazio com chamada para o FAB ("Toque em + para lançar"), não uma tabela vazia.

## Critérios de aceitação
- [ ] CA-01: a rota `/lancamentos` renderiza em 390x844 sem rolagem horizontal, com a TabBar fixa e a aba "Lançamentos" ativa.
- [ ] CA-02: itens agrupados por dia com total correto; transferência aparece como uma linha.
- [ ] CA-03: rolagem infinita carrega o próximo cursor sem duplicar nem pular itens (teste com 100 itens e 3 com mesma data).
- [ ] CA-04: busca filtra instantaneamente e encontra por descrição, categoria, conta, tag e valor (`42,90`).
- [ ] CA-05: editar valor, categoria, conta e data pela sheet persiste e atualiza saldo (`AccountBalance`) e a lista sem recarregar.
- [ ] CA-06: excluir mostra Desfazer; Desfazer restaura o lançamento (e as duas pernas de uma transferência).
- [ ] CA-07: PLANNED aparece no grupo "Previstos" com estilo distinto e não entra no total do dia.
- [ ] CA-08: a aba Inbox mostra o contador (0 nesta fase) e o estado vazio; sem erro de rota.
- [ ] CA-09: alvos de toque com no mínimo 44 px; nenhuma cor literal; só tokens `--fc-*`.
- [ ] CA-10: rotas só aceitam usuário autenticado e filtram por `userId`.
- [ ] CA-11: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
`src/server/modules/ledger/application/list-transactions.ts`, `update-transaction.ts`, `delete-transaction.ts`, `restore-transaction.ts`; `src/server/modules/ledger/http/schemas.ts` (query e patch com Zod); rotas em `src/app/api/transactions/route.ts`, `[id]/route.ts`, `[id]/restore/route.ts`. Reaproveitar do 1.x a ideia de filtros de `transaction-filters.tsx`, não o código.
### Frontend
`src/app/(app)/lancamentos/page.tsx` (server component que pré-carrega a primeira página), `lancamentos-client.tsx`, componentes em `src/components/fc/lancamentos/`: `day-group.tsx`, `transaction-row.tsx`, `transaction-edit-sheet.tsx`, `filter-chips.tsx`, `search-field.tsx`, `inbox-empty.tsx`. Remover `src/app/(app)/transactions/` do 1.x ao fim (se a FC2-F0-01 já não removeu). Estados de carregamento com esqueletos em `--fc-glass`.
### Banco de dados
Sem novas tabelas. Verificar índices para a consulta: `@@index([userId, date])`, e para busca por descrição `@@index([userId, description])`; se faltarem, migration aditiva. `deletedAt` conforme acima.
### Integrações
Nenhuma.
### Segurança
Autenticação por `requireAuth`; paginação com `limit` máximo 100; busca com parâmetros do Prisma (nada de SQL por string); escapar `q` em `contains`.

## Plano de implementação
- [ ] Etapa 1: `list-transactions.ts` com cursor composto e testes.
- [ ] Etapa 2: `update/delete/restore` com `$transaction` e atualização de `AccountBalance`.
- [ ] Etapa 3: schemas Zod e rotas finas.
- [ ] Etapa 4: `lancamentos/page.tsx` e `day-group`, `transaction-row`.
- [ ] Etapa 5: busca e filtros (chips).
- [ ] Etapa 6: sheet de edição reutilizando o `chip-picker` da F2-04.
- [ ] Etapa 7: exclusão com Desfazer, aba Inbox (vazia) e estados vazio/erro/carregando.
- [ ] Etapa 8: remover tela antiga `transactions/` e rotas que ficarem órfãs; atualizar `docs/` e `.agents/context/CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: agrupamento por dia (fuso: item `2026-10-05T12:00:00Z` cai em 05/10, nunca em 04/10); total do dia ignora PLANNED e transferências; formatação `-R$ 1.200,00`; parser de busca por valor (`42,90`, `42.90`, `1.250,00`).
- [ ] Integração: cursor com 100 itens e empate de data (sem duplicata/omissão); `updateTransaction` altera saldo corretamente (despesa de R$ 18,00 editada para R$ 20,00 reduz o saldo em R$ 2,00 a mais); editar RECONCILED sem confirmação retorna 409; excluir transferência apaga as duas pernas; `restore` recria as duas; usuário B não vê nem edita itens de A; filtros combinados (conta + período + sem categoria).
- [ ] E2E: fluxo "lançar pela sheet e ver na lista", se houver Playwright.
- [ ] Manual (iPhone 13 Pro): rolagem suave, barra de busca com teclado, sheet de edição, Desfazer.

Edge cases: lista com 0 itens; busca sem resultados; lançamento sem categoria; descrição de 120 caracteres (truncar com reticências, sem quebrar o layout); valor de R$ 1.000.000,00 sem estourar a coluna; item que muda de dia ao editar a data (reposiciona no grupo certo); exclusão de parcela única de compra parcelada (bloquear com mensagem "exclua a compra pela aba Cartões").

## Riscos e rollback
- Risco: consistência do saldo ao editar. Mitigação: `AccountBalance` atualizado na mesma transação e teste de recomputação.
- Risco: F2-04 e F2-05 rodam na mesma onda e ambas usam o `chip-picker`. Mitigação: o dono do `chip-picker` é a F2-04; se ele ainda não estiver integrado, criar `src/components/fc/capture/chip-picker.tsx` com a API mínima (`value`, `options`, `onChange`) e deixar a F2-04 estender, registrando em Divergências.
- Risco: desempenho da busca em lista grande. Mitigação: índices e limite; busca local nos itens carregados.
- Rollback: rota nova isolada; reativar a rota antiga é desnecessário (legado removido na F0-01); reverter commit remove a tela sem afetar dados.

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
