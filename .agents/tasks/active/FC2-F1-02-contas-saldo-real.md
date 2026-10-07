---
id: FC2-F1-02
title: "Contas: CRUD, saldo real, uso do limite"
status: active
type: feature
phase: F1
wave: 2
owner: api-servidor
depends_on: [FC2-F1-01, FC2-F1-09]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [accounts, ledger, app-mais]
related_use_cases: [createAccount, updateAccount, archiveAccount, listAccounts, getAccount]
related_adrs: [ADR-019, ADR-016, ADR-025]
---

# FC2-F1-02 — Contas: CRUD, saldo real, uso do limite

## Contexto
O critério de saída da F1 é "saldo de cada conta no app = saldo do banco". Para isso o usuário precisa cadastrar suas contas (corrente PF, conta PJ, poupança/carteira, cartões), informar o saldo inicial e ver, por conta, o saldo compensado, pendente, previsto e o **uso do cheque especial**. O 1.x tem `accounts` com CRUD simples (`src/app/api/accounts/route.ts`, `[id]/route.ts`, schemas `createAccountSchema`/`updateAccountSchema` em `finance/http/schemas.ts`, tela `(app)/accounts`) e um `initialBalance` que o 2.0 não usa mais (o saldo inicial é um lançamento `ADJUSTMENT`, FC2-F1-01).

## Problema
- Não existe módulo `accounts` no 2.0; as contas do 1.x foram removidas na F0-01.
- O cadastro precisa validar campos por tipo (cartão exige limite, fechamento e vencimento; corrente tem cheque especial).
- A API de contas precisa devolver o saldo e o uso do limite calculados pelo ledger, sem recalcular na tela.
- Sem tela mínima de contas, o usuário não consegue cumprir o critério de saída da F1 (as telas finais "Planejar/Cartões" vêm depois).

## Objetivo
1. Módulo `src/server/modules/accounts/` com use-cases e rotas finas.
2. Criação de conta com saldo inicial via lançamento `ADJUSTMENT` na mesma transação (linha de `AccountBalance` criada).
3. Tela funcional mínima em `Mais > Contas` para listar, criar, editar e arquivar contas, mostrando saldo e uso do limite.

## Fora de escopo
- Reconciliação (FC2-F1-04) e a UI de conferência de saldo (a tela de contas só deixa um ponto de extensão).
- Cartão: faturas, compras, parcelas (FC2-F1-03); aqui o cartão é apenas uma conta do tipo `CREDIT_CARD` com `creditLimit`, `closingDay` e `dueDay`.
- Polimento visual e animações (F6); a tela segue o design system mas é simples.
- Importação, merchants, regras.

## Comportamento atual
1.x: `GET/POST /api/accounts`, `GET/PATCH/DELETE /api/accounts/[id]` com Prisma direto no handler; `createAccountSchema` valida tipo, `initialBalance`, `creditLimit`, `statementClosingDay`, `statementDueDay`, `color`, `icon`, `networkBrandKey`; `DELETE` removia a conta com cascade. Tela `(app)/accounts` (`account-card.tsx`, `account-form.tsx`). `src/lib/brands/registry.ts` mantém as chaves de bancos/redes (`getBrand(key)`), preservado pela F0-01.

## Comportamento esperado
### Campos e validações por tipo (Zod 4)
| Campo | Regra |
|---|---|
| `name` | 1-60 caracteres, único por usuário (case-insensitive), sem confusão com arquivadas: nome de conta arquivada continua reservado |
| `type` | `CHECKING`, `SAVINGS`, `WALLET`, `INVESTMENT`, `CREDIT_CARD`, `BUSINESS` |
| `issuerKey` | opcional; se informado, deve existir em `src/lib/brands/registry.ts` (categoria `bank` ou `payment`) |
| `networkKey` | opcional; só para `CREDIT_CARD`; deve existir (categoria `network`) |
| `colorKey` | opcional; `cat-1`..`cat-10` |
| `icon` | opcional; nome de ícone lucide (string curta alfanumérica) |
| `overdraftLimit` | `Int >= 0` centavos; só `CHECKING`/`BUSINESS`; demais tipos devem vir 0/omitido |
| `creditLimit` | obrigatório e `> 0` para `CREDIT_CARD`; proibido nos demais |
| `closingDay`, `dueDay` | obrigatórios (1-31) para `CREDIT_CARD`; proibidos nos demais |
| `openingBalance` | opcional na criação; `Int` assinado em centavos (não persiste como coluna) |
| `openingDate` | opcional (`localDateSchema`); default hoje ao meio-dia UTC |

