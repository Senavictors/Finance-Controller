---
id: FC2-F5-03
title: Categorização LLM few-shot + fallback do parser
status: backlog
type: feature
phase: F5
wave: 2
owner: ia-integracoes
depends_on: [FC2-F5-02, FC2-F4-03]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [ai, rules, merchants, capture, imports]
related_use_cases: []
related_adrs: [ADR-024, ADR-026, ADR-023]
---

# FC2-F5-03 — Categorização LLM few-shot + fallback do parser

## Contexto
A meta da F5 é "≥ 80% categorizado sem toque" com custo ≤ US$ 1/mês. A cascata de categorização (ADR-024) é: `userLocked` > regras USER > regras LEARNED > memória de merchant > **LLM** > sem categoria. As quatro primeiras camadas existem (F2-02, F4-03). Esta task implementa a camada **LLM few-shot**, usada só quando as camadas determinísticas não decidem, e um **fallback do parser quick-add** para frases que o parser da F2-01 não entende. Tudo passa pelo cliente com orçamento e redaction da F5-02.

## Problema
Descrições novas (sem regra nem merchant conhecido) caem no Inbox sem sugestão, forçando toque em quase tudo. Frases livres ("paguei 80 de gasolina ontem no pix") podem escapar do parser determinístico.

## Objetivo
1. `categorizeWithLlm`: sugere categoria (e natureza) para uma transação, com exemplos few-shot do próprio histórico do usuário, em **lote** para economizar tokens.
2. `parseWithLlm`: fallback do parser quando a confiança é baixa, devolvendo um `Draft` validado.
3. Integrar na cascata sem nunca sobrescrever camadas superiores e sem tocar em `userLocked`.
4. Medir custo por transação e taxa de acerto.

## Fora de escopo
- Cliente OpenAI, orçamento, redaction (F5-02).
- Chat livre/consultas (bot, F5-04).
- Aprendizado automático de regra pelo LLM (só o fluxo "2 de 3" da F4-03).
- Fine-tuning ou embeddings.

## Comportamento atual
- F4-03: `Enricher` normaliza merchant, roda regras e memória; transação sem categoria vai ao Inbox.
- F2-01: parser determinístico pt-BR devolve `Draft` com `confidence`/campos faltantes (conferir o tipo real em `src/server/modules/capture/`).
- F5-02: `callStructured` disponível, com `ok:false` para degradação.

## Comportamento esperado
### 1. Categorização em lote (`ai/application/categorize-with-llm.ts`)
Entrada: até 20 itens `{ ref, merchantKey, descriptionRedacted, amountCents, direction, accountKind, hintCategory? }` ainda sem categoria após as camadas determinísticas. Para cada lote:
- Few-shot: até 12 exemplos do histórico do usuário (categoria confirmada pelo usuário, `categorySource = USER`, ou aplicada por regra, `RULE`), escolhidos por similaridade de tokens com os merchants do lote (3 mais parecidos por item, deduplicados) e sempre incluindo a **lista de categorias** do usuário (id curto, nome, tipo, natureza).
- Prompt (versão `categorize.v1`): "Você classifica transações bancárias brasileiras em UMA categoria da lista. Responda só JSON. Se não tiver confiança ≥ 0.6, devolva categoryId null." (texto exato em `ai/domain/prompts/categorize.ts`).
- Saída (Zod): `{ items: Array<{ ref: string; categoryId: string | null; nature?: 'MUST'|'NEED'|'WANT'; confidence: number (0..1); reason: string (≤ 80 chars) }> }`.
- Modelo: `tier: 'small'` (gpt-5-nano) por padrão; **escalar** apenas os itens com `confidence < 0.6` ou `null` para `mid` (gpt-5-mini), no máximo uma vez, e só se o orçamento mensal estiver < 60%.
- Validação: `categoryId` precisa existir na lista enviada; id desconhecido → tratado como `null`.
- Resultado aplicado: confiança ≥ 0.85 → `categorySource = LLM`, `aiConfidence` (inteiro 0 a 100, como no schema da F0-02), categoria gravada, `review = NEEDS_REVIEW` (nunca confirma sozinho); 0.6–0.85 → vira **sugestão** (aparece como sugestão 2 no Inbox, não grava categoria); < 0.6 → nada.
- Cache: por `merchantKey` normalizado + valor arredondado por faixa (`<50`, `50–500`, `>500` em reais) + direção + versão do prompt; mesma descrição repetida não é paga de novo (F5-02).

