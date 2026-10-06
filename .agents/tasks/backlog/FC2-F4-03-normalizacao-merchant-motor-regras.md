---
id: FC2-F4-03
title: Limpeza de descrição bancária + motor de regras
status: backlog
type: feature
phase: F4
wave: 1
owner: dominio-financeiro
depends_on: [FC2-F2-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [merchants, rules, imports, ledger]
related_use_cases: []
related_adrs: [ADR-024, ADR-023, ADR-002]
---

# FC2-F4-03 — Limpeza de descrição bancária + motor de regras

## Contexto
Descrições bancárias são sujas: `PAG*IFOOD SAO PAULO BR`, `MP*MERCADOLIVRE 03/10`, `DL*GOOGLE YOUTUBE`, `PAY UBER TRIP 12/09`. Para categorizar sem toque (meta de 80%, spec §11) e para o Inbox mostrar nomes limpos, é preciso (1) reduzir a descrição a um **merchant canônico** e (2) aplicar **regras** do usuário e aprendidas. A F2-02 criou a memória de merchant (alias, categoria padrão, últimas 3 categorias, natureza Must/Need/Want). Esta task estende com normalização de texto bruto e com o motor de regras (ADR-024: categorização em camadas com override do usuário).

## Problema
Sem normalização, "PAG*IFOOD" e "IFOOD *RESTAURANTE" viram merchants diferentes e a memória não aprende. Sem regras explícitas o usuário não tem como dizer "tudo que contém SABESP é Contas fixas" nem corrigir o sistema de forma permanente. Sem preview, criar uma regra é um tiro no escuro.

## Objetivo
1. Função pura `cleanBankDescription(raw)` (nova, em `merchants/domain/clean-bank-description.ts`) que remove prefixos de adquirente/gateway, sufixos de cidade/UF, datas, domínios e numeração de parcela e devolve `{ key, display, stripped }`.
2. Motor de regras puro com estágios **pre / default / post**, prioridade, origem **USER / LEARNED**, condições e ações validadas por Zod.
3. **Preview retroativo** ("esta regra afeta N lançamentos") e aplicação retroativa opcional.
4. **Regra aprendida** quando o usuário corrige 2 de 3 vezes a mesma categoria para um merchant.
5. Integração como `Enricher` do pipeline da F4-01.

## Fora de escopo
- Categorização por LLM (F5-03; entra como camada abaixo das regras e da memória).
- Telas de gestão de regras (aparecem no Inbox/F4-05 como "criar regra" e em Mais > Regras na F6; aqui só API e domínio).
- Matching com PLANNED e transferências (F4-04).

## Comportamento atual
Após F2-02: `src/server/modules/merchants/` tem `normalizeMerchantKey(raw)` (`domain/normalize-merchant.ts`: minúsculas, sem acento, remove prefixos curtos de meio de pagamento como `pix`/`pag`/`*` e dígitos finais, mantém as 2 primeiras palavras significativas), o tipo `MerchantMemory` (`defaultCategoryId`, `defaultCategoryLocked`, `lastCategoryIds` até 3), `learnFromTransaction` (promove categoria padrão após 3 iguais) e o repositório; a F2-02 deixou **explicitamente para esta task** a limpeza de descrição bruta de extrato e o motor de regras. A tabela `Rule` já existe no schema 2.0 (F0-02: `name`, `stage`, `priority`, `conditions`, `actions`, `origin`, `hits`, `lastHitAt`, `isActive`; enums `RuleStage` e `RuleOrigin` prontos). `Transaction.categorySource` (enum `USER, RULE, MERCHANT, LLM, PARSER, IMPORT`) e `Transaction.userLocked` existem. A F4-01 deixou o gancho `Enricher` em `src/server/modules/imports/application/enricher.ts`.

## Comportamento esperado
### Camadas de decisão (ordem de precedência, ADR-024)
```text
1. userLocked          campo editado manualmente pelo usuário nunca é sobrescrito
2. rules PRE           ajustam o texto/flags antes de categorizar (ex.: normalizar nome)
3. rules DEFAULT USER  regras do usuário
4. rules DEFAULT LEARNED
5. memória de merchant (categoria padrão / última categoria)       [F2-02]
6. LLM few-shot                                                    [F5-03, opcional]
7. sem categoria → Inbox pede ao usuário
8. rules POST          sempre rodam no fim (tags, excludeFromBudget, markReviewed)
```
Dentro de um estágio: ordenar por `priority` crescente (menor número roda primeiro), desempate `USER` antes de `LEARNED`, depois `createdAt`. No estágio **DEFAULT** vale "primeira regra que casa vence" (para quando alguma define categoria). Nos estágios **PRE** e **POST** todas as regras que casam são aplicadas, na ordem.

### Limpeza de descrição bruta (`merchants/domain/clean-bank-description.ts`)
Não substitui `normalizeMerchantKey` da F2-02: **alimenta** essa função. Pipeline: `raw → cleanBankDescription(raw) → { cleaned, display, stripped } → merchantKey = normalizeMerchantKey(cleaned)`. Assim a chave de merchant continua sendo a da F2-02 (uma só definição de chave) e a limpeza trata apenas o ruído típico de extrato/fatura.

`cleanBankDescription(raw: string): { cleaned: string; display: string; stripped: { prefix?: string; city?: string; date?: string; installment?: string; domain?: string; trailingId?: string } }`.

Passos, nesta ordem:
1. Maiúsculas, remover acentos, trocar `*`, `_` e `-` repetidos por espaço quando forem separadores, colapsar espaços.
2. **Prefixos** (apenas no início): `PAG*`, `PAGSEGURO*`, `PG *`, `PAY ` (só se sobrar texto), `DL*`, `DLO*`, `MP*`, `MERCPAGO*`, `MERCADOPAGO*`, `EC *`, `IZ*`, `SUMUP*`, `IFD*`, `PAYPAL *`, `GOOGLE *`. Tabela configurável em `merchants/domain/merchant-prefixes.ts`.
3. **Parcela**: `PARC 03/10`, `PARCELA 3/10`, `03/10` no fim.
4. **Data** no fim: `12/05`, `12/05/2026`, `12MAI`, `12 MAI`.
5. **Domínio** no fim do nome: `.COM`, `.COM.BR`, `.BR` (`NETFLIX.COM` vira `NETFLIX`).
6. **Sufixo de cidade/UF**: lista de cidades brasileiras mais comuns + padrão `... UF` no fim (`SP`, `RJ`...) e `.CIDADE` (o `.` vindo do layout da fatura Itaú). Só remover se sobrar pelo menos 1 token significativo.
7. **ID final**: `#1234`, `*A1B2C3`, sequências de ≥ 5 dígitos isoladas no fim.
8. `cleaned` = tokens restantes unidos por espaço (máx. 60 caracteres); `display` = nome do `Merchant` conhecido (alias), senão Title Case de `cleaned`.

Não remover números que fazem parte do nome (`99 POP`, `7 ELEVEN`, `LOJA 21` permanece `LOJA 21`; a F2-02 é que descarta dígitos finais ao montar a chave). Nunca esvaziar: se um passo remover tudo, manter o resultado do passo anterior.

### Regras
Tabela `Rule` **já existe** (F0-02). Migration aditiva `add_rules_extras` (coordenar com `dados-prisma`): `Rule.rejections Int @default(0)`, `Rule.createdAt/updatedAt` (se faltarem), `Transaction.appliedRuleId String?` (FK `SetNull`, quem categorizou) e índice `@@index([userId, stage, isActive, priority])`. Campo de ativação é `isActive` (não `isActive`). Não redeclarar `RuleStage`/`RuleOrigin`.

Condições (Zod, `rules/http/schemas.ts`):
```ts
type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { field: 'merchantKey' | 'rawDescription' | 'accountId' | 'kind' | 'direction'
      op: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'in'
      value: string | string[] }
  | { field: 'amountCents'; op: 'equals' | 'gte' | 'lte' | 'between'; value: number | [number, number] }
```
Ações: `setCategory { categoryId }`, `setMerchant { merchantKey, display? }`, `setKind { kind }`, `setNature { MUST | NEED | WANT }`, `addTags { tags[] }`, `excludeFromBudget { value }`, `markReviewed {}` (confirma sozinho, sem ir ao Inbox), `setAccount`, não permitidas: alterar valor ou data.
Comparações de texto: sem acento, case-insensitive, sobre `merchantKey` e `rawDescription` normalizados. `regex`: máx. 200 caracteres, compilada com flag `i`, **rejeitar** padrões com quantificadores aninhados (`(a+)+`, `(.*)*`) via checagem simples, e executar somente em strings ≤ 300 caracteres.

### Preview retroativo
`previewRule(userId, rule)` → `{ matched: number; wouldChange: number; locked: number; sample: Array<{ id, date, description, currentCategory, newCategory }> }` (sample ≤ 20). `matched` = transações do usuário que casam; `wouldChange` = as que mudariam de categoria/flag; `locked` = as puladas por `userLocked`. A UI mostra "afeta N lançamentos" com `wouldChange`. `applyRuleRetroactively(userId, ruleId, { onlyNeedsReview })` aplica em lote (transação do Prisma, 500 por vez), respeitando `userLocked`, gravando `categorySource = RULE_USER|RULE_LEARNED` e `Rule.hits`.

### Regra aprendida (corrige 2 de 3)
Reaproveita as últimas 3 categorias do merchant (`Merchant.recentCategoryIds` no schema da F0-02, exposto como `lastCategoryIds` no `MerchantMemory` da F2-02), já mantidas por `learnFromTransaction`. Coexiste com a promoção da F2-02 (3 iguais viram `defaultCategoryId`): a regra `LEARNED` é a versão **explícita e visível** com limiar mais baixo (2 de 3), e quando as duas apontam a mesma categoria não há conflito. Quando o usuário **define ou corrige** a categoria de uma transação (edição manual ou confirmação no Inbox com troca):
1. Registrar a decisão para o `merchantKey`.
2. Se, nas últimas 3 decisões, ≥ 2 são a mesma categoria X e X difere da categoria que o sistema sugeriu na última, e **não** existe regra `USER` ativa para esse `merchantKey` → criar/atualizar regra `LEARNED`: `stage = DEFAULT`, `priority = 500`, condição `merchantKey equals K`, ação `setCategory X`, nome `Aprendida: {display}`.
3. Se já existe `LEARNED` para K com categoria diferente e a nova maioria aponta outra categoria → atualizar a categoria.
4. Retorna `learnedRule` (ou `null`) para a UI mostrar "Aprendi: {display} → {categoria}. Desfazer".
5. Quando o usuário **desfaz** uma categorização feita por regra `LEARNED`, incrementar `rejections`; ao chegar em 2, `isActive = false`. Para saber qual regra categorizou a transação, usar `Transaction.appliedRuleId`.
Regras `USER` nunca são alteradas pelo aprendizado.

## Regras de negócio
- RN-01: `cleanBankDescription` é pura, determinística e sem I/O; mesma entrada, mesma saída.
- RN-02: Regra `USER` sempre vence `LEARNED` no mesmo estágio, independentemente de `priority`.
- RN-03: `userLocked` bloqueia qualquer ação de regra no campo travado; o motor devolve a lista de campos pulados para o preview.
- RN-04: O motor é **puro** (`rules/domain/engine.ts`): recebe regras e uma `RuleInput` (descrição, `merchantKey`, valor, conta, kind, direção) e devolve `RuleOutcome { patch, appliedRuleIds, categorySource }`. Prisma só em `infra/`.
- RN-05: Regra desabilitada não casa; regra com condição inválida é rejeitada na criação (422), nunca na execução (se no banco houver JSON inválido, ignorar a regra e registrar warning).
- RN-06: Categoria de ação precisa existir e pertencer ao usuário; apagar categoria desabilita as regras que a usam.
- RN-07: Toda regra criada pelo usuário a partir do Inbox ("criar regra") nasce `USER`, `stage DEFAULT`, `priority 100`, com preview obrigatório antes de salvar (a API devolve o preview; a confirmação é do cliente).
- RN-08: Transações importadas passam por: limpar descrição e derivar `merchantKey` → PRE → memória/DEFAULT → POST. `categorySource` registra a origem pelo enum existente: `RULE` (com `appliedRuleId` apontando a regra; `Rule.origin` distingue USER de LEARNED), `MERCHANT` (default do merchant) ou `IMPORT` (sem categoria).
- RN-09: `markReviewed` só é aceito em regras `USER` (regra aprendida nunca confirma sozinha).
- RN-10: Idempotência: reaplicar a mesma regra não muda `categorySource` de transações já categorizadas por regra de prioridade maior.
- RN-11: Limite de 200 regras ativas por usuário (mensagem clara; evita custo de avaliação em lote).

## Critérios de aceitação
- [ ] CA-01: Tabela de casos de `cleanBankDescription` (abaixo) passa integralmente.
- [ ] CA-02: O motor aplica estágios na ordem pre → default → post, respeita prioridade, `USER` antes de `LEARNED` e "primeira que categoriza vence" no DEFAULT.
- [ ] CA-03: `previewRule` retorna `matched`, `wouldChange`, `locked` e `sample` corretos sobre um conjunto sintético de 10 transações, com 1 travada.
- [ ] CA-04: `applyRuleRetroactively` altera só `wouldChange` transações, nunca campos em `userLocked`, e incrementa `hits`.
- [ ] CA-05: Três correções do mesmo merchant, duas para a categoria X, criam regra `LEARNED`; com regra `USER` existente nada é criado.
- [ ] CA-06: Duas rejeições seguidas desabilitam a regra aprendida.
- [ ] CA-07: O `Enricher` da F4-01 passa a usar normalização + regras; reimportar o fixture OFX sintético categoriza as linhas com regra sem mudar o `importHash`.
- [ ] CA-08: Regex perigosa (`(a+)+$`) é rejeitada na validação; regex > 200 caracteres é rejeitada.
- [ ] CA-09: Endpoints `GET/POST /api/rules`, `PATCH/DELETE /api/rules/[id]`, `POST /api/rules/preview`, `POST /api/rules/[id]/apply` funcionam com sessão e Zod; escopo por `userId`.
- [ ] CA-10: `npm run lint`, `npm test`, `npx next build` passam; cobertura dos arquivos de `domain/` ≥ 90% de linhas.

## Impacto técnico
### Backend
Criar:
- `src/server/modules/merchants/domain/clean-bank-description.ts`, `merchant-prefixes.ts`, `clean-bank-description.test.ts` (o `normalize-merchant.ts` da F2-02 **não** é alterado)
- `src/server/modules/rules/domain/types.ts`, `conditions.ts` (avaliador), `engine.ts`, `learning.ts`, `regex-safety.ts` (+ testes)
- `src/server/modules/rules/application/create-rule.ts`, `update-rule.ts`, `delete-rule.ts`, `list-rules.ts`, `preview-rule.ts`, `apply-rule-retroactively.ts`, `record-category-decision.ts`
- `src/server/modules/rules/infra/rule-repository.ts`
- `src/server/modules/rules/http/schemas.ts`
- `src/app/api/rules/route.ts`, `src/app/api/rules/[id]/route.ts`, `src/app/api/rules/preview/route.ts`, `src/app/api/rules/[id]/apply/route.ts`
- Alterar `src/server/modules/imports/application/enricher.ts` para usar `cleanBankDescription` → `normalizeMerchantKey` (F2-02) → `runRules`.
- Alterar o use-case de edição/confirmação de transação (F2-03/F1-01) para chamar `recordCategoryDecision` quando a categoria for definida pelo usuário.

### Frontend
Nenhum aqui (F4-05 consome preview, criação e `learnedRule`).

### Banco de dados
Migration `add_rules_extras` (campos acima). Usar o enum existente `CategorySource` (`USER, RULE, MERCHANT, LLM, PARSER, IMPORT`); não criar valores novos.

### Integrações
Nenhuma.

### Segurança
Regex do usuário é vetor de ReDoS (RN, CA-08); queries sempre com `userId`; ações não alteram valor/data.

## Plano de implementação
- [ ] 1. Ler `merchants/` (F2-02), `Transaction`/`Merchant` no `schema.prisma` e `imports/application/enricher.ts` (F4-01).
- [ ] 2. TDD de `cleanBankDescription` com a tabela de casos e a tabela de prefixos.
- [ ] 3. Tipos Zod de condições/ações + avaliador de condições puro.
- [ ] 4. `engine.ts` com estágios, prioridade, origem e `userLocked`.
- [ ] 5. `learning.ts` (função pura: recebe últimas 3 decisões + regra existente, devolve ação `create|update|none`).
- [ ] 6. Migration `add_rules` (via `dados-prisma`) e repositório.
- [ ] 7. Use-cases de CRUD, preview e aplicação retroativa (lotes de 500).
- [ ] 8. Rotas finas e schemas Zod; guard de sessão.
- [ ] 9. Integrar no `Enricher` e no use-case de edição/confirmação (`recordCategoryDecision`).
- [ ] 10. Documentar em `docs/domain/regras-e-merchants.md`; atualizar `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários. Tabela de `cleanBankDescription` (entrada → `cleaned`; coluna final = `normalizeMerchantKey(cleaned)` conforme a F2-02):

| Entrada | cleaned | merchantKey |
|---|---|---|
| `PAG*IFOOD SAO PAULO BR` | `IFOOD` | `ifood` |
| `MP*MERCADOLIVRE 03/10` | `MERCADOLIVRE` | `mercadolivre` |
| `DL*GOOGLE YOUTUBE PREMIUM` | `GOOGLE YOUTUBE PREMIUM` | `google youtube` |
| `PAY UBER TRIP 12/09` | `UBER TRIP` | valor definido pela F2-02 para "Uber Trip" |
| `UBER *TRIP` | `UBER TRIP` | idem |
| `99 POP 12MAI` | `99 POP` | `99 pop` |
| `LOJA 21 CAMPINAS SP` | `LOJA 21` | `loja` |
| `MERCADO EXEMPLO .SAO PAULO` | `MERCADO EXEMPLO` | `mercado exemplo` |
| `NETFLIX.COM 05/10` | `NETFLIX` | `netflix` |
| `PARC 03/10 LOJA EXEMPLO` | `LOJA EXEMPLO` | `loja exemplo` |
| `PAG*` (só prefixo) | `PAG` (não esvaziar) | n/a |
| `SAO PAULO` (só cidade) | `SAO PAULO` (não esvaziar) | n/a |

  Motor: duas regras DEFAULT com prioridades 10 e 20 (vence a 10); USER prioridade 50 vs LEARNED prioridade 1 (vence USER); PRE altera `merchantKey` e a regra DEFAULT casa pelo novo valor; POST adiciona tag mesmo quando a categoria veio da memória; `userLocked: { categoryId: true }` impede `setCategory` mas permite `addTags`; condição `between` em valor `[10000, 50000]`; `not`; `in`.
  Aprendizado: decisões [X, X, Y] → cria X; [X, Y, Z] → nada; [Y, X, X] com LEARNED=Y → atualiza para X; USER existente → nada.
- [ ] Integração: preview e aplicação retroativa com Prisma (10 transações sintéticas, 1 travada, 2 de outro usuário que não podem ser tocadas); reimportação do fixture com `Enricher` novo.
- [ ] E2E: n/a.
- [ ] Manual: criar regra pela API, conferir preview e aplicação; ReDoS (`(a+)+$` contra `aaaaaaaaaaaaaaaaaaaaaaaa!`) rejeitado.

## Riscos e rollback
- **Super-normalização** junta merchants distintos (ex.: remover dígitos); mitigada pelos casos de borda e por manter números do nome.
- **Regra aprendida errada** muda muitas transações futuras: sempre reversível (toast desfazer, `rejections`, desabilitar) e nunca sobrescreve `USER` nem `userLocked`.
- **Aplicação retroativa em massa**: lotes pequenos, transação do Prisma, só com confirmação do preview.
- Rollback: desabilitar o `Enricher` novo volta ao comportamento da F4-01/F2-02; `Rule` é tabela nova (drop seguro).

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff
