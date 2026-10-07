---
id: FC2-F1-07
title: Categorias padrão BR + natureza Must/Need/Want
status: active
type: feature
phase: F1
wave: 1
owner: dados-prisma
depends_on: [FC2-F0-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [merchants, categories, scripts]
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
- [ ] CA-01: Em um banco vazio com um usuário, `npm run seed:categories` cria todas as categorias da tabela (contagem exata fixada em teste: pais e filhos) e imprime `created=N existing=0`; rodar de novo imprime `created=0 existing=N`.
- [ ] CA-02: Cada categoria de despesa tem `effectiveNature` definida; cada categoria de receita tem `null`; filhos sem natureza própria herdam a do pai (ex.: `supermercado` -> NEED; `seguro-veiculo` -> MUST apesar do pai NEED; `moveis-eletro` -> WANT apesar do pai MUST).
- [ ] CA-03: Os `colorKey` de todas as categorias pertencem a `cat-1..cat-10` e os `icon` são strings não vazias existentes em `lucide-react` (teste verifica contra `lucide-react` exports).
- [ ] CA-04: `key` é única, kebab-case ASCII (`/^[a-z0-9]+(-[a-z0-9]+)*$/`), e `parentKey` aponta para um pai existente (sem ciclo; profundidade <= 2).
- [ ] CA-05: Renomear `supermercado` para "Feira e Mercado" e rodar `ensureDefaultCategories` mantém o nome editado e não duplica.
- [ ] CA-06: `PATCH` de arquivar categoria `isSystem` retorna 409 `CATEGORY_SYSTEM_LOCKED`; arquivar `lazer` funciona e some da árvore padrão.
- [ ] CA-07: `SYSTEM_CATEGORY_KEYS` contém no mínimo: `juros-encargos`, `tarifas-bancarias`, `iof`, `anuidade-cartao`, `multas-atrasos`, `parcelas-emprestimos`, `das-mei`, `renda-mei`, `sem-categoria`, `outros-receitas`.
- [ ] CA-08: `npm run owner:create` (F0-06) em banco vazio resulta em usuário + categorias padrão.
- [ ] CA-09: `GET /api/categories` sem sessão retorna 401; com sessão devolve árvore com `effectiveNature` e sem categorias de outro usuário.
- [ ] CA-10: `npm run lint`, `npm test`, `npx next build`, `npm run format:check`, `npm run guard:data` passam.

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
- [ ] Etapa 1 — Ler ADR-022/024, §6 da especificação, `tokens.css` (paleta `--fc-cat-1..10`), o schema 2.0 (`Category`) e o seed demo do 1.x via `git show fc-1.x-final:src/server/modules/finance/application/demo/create-demo-finance-data.ts` (apenas para comparar nomes; não copiar dados).
- [ ] Etapa 2 — `default-categories.ts` com a árvore completa; `nature.ts` (`resolveNature`); testes de integridade (CA-02/03/04).
- [ ] Etapa 3 — `ensure-default-categories.ts` (duas passadas, idempotente) com repositório em memória e testes.
- [ ] Etapa 4 — Repositório Prisma, `list-category-tree`, `update-category`, `create-category`, schemas Zod e rotas.
- [ ] Etapa 5 — `scripts/seed-categories.ts`, script npm e integração com `scripts/create-owner.ts`.
- [ ] Etapa 6 — Docs: `docs/domain/categories.md` (árvore, natureza, chaves de sistema), `.agents/context/CONTEXT.md`, `PLANS.md`; commit `feat(f1-categorias): categorias padrão BR e natureza must/need/want`.

## Estratégia de testes
- [ ] Unitários: integridade da árvore (chaves únicas, `parentKey` válido, profundidade, `colorKey` válido, ícones existentes, natureza só em despesa); `resolveNature` (filho com natureza própria; filho herdando; receita; pai inexistente lança); contagens exatas de categorias por tipo; `SYSTEM_CATEGORY_KEYS` todas presentes na árvore e marcadas `isSystem`.
- [ ] Integração (repositório em memória): `ensureDefaultCategories` em vazio, repetido, após renomear, após arquivar uma não-sistema (continua arquivada e não é recriada) e após apagar manualmente uma categoria (é recriada, pois `key` ausente); `updateCategory` em `isSystem`; `createCategory` com pai que já é filho (rejeita).
- [ ] Integração (banco de teste): unique `(userId, key)` respeitada; segunda execução não gera duplicata nem erro.
- [ ] E2E: não aplicável.
- [ ] Manual: `npm run owner:create` + `npm run seed:categories` em banco descartável; `curl /api/categories` e conferir a árvore.

## Riscos e rollback
- **Árvore grande demais** gera ruído no Inbox: manter os 58 filhos de despesa; usuário pode arquivar. A F4-03/F5-03 usa as `key`s, então não renomear chaves depois.
- **Natureza questionável** (ex.: plano de saúde MUST vs NEED): a natureza é editável por usuário; as escolhas padrão são pontos de partida.
- **Recriação inesperada**: categoria apagada manualmente volta no próximo `ensure`; por isso a UI deve arquivar, não excluir (apagar físico não existe na API).
- Rollback: `git revert`; categorias criadas ficam no banco (inofensivas). Para limpar em ambiente de teste, truncar a tabela.

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