### Use-cases (`src/server/modules/accounts/application/`)
- `createAccount(userId, input)`: em `prisma.$transaction`: cria `Account`, cria `AccountBalance` zerado e, se `openingBalance != 0`, chama o use-case do ledger para gravar `ADJUSTMENT` ("Saldo inicial", `CLEARED`, `excludeFromBudget = true`, `source = MANUAL`, `review = REVIEWED`). Para `CREDIT_CARD`, `openingBalance` representa dívida já existente (valor negativo) e é aceito apenas como `ADJUSTMENT`; a F1-03 tratará faturas.
- `updateAccount(userId, id, patch)`: permite renomear, trocar ícone/cor/emissor, ajustar `overdraftLimit`/`creditLimit`/`closingDay`/`dueDay`. **Não** permite trocar `type` se já houver lançamentos além do saldo inicial (`ACCOUNT_TYPE_LOCKED`). Mudar `closingDay`/`dueDay` de cartão com faturas existentes é permitido e só vale para faturas futuras (registrado em log de domínio; a F1-03 aplica).
- `archiveAccount(userId, id)`: marca `isArchived = true`; permitido com saldo diferente de zero, retornando `warnings: ['ARCHIVED_WITH_BALANCE']`; conta arquivada some das listas padrão e não aceita novos lançamentos (exceto `ADJUSTMENT`). `unarchiveAccount`. **Não existe exclusão física** de conta com lançamentos (`ACCOUNT_HAS_TRANSACTIONS`); conta recém-criada sem lançamentos além do saldo inicial pode ser excluída (`deleteAccount`) para desfazer erro de cadastro.
- `listAccounts(userId, { includeArchived })`: devolve cada conta com sua posição do ledger: `{ id, name, type, issuerKey, networkKey, colorKey, icon, overdraftLimit, creditLimit, closingDay, dueDay, isArchived, balance: { cleared, pending, planned, current, projected }, usage: { kind, limit, used, available, excess } }`, ordenada por `sortOrder` e depois nome. Totais por tipo (somente leitura): `totals: { cash, investments, cardDebt }` onde `cash = Σ current` de `CHECKING|SAVINGS|WALLET|BUSINESS`.
- `getAccount(userId, id)`.
- `reorderAccounts(userId, ids[])` atualiza `sortOrder`.

### Rotas finas
`GET/POST /api/accounts`, `GET/PATCH/DELETE /api/accounts/[id]`, `POST /api/accounts/[id]/archive`, `POST /api/accounts/[id]/unarchive`, `POST /api/accounts/reorder`. `requireAuth()` -> Zod -> use-case. Erros de domínio com `{ error, code }` (400/404/409).

### Tela mínima `src/app/(app)/mais/contas/page.tsx` (+ `[id]` opcional)
- Lista em `GlassCard` com `BrandIcon`, nome, tipo, `AmountText` do saldo atual (tom automático), linha secundária com pendente/previsto quando existirem e **barra de uso do limite** para `CHECKING`/`BUSINESS`/`CREDIT_CARD` (`ProgressBar` com `--fc-pend` até 80% e `--fc-out` acima; texto "Usando R$ X do cheque especial (limite R$ Y)"; excedente destacado em `--fc-out`).
- Botão "Nova conta" abre `Sheet` com formulário (campos conforme tipo; `MoneyField` para saldo inicial/limites; seletor de emissor com `BrandPicker`).
- Ações por conta: editar, arquivar/desarquivar. Link "Mais" -> "Contas" habilitado na página `/mais` (F0-05 deixou como desabilitado).
- Estado vazio com CTA "Criar primeira conta". Sem gráficos.

