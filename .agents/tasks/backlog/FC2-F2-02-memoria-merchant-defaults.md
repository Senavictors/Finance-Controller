---
id: FC2-F2-02
title: Memória de merchant e defaults de captura
status: backlog
type: feature
phase: F2
wave: 2
owner: dominio-financeiro
depends_on: [FC2-F2-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [merchants, capture]
related_use_cases: []
related_adrs: [ADR-024, ADR-025, ADR-002]
---

# FC2-F2-02 — Memória de merchant e defaults de captura

## Contexto
O parser (FC2-F2-01) devolve só texto: `description: "ifood"`, valor, conta. Para lançar em menos de 5 segundos o usuário não pode escolher categoria nem conta toda vez. A categorização é em camadas com override do usuário (ADR-024): camada 1 é a escolha explícita do usuário (sempre vence), camada 2 é a memória do merchant (esta task), camada 3 são regras aprendidas/usuário (FC2-F4-03) e camada 4 é LLM few-shot (FC2-F5-03). Esta task entrega as camadas 1 e 2 e os defaults de conta, para o Draft já chegar à sheet com categoria sugerida, conta provável e top-2 alternativas.

## Problema
No 1.x a categoria é um campo obrigatório escolhido a cada lançamento (`src/components/category-picker.tsx` e `src/app/(app)/transactions/transaction-form.tsx`), e a conta default é a primeira em ordem alfabética, o que gera erro de conta (spec §1, "Lançar é caro"). Não existe entidade de merchant; a descrição é texto solto e nada aprende com o uso.

## Objetivo
1. Normalizar descrições em uma chave de merchant estável (`ifood`, `uber`, `amazon`).
2. Aprender com cada lançamento confirmado: atualizar `Merchant` (categoria padrão, últimas 3 categorias, conta mais usada).
3. Enriquecer um Draft com `categoryId` sugerida, `categorySource`, `confidence`, top-2 alternativas explicadas e conta default, respeitando a hierarquia de camadas.
4. Fornecer "sugestões recentes" (descrições mais usadas/recentes) para a sheet.

## Fora de escopo
- Motor de regras e normalização de descrição bruta de extratos (`FC2-F4-03`).
- LLM (`FC2-F5-03`).
- UI (a sheet consome via `FC2-F2-04`).
- Natureza Must/Need/Want por merchant além de guardar o campo (a edição fica em "Mais").

## Comportamento atual
Não há `Merchant` no 1.x. Há `Category` com `type` INCOME/EXPENSE e `Transaction.description` (`prisma/schema.prisma`, 1.x). O picker `src/components/category-picker.tsx` é reaproveitável como referência de UI para a F2-04, não como lógica.

## Comportamento esperado
Contrato (arquivo `src/server/modules/merchants/domain/types.ts`):
```ts
export type MerchantMemory = {
  id: string
  key: string                        // chave normalizada
  aliases: string[]
  defaultCategoryId: string | null   // definida/travada pelo usuário ou promovida pelo aprendizado
  defaultCategoryLocked: boolean     // true quando o usuário escolheu "sempre usar esta categoria"
  lastCategoryIds: string[]          // até 3, mais recente primeiro
  lastAccountIds: { accountId: string; count: number; lastUsedAt: string }[]
  nature: 'MUST' | 'NEED' | 'WANT' | null
}

export type CategorySuggestion = {
  categoryId: string
  source: 'USER_LOCK' | 'MERCHANT_DEFAULT' | 'MERCHANT_RECENT'
  confidence: number                 // 0..1
  reason: string                     // texto curto para a UI: "Você usou 'Delivery' nas últimas 3 vezes"
}

export type EnrichedDraft = Draft & {
  merchantKey: string | null
  categoryId: string | null
  categorySource: CategorySuggestion['source'] | null
  alternatives: CategorySuggestion[]     // no máximo 2, sem repetir categoryId
  accountSuggestion: { id: string; reason: string } | null
}
```
Função pura principal: `enrichDraft(draft: Draft, memory: MerchantMemory | null, recentAccountId: string | null): EnrichedDraft`. Use-case de aprendizado: `learnFromTransaction(tx)` em `application/`. Consulta: `listRecentMerchants(userId, limit)`.

Hierarquia (RN abaixo): escolha explícita na sheet (`userLocked.categoryId` no Transaction, já gravado pela F2-03) > `Merchant.defaultCategoryLocked` > `defaultCategoryId` promovido > categoria mais recente se as últimas 3 coincidem > nada (a F4-03/F5-03 podem preencher depois).

## Regras de negócio
- RN-01 (chave): `normalizeMerchantKey(raw)` aplica minúsculas, remove acentos, remove prefixos de meio de pagamento (`pix`, `compra`, `pgto`, `debito`, `credito`, `pag`, `*`), remove dígitos finais de filial/loja e pontuação, descarta stopwords (`de`, `da`, `do`, `dos`, `das`, `e`), colapsa espaços e usa até as 2 primeiras palavras significativas. `"iFood *Restaurante 12"` e `"IFOOD"` geram `ifood`. `"Uber Trip"` gera `uber`. `"Mercado Livre"` mantém `mercado livre` (2 palavras).
- RN-02 (aliases): variações vistas viram `aliases` do mesmo `Merchant` quando a chave difere mas o usuário confirma a mesma categoria 2 vezes; não há fusão automática de chaves diferentes sem essa confirmação.
- RN-03 (promoção): quando as últimas 3 categorias confirmadas do merchant são iguais, `defaultCategoryId` passa a essa categoria. Duas categorias diferentes nas últimas 3 não promovem e o merchant fica sem default, mas as duas entram em `alternatives`.
- RN-04 (override do usuário): se o usuário troca a categoria de uma sugestão na sheet ou na lista, o `learnFromTransaction` registra a nova categoria em `lastCategoryIds`; se ele marca "sempre usar esta categoria", `defaultCategoryLocked = true` e nenhuma promoção automática a altera depois. Desfazer o travamento é uma ação explícita.
- RN-05 (confiança): `USER_LOCK` = 1.00; `MERCHANT_DEFAULT` promovido = 0.90; `MERCHANT_RECENT` (só o último uso) = 0.55. O texto `reason` cita a contagem real ("nas últimas 3 vezes").
- RN-06 (conta): conta sugerida só quando o Draft não traz conta no texto (`account == null`): usa a conta mais frequente do merchant nos últimos 90 dias; empate vai para a mais recente; se o merchant é desconhecido usa `recentAccountId` (última conta usada em qualquer lançamento). Nunca ordenar contas alfabeticamente.
- RN-07 (tipo): a categoria sugerida deve ter `type` compatível com o `kind` do Draft (EXPENSE usa categoria de despesa; INCOME usa de entrada). Categoria incompatível é descartada. TRANSFER não recebe categoria.
- RN-08 (privacidade): `Merchant` guarda só texto de descrição e ids; nenhum dado de conta bancária ou nome de terceiro identificável é copiado para exemplos de teste.
- RN-09 (idempotência): `learnFromTransaction` pode ser chamado duas vezes para a mesma transação sem duplicar contagem (chave `transactionId` em `lastAccountIds` não é guardada; usar `Transaction.merchantId` já preenchido como sinal de "já aprendida").
- RN-10 (recentes): `listRecentMerchants` retorna até 8 merchants distintos dos últimos 60 dias, ordenados por frequência e depois por recência, cada um com categoria default, conta provável e último valor, para os "chips de sugestão" da sheet.

## Critérios de aceitação
- [ ] CA-01: `normalizeMerchantKey` resolve os exemplos de RN-01 (tabela de 15 casos, abaixo).
- [ ] CA-02: após 3 confirmações do mesmo merchant com a mesma categoria, `enrichDraft` devolve `categorySource = 'MERCHANT_DEFAULT'`, confiança 0.90 e `reason` citando 3 vezes.
- [ ] CA-03: com 2 categorias diferentes nas últimas 3 confirmações, não há default; `alternatives` traz as duas (máximo 2) e `categoryId` fica nulo.
- [ ] CA-04: `defaultCategoryLocked = true` não é alterada por 3 confirmações de outra categoria; só `lastCategoryIds` muda.
- [ ] CA-05: conta sugerida respeita RN-06 (mais frequente em 90 dias, empate pela mais recente, fallback para `recentAccountId`).
- [ ] CA-06: categoria de tipo incompatível nunca é sugerida (RN-07).
- [ ] CA-07: toda consulta e escrita do módulo filtra por `userId`.
- [ ] CA-08: `learnFromTransaction` chamado duas vezes para a mesma transação não altera contagens na segunda chamada.
- [ ] CA-09: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
- `src/server/modules/merchants/domain/normalize-merchant.ts` (+ teste), `suggest-defaults.ts` (`enrichDraft`, puro, + teste), `types.ts`.
- `src/server/modules/merchants/application/learn-from-transaction.ts`, `list-recent-merchants.ts`, `lock-merchant-category.ts` (use-cases; a mesma função serve UI, bot e MCP, ADR-025).
- `src/server/modules/merchants/infra/merchant-repository.ts` (Prisma; `findByKey(userId, key)`, `upsert`, `recentByUser`).
- `src/server/modules/merchants/http/schemas.ts` (Zod para lock/unlock).
- Rota fina `src/app/api/merchants/recent/route.ts` (GET) e `src/app/api/merchants/[id]/category-lock/route.ts` (PUT, DELETE).
- Integração com a F2-03: `createFromDraft` chama `learnFromTransaction` após persistir (via gancho `afterCreate`, ver FC2-F2-03).
### Frontend
Nenhum (consumo na FC2-F2-04).
### Banco de dados
Usa o modelo `Merchant` criado na FC2-F0-02 (aliases, categoria padrão, últimas 3 categorias, natureza). Campos `defaultCategoryLocked` e `lastAccountIds Json` podem não existir no schema da F0-02: conferir `prisma/schema.prisma`; se faltarem, criar migration `add_merchant_memory_fields` (somente colunas aditivas e nulas) e registrar em "Divergências". Índice recomendado: `@@unique([userId, key])`.
### Integrações
Nenhuma externa.
### Segurança
Todas as rotas exigem sessão (`requireAuth`, padrão do 1.x em `src/server/auth`) e filtram por `userId`. Validar `categoryId` pertence ao usuário antes do lock.

## Plano de implementação
- [ ] Etapa 1: `types.ts` e `normalize-merchant.ts` com a tabela de testes.
- [ ] Etapa 2: `suggest-defaults.ts` (`enrichDraft`) com RN-03, RN-05 a RN-07; função pura.
- [ ] Etapa 3: `merchant-repository.ts` e verificação do schema (migration aditiva se preciso).
- [ ] Etapa 4: `learn-from-transaction.ts` (RN-02 a RN-04, RN-09), transação Prisma única.
- [ ] Etapa 5: `list-recent-merchants.ts` (RN-10) e `lock-merchant-category.ts`.
- [ ] Etapa 6: rotas finas e schemas Zod.
- [ ] Etapa 7: expor `enrichDraft` no `index.ts` do módulo e documentar o gancho para a F2-03.
- [ ] Etapa 8: atualizar `docs/domain/` e `.agents/context/CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários, `normalizeMerchantKey` (entrada, chave esperada): `iFood *Restaurante 12` e `ifood`; `IFOOD` e `ifood`; `Uber Trip` e `uber`; `UBER *TRIP 8821` e `uber`; `Pix Padaria Central` e `padaria central`; `compra amazon.com.br` e `amazon`; `Mercado Livre*Pedido` e `mercado livre`; `açaí da vila` e `acai vila`; `   ` e `` (vazio, merchant nulo); `99` e `99`; `Netflix.com` e `netflix`; `PAG*Farmacia 03` e `farmacia`; `Posto 24h` e `posto`; `Spotify` e `spotify`; `iFood iFood` e `ifood`.
- [ ] Unitários, `enrichDraft`: promoção com 3 iguais; 2 diferentes sem default; lock vence; categoria incompatível descartada; merchant nulo mantém `categoryId` nulo e mantém conta do texto; conta do texto nunca é substituída pela sugerida; `alternatives` nunca repete a categoria principal; no máximo 2.
- [ ] Unitários, conta: frequências 5 x 3 vence 5; empate 3 x 3 vence a mais recente; fora da janela de 90 dias é ignorada.
- [ ] Integração (Prisma, banco de teste ou mocks do repositório conforme padrão da FC2-F0-07): `learnFromTransaction` x2 idempotente; isolamento por `userId` (merchant de outro usuário nunca é lido).
- [ ] E2E: não aplicável.
- [ ] Manual: lançar 3x `uber 18 nubank` na F2-04 e verificar que a quarta já vem com categoria e explicação.

Edge cases: merchant com categoria apagada pelo usuário (default vira nulo, sem erro); transferência não aprende categoria; estorno (`isRefund`) não conta como confirmação de categoria de despesa; descrição vazia não cria Merchant.

## Riscos e rollback
- Risco: promoção errada por 3 lançamentos iguais mas coincidentes (ex.: `mercado` usado em duas naturezas). Mitigação: sempre mostrar `reason` e permitir lock/unlock; override do usuário vence.
- Risco: chave curta demais colidir (`99`). Mitigação: chave nunca vazia; aliases só por confirmação.
- Rollback: tabelas/colunas aditivas; desabilitar o gancho `afterCreate` de aprendizado reverte o comportamento sem tocar dados.

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
