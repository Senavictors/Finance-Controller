---
id: ADR-019
title: Ledger como fonte de verdade do saldo, cache AccountBalance e reconciliação
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F1-01, FC2-F1-02, FC2-F1-04, FC2-F0-02]
supersedes: []
---

# ADR-019 — Ledger como fonte de verdade do saldo, cache AccountBalance e reconciliação

## Contexto
No 1.x, `monthly-summary.ts` somava apenas as transações do mês e ignorava transferências; o usuário via um saldo que não batia com o banco e deixou de confiar. O perfil do dono inclui conta corrente com cheque especial (saldo negativo é cenário normal), conta PJ separada com transferências PJ→PF, cartões e transações futuras. O princípio 5 da spec é "número que não mente": saldo do ledger = saldo do banco.

## Decisão
1. **Fonte de verdade**: o saldo de uma conta é a **soma dos lançamentos** (`Transaction.amountCents`, inteiro com sinal: entrada positiva, saída negativa) daquela conta. Nunca é um campo editado manualmente.
2. **Três saldos por conta**, derivados de `Transaction.status`:

```text
cleared(conta)  = Σ amountCents  onde status ∈ {CLEARED, RECONCILED}
pending(conta)  = Σ amountCents  onde status = PENDING
planned(conta)  = Σ amountCents  onde status = PLANNED          // só futuro, nunca entra no saldo atual
saldoAtual      = cleared + pending
usoLimite       = max(0, −saldoAtual)                            // cheque especial usado
limiteLivre     = max(0, overdraftLimit − usoLimite)
disponivel      = saldoAtual + overdraftLimit                    // pode ser < 0 se estourou o limite
```

3. **Cheque especial**: o saldo pode ser negativo até `Account.overdraftLimit`. Ultrapassar o limite **não bloqueia** o lançamento (o banco já aconteceu); gera alerta (`usoLimite > overdraftLimit`) e entra no modo Aperto (ADR-021). Juros do cheque especial são lançamentos `kind = INTEREST` (ADR-028).
4. **Cache `AccountBalance`** (`accountId` PK, `userId`, `clearedCents`, `pendingCents`, `plannedCents`, `version`, `updatedAt`): atualizado **na mesma transação de banco** que cria, edita, remove ou muda o status de um lançamento (`prisma.$transaction`, deltas aplicados com `UPDATE ... SET clearedCents = clearedCents + $delta`, atômico). Leitura de saldo usa o cache; o ledger só é somado em verificação.
5. **Transferência** como par ligado (ADR-004 mantido): duas transações `kind = TRANSFER` com `transferGroupId` comum, criadas na mesma `$transaction`. Pagamento de fatura é `kind = CARD_PAYMENT` ligado à fatura.
6. **Reconciliação** (`Reconciliation`: `id`, `userId`, `accountId`, `asOf`, `bankBalanceCents`, `ledgerBalanceCents`, `diffCents`, `adjustmentTransactionId?`): o usuário informa o saldo do banco; se `diff = bank − ledger != 0`, o sistema **grava um lançamento `kind = ADJUSTMENT`** com `amountCents = diff` (descrição "Ajuste de reconciliação"), nunca altera o saldo diretamente. Lançamentos `CLEARED` até `asOf` viram `RECONCILED` e ficam imutáveis (edição exige reabrir a reconciliação).
7. **Job de verificação** (ADR-030): recalcula `Σ amountCents` por conta e compara com `AccountBalance`; divergência > 0 é corrigida e registrada em log como incidente (`drift`).
8. **Invariantes testadas**: soma de transferências de um grupo = 0; `saldoAtual = Σ ledger` após qualquer sequência de operações (teste de propriedade com 1.000 operações aleatórias); valores sempre em centavos inteiros (ADR-002).

## Alternativas consideradas
### Alternativa A — Saldo como campo editável da conta (modelo "saldo inicial + ajustes")
- Vantagens: trivial de implementar; leitura O(1).
- Desvantagens: o saldo diverge sempre que um lançamento é apagado ou editado; sem trilha de auditoria; é exatamente a causa da desconfiança no 1.x.

### Alternativa B — Calcular o saldo somando o ledger a cada leitura (sem cache)
- Vantagens: nenhuma possibilidade de divergência de cache.
- Desvantagens: com 10 contas e dezenas de milhares de lançamentos, o primeiro render de Hoje faria 10 agregações; incompatível com a meta de 2 s em Neon com cold start.

### Alternativa C — Event sourcing completo
- Vantagens: auditoria total e reconstrução de qualquer estado.
- Desvantagens: complexidade desproporcional para um usuário; o ledger com `status` já fornece rastreabilidade suficiente.

## Consequências
### Positivas
- Saldo verificável contra o banco; ajustes ficam visíveis como lançamentos.
- Cheque especial modelado como estado normal.
- Leitura rápida via cache.

### Negativas
- Toda escrita de lançamento carrega a obrigação de atualizar o cache (centralizada em um único use-case).
- Edições de valor/conta/status exigem aplicar delta duplo (remove do antigo, soma no novo).

### Riscos
- Deriva do cache por escrita fora do use-case: proibido por convenção e coberto pelo job de verificação e por teste de arquitetura (nenhum `prisma.transaction.create` fora de `ledger/infra`).
- Contenção em linhas de `AccountBalance`: irrelevante em single-user.

## Plano de adoção
1. FC2-F0-02: tabelas `Transaction`, `AccountBalance`, `Reconciliation` no schema.
2. FC2-F1-01: `src/server/modules/ledger/domain/balance.ts` (funções puras) e `application/` (create/update/delete/transfer) com cache transacional.
3. FC2-F1-02: contas e uso do limite; FC2-F1-04: reconciliação.
4. Teste de propriedade e fixtures sintéticas em `tests/fixtures/ledger/`.

## Validação
- Reconciliação com diferença R$ 0,00 por conta no fechamento (spec §11).
- Job de verificação sem drift por 30 dias consecutivos.
- Cobertura de testes das funções de `balance.ts` >= 95%.

## Revisão
Ao introduzir Open Finance (F7-01), pois saldos do provedor passam a ser outra fonte a reconciliar.