## Regras de negócio
- RN-01: Saldo inicial é lançamento `ADJUSTMENT`, nunca coluna; o saldo da conta vem sempre do ledger (ADR-019).
- RN-02: Nome único por usuário (case-insensitive, normalizado com trim).
- RN-03: Campos de cartão (`creditLimit`, `closingDay`, `dueDay`) só em `CREDIT_CARD` e obrigatórios nele; `overdraftLimit` só em `CHECKING`/`BUSINESS`.
- RN-04: Conta com lançamentos não é excluída, apenas arquivada; arquivada não recebe lançamentos (exceto `ADJUSTMENT`).
- RN-05: `type` é imutável após haver lançamentos além do saldo inicial.
- RN-06: Uso do limite é calculado pelo ledger (`limitUsage`); a API apenas repassa. Excedente do limite é informado, não bloqueia (RN-04 da F1-01).
- RN-07: A conta `BUSINESS` (PJ) fica fora do cálculo de "caixa pessoal" quando solicitado (`excludeBusiness` em totais), mas é uma conta como as outras no ledger.
- RN-08: Toda consulta filtra por `userId`; ids de outro usuário retornam 404.

## Critérios de aceitação
- [ ] CA-01: `POST /api/accounts` com `type=CHECKING`, `name="Conta Exemplo"`, `overdraftLimit=100000`, `openingBalance=-20000` cria a conta, uma linha `AccountBalance` com `balance_cleared = -20000` e **um** lançamento `ADJUSTMENT` de -20000 `CLEARED`; `GET /api/accounts` devolve `usage = { kind:'OVERDRAFT', limit:100000, used:20000, available:80000, excess:0 }`.
- [ ] CA-02: `type=CREDIT_CARD` sem `creditLimit`, sem `closingDay` ou com `dueDay=32` retorna 400 com mensagens por campo; `type=CHECKING` com `creditLimit` retorna 400.
- [ ] CA-03: `issuerKey="inexistente"` retorna 400; `issuerKey` válido do registry é aceito.
- [ ] CA-04: Criar duas contas com nomes "Conta Exemplo" e "conta exemplo " retorna 409 `ACCOUNT_NAME_TAKEN` na segunda.
- [ ] CA-05: Arquivar conta com saldo != 0 devolve `warnings: ['ARCHIVED_WITH_BALANCE']`; a conta some de `GET /api/accounts` e aparece com `includeArchived=true`; `POST /api/transactions` nela (não `ADJUSTMENT`) retorna erro `LEDGER_ACCOUNT_ARCHIVED`.
- [ ] CA-06: `DELETE` de conta com lançamentos além do saldo inicial retorna 409 `ACCOUNT_HAS_TRANSACTIONS`; `DELETE` de conta recém-criada com só o saldo inicial remove conta, saldo e `ADJUSTMENT` na mesma transação.
- [ ] CA-07: `PATCH` trocando `type` de uma conta com lançamentos retorna 409 `ACCOUNT_TYPE_LOCKED`.
- [ ] CA-08: Após uma transferência de R$ 100,00 da conta A para B (F1-01), `GET /api/accounts` mostra A com -10000 e B com +10000 em `balance.current`, e `totals.cash` inalterado.
- [ ] CA-09: Acesso a conta de outro usuário (id existente) retorna 404; sem sessão retorna 401.
- [ ] CA-10: Tela `/mais/contas` em 390x844 lista as contas com saldo e barra de uso do limite; criar conta de cartão e conta corrente pelo sheet funciona; nenhuma cor literal (guard verde); alvos de toque >= 44px.
- [ ] CA-11: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.

