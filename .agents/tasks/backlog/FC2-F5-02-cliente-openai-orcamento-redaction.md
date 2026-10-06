---
id: FC2-F5-02
title: Cliente OpenAI com orçamento, cache e redaction
status: backlog
type: feature
phase: F5
wave: 1
owner: ia-integracoes
depends_on: [FC2-F0-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [ai, tools]
related_use_cases: []
related_adrs: [ADR-026, ADR-024, ADR-027, ADR-030]
---

# FC2-F5-02 — Cliente OpenAI com orçamento, cache e redaction

## Contexto
A IA do FC 2.0 é um **complemento**, não o núcleo: categorização few-shot, fallback do parser, resumo/chat e transcrição de áudio do bot. O dono tem **crédito total de US$ 5** na OpenAI e a meta é gastar **no máximo ~US$ 1 por mês** (spec §11). ADR-026 fixa: orçamento duro, registro de custo por chamada, redaction obrigatória e modelos pequenos. Esta task cria a única porta de saída para a OpenAI; nenhuma outra parte do código chama a API diretamente.

## Problema
Sem uma camada central, qualquer feature pode estourar o crédito, enviar CPF/conta/nome de terceiros a um serviço externo ou repetir chamadas idênticas. Sem registro de custo não há como saber o quanto já foi gasto nem desligar a IA a tempo.

## Objetivo
Entregar `src/server/modules/ai/` com:
1. Cliente OpenAI (texto estruturado e transcrição) com modelos configuráveis por env.
2. **Orçamento**: total de US$ 5, teto mensal configurável (padrão US$ 1), **kill switch** automático.
3. Tabela `AiUsage` (modelo, tokens, custo estimado) e `AiSettings`.
4. **Cache por hash** da entrada redigida.
5. **Redaction obrigatória** antes de qualquer envio, com falha fechada.

## Fora de escopo
- Prompts e lógica de categorização (F5-03), bot (F5-04), agentes (F5-05).
- Tela de configuração da IA (F6; aqui só endpoint de leitura de uso).
- Treinamento/fine-tuning, embeddings, imagens.

## Comportamento atual
Não há integração com OpenAI. Existem as tabelas `AiUsage` e `AgentRun` previstas no spec §6 (F0-02): conferir `prisma/schema.prisma`; se `AiUsage` já existir com outros campos, **estender** em vez de recriar.

## Comportamento esperado
### API do módulo (`src/server/modules/ai/application/`)
```ts
type AiPurpose = 'CATEGORIZE' | 'PARSE' | 'CHAT' | 'TRANSCRIBE' | 'AGENT'

interface StructuredRequest<T> {
  userId: string
  purpose: AiPurpose
  tier: 'small' | 'mid'                  // small = gpt-5-nano, mid = gpt-5-mini (via env)
  system: string
  input: string | Record<string, unknown> // passa SEMPRE por redaction
  schema: z.ZodType<T>                    // saída estruturada validada
  maxOutputTokens: number
  cache?: { ttlDays: number } | false     // padrão: 30 dias
  promptVersion: string                   // entra na chave de cache
  agentRunId?: string
}

type AiResult<T> =
  | { ok: true; data: T; usage: UsageInfo; cacheHit: boolean }
  | { ok: false; reason: 'BUDGET_EXCEEDED' | 'KILL_SWITCH' | 'REDACTION_FAILED' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT' | 'DISABLED'; detail?: string }

callStructured<T>(req: StructuredRequest<T>): Promise<AiResult<T>>
transcribe(req: { userId: string; audio: Buffer; mime: string; durationSec?: number }): Promise<AiResult<{ text: string }>>
getBudgetStatus(userId: string): Promise<{ monthSpentMicroUsd: number; monthCapMicroUsd: number; totalSpentMicroUsd: number; totalBudgetMicroUsd: number; killSwitch: boolean; percentMonth: number }>
```
Quem chama trata `ok:false` **degradando para regras** (categoria vazia → Inbox; parser sem LLM; bot responde "IA indisponível, usei regras"). A IA nunca é caminho obrigatório.

### Configuração (env, todos opcionais com padrão; documentar em `.env.example`)
```text
OPENAI_API_KEY=
OPENAI_MODEL_SMALL=gpt-5-nano
OPENAI_MODEL_MID=gpt-5-mini
OPENAI_MODEL_TRANSCRIBE=gpt-4o-mini-transcribe
AI_TOTAL_BUDGET_USD=5
AI_MONTHLY_CAP_USD=1
AI_ENABLED=true
OPENAI_PRICING_JSON=            # sobrescreve a tabela de preços (ver abaixo)
```
`AiSettings { userId, monthlyCapMicroUsd, totalBudgetMicroUsd, killSwitch, updatedAt }`: valores do banco prevalecem sobre env quando existirem (permite o dono ajustar o teto sem redeploy; escrita por rota autenticada).

### Unidade de custo
Custos em **micro-dólares inteiros** (1 USD = 1.000.000 µUSD), nunca `float`. `costMicroUsd = ceil(inputTokens * inPricePerMTokMicro / 1_000_000 + outputTokens * outPricePerMTokMicro / 1_000_000)`. Tabela de preços em `domain/pricing.ts`, por modelo, em µUSD por 1M de tokens, com comentário "valores de referência; conferir a página de preços da OpenAI e sobrescrever por `OPENAI_PRICING_JSON`". Valores iniciais de referência (a conferir): gpt-5-nano entrada 50.000 / saída 400.000; gpt-5-mini entrada 250.000 / saída 2.000.000; transcrição ~3.000 µUSD por minuto de áudio (gpt-4o-mini-transcribe). Modelo sem preço na tabela → tratar como **caro** (usar o maior preço conhecido) e logar warning; nunca custo zero.

### Orçamento e kill switch
Antes de cada chamada: estimar custo máximo = tokens de entrada estimados (`ceil(chars / 3)`) × preço de entrada + `maxOutputTokens` × preço de saída. Bloquear (`BUDGET_EXCEEDED`) se `monthSpent + estimativa > monthCap` ou `totalSpent + estimativa > totalBudget`. Depois da chamada, gravar o custo **real** (tokens reportados pela API). Ao ultrapassar 100% do teto mensal ou do total, gravar `AiSettings.killSwitch = true` (reativação manual explícita por rota autenticada, ou automática na virada do mês só para o teto mensal). Limiares de alerta: 50%, 80% do teto mensal (flag `alertLevel` em `getBudgetStatus` para o Telegram avisar na F5-04). Reserva do total: manter US$ 0,50 (`AI_RESERVE_USD`, padrão 0,5) fora do uso automático (agentes/categorização), liberada só para chamadas iniciadas pelo usuário no bot.

### Cache
Chave: `sha256(purpose | model | promptVersion | JSON.stringify(redactedInput canônico))`. Tabela `AiCache { userId, key, response Json, createdAt, expiresAt }` com `@@unique([userId, key])`. Acerto de cache grava `AiUsage` com `cacheHit = true` e custo 0. Só cacheia respostas validadas pelo schema. Cache vale por merchant/descrição normalizada: a categorização da mesma descrição não é paga duas vezes.

### Redaction (`domain/redact.ts`) — fail closed
`redactText(text, opts?)` e `redactObject(obj)` aplicam, nesta ordem:
| Padrão | Substituição |
|---|---|
| CPF (`123.456.789-00`, só dígitos com 11, mascarado `•••.456.789-••`) | `[CPF]` |
| CNPJ (`12.345.678/0001-90`) | `[CNPJ]` |
| Cartão (13 a 19 dígitos, com espaços/hífens, ou `•••• 1234`) | `[CARTAO]` |
| Agência/conta (`Ag(ência)? 1234`, `Conta 12345-6`, `AG 0001 CC 12345-6`) | `[CONTA]` |
| E-mail | `[EMAIL]` |
| Telefone BR (`(11) 91234-5678`, `+55 11 ...`) | `[TEL]` |
| Chave Pix aleatória (UUID) | `[CHAVE]` |
| Nome de pessoa em Pix: `PIX TRANSF {nome} DD/MM`, `Transferência (enviada|recebida) pelo Pix {nome} - ...`, `PIX ENVIADO/RECEBIDO {nome}`, `TED/DOC {nome}` | `PESSOA` (mantém o prefixo, ex.: `PIX TRANSF PESSOA 02/09`) |
| Qualquer sequência de ≥ 8 dígitos remanescente | `[NUM]` |
`PIX QRS {comerciante}` e `PAY {comerciante}` **não** são pessoas: preservar. Quando a linha vem estruturada com `hints.counterpartyType = 'PERSON'` (F4-02), o descritor é substituído por `PESSOA` mesmo fora dos padrões acima.
`assertClean(text)`: segunda passada que procura CPF/CNPJ/cartão/conta/e-mail/telefone/≥ 8 dígitos; se achar algo, lança `RedactionError` e a chamada retorna `REDACTION_FAILED` **sem enviar nada**. Valores monetários e datas podem ser enviados. Nomes de contas do usuário ("Nubank PJ") podem ser enviados; nomes de pessoas, não.

### Chamada ao provedor (`infra/openai-client.ts`)
Usar o SDK oficial `openai` (instalar) com a Responses API (`responses.create`) e `store: false`; saída estruturada por JSON Schema derivado do Zod (`z.toJSONSchema`) e validação final com Zod. Timeout 20 s, 1 retry em 429/5xx com backoff curto (400 ms), nunca retry em 4xx de validação. Transcrição: `audio.transcriptions.create` com o modelo de `OPENAI_MODEL_TRANSCRIBE`; áudio ≤ 2 MB e ≤ 60 s, só em memória, nunca gravado. Parâmetros específicos de modelos de raciocínio (ex.: `reasoning.effort = 'minimal'`) configurados em um único lugar (`infra/model-params.ts`) e checados contra a documentação vigente da API na hora da implementação.

## Regras de negócio
- RN-01: Nenhum módulo importa `openai` fora de `ai/infra/`. Um teste de arquitetura (grep em teste) falha se `from 'openai'` aparecer fora dele.
- RN-02: **Toda** entrada passa por redaction + `assertClean` antes de cache e envio; a chave de cache é calculada **depois** da redaction.
- RN-03: Sem `OPENAI_API_KEY`, `AI_ENABLED=false` ou `killSwitch = true`: retornar `ok:false` (`DISABLED`/`KILL_SWITCH`) imediatamente, sem erro para o usuário.
- RN-04: Custo sempre em µUSD inteiros; `AiUsage` é gravada para **toda** tentativa (OK, ERROR, BLOCKED, cache hit) com `status`.
- RN-05: Orçamento é verificado de forma atômica (transação com leitura da soma do mês + inserção do uso reservado) para evitar que chamadas concorrentes ultrapassem o teto.
- RN-06: Prompts, entradas e saídas **não** são logados; `AiUsage` não guarda o texto, só metadados e `requestHash`.
- RN-07: Nomes de modelo vêm de env; trocar de modelo muda a chave de cache (inclui o modelo).
- RN-08: Saída inválida para o schema conta como custo (já foi cobrado) e retorna `INVALID_OUTPUT`; sem retry automático para não gastar em dobro, exceto 1 reparo barato opcional desligado por padrão.
- RN-09: Chamadas de `purpose` automático (`CATEGORIZE`, `AGENT`) respeitam a reserva (US$ 0,50 do total); `CHAT`/`PARSE`/`TRANSCRIBE` iniciados pelo usuário podem usá-la.
- RN-10: Limite por chamada: entrada ≤ 8.000 caracteres; `maxOutputTokens` ≤ 1.500 (agentes: ≤ 3.000).
- RN-11: Rotas: `GET /api/ai/usage` (status do orçamento e últimos 30 dias por `purpose`), `PUT /api/ai/settings` (teto mensal, total, kill switch), ambas com sessão.

## Critérios de aceitação
- [ ] CA-01: Teste de redaction cobre CPF (3 formatos), CNPJ, cartão, conta/agência, e-mail, telefone, UUID, nome em `PIX TRANSF`, `Transferência enviada pelo Pix` e `TED`; `PIX QRS MERCADO EXEMPLO` permanece intacto.
- [ ] CA-02: `assertClean` lança quando sobra CPF/≥ 8 dígitos; a chamada devolve `REDACTION_FAILED` e o provedor mockado **não** é chamado.
- [ ] CA-03: Com teto mensal de 1 USD já consumido, `callStructured` devolve `BUDGET_EXCEEDED` sem chamar o provedor; `AiUsage` registra tentativa `BLOCKED`.
- [ ] CA-04: Ao estourar o teto (custo real), `killSwitch` é ativado e as chamadas seguintes retornam `KILL_SWITCH`.
- [ ] CA-05: A segunda chamada idêntica retorna `cacheHit = true`, custo 0, sem chamar o provedor.
- [ ] CA-06: Custo calculado para (1.000 tokens de entrada, 200 de saída) em gpt-5-nano bate com o valor esperado da tabela (verificado em teste com preços injetados).
- [ ] CA-07: Duas chamadas concorrentes que juntas passariam do teto: no máximo uma é executada (teste de integração).
- [ ] CA-08: Modelo sem preço cadastrado usa o preço mais alto e gera warning.
- [ ] CA-09: Transcrição respeita limites (áudio > 2 MB recusado) e grava `AiUsage` com `purpose = TRANSCRIBE`.
- [ ] CA-10: `grep -rn "from 'openai'" src` só encontra arquivos em `src/server/modules/ai/infra/`.
- [ ] CA-11: `GET /api/ai/usage` devolve gasto do mês/total/percentual sem expor chaves; `PUT /api/ai/settings` altera o teto.
- [ ] CA-12: `.env.example` documenta as variáveis; `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
Criar:
- `src/server/modules/ai/domain/pricing.ts`, `cost.ts`, `budget.ts` (decisão pura `decideBudget(status, estimate)`), `redact.ts`, `canonical-hash.ts`, `errors.ts` (+ testes)
- `src/server/modules/ai/application/call-structured.ts`, `transcribe.ts`, `get-budget-status.ts`, `update-settings.ts`
- `src/server/modules/ai/infra/openai-client.ts`, `model-params.ts`, `usage-repository.ts`, `cache-repository.ts`, `settings-repository.ts`
- `src/server/modules/ai/http/schemas.ts`
- `src/app/api/ai/usage/route.ts` (GET), `src/app/api/ai/settings/route.ts` (PUT)
- Dependência: `openai`. Atualizar `.env.example`.

### Frontend
Nenhum.

### Banco de dados
Migration aditiva `add_ai_budget`. A F0-02 **já criou** `AiUsage` (`model`, `purpose`, `inputTokens`, `outputTokens`, `costMicroUsd`, `agentRunId?`, `createdAt`, índice `[userId, createdAt]`) e `AgentRun` com `costMicroUsd`. Conferir o schema real (inclusive se `purpose` é `String` ou enum) e **estender**, sem recriar:
```prisma
enum AiUsageStatus { OK ERROR BLOCKED }

model AiUsage {
  // campos existentes da F0-02 ...
  cachedInputTokens Int           @default(0)
  cacheHit          Boolean       @default(false)
  status            AiUsageStatus @default(OK)
  requestHash       String?
  latencyMs         Int?
}
model AiSettings {
  userId              String   @id
  monthlyCapMicroUsd  Int      @default(1000000)
  totalBudgetMicroUsd Int      @default(5000000)
  killSwitch          Boolean  @default(false)
  updatedAt           DateTime @updatedAt
}
model AiCache {
  id        String   @id @default(cuid())
  userId    String
  key       String
  response  Json
  createdAt DateTime @default(now())
  expiresAt DateTime
  @@unique([userId, key])
  @@index([expiresAt])
}
```
`purpose` usa os valores `CATEGORIZE`, `PARSE`, `CHAT`, `TRANSCRIBE`, `AGENT` (como `String` validado por Zod ou enum, conforme o schema existente). Não usar `@db.Date` nem `Float` (o teste de contrato do schema da F0-02 proíbe); dinheiro sempre `Int` em micro-dólares.

### Integrações
OpenAI API (Responses e Audio Transcriptions). Sem outras chamadas externas.

### Segurança
Chave só em env (nunca no banco nem em log); redaction com falha fechada; `store: false`; nada de PII em `AiUsage`; rotas de configuração autenticadas; mês definido pelo fuso `America/Sao_Paulo`.

## Plano de implementação
- [ ] 1. Ler `prisma/schema.prisma` (AiUsage existente), `src/server/auth/guard.ts` e o padrão de env do projeto.
- [ ] 2. TDD de `redact.ts` e `assertClean` (a parte mais crítica); fixtures sintéticos em `tests/fixtures/ai/redaction-cases.ts` (todos fictícios).
- [ ] 3. `pricing.ts`, `cost.ts` e `budget.ts` puros, com testes.
- [ ] 4. Migration `add_ai_budget` (via `dados-prisma`).
- [ ] 5. Repositórios + reserva atômica de orçamento.
- [ ] 6. `openai-client.ts` com cliente injetável (para mock em testes) e `callStructured` completo (redaction → cache → orçamento → provedor → validação → registro).
- [ ] 7. `transcribe`.
- [ ] 8. Rotas `api/ai/usage` e `api/ai/settings`; `.env.example`.
- [ ] 9. Teste de arquitetura (RN-01) e de concorrência (CA-07).
- [ ] 10. Documentar em `docs/integrations/openai.md`; atualizar `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: redaction com tabela de entradas/saídas (inclui `CPF 12345678900` sem pontuação, `cartão 4111 1111 1111 1111`, `Ag 0001 Conta 12345-6`, `PIX TRANSF MARIA EXEMPLO 02/09` → `PIX TRANSF PESSOA 02/09`, `PIX QRS PADARIA EXEMPLO 03/09` intacto, texto sem nada sensível intacto, entrada de objeto aninhado); custo (arredondamento para cima, tokens zero, modelo desconhecido); `decideBudget` (exatamente no teto, 1 µUSD acima, total esgotado, reserva); hash canônico (ordem de chaves não altera).
- [ ] Integração (provedor mockado): fluxo completo OK; erro 429 com 1 retry e sucesso; erro 400 sem retry; saída inválida → `INVALID_OUTPUT` com custo gravado; cache hit; kill switch; virada de mês reseta o teto mensal; concorrência.
- [ ] E2E: n/a.
- [ ] Manual (opcional, com chave real e centavos de custo): uma chamada `small` com texto sintético e conferir `AiUsage`.

## Riscos e rollback
- **Redaction incompleta** vaza dado pessoal: mitigada por `assertClean` em falha fechada, estruturas com `counterpartyType` e testes; ampliar padrões a cada nova fonte.
- **Preços mudam**: tabela sobrescrevível por env; custo subestimado é pior que superestimado (modelo desconhecido = preço alto).
- **Estimativa de tokens imprecisa** (chars/3): reserva conservadora; custo real corrige.
- **Dependência de modelo específico**: nomes por env; trocar modelo não exige deploy de código.
- Rollback: `AI_ENABLED=false` desliga tudo sem deploy; todas as features degradam para regras.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff
