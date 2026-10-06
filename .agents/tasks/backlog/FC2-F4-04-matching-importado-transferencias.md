---
id: FC2-F4-04
title: Matching importado × previsto/manual + transferência entre contas
status: backlog
type: feature
phase: F4
wave: 2
owner: dominio-financeiro
depends_on: [FC2-F3-01, FC2-F4-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [imports, recurring, ledger, cards]
related_use_cases: []
related_adrs: [ADR-020, ADR-023, ADR-024, ADR-004, ADR-019]
---

# FC2-F4-04 — Matching importado × previsto/manual + transferência entre contas

## Contexto
Com a importação (F4-01) o mesmo fato financeiro pode existir em até três formas: (a) lançamento **PLANNED** gerado por série recorrente (F3-01), (b) lançamento **manual** feito pelo usuário via quick-add, (c) linha **importada** do extrato. Sem casar as três, o usuário vê duplicatas e o saldo/"livre" conta o mesmo valor duas vezes. Além disso, uma transferência entre contas do próprio usuário aparece como duas linhas (saída num extrato, entrada em outro) que devem virar **par ligado** (ADR-004), e não como despesa + receita.

## Problema
- Importar "DA EMPRESA EXEMPLO -89,90" com uma PLANNED de 89,90 do mesmo dia cria um segundo lançamento e deixa a PLANNED como atrasada.
- Lançar "mercado 120" na hora e depois importar o extrato duplica a compra.
- Mover R$ 500 da conta PJ para a PF aparece como despesa na PJ e receita na PF, inflando renda e gasto.

## Objetivo
1. Casar linhas importadas com PLANNED e com lançamentos manuais usando **a mesma chave de matching da F3-01** (sem reimplementar).
2. Detectar transferências entre contas próprias (mesmo valor, sinais opostos, ±1 dia, contas diferentes do usuário) e ligá-las como par.
3. Aplicar **marcadores**: transferência pessoal, pagamento de fatura, ignorar no orçamento.
4. Respeitar `userLocked` (ADR-024) em qualquer fusão.

## Fora de escopo
- Matching entre série recorrente e fatura de cartão além do pagamento de fatura (a fatura em si é F1-03).
- UI (F4-05 mostra candidatos e permite desfazer/forçar).
- Open Finance (F7-01 reaproveita este módulo).
- Detectar nomes do titular para inferir "transferência para si mesmo" (só valor/data/conta).

## Comportamento atual
- F3-01 entrega o engine de matching **transação nova × PLANNED**: função pura `matchPlanned(incoming, candidates, opts): MatchDecision` em `src/server/modules/recurring/domain/match-planned.ts` (candidatos = PLANNED do mesmo usuário e conta; pontuação por data, valor com tolerância e similaridade de merchant; decisão `MATCHED` com score ≥ 0.75 e margem ≥ 0.15, `AMBIGUOUS`, `NO_MATCH`) e o use-case `applyMatch(incomingId, plannedId)` em `recurring/application/apply-match.ts` (a PLANNED vira `CLEARED` com os dados reais e a transação recém-criada é removida). Colunas aditivas da F3-01 em `Transaction`: `matchedTransactionId`, `matchedAt`, `matchCandidates Json?`. `OUTSTANDING` é derivado (PLANNED vencida além da tolerância). Na criação via `createFromDraft` o matching roda pelo gancho `registerAfterCreate` da F2-03; **o pipeline de importação não passa por esse gancho** e precisa chamar o engine explicitamente (esta task).
- F4-01 grava toda linha nova como `Transaction` `NEEDS_REVIEW` sem tentar casar nada.
- F1-01 oferece o use-case de transferência como par ligado (ADR-004) em `src/server/modules/ledger/application/`.
- F1-03 oferece o pagamento de fatura de cartão em `src/server/modules/cards/application/`.

## Comportamento esperado
Novo passo no pipeline da F4-01, depois do dedupe e do enriquecimento e **antes** de gravar:

```text
linhas novas (enriquecidas)
  → matchAgainstPlanned()        usa o engine da F3-01 (importado vs PLANNED)
  → matchAgainstManual()         lançamento manual sem importHash na mesma conta
  → detectTransfers()            entre linhas do lote e transações já existentes
  → applyMarkers()               pagamento de fatura, transferência pessoal, ignorar no orçamento
  → persist                      fusões e criações numa única $transaction
```

### 1. Importado × PLANNED
Chamar `matchPlanned` da F3-01 sem copiar sua lógica (se a assinatura não servir, adaptador fino em `imports/domain/match-adapter.ts`, registrado em "Divergências"). Como o `applyMatch` da F3-01 parte de uma transação já criada, o fluxo é: criar a linha importada pelo ledger, chamar `applyMatch` (a PLANNED sobrevive e a nova é removida) e, em seguida, **copiar para a PLANNED sobrevivente** `importHash`, `importBatchId` e `rawDescription` (estender `applyMatch` com um parâmetro opcional `carry`, coordenando com a F3-01), tudo na mesma `$transaction`. Resultado por linha, usando `MatchDecision`:
- **MATCHED**: a PLANNED é **atualizada** com os dados reais (`status = CLEARED`, `date`, `amountCents`, `rawDescription`, `importHash`, `importBatchId`, `source` continua `RECURRING`), e nenhuma transação nova é criada. `review` = `NEEDS_REVIEW` se o valor difere da prevista além da tolerância, senão `REVIEWED` quando a série tem `autoConfirm`.
- **AMBIGUOUS**: criar a transação importada `NEEDS_REVIEW` gravando em `matchCandidates` (coluna da F3-01) os ids das PLANNED candidatas para o Inbox decidir.
- **NO_MATCH**: transação nova normal.

### 2. Importado × manual
Candidata = transação do mesmo usuário e conta, `importHash IS NULL`, `source` em (`MANUAL`, `QUICKADD`, `BOT`), `status` ≠ `PLANNED`, data dentro de ±2 dias, **valor idêntico** em centavos. Pontuação: `0.5` (valor) + `0.3 * (1 - |Δdias|/3)` + `0.2 * similaridade` onde similaridade = Jaccard de tokens entre `merchantKey` normalizados (F4-03) da manual e da importada. Limiar de fusão automática: ≥ 0.8 **e** candidato único. Entre 0.5 e 0.8 ou ≥ 2 candidatos: não funde, grava a importada com `matchCandidates` para o Inbox.
Fusão: mantém tudo que o usuário digitou (categoria, tags, nota, merchant, `userLocked`), preenche o que falta com o importado (`rawDescription`, `importHash`, `importBatchId`), `status = CLEARED`, `source` permanece o original e registra `matchedFromImport = true` em `metadata`. Campos em `userLocked` nunca são sobrescritos (ex.: se o usuário travou `amountCents`, a diferença vira aviso e a importada é gravada à parte em vez de fundida).

### 2b. Parcela importada × compra parcelada já registrada
Linha de fatura com `hints.installment` (por exemplo parcela 3 de 10) em conta de cartão casa com a `CardInstallment` existente (compra parcelada lançada antes pelo quick-add) quando: mesma conta, mesmo número de parcela, valor idêntico em centavos e `statementKey` igual à da fatura importada. O casamento marca o lançamento da parcela com `importHash`/`importBatchId`/`rawDescription` e **não** cria compra nova. Sem casamento: lançamento avulso na fatura (F4-02, RN-12).

### 3. Transferência entre contas próprias
Duas transações formam par quando: contas diferentes **ambas do usuário**; `amountCents` de uma = `−amountCents` da outra; `|Δdata| ≤ 1 dia`; nenhuma das duas já pertence a um par; não são `CARD_PAYMENT`. Fontes de candidatos: (i) as duas linhas no mesmo lote (extrato de uma conta com as duas pontas, caso raro), (ii) uma linha do lote + transação já existente na outra conta (caso comum: importa o extrato da conta B depois do da conta A). Ligação: o `createTransfer` da F1-01 cria pernas **novas**; para ligar duas transações **já existentes** é preciso um use-case irmão `linkAsTransfer(legAId, legBId)` em `src/server/modules/ledger/application/link-transfer.ts` (criar aqui se a F1-01 não o tiver): atribui o mesmo `transferId` (UUID) às duas pernas, `kind = TRANSFER`, respeita `@@unique([transferId, accountId])`, `AccountBalance` não muda (valores e contas iguais) e roda numa `$transaction`; recusa pernas `RECONCILED` ou que já sejam de outro par.
Auto-ligar só quando o par é **único** (cada ponta tem exatamente um candidato); caso contrário grava as linhas e anexa `transferCandidates` para o Inbox. Dica extra de confiança (não obrigatória): descrição contendo `PIX TRANSF`, `TED`, `TRANSF` ou o nome de uma das contas do usuário aumenta a confiança de ambíguo para auto-ligar quando só há um par válido por valor.

### 4. Marcadores
Enum `ImportMarker`: `PERSONAL_TRANSFER`, `CARD_PAYMENT`, `IGNORE_BUDGET`. Efeitos:

| Marcador | Efeito no lançamento | Quando é aplicado automaticamente |
|---|---|---|
| `CARD_PAYMENT` | `kind = CARD_PAYMENT`, `excludeFromBudget = true`; liga ao pagamento da fatura (F1-03): se já há pagamento registrado no app (mesmo valor, ±3 dias, mesma conta pagadora), funde; senão cria o pagamento via use-case da F1-03; se ainda não existe fatura/conta de cartão correspondente, cria como `EXPENSE` com `excludeFromBudget = true` e tag `fatura-pendente` para ligar depois no Inbox | `hints.kind = CARD_PAYMENT` do parser e descrição `FATURA PAGA`/`Pagamento de fatura` |
| `PERSONAL_TRANSFER` | mantém `EXPENSE`/`INCOME`, categoria de sistema "Transferências pessoais" (criada na F1-07; se faltar, usar a mais próxima e registrar divergência), tag `pessoal`; **entra** no Flex salvo se o usuário também marcar `IGNORE_BUDGET` | `hints.counterpartyType = PERSON` em Pix |
| `IGNORE_BUDGET` | `excludeFromBudget = true` | `hints.marker = DEBT_DISBURSEMENT` (resgate de empréstimo) e `PIX_CREDIT` do lado de crédito: não são renda nem despesa do orçamento; manual pelo usuário |

Marcadores podem ser aplicados também pelo usuário no Inbox (F4-05) via `applyMarker(transactionId, marker)`.

## Regras de negócio
- RN-01: A chave e o limiar de matching contra PLANNED vêm **exclusivamente** da F3-01; esta task não define uma segunda chave.
- RN-02: `userLocked` (ADR-024) nunca é sobrescrito por fusão, matching ou marcador; conflito vira `warning` `LOCKED_FIELD_CONFLICT` e a linha importada é gravada separada (`NEEDS_REVIEW`).
- RN-03: Fusão automática só com candidato **único** e pontuação ≥ 0.8; qualquer ambiguidade vai ao Inbox. Nunca fundir transações de contas diferentes (exceto como par de transferência).
- RN-04: Fusão é idempotente: reimportar o arquivo não cria nada (dedupe por `importHash` da F4-01) e não refunde (a fundida já tem `importHash`).
- RN-05: Par de transferência exige valor **exato** e sinais opostos; tolerância de ±1 dia em data (fusos e compensação). Taxas (TED com tarifa) ficam como lançamento `FEE` separado, fora do par.
- RN-06: Toda mutação passa por use-cases do ledger/cartões (ADR-025/019): `AccountBalance` coerente após fusão; nada de `prisma.transaction.update` direto para valores.
- RN-07: O lote registra contagens adicionais em `ImportBatch`: `matchedCount` (já existe na F0-02: fundidas com PLANNED), e novas `mergedManualCount`, `transferPairCount`, `ambiguousCount` (`Int @default(0)`).
- RN-08: `matchCandidates` (coluna da F3-01) e `transferCandidates` (nova, `Json?`) guardam apenas ids; são limpas quando o usuário resolve no Inbox.
- RN-09: Desfazer o lote (`undo`, F4-01) também desfaz fusões: transações que foram fundidas voltam ao estado anterior (PLANNED volta a PLANNED; manual perde `importHash`); pares criados pelo lote são desfeitos. Para isso o lote guarda `mergeLog Json` (ids e valores anteriores, sem descrição).
- RN-10: O pagamento de fatura casado não pode gerar dupla contagem no caixa: a despesa do cartão já está nas compras; o débito na conta é `CARD_PAYMENT` e fica fora do orçamento.

## Critérios de aceitação
- [ ] CA-01: Importar linha idêntica a uma PLANNED recorrente do mesmo dia atualiza a PLANNED (`CLEARED`, `importHash` preenchido) e não cria transação nova; contagem `matchedCount = 1`.
- [ ] CA-02: Duas PLANNED igualmente plausíveis para a mesma linha resultam em transação importada `NEEDS_REVIEW` com `matchCandidates` contendo os dois ids.
- [ ] CA-03: Manual "mercado 120" (hoje) + importada de R$ 120,00 com descrição similar, mesma conta, ±1 dia, funde preservando categoria e tags do usuário.
- [ ] CA-04: Manual com `userLocked: { amountCents: true }` e valor diferente da importada não é alterada; grava a importada à parte com aviso.
- [ ] CA-05: Saída de R$ 500,00 na conta A e entrada de R$ 500,00 na conta B (datas com 1 dia de diferença) viram um par ligado (`kind = TRANSFER`), sem despesa nem receita no orçamento; saldos das duas contas coerentes.
- [ ] CA-06: Entrada de R$ 500,00 na conta A com duas saídas de R$ 500,00 candidatas na conta B não é ligada; vai ao Inbox com `transferCandidates`.
- [ ] CA-07: Linha com `hints.kind = CARD_PAYMENT` vira `CARD_PAYMENT`, `excludeFromBudget = true` e se vincula/gera o pagamento da fatura pelo use-case da F1-03.
- [ ] CA-08: `PIX_CREDIT` / `DEBT_DISBURSEMENT` de crédito ficam `excludeFromBudget = true` e não entram como renda.
- [ ] CA-09: Pix para pessoa recebe `PERSONAL_TRANSFER` (categoria e tag), continua no Flex.
- [ ] CA-10: Undo do lote restaura PLANNED, manuais e desfaz pares criados.
- [ ] CA-11: Reimportar o mesmo arquivo após as fusões é no-op (nenhuma alteração no banco).
- [ ] CA-12: `npm run lint`, `npm test`, `npx next build` passam; domínio com ≥ 90% de cobertura.

## Impacto técnico
### Backend
Criar:
- `src/server/modules/imports/domain/match-adapter.ts` (ponte para o engine da F3-01)
- `src/server/modules/imports/domain/match-manual.ts` (pontuação e limiar) + teste
- `src/server/modules/imports/domain/detect-transfers.ts` (pareamento puro) + teste
- `src/server/modules/imports/domain/markers.ts` (regras de marcador) + teste
- `src/server/modules/imports/application/reconcile-import.ts` (orquestra os 4 passos; chamado por `commit-import.ts`)
- `src/server/modules/imports/application/apply-marker.ts`, `resolve-match.ts` (para o Inbox: confirmar candidato via `applyMatch`, ligar par via `linkAsTransfer`, rejeitar; o `unmatch` previsto na F3-01 é exposto aqui para a F4-05)
- `src/server/modules/ledger/application/link-transfer.ts` (se a F1-01 não tiver)
- `src/app/api/transactions/[id]/marker/route.ts` (POST), `src/app/api/transactions/[id]/resolve-match/route.ts` (POST) — finos, Zod.
- Alterar `commit-import.ts` (F4-01) para chamar `reconcileImport` e acumular as novas contagens, e `undo-import.ts` para usar `mergeLog`.

Reaproveitar: engine de matching e série da F3-01; use-case de par ligado da F1-01; pagamento de fatura da F1-03; normalização de merchant da F4-03 (`similaridade`).

### Frontend
Nenhum (F4-05).

### Banco de dados
Migration `add_import_reconciliation`: `ImportBatch.mergedManualCount`, `transferPairCount`, `ambiguousCount` (Int default 0) e `ImportBatch.mergeLog Json?` (`matchedCount` já existe); `Transaction.transferCandidates Json?` (e `matchCandidates` se a F3-01 ainda não criou). `ImportMarker` **sem** enum persistido: o marcador é um comando e o efeito é gravado nos campos existentes (`kind`, `excludeFromBudget`, `tags`, `categoryId`).

### Integrações
Nenhuma.

### Segurança
Todas as consultas por `userId`; ambas as pontas do par devem pertencer ao mesmo usuário; metadados guardam ids, não descrições.

## Plano de implementação
- [ ] 1. Ler o engine de matching da F3-01 (`src/server/modules/recurring/domain/`), o use-case de par ligado (F1-01), o pagamento de fatura (F1-03), `commit-import.ts` e `undo-import.ts` (F4-01).
- [ ] 2. Implementar `detect-transfers.ts` e `match-manual.ts` com TDD (funções puras).
- [ ] 3. Implementar `match-adapter.ts` sobre a F3-01 + teste com os casos MATCHED/ambíguo/sem candidato.
- [ ] 4. Implementar `markers.ts` e `apply-marker.ts`.
- [ ] 5. Migration (via `dados-prisma`) e `mergeLog`.
- [ ] 6. `reconcile-import.ts` + integração em `commit-import.ts` e `undo-import.ts`.
- [ ] 7. Rotas `marker` e `resolve-match`.
- [ ] 8. Testes de integração com Prisma (cenários dos CA).
- [ ] 9. Documentar em `docs/domain/matching-e-transferencias.md`; atualizar `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários:
  - Transferência: A −50000 em 2026-09-10 e B +50000 em 2026-09-11 → par; B em 2026-09-12 → não; valores 50000 vs 50001 → não; mesma conta → não; uma já pareada → não; duas candidatas → ambíguo; tolerância exatamente 1 dia → par.
  - Manual: valor igual, mesmo dia, descrições iguais → score 1.0; valor igual, 2 dias, descrição sem relação → 0.5 + 0.1 + 0 = 0.6 (não funde); duas manuais iguais → não funde; manual `PLANNED` nunca é candidata; manual de outra conta nunca.
  - Marcadores: tabela hints → efeitos; `IGNORE_BUDGET` não remove categoria; marcador manual sobre transação com `userLocked.excludeFromBudget` não altera.
  - Edge: virada de mês (30/09 vs 01/10); valor zero; lote com 3 pares possíveis; mesma linha candidata a transferência e a PLANNED (PLANNED de transferência da série tem prioridade e gera o par com a série).
- [ ] Integração: CA-01 a CA-11 com banco; undo restaura; concorrência: duas importações simultâneas não fundem a mesma PLANNED duas vezes (lock por `SELECT ... FOR UPDATE` ou update condicional por `status = PLANNED`).
- [ ] E2E: n/a.
- [ ] Manual: importar duas contas sintéticas com uma transferência e uma recorrência, conferir saldos e Inbox.

## Riscos e rollback
- **Falso positivo de fusão** (valor igual em compras diferentes): mitigado por limiar 0.8, candidato único, ±2 dias e log de fusão com undo.
- **Falso par de transferência** (valores redondos coincidentes, ex.: R$ 100,00 em contas diferentes): só auto-liga quando único; senão Inbox.
- **Dependência da F3-01**: se a API do engine mudar, o adaptador isola a mudança.
- **Dupla contagem de fatura** (compra no cartão + débito do pagamento): coberta por RN-10 e CA-07.
- Rollback: feature flag simples `IMPORT_RECONCILE_ENABLED` (default true) no `commit-import.ts`; desligada, volta ao comportamento da F4-01. Migration só adiciona colunas.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff
