---
id: ADR-020
title: Recorrências como série RRULE com lançamentos PLANNED e matching
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F3-01, FC2-F4-04, FC2-F3-02, FC2-F0-02]
supersedes: [ADR-006]
---

# ADR-020 — Recorrências como série RRULE com lançamentos PLANNED e matching

## Contexto
O ADR-006 (1.x) definiu recorrência como regra aplicada manualmente por um botão "Aplicar", com bug conhecido nos dias 29/30/31. O resultado é futuro incompleto: sem previsão confiável não há "vence em breve", nem caixa do fim do ciclo (ADR-021). A spec diz "o futuro é dado": recorrências, parcelas, faturas e renda são lançamentos previstos que casam com os reais. O perfil inclui débitos automáticos, assinaturas (inclusive em USD), parcelas de consignado, DAS e renda mensal.

## Decisão
1. **Série** (`RecurringSeries`): `kind` (BILL | SUBSCRIPTION | INCOME | TRANSFER | LOAN_INSTALLMENT | TAX), `rrule` no formato **RFC 5545** (ex.: `FREQ=MONTHLY;BYMONTHDAY=5`), `dtstart`, `until?`, `count?`, `amountCents`, `amountTolerancePct` (default 10), `dateToleranceDays` (default 3), `autoConfirm`, `accountId`, `categoryId`, `merchantId?`, `materializedUntil`. Biblioteca: `rrule` (npm), encapsulada em `recurring/domain/expand.ts`.
2. **Materialização**: o job diário (ADR-030) e a abertura do app geram ocorrências **PLANNED** (`Transaction.status = PLANNED`, `seriesId`, `plannedFor` = data da ocorrência) até **hoje + 90 dias**, atualizando `materializedUntil`. Idempotência por chave única `(seriesId, occurrenceDate)`.
3. **Dias inexistentes**: `BYMONTHDAY=31` em mês de 30 dias cai no **último dia do mês** (usar `BYMONTHDAY=-1` semanticamente; o 29/30/31 do 1.x é corrigido por testes de fronteira: fevereiro bissexto e não bissexto, 31 em abril). Dia útil opcional (`rollToBusinessDay`: avançar para o próximo dia útil se cair em fim de semana ou feriado).
4. **Matching**: quando entra uma transação real (captura, importação, bot) em uma conta, procura PLANNED candidatos com `série.accountId` igual, `|valor − previsto| <= amountTolerancePct` e `|data − plannedFor| <= dateToleranceDays`, ranqueados por similaridade de merchant e proximidade. Resultado:
   - 1 candidato com score >= 0,8: **MATCHED**: a transação real passa a ser a ocorrência (`seriesId` herdado) e a PLANNED é removida na mesma `$transaction`; se `autoConfirm`, `review = REVIEWED`.
   - 2 ou mais candidatos com score próximo (diferença < 0,1): **ambíguo**, vai para o Inbox com as opções.
   - Nenhum: lançamento avulso.
5. **OUTSTANDING**: PLANNED com `plannedFor < hoje − dateToleranceDays` e sem match vira estado derivado `OUTSTANDING` (atrasado). Continua contando no caixa (ADR-021: "inclui atrasadas"), aparece destacado em "Vence em breve" e dispara o agente Vigia (F5-05). O usuário pode: marcar como pago (cria o real), adiar, ou pular a ocorrência (exceção `EXDATE` na série).
6. **Edição de série**: "só esta", "esta e as seguintes" (divide a série: encerra a atual com `until` e cria nova) e "todas". Alterar o valor atualiza apenas PLANNED futuras.
7. **Renda e DAS** usam o mesmo mecanismo (ADR-029); parcelas de empréstimo geram `LOAN_INSTALLMENT` a partir do `Loan` (ADR-028).

## Alternativas consideradas
### Alternativa A — Manter aplicação manual (ADR-006)
- Vantagens: sem job; usuário controla.
- Desvantagens: é a causa do futuro incompleto; depende de lembrar; bug de dias.

### Alternativa B — Expandir ocorrências em memória sem persistir (virtuais)
- Vantagens: sem linhas PLANNED para limpar; mudança de série reflete na hora.
- Desvantagens: matching e OUTSTANDING precisam de identidade estável por ocorrência; consultas de caixa teriam que expandir em runtime a cada leitura; não dá para anotar uma ocorrência individual.

### Alternativa C — Cron expression própria em vez de RRULE
- Vantagens: simples.
- Desvantagens: não cobre "último dia do mês", exceções, `INTERVAL`; reinventa padrão.

## Consequências
### Positivas
- Caixa futuro completo sem ação manual.
- Atrasos detectados automaticamente.
- Idempotência e regras de data testáveis em funções puras.

### Negativas
- Linhas PLANNED em tabela de lançamentos exigem filtrar por `status` em todas as consultas de saldo e relatórios (ADR-019 já exclui PLANNED do saldo).
- Matching com heurística pode errar; mitigado pelo Inbox.

### Riscos
- Série com valor variável (conta de luz): tolerância e `amountCents` como estimativa (média das 3 últimas); revisão no Inbox.
- Fuso: datas de calendário ao meio-dia UTC (ADR-002).

## Plano de adoção
1. FC2-F0-02: tabela `RecurringSeries` e índice único `(seriesId, plannedFor)`.
2. FC2-F3-01: `recurring/domain/{expand,match}.ts` com testes de fronteira, `application/materialize.ts` e rota `/api/cron/materialize-recurring`.
3. FC2-F4-04: matching importado × previsto reutilizando `match.ts`.

## Validação
- Testes: 29/30/31 em todos os meses, ano bissexto, mudança de horário (UTC-3 sem DST, mas datas ao meio-dia UTC).
- Rodar o job duas vezes seguidas não cria duplicatas.
- Taxa de matching automático >= 90% das recorrências conhecidas após 2 ciclos de uso.

## Revisão
Após 2 ciclos reais ou se a heurística gerar > 10% de ambiguidades.
