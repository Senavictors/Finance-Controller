---
id: FC2-F4-05
title: Inbox de revisão (pilha com swipe)
status: backlog
type: feature
phase: F4
wave: 3
owner: telas-produto
depends_on: [FC2-F4-03, FC2-F4-04]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [ledger, rules, imports, ui]
related_use_cases: []
related_adrs: [ADR-017, ADR-018, ADR-023, ADR-024, ADR-025]
---

# FC2-F4-05 — Inbox de revisão (pilha com swipe)

## Contexto
Tudo que entra por importação, bot ou recorrência sem certeza fica `review = NEEDS_REVIEW`. O Inbox é a fila onde o usuário confirma, corrige ou adia em segundos (princípio 3, "Automatizar e revisar"). Fica dentro da aba **Lançamentos** como segundo segmento ("Todos | Inbox", spec §4.2) e alimenta o anel de ritual da tela Hoje (F3-04, passo "revisar inbox"). Alvo: iPhone 13 Pro (390×844), uma mão, 120 Hz; desktop secundário com teclado.

## Problema
Sem Inbox as transações importadas ficam num limbo: o usuário não tem como confirmá-las, trocar a categoria com um toque, aceitar um match com recorrência/transferência nem transformar uma correção em regra.

## Objetivo
Entregar a tela do Inbox com **pilha de cartões e swipe** (direita confirma, esquerda adia), teclado na web (setas, `X`, `R`), **duas sugestões de categoria com explicação**, avisos de match (recorrência/transferência) com ação de aceitar/rejeitar, "criar regra" com preview retroativo, undo e estado vazio ("inbox zero").

## Fora de escopo
- Gestão completa de regras (lista/edição) e relatórios (F6).
- Motion avançado e celebrações (F6-01/F6-02; aqui só o necessário e `prefers-reduced-motion`).
- Edição completa de transação (existe na tela Lançamentos da F2-05; o Inbox reaproveita o sheet de edição).
- Importação (F4-06).

## Comportamento atual
- Backend pronto: transações `NEEDS_REVIEW` com `categorySource`, `matchCandidates`/`transferCandidates` (F4-04), regras e preview (F4-03), `Merchant` (F2-02).
- Não existe tela do Inbox. A tela Lançamentos (F2-05) tem a lista "Todos"; o segmento "Inbox" ainda é um placeholder (se não for, adaptar).
- Primitivos dark glass em `src/components/fc/` (F0-04) e shell com TabBar (F0-05).

## Comportamento esperado
Rota: `src/app/(app)/lancamentos/inbox/page.tsx` (ou segmento controlado por `?aba=inbox` na página de lançamentos; seguir o padrão da F2-05). Contador no segmento "Inbox" e no badge da aba.

### Layout (390×844)
```text
┌ Lançamentos        [Todos | Inbox 12] ┐
│ 12 para revisar · Itaú conta · set     │
│                                        │
│  ┌──────────────────────────────┐      │
│  │ Mercado Exemplo       -R$ 42,90│    │  cartão do topo (arrastável)
│  │ 12 set · Itaú conta            │    │
│  │ "PAG*MERCADO EXEMPLO SAO PAULO"│    │  descrição bruta pequena
│  │                                │    │
│  │ Categoria                      │    │
│  │ [Mercado ▪ Regra: Mercado Exemplo]  │  sugestão 1 + explicação
│  │ [Alimentação ▪ IA 82%]         │    │  sugestão 2 + explicação
│  │ [Outra...]                     │    │
│  │ ⟳ Parece a recorrência "Internet" │ │  (se houver match)
│  │   [Aceitar] [Não é esta]       │    │
│  └──────────────────────────────┘      │
│  (cartões 2 e 3 espiando atrás)        │
│                                        │
│  ← Adiar      Criar regra      Confirmar →│
└ TabBar ────────────────────────────────┘
```
Sem emojis: usar ícones do `lucide-react`. Cores só via `var(--fc-*)`.

### Gestos e teclado
- Swipe para a **direita** (≥ 80 px ou velocidade > 0,5 px/ms): confirma com a categoria selecionada (a sugestão 1 é a pré-selecionada).
- Swipe para a **esquerda**: adia (vai para o fim da fila do dia; `reviewSnoozedUntil = amanhã`).
- Toque em uma sugestão troca a categoria selecionada; "Outra..." abre o seletor de categorias.
- Teclado (desktop): `↑`/`↓` navegam entre cartões, `X` confirma, `R` abre "criar regra", `E` edita, `Z` desfaz, `Esc` fecha sheets. Mostrar dica de atalhos só em `pointer: fine`.
- Botões visíveis equivalentes aos gestos (acessibilidade; alvo mínimo 44×44 pt).
- Movimento com mola (tokens de motion do `tokens.css`); com `prefers-reduced-motion` o cartão some com fade curto, sem arrasto animado.

### Sugestões com explicação
Obter do servidor, por transação, até 2 sugestões ordenadas: `{ categoryId, source, label, confidence? }` onde `source` (tipo de sugestão da camada de apresentação, derivado de `Rule.origin` e de `CategorySuggestion.source` da F2-02) ∈ `RULE_USER` ("Regra: {nome}"), `RULE_LEARNED` ("Aprendido: você escolheu {categoria} nas últimas vezes"), `MERCHANT_DEFAULT` / `MERCHANT_RECENT` ("Última categoria deste comerciante"), `LLM` ("Sugestão da IA, {n}%"; só aparece se F5-03 estiver ativa). Não confundir com `Transaction.categorySource` (enum do schema: `USER, RULE, MERCHANT, LLM, PARSER, IMPORT`). A explicação é sempre visível, não escondida em tooltip.

### Avisos de match (F4-04)
- `matchCandidates` (PLANNED, coluna da F3-01): bloco "Parece a recorrência {nome} de {data}": **Aceitar** (funde via `applyMatch`, `resolve-match`) / **Não é esta** (mantém separada, limpa candidatos). Transação já fundida mostra **Desfazer match** (`unmatch`, F3-01/F4-04).
- `transferCandidates`: bloco "Parece uma transferência de/para {conta}": **Ligar** / **Não é transferência**.
- Marcadores rápidos no menu do cartão: "Pagamento de fatura", "Transferência pessoal", "Ignorar no orçamento".

### Criar regra
Botão "Criar regra" no cartão abre sheet com condição pré-preenchida (`merchantKey igual a X`) e categoria atual; ao editar, chama `POST /api/rules/preview` e mostra **"Afeta N lançamentos"** (`wouldChange`) com os 3 primeiros exemplos; "Salvar regra" cria (`POST /api/rules`) e oferece "Aplicar aos N existentes" (`POST /api/rules/[id]/apply`).

### Regra aprendida
Se a confirmação/correção retornar `learnedRule` (F4-03), mostrar toast: "Aprendi: {merchant} vai para {categoria}." com **Desfazer**.

### Undo e estados
- Toast "Confirmado. Desfazer" por 6 s após cada ação (`Z` no teclado). Desfazer reabre o cartão no topo.
- Estado vazio: ilustração simples com tokens, "Inbox zero" e atalho para Lançamentos/Importar.
- Carregamento: esqueleto do cartão; erro: mensagem com "Tentar de novo".
- Confirmar em lote: botão "Confirmar todos de {conta}" só para itens com sugestão 1 vinda de regra/merchant (nunca sugestão `LLM` sozinha) e sem match pendente; mostra confirmação com contagem.

## Regras de negócio
- RN-01: Confirmar = `review = REVIEWED` + categoria escolhida; se a categoria foi trocada pelo usuário, gravar `categorySource = USER` e marcar `userLocked.categoryId = true` (ADR-024) e chamar `recordCategoryDecision` (F4-03).
- RN-02: Adiar não altera a transação além de `reviewSnoozedUntil` (adicionar o campo se não existir, via `dados-prisma`); itens adiados voltam à fila após a data.
- RN-03: A fila ordena: com match pendente primeiro, depois por data decrescente, depois por valor absoluto decrescente; adiados ao fim.
- RN-04: Nenhuma ação do Inbox escreve direto no Prisma: tudo por use-cases/API (ADR-025): `POST /api/inbox/[id]/confirm`, `/defer`, `/undo`, `POST /api/inbox/confirm-batch`.
- RN-05: Confirmar uma transação com match aceito segue `resolve-match` da F4-04 antes de marcar revisada.
- RN-06: Atualização otimista com rollback se a API falhar; sem perder o cartão da tela.
- RN-07: Zero cor literal, zero valor mágico de raio/sombra: apenas tokens `--fc-*` e primitivos de `src/components/fc/`. Texto numérico com fonte tabular.
- RN-08: Valores sempre formatados a partir de centavos (`src/lib/format.ts`/`money.ts`); descrição bruta exibida truncada em 2 linhas.
- RN-09: Privacidade: modo "esconder valores" (F6-02) deve funcionar com os componentes criados; usar um componente de valor central, não formatar valor inline em vários lugares.
- RN-10: Acessibilidade: `role="list"`/`listitem`, foco gerenciado ao trocar o cartão, ações de swipe disponíveis por botão, `aria-live="polite"` para toasts.

