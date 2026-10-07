---
id: FC2-F1-07
title: Categorias padrão BR + natureza Must/Need/Want
status: completed
type: feature
phase: F1
wave: 1
owner: dados-prisma
depends_on: [FC2-F0-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [categories, scripts]
related_use_cases: [ensureDefaultCategories, listCategories, updateCategory]
related_adrs: [ADR-022, ADR-024, ADR-019]
---

# FC2-F1-07 — Categorias padrão BR + natureza Must/Need/Want

## Contexto
Categorias alimentam o Flex em 3 baldes (ADR-022), a categorização por camadas (ADR-024), os relatórios Must/Need/Want (F6-03) e a captura (F2). O 1.x tinha categorias livres por usuário (`Category` com `type`, `icon`, `color` hex, `parentId`), sem natureza e sem chave estável, e as criava no seed demo. No 2.0 o banco nasce vazio e o usuário precisa começar com um conjunto padrão brasileiro, estável (chaves fixas) e classificado por **natureza**: `MUST` (obrigatório/inevitável), `NEED` (necessário, mas com margem) e `WANT` (desejo). A natureza também é herdada por merchants (`Merchant.nature`).

## Problema
- Não há categorias no schema novo; sem elas, captura, regras, importação e orçamento não funcionam.
- Sem chave estável (`key`), regras e merchants não conseguem referenciar categorias de forma idempotente entre ambientes.
- Cores em hex (1.x) violam o design system; no 2.0 a cor é uma chave de token `cat-1..cat-10`.
- Faltam categorias "de sistema" exigidas por outras tasks (juros, tarifas, IOF, DAS, empréstimos).

## Objetivo
1. Definir a árvore padrão (2 níveis) com `key`, `type`, `nature`, `icon` (lucide) e `colorKey`.
2. Função idempotente `ensureDefaultCategories(userId)` e script `npm run seed:categories`.
3. Integração com a criação do dono (`scripts/create-owner.ts`, F0-06).
4. API mínima de leitura em árvore e edição leve (renomear, arquivar, mudar natureza/cor/ícone).

## Fora de escopo
- Merchants, regras e categorização automática (F2-02, F4-03, F5-03).
- Tela de gestão de categorias (item de `Mais`, fase posterior).
- Orçamento Flex e watchlists (F3-03).
- Dados de usuário/demonstração: **nenhum seed de contas, lançamentos ou usuários**.

## Comportamento atual
1.x: `Category { id, userId, name, type INCOME|EXPENSE, icon?, color?, parentId?, createdAt }`; rotas `src/app/api/categories/**` e tela `(app)/categories`, removidas na F0-01; categorias de demonstração eram criadas por `createDemoFinanceData` (removido). No schema 2.0 (F0-02), `Category` tem `key`, `name`, `type`, `nature?`, `icon?`, `colorKey?`, `parentId?`, `sortOrder`, `isSystem`, `isArchived`, `@@unique([userId, key])`.

## Comportamento esperado
### Definição de dados (puro, versionado) — `src/server/modules/merchants/domain/default-categories.ts`
Constante `DEFAULT_CATEGORIES: DefaultCategory[]` (`{ key, name, type, nature?, icon, colorKey, parentKey?, isSystem?, sortOrder }`) e `SYSTEM_CATEGORY_KEYS` (union literal). Natureza só em `EXPENSE`. Regra de herança: filho sem `nature` explícita herda a do pai.

**Despesas** (pai > filhos). Chaves em kebab-case ASCII:
| Pai (nature, colorKey, ícone) | Filhos (nature se diferente) |
|---|---|
| `moradia` Moradia (MUST, cat-8, `house`) | `aluguel-financiamento`, `condominio`, `energia`, `agua-esgoto`, `gas`, `internet-telefone`, `iptu-taxas`, `manutencao-casa` (NEED), `moveis-eletro` (WANT) |
| `mercado` Mercado (NEED, cat-2, `shopping-cart`) | `supermercado`, `hortifruti-padaria`, `acougue-peixaria`, `limpeza-higiene` |
| `alimentacao-fora` Alimentação fora (WANT, cat-3, `utensils`) | `restaurantes`, `lanches-cafe`, `delivery` (cat-4) |
| `transporte` Transporte (NEED, cat-1, `bus`) | `transporte-publico`, `app-taxi`, `combustivel`, `estacionamento-pedagio`, `manutencao-veiculo`, `seguro-veiculo` (MUST), `ipva-licenciamento` (MUST), `viagens-passagens` (WANT) |
| `saude` Saúde (NEED, cat-9, `heart-pulse`) | `plano-saude` (MUST), `consultas-exames`, `farmacia`, `terapia-bem-estar`, `odontologia` |
| `educacao` Educação (NEED, cat-6, `graduation-cap`) | `mensalidade-curso`, `material-livros`, `cursos-online` |
| `assinaturas` Assinaturas (WANT, cat-7, `repeat`) | `streaming`, `musica-audio`, `software-nuvem`, `jogos`, `jornais-revistas` |
| `lazer` Lazer (WANT, cat-5, `party-popper`) | `cinema-shows`, `bares-baladas`, `hobbies`, `viagens-lazer`, `presentes-datas` |
| `compras` Compras (WANT, cat-6, `shopping-bag`) | `roupas-calcados`, `eletronicos`, `casa-decoracao`, `beleza-cuidados` |
| `familia` Família e pets (NEED, cat-10, `users`) | `pet`, `filhos-dependentes`, `ajuda-familia` (WANT) |
| `dividas-financeiro` Dívidas e custos financeiros (MUST, cat-8, `landmark`) — `isSystem` | `parcelas-emprestimos` (system), `juros-encargos` (system; destino padrão de `INTEREST`), `tarifas-bancarias` (system; destino de `FEE`), `iof` (system), `anuidade-cartao` (system), `multas-atrasos` (system) |
| `impostos` Impostos (MUST, cat-8, `receipt-text`) — `isSystem` | `das-mei` (system; usado por F1-06), `outros-impostos` |
| `doacoes` Doações (WANT, cat-10, `gift`) | — |
| `outros-despesas` Outros (NEED, cat-10, `circle-ellipsis`) — `isSystem` | `sem-categoria` (system; categoria de entrada do Inbox) |

**Receitas** (sem natureza): `renda-mei` Renda MEI (cat-2, `briefcase`, system; usado por F1-06) com filhos `base-mensal` e `adicional-presencial`; `salario-clt` Salário (cat-2, `wallet`); `reembolsos` Reembolsos (cat-1, `undo-2`); `rendimentos` Rendimentos de investimentos (cat-7, `trending-up`); `vendas-eventuais` Vendas e bicos (cat-4, `tag`); `outros-receitas` Outras receitas (cat-10, `circle-ellipsis`, system).

Não há categoria para transferências nem para pagamento de fatura (esses kinds não têm categoria). Total esperado: 14 pais de despesa, 58 filhos de despesa, 6 pais de receita e 2 filhos de receita (80 categorias no total).

### Aplicação — `src/server/modules/merchants/application/ensure-default-categories.ts`
- `ensureDefaultCategories(userId, { db })`: upsert por `(userId, key)` em duas passadas (pais, depois filhos com `parentId` resolvido). Em categorias já existentes **não sobrescreve** `name`, `nature`, `icon`, `colorKey` editados pelo usuário (compara com `isSystem`/`userEdited`: usar `sortOrder` e `updatedAt > createdAt` como sinal; se o usuário alterou, mantém). Cria apenas as ausentes; nunca apaga nem arquiva. Retorna `{ created, existing }`.
- `resolveNature(category, parent)`: nature efetiva (própria ou do pai; `null` para receita).
- `listCategoryTree(userId, { includeArchived })`: árvore ordenada por `sortOrder`, cada nó com `effectiveNature`.
- `updateCategory(userId, id, patch)`: permite `name`, `icon`, `colorKey` (validar `cat-1..10`), `nature` (apenas despesa), `isArchived`, `sortOrder`. **Categorias `isSystem` não podem ser arquivadas nem ter `key`/`type` alterados** (`CATEGORY_SYSTEM_LOCKED`); podem ser renomeadas.
- `createCategory(userId, input)`: filhas ou pais customizados com `key` gerada (prefixo `custom-`, slug do nome e sufixo numérico), `isSystem = false`, máx. 2 níveis (pai não pode ter pai).

### Script e integração
- `scripts/seed-categories.ts` (`npm run seed:categories`): se houver exatamente um usuário, executa `ensureDefaultCategories` e imprime o resumo; recusa e orienta se não houver usuário (`npm run owner:create`).
- `scripts/create-owner.ts` (F0-06): após criar o usuário, chama `ensureDefaultCategories`. Esta task adiciona essa chamada.
- API: `GET /api/categories` (árvore), `PATCH /api/categories/[id]`, `POST /api/categories`.

## Regras de negócio
- RN-01: `key` é estável e única por usuário; nunca muda; é o identificador usado por regras, merchants, importação e código (`SYSTEM_CATEGORY_KEYS`).
- RN-02: No máximo 2 níveis (pai > filho).
- RN-03: Natureza (MUST/NEED/WANT) existe só em categorias de despesa; filho sem natureza herda a do pai; receita tem `nature = null`.
- RN-04: Significado das naturezas: `MUST` = obrigação ou custo que não se negocia no mês (moradia, contas essenciais, dívidas, impostos, seguros obrigatórios); `NEED` = necessário à vida, mas com margem de ajuste (mercado, transporte, saúde, educação); `WANT` = desejo/lazer, o que pode ser cortado.
- RN-05: Categorias `isSystem` (juros, tarifas, IOF, DAS, empréstimos, sem categoria, renda MEI) não podem ser arquivadas nem trocar de tipo; outras tasks as referenciam por `key`.
- RN-06: Cor/ícone são chaves de token (`cat-N`) e nomes lucide; nunca hex.
- RN-07: `ensureDefaultCategories` é idempotente e não destrói edições do usuário.
- RN-08: Nenhum dado pessoal em categorias; só rótulos genéricos.

## Critérios de aceitação
- [x] CA-01: Em um banco vazio com um usuário, `npm run seed:categories` cria todas as categorias da tabela (contagem exata fixada em teste: pais e filhos) e imprime `created=N existing=0`; rodar de novo imprime `created=0 existing=N`.
- [x] CA-02: Cada categoria de despesa tem `effectiveNature` definida; cada categoria de receita tem `null`; filhos sem natureza própria herdam a do pai (ex.: `supermercado` -> NEED; `seguro-veiculo` -> MUST apesar do pai NEED; `moveis-eletro` -> WANT apesar do pai MUST).
- [x] CA-03: Os `colorKey` de todas as categorias pertencem a `cat-1..cat-10` e os `icon` são strings não vazias existentes em `lucide-react` (teste verifica contra `lucide-react` exports).
- [x] CA-04: `key` é única, kebab-case ASCII (`/^[a-z0-9]+(-[a-z0-9]+)*$/`), e `parentKey` aponta para um pai existente (sem ciclo; profundidade <= 2).
- [x] CA-05: Renomear `supermercado` para "Feira e Mercado" e rodar `ensureDefaultCategories` mantém o nome editado e não duplica.
- [x] CA-06: `PATCH` de arquivar categoria `isSystem` retorna 409 `CATEGORY_SYSTEM_LOCKED`; arquivar `lazer` funciona e some da árvore padrão.
- [x] CA-07: `SYSTEM_CATEGORY_KEYS` contém no mínimo: `juros-encargos`, `tarifas-bancarias`, `iof`, `anuidade-cartao`, `multas-atrasos`, `parcelas-emprestimos`, `das-mei`, `renda-mei`, `sem-categoria`, `outros-receitas`.
- [x] CA-08: `npm run owner:create` (F0-06) em banco vazio resulta em usuário + categorias padrão.
- [x] CA-09: `GET /api/categories` sem sessão retorna 401; com sessão devolve árvore com `effectiveNature` e sem categorias de outro usuário.
- [x] CA-10: `npm run lint`, `npm test`, `npx next build`, `npm run format:check`, `npm run guard:data` passam.

## Impacto técnico
### Backend
Novo módulo `src/server/modules/merchants/` (domínio de categorias vive aqui porque categorias, merchants e regras se referenciam; não existe módulo `categories` separado na estrutura-alvo): `domain/default-categories.ts`, `domain/nature.ts`, `application/{ensure-default-categories,list-category-tree,update-category,create-category}.ts`, `infra/prisma-category-repository.ts`, `http/schemas.ts`. Rotas `src/app/api/categories/**`.
### Frontend
Nenhum (a gestão de categorias é posterior). Os primitivos `CategoryIcon` (F0-04) consomem `icon` e `colorKey`.
### Banco de dados
Sem migration (campos já existem na F0-02). Dados inseridos por script, não por migration (evita acoplar dados de usuário a migrations). Se a F0-02 não incluir `userEdited`, usar o critério `updatedAt > createdAt` e registrar em Decisões.
### Integrações
`lucide-react` (nomes de ícone).
### Segurança
Isolamento por `userId`; Zod nas entradas; nenhum dado sensível. O script só roda localmente (usa `DATABASE_URL`).

## Plano de implementação
- [x] Etapa 1 — Ler ADR-022/024, §6 da especificação, `tokens.css` (paleta `--fc-cat-1..10`), o schema 2.0 (`Category`) e o seed demo do 1.x via `git show fc-1.x-final:src/server/modules/finance/application/demo/create-demo-finance-data.ts` (apenas para comparar nomes; não copiar dados).
- [x] Etapa 2 — `default-categories.ts` com a árvore completa; `nature.ts` (`resolveNature`); testes de integridade (CA-02/03/04).
- [x] Etapa 3 — `ensure-default-categories.ts` (duas passadas, idempotente) com repositório em memória e testes.
- [x] Etapa 4 — Repositório Prisma, `list-category-tree`, `update-category`, `create-category`, schemas Zod e rotas.
- [x] Etapa 5 — `scripts/seed-categories.ts`, script npm e integração com `scripts/create-owner.ts`.
- [x] Etapa 6 — Docs: `docs/domain/categories.md` (árvore, natureza, chaves de sistema), `.agents/context/CONTEXT.md`, `PLANS.md`; commit `feat(f1-categorias): categorias padrão BR e natureza must/need/want`.

## Estratégia de testes
- [x] Unitários: integridade da árvore (chaves únicas, `parentKey` válido, profundidade, `colorKey` válido, ícones existentes, natureza só em despesa); `resolveNature` (filho com natureza própria; filho herdando; receita; pai inexistente lança); contagens exatas de categorias por tipo; `SYSTEM_CATEGORY_KEYS` todas presentes na árvore e marcadas `isSystem`.
- [x] Integração (repositório em memória): `ensureDefaultCategories` em vazio, repetido, após renomear, após arquivar uma não-sistema (continua arquivada e não é recriada) e após apagar manualmente uma categoria (é recriada, pois `key` ausente); `updateCategory` em `isSystem`; `createCategory` com pai que já é filho (rejeita).
- [x] Integração (banco de teste): unique `(userId, key)` respeitada; segunda execução não gera duplicata nem erro.
- [x] E2E: não aplicável.
- [x] Manual: `npm run owner:create` + `npm run seed:categories` em banco descartável; `curl /api/categories` e conferir a árvore.

## Riscos e rollback
- **Árvore grande demais** gera ruído no Inbox: manter os 58 filhos de despesa; usuário pode arquivar. A F4-03/F5-03 usa as `key`s, então não renomear chaves depois.
- **Natureza questionável** (ex.: plano de saúde MUST vs NEED): a natureza é editável por usuário; as escolhas padrão são pontos de partida.
- **Recriação inesperada**: categoria apagada manualmente volta no próximo `ensure`; por isso a UI deve arquivar, não excluir (apagar físico não existe na API).
- Rollback: `git revert`; categorias criadas ficam no banco (inofensivas). Para limpar em ambiente de teste, truncar a tabela.

## Registro de execução
### Alterações realizadas
- Módulo novo `src/server/modules/categories/` em camadas (ADR-025): `domain/` (árvore padrão, `resolveNature`, regras de edição/criação, árvore, erros), `application/` (`ensureDefaultCategories`, `listCategoryTree`, `updateCategory`, `createCategory`, `seedCategoriesForOwner`, porta `CategoryRepository`), `infra/` (repositório Prisma por injeção de cliente), `http/` (Zod e mapeamento de erros) e `index.ts` com a API pública.
- Rotas finas `GET/POST /api/categories` e `PATCH /api/categories/[id]` com `requireAuth()` no handler (o proxy já devolve 401 sem cookie).
- `scripts/seed-categories.ts` (`npm run seed:categories`) e integração em `scripts/create-owner.ts` por gancho opcional `onOwnerCreated` em `createOwner` (a lógica de auth não importa o módulo de categorias).
- Árvore padrão: 80 categorias (14 pais e 58 filhos de despesa; 6 pais e 2 filhos de receita), 13 chaves de sistema.
- Documentação: `docs/domain/categories.md` (e entrada em `docs/domain/README.md`).

### Arquivos principais
- `src/server/modules/categories/domain/{default-categories,nature,category-rules,types,errors}.ts`
- `src/server/modules/categories/application/{ports,ensure-default-categories,list-category-tree,update-category,create-category,seed-categories}.ts`
- `src/server/modules/categories/infra/{prisma-category-repository,default-repository}.ts`
- `src/server/modules/categories/http/{schemas,error-response}.ts`
- `src/app/api/categories/route.ts`, `src/app/api/categories/[id]/route.ts`
- `scripts/seed-categories.ts`, `scripts/create-owner.ts`, `src/server/auth/owner.ts`, `package.json` (só o script)
- Testes: `domain/*.test.ts`, `application/categories.test.ts`, `infra/prisma-category-repository.integration.test.ts`, `src/app/api/categories/routes.test.ts`, `src/server/auth/owner-categories.test.ts`, `tests/helpers/category-fakes.ts`

### Decisões
- Módulo `categories/` (não `merchants/` como no texto original da task): decisão do orquestrador para a F1; `merchants/` nasce nas F2/F4 e consome `SYSTEM_CATEGORY_KEYS` e `resolveNature` por `index.ts`.
- Sem migration e sem `userEdited`: o critério `updatedAt > createdAt` ficou desnecessário porque `ensureDefaultCategories` nunca atualiza campos de categoria existente (só cria ausentes e reata filho sem pai). Edições e arquivamentos do usuário sobrevivem por construção; um teste de integração confere `updatedAt > createdAt` após renomear.
- Filhos que herdam natureza gravam `nature = null` (a herança é calculada em `effectiveNature`); trocar a natureza do pai propaga aos filhos que herdam. Subcategoria pode voltar a herdar com `nature: null`; raiz de despesa não pode ficar sem natureza.
- `key` e `type` imutáveis para qualquer categoria: em categoria de sistema a tentativa responde `CATEGORY_SYSTEM_LOCKED` (409); em categoria comum, `CATEGORY_INVALID` (422). O PATCH aceita `key`/`type` no schema só para devolver esse erro claro.
- Arquivar um pai some com os filhos da árvore padrão (sem arquivar os filhos em cascata). Não existe exclusão física na API.
- Códigos HTTP: 400 corpo/consulta inválidos (Zod), 404 `CATEGORY_NOT_FOUND` (inclusive id de outro usuário), 409 `CATEGORY_SYSTEM_LOCKED`, 422 `CATEGORY_INVALID` e `CATEGORY_MAX_DEPTH`.
- Ícone `circle-help` do texto da task foi trocado por `circle-question-mark` (nome vigente em `lucide-react` 1.x; verificado contra os exports do pacote instalado).
- `createOwner` com falha no gancho lança erro explicando que o dono foi criado e que `npm run seed:categories` conclui a semeadura (idempotente).

### Divergências
- Caminho do módulo (`categories/` em vez de `merchants/`), ver Decisões.
- Contrato de `ensureDefaultCategories`: recebe `{ categories }` (porta) em vez de `{ db }`.
- `prisma/migration.contract.test.ts` (F0-02, CA-07 "sem seed") reprovava qualquer ocorrência de "seed" em `package.json`, o que bloqueia o script `seed:categories` exigido por esta task. Alteração mínima no teste: remove do texto apenas a linha exata do script `seed:categories` antes da verificação; qualquer outro "seed" (ex.: `prisma db seed`, bloco `prisma.seed`) continua reprovando. Fora do escopo declarado do papel; sinalizado ao orquestrador para revisão.
- `CategoryIcon` (F0-04) tem conjunto curado que não cobre a maioria dos ícones padrão (cai em `tag`; usa `home` onde a árvore usa `house`).

### Pendências
- UI: estender `CATEGORY_ICONS` em `src/components/fc/category-icon.tsx` para os ícones da árvore padrão (papel `ui-design-system`); tela de gestão de categorias fica para fase posterior (fora de escopo).
- Etapa 6 pede atualizar `.agents/context/CONTEXT.md` e `PLANS.md`: não alterados nesta entrega por orientação do orquestrador.
- F1-06 decide se `base-mensal` e `adicional-presencial` devem ser de sistema.
- O prompt interativo de `npm run owner:create` (TTY, senha sem eco) não foi exercitado; o caminho foi validado com o mesmo `createOwner` e repositórios Prisma reais num script temporário (CA-08).

## Validação
Ambiente: Postgres 16 descartável em container local (`fc2_f107_test`, porta 55438; parado ao final). Nada foi executado contra outro banco, nem `npm run build`.

- `npm run lint`: 0 erros, 0 warnings.
- `npm run typecheck`: ok.
- `npm test`: 36 arquivos passam, 540 testes passam, 7 pulados (integração; sem `DATABASE_URL_TEST`). Com `DATABASE_URL_TEST` apontando ao banco descartável: 547 testes, nenhum pulado.
- `npm run test:coverage`: domínio de categorias com 99,2% de linhas e ramos (limite 80%).
- `npm run guard:data`: 3 arquivos, 154 testes passam.
- `npx prettier --check --end-of-line auto .`: ok.
- `DATABASE_URL=<placeholder ci> npx next build`: ok; rotas `/api/categories` e `/api/categories/[id]` listadas.
- CA-01: `npm run seed:categories` em banco vazio com um usuário sintético: `created=80 existing=0`; segunda execução: `created=0 existing=80`. Sem usuário: recusa orientando `npm run owner:create`. Contagem no banco: despesa 72 (58 com pai, 21 com natureza própria), receita 8 (2 com pai).
- CA-02/03/04/07: `default-categories.test.ts` (contagens exatas, herança, `colorKey` em `cat-1..10`, ícones existentes em `lucide-react`, keys únicas kebab-case, profundidade, `SYSTEM_CATEGORY_KEYS` iguais ao conjunto `isSystem`).
- CA-05: teste em memória e de integração (nome editado preservado, sem duplicata, `updatedAt > createdAt`).
- CA-06: `PATCH` em `iof` retornou 409 `CATEGORY_SYSTEM_LOCKED`; `PATCH` arquivando `lazer` retornou 200 e a árvore passou de 20 para 19 raízes (dev server local contra o banco descartável, com login real do usuário sintético).
- CA-08: `createOwner` com `ensureDefaultCategories` e repositórios Prisma reais: `{"ok":true,...,"categories":{"created":80,"existing":0}}`, 1 usuário e 80 categorias. Lógica coberta sem banco em `owner-categories.test.ts`; testes da F0-06 (`owner.test.ts`) seguem verdes.
- CA-09: `curl /api/categories` sem cookie: HTTP 401 `{"error":"Não autorizado"}`; com sessão: 20 raízes e 60 filhos, `transporte` NEED com `seguro-veiculo` MUST e `viagens-passagens` WANT. O isolamento por usuário está em `routes.test.ts` e no teste de integração.
- CA-10: lint, testes, build, prettier e guard de dados passam (ver acima).

### Parecer QA (qa-revisor) - APROVADO
Ambiente: Postgres 16 descartável (`fc2_cat_test`, porta 55440, container parado ao final). Nada contra Neon; sem `npm run build`.

- `npm run lint`, `npm run typecheck`: sem erros. `npm run guard:data`: 3 arquivos, 154 testes. `npx prettier --check --end-of-line auto .`: ok.
- `npm test`: 36 arquivos, 540 passam, 7 pulados (integração sem `DATABASE_URL_TEST`). `npm run test:coverage`: domínio de categorias 99,2% linhas e ramos (limite 80%).
- `DATABASE_URL=<placeholder ci> npx next build`: ok; `/api/categories` e `/api/categories/[id]` listadas.
- Com `DATABASE_URL_TEST` (migration aplicada no banco descartável): `vitest run src/server/modules/categories`: 5 arquivos, 69 testes, nenhum pulado.
- CA-01: usuário sintético por SQL; `npm run seed:categories` 1a vez `created=80 existing=0`, 2a vez `created=0 existing=80`; banco: despesa 72 (58 filhos, 21 com natureza própria), receita 8 (2 filhos), 0 duplicatas `(user_id, key)`.
- CA-02..CA-07, CA-09: cobertos por testes (ver `default-categories.test.ts`, `categories.test.ts`, `routes.test.ts`); conteúdo da árvore revisado (sem marcas/terceiros/dígitos; naturezas conforme especificação; `SYSTEM_CATEGORY_KEYS` inclui as 10 chaves do CA-07 mais 3 pais de sistema).
- CA-08: `createOwner` + gancho `onOwnerCreated` (testes em `owner-categories.test.ts`); prompt TTY não exercitado (já declarado).
- Achados menores (não bloqueiam): `listCategoriesQuerySchema` não é `.strict()` (query ignora parâmetros desconhecidos); `isIconName` só valida o formato (ícone inexistente em lucide cai no fallback do `CategoryIcon`); front matter da task ainda lista `merchants` em `affected_modules`; `CATEGORY_ICONS` do `CategoryIcon` não cobre a árvore (pendência já registrada); Etapa 6 (CONTEXT.md/PLANS.md) fica com o orquestrador.

## Handoff
Sem handoff ativo.
