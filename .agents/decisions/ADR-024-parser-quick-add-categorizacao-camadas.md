---
id: ADR-024
title: Parser quick-add e categorização em camadas com override do usuário
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F2-01, FC2-F2-02, FC2-F2-03, FC2-F4-03, FC2-F5-03]
supersedes: []
---

# ADR-024 — Parser quick-add e categorização em camadas com override do usuário

## Contexto
Lançar no 1.x custava 2 digitações e 5–9 cliques. A meta é capturar em menos de 5 s com um campo de texto livre ("uber 18 nubank"). Além disso, extratos importados trazem descrições cruas ("PIX TRANSF FULANO", "IFOOD *RESTAURANTE") que precisam de categoria sem trabalho manual (meta: >= 80% sem edição). Há um orçamento de IA de US$ 5 no total (ADR-026): chamar LLM para tudo é inviável.

## Decisão
### Parser quick-add (determinístico primeiro)
1. `src/server/modules/capture/domain/parse.ts`: função pura `parseQuickAdd(texto, contexto) -> Draft` com gramática pt-BR: valor (`42,90`, `1.250,00`, `18`), data (`hoje`, `ontem`, `anteontem`, `dd/mm`, `dia 5`), conta/cartão por apelido (`nubank`, `itau`, `c6`), parcelas (`10x`, `em 3x`), tipo (`salário`, `estorno`, `transf ... → ...`), `#tag`. O que sobra é a descrição do merchant.
2. Saída `Draft` tipado `{ kind, amountCents, date, accountId?, merchantText, categoryId?, installments?, tags[], confidence, missing[] }`. `confidence` = fração de campos obrigatórios (valor, conta, descrição) resolvidos sem ambiguidade.
3. **LLM só como fallback**: chamado apenas se `confidence < 0.6` ou faltar o valor e a regra determinística não resolver, uma chamada com saída estruturada (ADR-026). Se o orçamento acabou (kill switch), o Draft incompleto vai para a sheet com chips vazios.

### Categorização em camadas (ordem de precedência)
```text
0. userLocked   -> se o campo está travado pelo usuário, nada o altera
1. Regras (Rule, por stage e priority)  -> categoria + fonte RULE, confiança 1.0
2. Memória de merchant                  -> Merchant.lastCategories (3 últimas):
                                           se 2 de 3 coincidem -> fonte MEMORY, confiança 0.9
3. LLM few-shot (ADR-026)               -> fonte AI, confiança do modelo (0..1)
4. Sem resultado                        -> fonte NONE, review = NEEDS_REVIEW
```
- **`userLocked Json`** (em `Transaction`): `{ "category": true, "merchant": true, "amount": true, "date": true }`. Qualquer edição manual de um campo o trava. Regras, memória, reprocessamentos e LLM **nunca** sobrescrevem campo travado, inclusive no "aplicar regra retroativamente". Esta é a camada de maior precedência.
- **Merchant**: normalização da descrição crua (`rawDescription`) para `Merchant` com `aliases` (minúsculas, sem acentos, sem sufixos de adquirente como `*`, cidade e número de loja). Match por alias exato, depois por similaridade (Jaro-Winkler >= 0,92). Sem match cria Merchant novo.
- **Regras** (`Rule`): `conditions` e `actions` em JSON validados por Zod, `stage` (PRE | POST), `priority` (menor roda primeiro), `origin` (USER | LEARNED), `hits`. Condições: texto contém/regex, faixa de valor, conta, tipo. Ações: categoria, merchant, tags, `excludeFromBudget`. Sugestão de regra aprendida após 3 confirmações iguais no Inbox.
- **Fonte e confiança** gravadas em `Transaction.categorySource` (USER | RULE | MEMORY | AI | NONE) e `aiConfidence`. Auto-aceite sem Inbox quando fonte é USER/RULE/MEMORY ou AI com confiança >= 0,85; abaixo disso, `NEEDS_REVIEW` com top-2 sugestões e explicação ("porque 2 das 3 últimas compras em Ifood foram Delivery").
- **Aprendizado**: confirmar ou corrigir no Inbox atualiza `Merchant.lastCategories` (janela de 3).

## Alternativas consideradas
### Alternativa A — LLM para todo parse e categorização
- Vantagens: tolera linguagem livre e erros de digitação.
- Desvantagens: latência de 1–3 s por captura (viola a meta de 5 s com folga pequena), custo recorrente contra US$ 5, resultado não determinístico, risco de enviar dados.

### Alternativa B — Apenas regras manuais (sem memória)
- Vantagens: previsível.
- Desvantagens: trabalho de configuração alto; não generaliza; o dono abandonaria.

### Alternativa C — Classificador local treinado (ML embarcado)
- Vantagens: sem custo de API.
- Desvantagens: pouco dado de um só usuário, infraestrutura de treino/deploy desproporcional na Vercel.

## Consequências
### Positivas
- Captura instantânea e offline-friendly (parser roda no cliente e no servidor com o mesmo código).
- Custo de IA concentrado nos casos difíceis.
- Correções do usuário nunca são desfeitas.

### Negativas
- Gramática do parser exige manutenção conforme novos hábitos de digitação.
- Quatro camadas aumentam a superfície de teste.

### Riscos
- Memória de merchant aprende erro do usuário: janela de 3 e "2 de 3" limitam o dano.
- Regra ampla demais re-categoriza muitos lançamentos: preview retroativo obrigatório e respeito a `userLocked`.

## Plano de adoção
1. FC2-F2-01: `parse.ts` com >= 60 casos de teste (spec §4.3 como base).
2. FC2-F2-02: `merchants` com memória; FC2-F2-03: `createFromDraft`.
3. FC2-F4-03: normalização e motor de regras; FC2-F5-03: camada LLM e fallback do parser.

## Validação
- Tabela de casos do parser: 100% dos exemplos da spec §4.3 produzem o Draft esperado.
- Em dados sintéticos de 500 linhas: >= 80% categorizadas por regras+memória sem LLM.
- Teste: campo `userLocked` permanece intacto após aplicar regra, reprocessar e rodar LLM.

## Revisão
Após F5, comparando % de auto-categorização e gasto de IA do primeiro mês.