### 2. Fallback do parser (`ai/application/parse-with-llm.ts`)
Quando o parser da F2-01 devolve `Draft` com valor ausente/ambíguo ou `confidence < limiar` (definido pelo parser), chamar `parseWithLlm({ text, accounts, categories, today })` com `tier: 'small'` e saída Zod igual ao `Draft` da F2-01 (importar o schema, não duplicar). O LLM **nunca** inventa valor: se o texto não contém número, devolve `amountCents: null` e campos faltantes. Resultado tem `source = 'LLM'` e o chamador (UI/bot) mostra os chips para o usuário conferir antes de salvar (nada é gravado direto).

### 3. Integração na cascata
`Enricher` (F4-03) passa a: camadas determinísticas → se sem categoria e `ai.enabled` e orçamento permite → enfileira para `categorizeWithLlm` em **lote por importação** (uma chamada por até 20 itens, após o dedupe, não por linha). Quick-add: `createFromDraft` chama a categorização LLM só quando o merchant é desconhecido e a categoria não veio do texto.

### 4. Métricas
`AiUsage` por `purpose`; novo endpoint `GET /api/ai/categorization-stats` (período) devolvendo: % de transações categorizadas por origem (`categorySource`: `RULE`, `MERCHANT`, `LLM`, `USER`, `IMPORT`; a separação USER/LEARNED das regras vem de `Rule.origin` via `Transaction.appliedRuleId`), taxa de aceite da IA (confirmadas sem troca ÷ confirmadas) e custo médio por transação categorizada (µUSD). Base para checar a meta de 80%.

## Regras de negócio
- RN-01: Nenhuma chamada LLM quando uma camada determinística já definiu a categoria ou quando o campo está em `userLocked`.
- RN-02: Entrada ao LLM é **sempre** a descrição redigida (F5-02); nomes de pessoas em Pix chegam como `PESSOA`; o LLM não vê CPF, conta ou nome.
- RN-03: IA nunca confirma (`review` permanece `NEEDS_REVIEW`) e nunca cria regra sozinha; a regra aprendida só nasce de decisão do usuário (F4-03).
- RN-04: Orçamento: se `ok:false` (`BUDGET_EXCEEDED`, `KILL_SWITCH`, `DISABLED`, `REDACTION_FAILED`), o item segue para o Inbox sem categoria, sem erro e sem retry.
- RN-05: Máximo de 20 itens por chamada e 3 chamadas LLM por importação (até 2 lotes `small`, ou seja 40 itens, mais 1 escalonamento `mid`); o excedente fica sem categoria.
- RN-06: Aceite do usuário alimenta a memória: ao confirmar uma sugestão de IA, o fluxo normal da F4-03 registra a decisão (`recordCategoryDecision`); confirmar sem trocar a categoria mantém `categorySource = LLM` (para as métricas de aceite); trocar a categoria grava `USER` e `userLocked.categoryId`.
- RN-07: Prompt e exemplos ficam versionados (`promptVersion`); mudar o prompt invalida o cache.
- RN-08: Respostas fora do schema ou com `categoryId` inexistente são descartadas (custo registrado, categoria vazia).
- RN-09: Few-shot usa só dados do usuário logado e só descrições já redigidas; exemplos não incluem valores exatos (faixa), para reduzir tokens e vazamento.
- RN-10: O fallback do parser só roda para texto digitado pelo usuário (quick-add/bot), nunca para descrições importadas.