## Critérios de aceitação
- [ ] CA-01: Com 3 transações `NEEDS_REVIEW` sintéticas, swipe à direita confirma a do topo, mostra toast com desfazer e o contador cai de 3 para 2.
- [ ] CA-02: Swipe à esquerda adia: a transação vai para o fim da fila e continua `NEEDS_REVIEW`.
- [ ] CA-03: Teclado: `X` confirma, `R` abre criar regra, `↑↓` navegam, `Z` desfaz (testado no desktop).
- [ ] CA-04: Duas sugestões aparecem com explicação textual da fonte (regra, aprendido, comerciante, IA); tocar na segunda a seleciona e a confirmação grava essa categoria.
- [ ] CA-05: Trocar a categoria e confirmar grava `categorySource = USER` e `userLocked.categoryId`.
- [ ] CA-06: Candidato de recorrência/transferência exibe aviso com Aceitar/Não é esta e executa `resolve-match`.
- [ ] CA-07: "Criar regra" mostra "Afeta N lançamentos" correto (igual ao `wouldChange` da API) e, ao salvar, a regra existe; "Aplicar aos N existentes" altera exatamente N.
- [ ] CA-08: Correção repetida (2 de 3) dispara o toast "Aprendi...".
- [ ] CA-09: Estado vazio ("Inbox zero") aparece com a fila vazia; loading e erro tratados.
- [ ] CA-10: Em 390×844 não há rolagem horizontal, alvos ≥ 44 pt, safe-area respeitada (notch e home indicator); com `prefers-reduced-motion` não há arrasto animado.
- [ ] CA-11: `grep -rnE "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(" src/components/inbox src/app/(app)/lancamentos` não retorna cores literais.
- [ ] CA-12: `npm run lint`, `npm test`, `npx next build` passam; verificação visual em 390×844 com screenshot sintético anexada ao handoff (sem dados reais).

## Impacto técnico
### Backend
Criar use-cases em `src/server/modules/ledger/application/`: `list-inbox.ts` (fila ordenada + sugestões), `confirm-transaction.ts`, `defer-transaction.ts`, `undo-review-action.ts`, `confirm-batch.ts`; suggestions em `src/server/modules/rules/application/suggest-categories.ts` (junta regra USER, LEARNED, merchant e, se existir, IA). Rotas finas em `src/app/api/inbox/route.ts` (GET), `src/app/api/inbox/[id]/confirm/route.ts`, `defer/route.ts`, `undo/route.ts`, `src/app/api/inbox/confirm-batch/route.ts`; Zod em `ledger/http/inbox-schemas.ts`.

### Frontend
Criar `src/components/inbox/` : `inbox-stack.tsx` (pilha + gestos com Pointer Events, sem biblioteca nova; `framer-motion`/`motion` só se já estiver no projeto, senão CSS transforms + `requestAnimationFrame`), `inbox-card.tsx`, `category-suggestions.tsx`, `match-notice.tsx`, `create-rule-sheet.tsx`, `inbox-empty.tsx`, `use-inbox-keyboard.ts`, `use-inbox-queue.ts` (estado otimista). Página em `src/app/(app)/lancamentos/inbox/page.tsx` ou segmento na página de lançamentos. Usar `src/components/fc/` (glass card, sheet, chip, button, toast).

### Banco de dados
`Transaction.reviewSnoozedUntil DateTime?` (se ausente) + índice `[userId, review, reviewSnoozedUntil]`.

### Integrações
Nenhuma externa; consome as APIs de regras (F4-03) e de match/marcadores (F4-04).

### Segurança
Rotas com sessão; `userId` em todo acesso; confirmação em lote limitada a ≤ 200 itens por chamada.

## Plano de implementação
- [ ] 1. Ler `src/components/fc/`, a página de lançamentos (F2-05), as APIs de regras (F4-03) e `resolve-match`/`marker` (F4-04).
- [ ] 2. Migration `reviewSnoozedUntil` (via `dados-prisma`) se necessário.
- [ ] 3. Use-cases do Inbox + sugestões + testes unitários/integração.
- [ ] 4. Rotas `api/inbox/**` com Zod.
- [ ] 5. Hook `use-inbox-queue` (otimista, undo) com testes (Vitest + Testing Library se já configurada; senão testar a lógica pura da fila).
- [ ] 6. Componentes visuais com tokens; gestos Pointer Events; teclado; reduced motion.
- [ ] 7. Sheet "criar regra" com preview e toast de regra aprendida.
- [ ] 8. Verificação manual em viewport 390×844 (DevTools) e desktop; screenshot sintética.
- [ ] 9. Atualizar `docs/ui/inbox.md` e `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: ordenação da fila (match primeiro, data, valor, adiados ao fim); lógica de gesto (limiar de distância/velocidade); reducer do estado otimista (confirmar, adiar, desfazer, falha com rollback); mapeamento de `source` → texto de explicação.
- [ ] Integração: `confirm` com troca de categoria grava `USER` + `userLocked`; `defer` não altera revisão; `confirm-batch` ignora itens com match pendente e itens com sugestão só da IA; usuário B não confirma transações do usuário A.
- [ ] E2E: roteiro manual/Playwright opcional (se a F0-07 configurou): abrir Inbox com 3 itens sintéticos, swipe, desfazer, criar regra.
- [ ] Manual: iPhone 13 Pro (PWA instalada) ou emulação: gestos com polegar, rolagem vertical não conflita com swipe (usar `touch-action: pan-y` no cartão), teclado desktop.

## Riscos e rollback
- **Conflito entre swipe horizontal e rolagem vertical** no Safari iOS: `touch-action: pan-y` e limiar de ângulo (só captura se |dx| > 2×|dy|).
- **Confirmação acidental**: undo de 6 s e botão visível; confirmação em lote com contagem.
- **Sugestão de IA errada**: nunca confirmada em lote e sempre rotulada.
- Rollback: reverter a página e as rotas `api/inbox`; o campo `reviewSnoozedUntil` é aditivo.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff
