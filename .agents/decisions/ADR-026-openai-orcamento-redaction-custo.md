---
id: ADR-026
title: OpenAI com orçamento fixo, redaction e registro de custo
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F5-02, FC2-F5-03, FC2-F5-04, FC2-F5-05, FC2-F0-02]
supersedes: []
---

# ADR-026 — OpenAI com orçamento fixo, redaction e registro de custo

## Contexto
O dono tem crédito total de **US$ 5** na OpenAI (sem renovação automática) e quer IA para: fallback do parser (ADR-024), categorização few-shot, chat/consultas no Telegram e transcrição de áudio. Meta de custo: <= US$ 1/mês (spec §11). Os dados são financeiros e pessoais: CPF, número de conta e nomes de terceiros nunca podem sair do sistema. O repositório é público, então chaves jamais entram no Git.

## Decisão
1. **Provedor e modelos**: OpenAI via SDK oficial, em `src/server/modules/ai/`. Modelos pequenos configuráveis por env: `AI_MODEL_FAST=gpt-5-nano` (parser, categorização) e `AI_MODEL_CHAT=gpt-5-mini` (chat/agentes). Transcrição de áudio com modelo de transcrição da OpenAI, com duração máxima de 60 s por áudio. Saídas estruturadas (JSON schema do Zod) com `max_output_tokens` <= 400 e entrada <= 2.000 tokens por chamada.
2. **Orçamento**:
   - Orçamento total: US$ 5,00 = `5_000_000` micro-dólares (inteiros, nunca float).
   - **Teto mensal** configurável em `Settings.aiMonthlyCapMicros`, default **US$ 1,00** (`1_000_000`).
   - Alerta ao atingir 80% do teto (mensagem no Telegram e aviso em Mais > Integrações); **bloqueio** de novas chamadas a 100%. Com saldo total restante < US$ 0,50, bloqueio também.
   - Cálculo prévio: `custoEstimado = tokensEntrada × preçoIn + maxSaída × preçoOut` com tabela de preços versionada em `ai/domain/pricing.ts`; chamada negada se `gastoMes + custoEstimado > teto`.
3. **`AiUsage`** (uma linha por chamada): `id`, `userId`, `createdAt`, `purpose` (PARSE | CATEGORIZE | CHAT | AGENT | TRANSCRIBE), `model`, `inputTokens`, `outputTokens`, `costMicros`, `cacheKey?`, `cacheHit`, `ok`. Custo real vem do `usage` retornado pela API. Nenhum prompt ou resposta é gravado, só metadados.
4. **Redaction obrigatória** antes de qualquer chamada (`ai/domain/redact.ts`, função pura): remove ou substitui CPF/CNPJ (com ou sem pontuação), sequências de >= 8 dígitos (contas, cartões, códigos), e-mails, telefones, chaves Pix aleatórias e nomes próprios em padrões "pix para/de NOME", "ted NOME" por tokens (`[CPF]`, `[NUM]`, `[PESSOA]`). O merchant comercial (ex.: "ifood") e valores permanecem. Teste de propriedade: nenhuma saída contém regex de CPF ou 8+ dígitos.
5. **Cache**: `cacheKey = sha256(purpose | model | entradaRedigida)`; resposta de categorização é reaproveitada (`AiCache`, TTL 90 dias). Merchant já resolvido por regra ou memória (ADR-024) nunca chega à IA. Lotes: categorização de até 20 linhas por chamada.
6. **Kill switch**: `AI_ENABLED=false` (env) ou `Settings.aiEnabled=false` (Mais > Integrações) desliga toda chamada imediatamente; o sistema continua funcional sem IA (parser e regras determinísticos). Falha ou timeout (8 s) da OpenAI nunca bloqueia captura: degrada para o fluxo manual.
7. **Chave**: `OPENAI_API_KEY` só em variáveis de ambiente da Vercel e `.env.local` (gitignored); nunca no client.
8. **Dados fora do prompt**: nunca enviar saldos de contas, nomes de bancos com número, descrições completas de transferências a pessoas; para chat sobre finanças, enviar agregados (totais por categoria, `get_available`) via tools (ADR-025) e não o extrato bruto.

## Alternativas consideradas
### Alternativa A — Modelos grandes (gpt-5 completo) para tudo
- Vantagens: maior qualidade em casos ambíguos.
- Desvantagens: US$ 5 acabaria em semanas; qualidade extra desnecessária para categorizar merchants.

### Alternativa B — Modelo local (Ollama) sem custo
- Vantagens: sem custo nem envio de dados.
- Desvantagens: não roda na Vercel; o dono não quer manter servidor próprio; latência no celular.

### Alternativa C — Sem IA
- Vantagens: custo zero e privacidade total.
- Desvantagens: perde o fallback do parser, a categorização dos casos difíceis e o chat por Telegram; a meta de 80% automático fica mais difícil.

## Consequências
### Positivas
- Custo previsível e auditável; sistema degrada com elegância.
- Dados sensíveis não saem do ambiente.

### Negativas
- Redaction pode remover contexto útil e reduzir acurácia.
- Tabela de preços precisa ser mantida.

### Riscos
- Mudança de preços ou de modelo: preços em arquivo versionado com data; revisar a cada troca de modelo.
- Loop de agente consumindo crédito: limite de 5 chamadas por execução de agente e 1 execução por job/dia.

## Plano de adoção
1. FC2-F0-02: tabelas `AiUsage`, `AiCache`, `Settings` (campos de IA).
2. FC2-F5-02: cliente com `guard` (orçamento), `redact`, cache e registro.
3. FC2-F5-03: categorização few-shot e fallback do parser; FC2-F5-04/F5-05 usam o cliente.

## Validação
- Teste: a chamada é negada quando `gastoMes + estimado > teto`.
- Teste de redaction com amostras sintéticas (CPF, conta, Pix para nome).
- Custo mensal real <= US$ 1 nos 2 primeiros meses; painel simples com gasto do mês e saldo restante.

## Revisão
Quando restar menos de US$ 1 do crédito total ou ao trocar de modelo.