## Impacto técnico
### Backend
Novo `src/server/modules/accounts/{domain,application,infra,http}`: `domain/validation.ts` (regras por tipo, puras), `application/*.ts` (use-cases acima), `infra/prisma-account-repository.ts`, `http/schemas.ts`. Rotas em `src/app/api/accounts/**`. Consome `ledger/application` (criação do `ADJUSTMENT`, `getAccountPosition`).
### Frontend
`src/app/(app)/mais/contas/page.tsx`, `account-sheet.tsx`, `account-card.tsx` (reescritos com `src/components/fc/*`); habilitar o item "Contas" em `src/app/(app)/mais/page.tsx`.
### Banco de dados
Sem migration. Usa `accounts` e `account_balances`; `@@unique([userId, name])` do schema é sensível a caixa — por isso a normalização (trim + comparação case-insensitive) fica no use-case, consultando antes de gravar.
### Integrações
`src/lib/brands/registry.ts` para validar chaves.
### Segurança
`requireAuth()` em todas as rotas; Zod em toda entrada; isolamento por `userId`; nenhum valor real nos testes e nenhum dado real em exemplos (nomes genéricos "Conta Exemplo", "Cartão Exemplo").

## Plano de implementação
- [ ] Etapa 1 — Ler `docs/product/especificacao-fc2.md` §2/§6, o módulo `ledger` (F1-01), `registry.ts` de marcas e as rotas 1.x via `git show fc-1.x-final:src/app/api/accounts/route.ts`.
- [ ] Etapa 2 — `domain/validation.ts` + testes (matriz tipo x campos).
- [ ] Etapa 3 — Repositório e use-cases (`createAccount` com `ADJUSTMENT` na mesma transação; reutilizar o repositório do ledger passando o cliente transacional).
- [ ] Etapa 4 — `http/schemas.ts` + rotas.
- [ ] Etapa 5 — Tela `mais/contas` com primitivos `fc/*`; habilitar o item em `/mais`.
- [ ] Etapa 6 — Testes de integração (`DATABASE_URL_TEST`) e verificação manual (CA-10).
- [ ] Etapa 7 — Docs `docs/domain/accounts.md`, `docs/api/accounts.md`, `.agents/context/CONTEXT.md`, `PLANS.md`; commit `feat(f1-accounts): contas, saldo real e uso do limite`.

## Estratégia de testes
- [ ] Unitários: `validateAccountInput`: tabela 6 tipos x campos (cartão sem limite; corrente com `closingDay`; `overdraftLimit` negativo; `dueDay` 0 e 32; `networkKey` em conta corrente; `name` vazio e com 61 caracteres; `openingBalance` não inteiro); `normalizeName`; `canChangeType(txnCount)`.
- [ ] Integração (repositório em memória): criação gera 1 `ADJUSTMENT` e `AccountBalance` coerente; criação com `openingBalance = 0` não gera lançamento; arquivar/desarquivar; excluir recém-criada; nome duplicado; ordenação `reorder`.
- [ ] Integração (banco de teste): atomicidade (falha ao gravar `ADJUSTMENT` desfaz a conta).
- [ ] E2E: não aplicável.
- [ ] Manual (390x844): criar conta corrente com cheque especial, conta PJ (`BUSINESS`) e cartão; transferir entre as duas primeiras e conferir saldos; arquivar e reabrir.

## Riscos e rollback
- **Unique sensível a caixa**: dois nomes que diferem só por caixa passam no banco; a checagem do use-case cobre, mas corrida entre duas requisições é improvável (single-user). Se necessário, índice único em expressão `lower(name)` por migration incremental (pendência).
- **Cartão com saldo inicial**: mistura dívida inicial com faturas; mantido simples, F1-03 define a importação de fatura em aberto.
- **Tela mínima** pode ser trocada por design final na F3/F6; manter componentes pequenos e sem lógica de negócio.
- Rollback: `git revert`; sem migration. Contas criadas em teste são descartáveis.

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