## Critérios de aceitação
- [ ] CA-01: Para 10 itens sintéticos sem camada determinística, uma única chamada ao provedor mockado categoriza o lote e o resultado é aplicado conforme as faixas de confiança (≥ 0.85 grava, 0.6–0.85 sugere, < 0.6 ignora).
- [ ] CA-02: Itens com regra USER, regra LEARNED, merchant conhecido ou `userLocked.categoryId` **não** geram chamada.
- [ ] CA-03: `categoryId` inventado pelo modelo é descartado.
- [ ] CA-04: Com orçamento estourado (mock), nenhum item falha: todos ficam sem categoria e a importação conclui.
- [ ] CA-05: O prompt enviado (capturado no mock) não contém CPF, número de conta nem nome de pessoa (teste com entradas sintéticas sensíveis).
- [ ] CA-06: Repetir a categorização da mesma descrição usa cache (`cacheHit`), custo 0.
- [ ] CA-07: Escalonamento small → mid acontece só para itens de baixa confiança e só com orçamento mensal < 60%.
- [ ] CA-08: `parseWithLlm` para "paguei 80 de gasolina ontem no pix" devolve `Draft` com `amountCents = 8000`, data de ontem e categoria combustível (mock); texto sem número devolve `amountCents = null`.
- [ ] CA-09: `GET /api/ai/categorization-stats` retorna percentuais por camada e custo médio calculados corretamente sobre dados sintéticos.
- [ ] CA-10: Importação sintética de 50 linhas gera no máximo 3 chamadas LLM (lotes small + escalonamento mid; nenhuma de parser), e as linhas além das 40 primeiras sem categoria determinística ficam sem categoria.
- [ ] CA-11: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
Criar:
- `src/server/modules/ai/domain/prompts/categorize.ts`, `parse-fallback.ts`, `few-shot.ts` (seleção de exemplos, pura) (+ testes)
- `src/server/modules/ai/application/categorize-with-llm.ts`, `parse-with-llm.ts`, `categorization-stats.ts`
- `src/server/modules/ai/infra/few-shot-repository.ts` (busca exemplos do histórico do usuário)
- `src/server/modules/ai/http/schemas.ts` (saídas Zod: `categorizeOutputSchema`)
- `src/app/api/ai/categorization-stats/route.ts`
- Alterar `src/server/modules/imports/application/enricher.ts` (F4-03) e `createFromDraft` (F2-03) para chamar a camada LLM pelo ponto de extensão.

### Frontend
Nenhum aqui. O Inbox (F4-05) já exibe sugestões `AI` com explicação; confirmar o rótulo `source = AI` com a F4-05.

### Banco de dados
Usar `Transaction.categorySource = LLM` e `aiConfidence Int?` (0 a 100), já existentes na F0-02. Sugestões de confiança média precisam de um lugar para persistir entre a importação e a abertura do Inbox: migration aditiva `Transaction.suggestions Json?` (ids de categoria e confiança, sem texto), coordenada com `dados-prisma`.

### Integrações
OpenAI via F5-02 apenas.

### Segurança
Somente texto redigido; sem logs de prompt; exemplos few-shot do próprio usuário.

## Plano de implementação
- [ ] 1. Ler `enricher.ts` (F4-03), `createFromDraft` (F2-03), o `Draft` e o schema da F2-01, e a API de `callStructured` (F5-02).
- [ ] 2. `few-shot.ts` (seleção por similaridade de tokens) com testes.
- [ ] 3. Prompts versionados e schemas Zod de saída.
- [ ] 4. `categorize-with-llm.ts`: lote, aplicação por faixas, escalonamento, validação de ids, cache.
- [ ] 5. Integrar no `Enricher` com lote por importação.
- [ ] 6. `parse-with-llm.ts` e integração no quick-add/bot (ponto de extensão; o bot consome na F5-04).
- [ ] 7. `categorization-stats` + rota.
- [ ] 8. Teste de privacidade do prompt (CA-05) e de custo por lote (CA-10).
- [ ] 9. Documentar em `docs/domain/categorizacao.md` (camadas e métricas); atualizar `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: seleção few-shot (3 exemplos por item, deduplicados, limite 12); faixas de confiança em 0.59, 0.6, 0.84, 0.85; descarte de id inexistente; construção do prompt com lista de categorias; faixa de valor (49,99 → `<50`; 50,00 → `50–500`).
- [ ] Integração (provedor mockado): lote de 10; 25 itens → chamadas de 20 e 5, mais no máximo 1 escalonamento mid (3 no total, RN-05); 45 itens → só 40 processados e 5 ficam sem categoria; budget bloqueado; cache; escalonamento; `userLocked`; usuário B não vê exemplos do A.
- [ ] E2E: n/a.
- [ ] Manual (opcional com chave real): importar OFX sintético pequeno e conferir `AiUsage` (custo em centavos de dólar) e sugestões.

## Riscos e rollback
- **Categoria errada com alta confiança**: nunca confirma sozinha; aparece no Inbox com rótulo "IA"; métrica de aceite acusa degradação; limiar de 0.85 ajustável por env `AI_CATEGORIZE_MIN_CONFIDENCE`.
- **Custo maior que o previsto**: lote + cache + small primeiro + teto da F5-02.
- **Viés do few-shot** (exemplos ruins do histórico): usar só decisões confirmadas pelo usuário (`USER`) ou aplicadas por regra (`RULE`).
- Rollback: `AI_ENABLED=false` ou remover a chamada no `Enricher`; cascata volta às quatro camadas determinísticas.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff
