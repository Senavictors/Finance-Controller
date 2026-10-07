---
estado: real
fonte: src/server/modules/categories/ (domain/default-categories.ts, domain/nature.ts, application/); task FC2-F1-07
ultima-revisao: FC2-F1-07 2026-10-05
---

# Categorias padrão BR e natureza Must/Need/Want

Categorias alimentam o orçamento Flex (ADR-022), a categorização por camadas (ADR-024), os relatórios por natureza e a captura. O banco do 2.0 nasce vazio: as categorias padrão são semeadas por `ensureDefaultCategories(userId)` (script e criação do dono), nunca por migration.

## Modelo

`Category` (ver `docs/data/modelo-fc2.md`): `key` (estável, única por usuário), `name`, `type` (`INCOME`/`EXPENSE`), `nature` (`MUST`/`NEED`/`WANT`, só despesa), `icon` (nome lucide em kebab-case), `colorKey` (`cat-1..cat-10`, token `--fc-cat-N`, nunca hex), `parentId` (no máximo 2 níveis), `sortOrder`, `isSystem`, `isArchived`.

- **Natureza**: `MUST` é obrigação ou custo que não se negocia no mês; `NEED` é necessário à vida, mas com margem; `WANT` é desejo, o que pode ser cortado. Filho sem natureza própria herda a do pai (`effectiveNature`); receita tem `null`. As escolhas padrão são ponto de partida, editáveis.
- **`key` nunca muda** (identificador usado por regras, merchants, importação e código). Categorias criadas pelo usuário recebem `custom-<slug>[-N]`.
- **Sem exclusão física**: a UI arquiva. Uma categoria padrão apagada à mão no banco é recriada no próximo `ensure`.

## Árvore padrão (80 categorias: 14 pais e 58 filhos de despesa; 6 pais e 2 filhos de receita)

Filhos herdam natureza e cor do pai, salvo indicação entre parênteses.

| Pai | Natureza | Cor | Ícone | Sistema | Filhos |
| --- | --- | --- | --- | --- | --- |
| `moradia` Moradia | MUST | cat-8 | `house` | não | `aluguel-financiamento`, `condominio`, `energia`, `agua-esgoto`, `gas`, `internet-telefone`, `iptu-taxas`, `manutencao-casa` (NEED), `moveis-eletro` (WANT) |
| `mercado` Mercado | NEED | cat-2 | `shopping-cart` | não | `supermercado`, `hortifruti-padaria`, `acougue-peixaria`, `limpeza-higiene` |
| `alimentacao-fora` Alimentação fora | WANT | cat-3 | `utensils` | não | `restaurantes`, `lanches-cafe`, `delivery` (cat-4) |
| `transporte` Transporte | NEED | cat-1 | `bus` | não | `transporte-publico`, `app-taxi`, `combustivel`, `estacionamento-pedagio`, `manutencao-veiculo`, `seguro-veiculo` (MUST), `ipva-licenciamento` (MUST), `viagens-passagens` (WANT) |
| `saude` Saúde | NEED | cat-9 | `heart-pulse` | não | `plano-saude` (MUST), `consultas-exames`, `farmacia`, `terapia-bem-estar`, `odontologia` |
| `educacao` Educação | NEED | cat-6 | `graduation-cap` | não | `mensalidade-curso`, `material-livros`, `cursos-online` |
| `assinaturas` Assinaturas | WANT | cat-7 | `repeat` | não | `streaming`, `musica-audio`, `software-nuvem`, `jogos`, `jornais-revistas` |
| `lazer` Lazer | WANT | cat-5 | `party-popper` | não | `cinema-shows`, `bares-baladas`, `hobbies`, `viagens-lazer`, `presentes-datas` |
| `compras` Compras | WANT | cat-6 | `shopping-bag` | não | `roupas-calcados`, `eletronicos`, `casa-decoracao`, `beleza-cuidados` |
| `familia` Família e pets | NEED | cat-10 | `users` | não | `pet`, `filhos-dependentes`, `ajuda-familia` (WANT) |
| `dividas-financeiro` Dívidas e custos financeiros | MUST | cat-8 | `landmark` | sim | `parcelas-emprestimos`, `juros-encargos`, `tarifas-bancarias`, `iof`, `anuidade-cartao`, `multas-atrasos` (todos sistema) |
| `impostos` Impostos | MUST | cat-8 | `receipt-text` | sim | `das-mei` (sistema), `outros-impostos` |
| `doacoes` Doações | WANT | cat-10 | `gift` | não | — |
| `outros-despesas` Outros | NEED | cat-10 | `circle-ellipsis` | sim | `sem-categoria` (sistema) |
| `renda-mei` Renda MEI | — | cat-2 | `briefcase` | sim | `base-mensal`, `adicional-presencial` |
| `salario-clt` Salário | — | cat-2 | `wallet` | não | — |
| `reembolsos` Reembolsos | — | cat-1 | `undo-2` | não | — |
| `rendimentos` Rendimentos de investimentos | — | cat-7 | `trending-up` | não | — |
| `vendas-eventuais` Vendas e bicos | — | cat-4 | `tag` | não | — |
| `outros-receitas` Outras receitas | — | cat-10 | `circle-ellipsis` | sim | — |

Não há categoria para transferências nem para pagamento de fatura (esses `kind` não têm categoria).

## Categorias de sistema (`SYSTEM_CATEGORY_KEYS`)

`dividas-financeiro`, `parcelas-emprestimos`, `juros-encargos` (destino padrão de `INTEREST`), `tarifas-bancarias` (destino de `FEE`), `iof`, `anuidade-cartao`, `multas-atrasos`, `impostos`, `das-mei` (F1-06), `outros-despesas`, `sem-categoria` (entrada do Inbox), `renda-mei` (F1-06) e `outros-receitas`.

Podem ser renomeadas, mas não arquivadas nem trocar `key`/`type` (`CATEGORY_SYSTEM_LOCKED`, HTTP 409). `base-mensal` e `adicional-presencial` (filhos de `renda-mei`) não são de sistema na especificação da task; a F1-06 decide se precisa travá-los.

## Operações

- `ensureDefaultCategories(userId, { categories })`: idempotente; cria só as ausentes por `(userId, key)` em duas passadas (pais, filhos). **Nunca atualiza** nome, natureza, ícone, cor, ordem ou arquivamento de categorias existentes (portanto edições do usuário sobrevivem), nunca apaga nem arquiva. Única correção: reata ao pai o filho padrão que ficou sem pai (pai apagado à mão e recriado). Retorna `{ created, existing }`.
- `listCategoryTree(userId, { includeArchived })`: árvore de 2 níveis por `sortOrder`, cada nó com `effectiveNature`; arquivada some junto com os filhos.
- `updateCategory`: `name`, `icon`, `colorKey`, `nature` (só despesa; `null` em subcategoria volta a herdar), `isArchived`, `sortOrder`.
- `createCategory`: pai ou filha customizada (`isSystem = false`); o pai não pode ter pai (`CATEGORY_MAX_DEPTH`).

## Rotas

| Rota | Efeito |
| --- | --- |
| `GET /api/categories?includeArchived=true` | `{ categories: CategoryNode[] }` (sem `userId`) |
| `POST /api/categories` | cria; 201 `{ category }` |
| `PATCH /api/categories/[id]` | edita; 200 `{ category }` |

Erros: 401 sem sessão; 400 corpo inválido (Zod); 404 `CATEGORY_NOT_FOUND`; 409 `CATEGORY_SYSTEM_LOCKED`; 422 `CATEGORY_INVALID` / `CATEGORY_MAX_DEPTH`.

## Como semear

```bash
npm run owner:create        # cria o dono e as categorias padrão
npm run seed:categories     # idempotente; imprime created=N existing=M
```

`seed:categories` recusa (sem tocar no banco) se não houver usuário ou houver mais de um.

## Pendência de UI

O conjunto curado de `CategoryIcon` (`src/components/fc/category-icon.tsx`, F0-04) não cobre todos os ícones padrão (por exemplo `house`, `gamepad-2` e a maioria dos filhos): ícones fora do conjunto caem em `tag`. A extensão do conjunto é trabalho de `ui-design-system`.
