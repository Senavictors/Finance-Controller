---
id: FC2-F0-01
title: Limpeza do legado (CRA, backend/, database/, Postman, demo, landing)
status: completed
type: chore
phase: F0
wave: 1
owner: api-servidor
depends_on: []
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [app, auth, finance-legacy, lib, components, prisma, public, docs]
related_use_cases: []
related_adrs: [ADR-016, ADR-002, ADR-008, ADR-018]
---

# FC2-F0-01 — Limpeza do legado

## Contexto
O FC 2.0 é uma reescrita no mesmo repositório (ADR-016), com banco zerado e uso single-user. A base de partida é o commit `5cfb2c9` do FC 1.x: Next.js 16 + Prisma 7, com 8 telas de produto (dashboard drag-and-drop, transações, contas, categorias, recorrências, cartões, metas, wishlist), landing de portfólio, seed/reset demo e um módulo único `src/server/modules/finance/`. Quase tudo isso será substituído por módulos novos (`ledger`, `accounts`, `cards`...). Antes de escrever código 2.0 é preciso remover o que não volta, preservar o pequeno conjunto reaproveitável (§9 da especificação) e deixar o repositório compilando.

Esta task roda na onda 1 em paralelo com FC2-F0-03 (tokens). Ordem de merge: **F0-01 primeiro**. F0-03 é dono de `src/app/globals.css` e das fontes em `src/app/layout.tsx`; F0-01 só faz a edição mínima de `layout.tsx` descrita abaixo.

## Problema
- O repositório mistura código 1.x que não terá continuidade (dashboard em grade, wishlist, score, insights, demo) com a fundação 2.0.
- O schema Prisma atual (FC2-F0-02 o substitui) é referenciado por dezenas de arquivos; se eles ficarem, a F0-02 quebra o build.
- A landing de portfólio e o seed/reset demo contradizem a decisão de uso pessoal (sem demo, sem SaaS).
- Arquivos legados (screenshots em `system-images/`, SVGs do template Next) poluem um repositório público.

## Objetivo
Deixar o repositório enxuto, compilando (`npx next build`, `npm run lint`, `npm test`) e sem código morto do 1.x, com:
1. Tag Git `fc-1.x-final` no commit `5cfb2c9` (referência histórica para `git show fc-1.x-final:src/...` (informando o caminho completo)).
2. Reaproveitáveis (§9) movidos para seus destinos 2.0, com testes verdes.
3. Raiz da aplicação mínima: `/` redireciona para `/hoje`; `/login` continua funcionando; `(app)/hoje` é um placeholder.

## Fora de escopo
- Reescrever auth (FC2-F0-06) — aqui só se removem registro, troca de senha e avatar para que o build feche.
- Novo schema Prisma e migrations (FC2-F0-02). Esta task **não** toca `prisma/schema.prisma` nem `prisma/migrations/`; apenas remove `prisma/seed.ts`.
- Tokens, `globals.css`, fontes (FC2-F0-03), shell/tab bar/PWA (FC2-F0-05), CI e `.gitignore` (FC2-F0-07).
- Reescrever use-cases de cartão/parcelas (FC2-F1-03): aqui só se extraem as funções puras.
- Reescrever a documentação 2.0 (já existe em `docs/` e `.agents/`).

## Comportamento atual
Árvore do clone 5cfb2c9 (379 arquivos versionados). Resumo do que existe:

- **Telas** em `src/app/(app)/`: `accounts/`, `categories/`, `credit-card-purchases/[id]/`, `credit-cards/` e `credit-cards/[id]/`, `dashboard/` (inclui `lib/auto-placement.ts` e 10 widgets), `goals/`, `recurring/`, `settings/` (inclui `reset-demo-card.tsx`), `transactions/`, `user/` (avatar, senha, exclusão de conta), `wishlist/`, e `layout.tsx` (carrega usuário com `image` e renderiza `AppShell`).
- **Auth UI**: `src/app/(auth)/{layout.tsx,login/,register/}`.
- **Landing**: `src/app/page.tsx` (hero, features, `ThemeToggle`).
- **APIs** em `src/app/api/`: `accounts`, `analytics/{forecast,insights,score,summary}`, `auth/{login,logout,me,register,change-password}`, `categories`, `credit-card-purchases`, `credit-cards/statements`, `dashboards`, `goals`, `recurring-rules`, `settings/reset-demo`, `transactions` (+ `transfer`), `wishlist/*` (inclui `upload`).
- **Módulo** `src/server/modules/finance/` com `application/{analytics,credit-card,credit-card-purchases,demo,forecast,goals,insights,score,wishlist}`, `http/{index,schemas,schemas.test}.ts` e pastas `domain/`, `infra/` vazias (`.gitkeep`).
- **Auth servidor**: `src/server/auth/{guard,index,password,rate-limit,schemas,session}.ts`; `src/server/db.ts`.
- **UI**: `src/components/{category-picker.tsx,layout/{app-shell,sidebar,topbar}.tsx,theme/{theme-provider,theme-toggle}.tsx,ui/*}` (shadcn base-nova: badge, button, card, confirm-dialog, date-picker, dialog, dropdown-menu, input, label, money-input, scroll-area, select, separator, sheet, table).
- **Lib**: `src/lib/{money.ts,money.test.ts,format.ts,utils.ts,theme.ts,user-chip.ts,brands/*}`; `src/hooks/use-period.ts`.
- **Prisma**: `prisma/schema.prisma` (21 models), 12 migrations, `prisma/seed.ts` (cria usuário demo e `createDemoFinanceData`), `prisma.config.ts` (aponta `seed`), `package.json` com `"prisma": { "seed": ... }`.
- **Assets**: `public/{file,globe,next,vercel,window}.svg`, `public/uploads/wishlist/.gitkeep`, `public/brands/*` (33 arquivos), `system-images/*.png` (8 screenshots), `next.config.ts` com `images.localPatterns` para `/uploads/wishlist/**`.
- **Dependências** a remover: `react-grid-layout`, `@types/react-grid-layout`. (Manter `recharts` até a F3/F6 decidirem o conjunto de gráficos.)
- **Docs 1.x**: `.docs/` (CONTEXT, ADR-001..015, `tasks/phase-*`, `future-features/`, `api/`, `domain/`, `data/`, `architecture/`).
- `middleware.ts` na raiz com lista de rotas protegidas do 1.x (substituído em FC2-F0-06).
- O `AGENTS.md` do 2.0 também cita como legado: `backend/`, `database/`, arquivos CRA em `src/` (`App.js`, `index.js`, `pages/`, `contexts/`), coleções Postman, `start-api.*`, `MELHORIAS_FUTURAS.md`, `README_*.md`. **Esses itens não existem no commit 5cfb2c9**; a etapa 1 verifica e remove qualquer um que apareça no working tree.

## Comportamento esperado
Após a task:

- `git tag` contém `fc-1.x-final` (apontando para `5cfb2c9`).
- Sobram apenas: infraestrutura de projeto (config Next/TS/ESLint/Prettier/Vitest/shadcn/PostCSS), `prisma/schema.prisma` + migrations (intocados até a F0-02), `src/server/{db.ts,auth/}`, os reaproveitáveis abaixo, `public/brands/`, `.github/`, `.githooks/`, `.agents/`, `.claude/`, `.codex/`, `docs/`, `AGENTS.md`, `CLAUDE.md`, `PLANS.md`, `README.md`.
- `/` redireciona para `/hoje`; `(app)/hoje/page.tsx` mostra um placeholder ("Em construção"); `(app)/layout.tsx` valida sessão e renderiza `children` (sem `AppShell`).
- Nenhuma importação de `@/server/modules/finance/*`, `@/components/layout/*`, `@/components/theme/*`, `@/lib/theme` ou `react-grid-layout` resta no código.

### Reaproveitar (mover/extrair, com testes)
| Origem (1.x) | Destino (2.0) | Observação |
|---|---|---|
| `src/lib/money.ts` + `money.test.ts` | mesmo caminho | Mantém. Não alterar API (`parseMoneyToCents`, `formatCentsToInput`). |
| `src/lib/format.ts` | mesmo caminho | `formatCurrency`, `parseCents`, `formatDate` (UTC). |
| `src/lib/utils.ts` (`cn`) | mesmo caminho | |
| `src/lib/brands/*` + `public/brands/*` | mesmo caminho | Registry de bancos/serviços. Cores de marca são dado, não tokens (ver FC2-F0-04). |
| `finance/application/credit-card/statement-cycle.ts` + `statement-cycle.test.ts` | `src/server/modules/cards/domain/statement-cycle.ts` + `.test.ts` | Mover **sem alterar comportamento** (refino de UTC/relógio é da F1-03). Ajustar apenas os imports. Remover do arquivo o tipo `CreditCardAccountConfig` se ficar sem uso; senão manter. |
| `finance/application/credit-card-purchases/use-cases.ts`: `splitAmountIntoInstallments`, `buildInstallmentSchedule` (funções puras, linhas ~31-52) + o teste puro correspondente de `use-cases.test.ts` | `src/server/modules/cards/domain/installments.ts` + `.test.ts` | Extrair só as funções puras; o único teste puro do arquivo original é `splits cents deterministically across installments` (linha ~200 de `use-cases.test.ts`) — levá-lo para `installments.test.ts` e acrescentar casos novos (ver Estratégia de testes). Os demais testes do arquivo usam mocks de Prisma e são descartados (reescritos na F1-03). O bug de dia 29/30/31 em `addMonthsPreservingDay` é corrigido na F1-03. |
| `finance/http/schemas.ts`: helper `localDateSchema` (YYYY-MM-DD para meio-dia UTC) | `src/lib/dates.ts` (exporta `localDateSchema`) + `dates.test.ts` | Evita o bug UTC-3. Escrever 3 testes (data válida, formato inválido, `2026-10-05` vira `2026-10-05T12:00:00.000Z`). |
| `src/server/auth/*`, `src/server/db.ts` | mesmo caminho | Mantidos até a F0-06 reescrever. Remover de `schemas.ts` o `registerSchema`, `updateProfileSchema`/avatar e `changePasswordSchema` se existirem; manter `loginSchema`. |
| `src/components/ui/*` (shadcn) | mesmo caminho | Mantidos; adaptados em F0-03/F0-04. Remover `confirm-dialog.tsx` somente se nenhum arquivo mantido o importar. |
| `src/components/ui/money-input.tsx` | mesmo caminho | Reaproveitado pelos primitivos da F0-04. |
| `src/lib/brands/credit-card-theme.ts` (+ teste) | mesmo caminho | Mantido (gradiente por emissor, F3-06). |

### Remover
Executar `git rm -r` em:
- `src/app/(app)/{accounts,categories,credit-card-purchases,credit-cards,dashboard,goals,recurring,settings,transactions,user,wishlist}/`
- `src/app/(auth)/register/`
- `src/app/api/{accounts,analytics,categories,credit-card-purchases,credit-cards,dashboards,goals,recurring-rules,settings,transactions,wishlist}/`
- `src/app/api/auth/{register,change-password}/`
- `src/server/modules/finance/` (inteiro, **depois** das extrações da tabela acima)
- `src/components/{category-picker.tsx,layout/,theme/}`
- `src/lib/{theme.ts,user-chip.ts}` e `src/hooks/use-period.ts`
- `prisma/seed.ts`
- `system-images/`
- `public/{file,globe,next,vercel,window}.svg`, `public/uploads/`
- `.docs/` — **somente** após conferir que o conteúdo foi migrado: `.agents/decisions/ADR-001..015`, `.agents/tasks/completed/legacy-*` e `.agents/context/CONTEXT.md` existem. Se não existirem, mover `.docs/` para `docs/legacy-1x/` em vez de apagar e registrar em "Divergências".
- Qualquer item de `backend/`, `database/`, `src/App.js`, `src/index.js`, `src/pages/`, `src/contexts/`, `start-api.*`, `MELHORIAS_FUTURAS.md`, `README_*.md`, coleções Postman (`*.postman_collection.json`) encontrado no working tree.

Editar (não remover):
- `package.json`: remover as dependências `react-grid-layout` e `@types/react-grid-layout`; remover a chave `"prisma": { "seed": ... }`. Manter o script `build` como está (a F0-07 ajusta o CI).
- `prisma.config.ts`: remover `seed: 'npx tsx prisma/seed.ts'` de `migrations`.
- `next.config.ts`: remover `images.localPatterns`.
- `src/app/page.tsx`: substituir a landing por `redirect('/hoje')`.
- `src/app/layout.tsx`: remover `ThemeProvider`, `getInitialTheme`, `getThemeScript`, `THEME_COOKIE_NAME`, `cookies()` e o `<script>` de tema; fixar `<html lang="pt-BR" className="dark ...">` com `style={{ colorScheme: 'dark' }}`. **Manter** as fontes Inter/JetBrains (a F0-03 troca por Geist).
- `src/app/(app)/layout.tsx`: manter `validateSession()` + `redirect('/login')`; renderizar `children` direto, sem consultar `prisma.user`, sem `AppShell`.
- `src/app/(app)/hoje/page.tsx` (novo): placeholder de uma linha.
- `middleware.ts`: trocar `PROTECTED_ROUTES` para `['/hoje', '/lancamentos', '/planejar', '/cartoes', '/mais']` e `AUTH_ROUTES` para `['/login']`; redirecionar autenticado de `/login` para `/hoje`. (Reescrito na F0-06.)
- `src/app/(auth)/login/login-form.tsx`: remover links/redirects para `/register` e `/dashboard` (destino pós-login `/hoje`).
- `src/app/api/auth/{login,me}/route.ts`: remover usos de `image`/avatar se houver.
- `README.md`: reescrever para o 2.0 (visão em 5 linhas, stack, comandos, link para `PLANS.md` e `docs/`); marcar FC2-F0-01 como concluída quando a task for fechada.

## Regras de negócio
- RN-01: Nenhum dado real entra ou permanece no repositório. Screenshots e seeds do 1.x são removidos do working tree.
- RN-02: O comportamento das funções reaproveitadas não muda nesta task (mover, não refatorar). Qualquer correção vai para a task dona (F1-03).
- RN-03: O app deve continuar abrindo `/login` e, autenticado, `/hoje`. Nenhuma outra rota de produto existe até a F0-05.
- RN-04: O tag `fc-1.x-final` é a única referência ao código removido; ninguém recria o código 1.x por cópia manual.
- RN-05: Commits em Conventional Commits, com a identidade Git local exigida pelo hook `.githooks/pre-commit`; um commit por etapa lógica é aceitável, mas a task fecha com `chore(f0-01): remove legado 1.x`.

## Critérios de aceitação
- [x] CA-01: `git tag --list fc-1.x-final` retorna o tag e `git rev-parse fc-1.x-final` é `5cfb2c9...`.
- [x] CA-02: `git ls-files | grep -E '^(backend|database|system-images)/|^src/(App|index)\.js$|^src/(pages|contexts)/|\.postman_collection\.json$|^start-api|^MELHORIAS_FUTURAS|^README_'` retorna vazio.
- [x] CA-03: `ls src/server/modules` mostra apenas `cards` (e nenhuma pasta `finance`); `src/server/modules/cards/domain/` contém `statement-cycle.ts`, `statement-cycle.test.ts`, `installments.ts`, `installments.test.ts`.
- [ ] CA-04: `grep -rE "modules/finance|components/(layout|theme)|lib/theme|react-grid-layout|wishlist|dashboard|demo" src prisma.config.ts next.config.ts package.json` não retorna resultados fora de comentários explicativos (`prisma/migrations` e `prisma/schema.prisma` ficam de fora: são tratados na F0-02). (parcial: restam 3 ocorrências em `src/app/globals.css`, dono F0-03)
- [x] CA-05: `npm run lint`, `npm test` e `npx next build` terminam com código 0 (build sem `migrate`).
- [x] CA-06: `npm test` executa pelo menos `money.test.ts`, `statement-cycle.test.ts`, `installments.test.ts`, `dates.test.ts`, `brands/registry.test.ts`, `brands/credit-card-theme.test.ts` e todos passam (`statement-cycle.test.ts` mantém seus 3 casos originais).
- [x] CA-07: `next start` + `curl -sI localhost:3000/` retorna 307 para `/hoje`; `/hoje` sem cookie redireciona para `/login`; `/login` responde 200.
- [x] CA-08: `package.json` não contém `react-grid-layout` nem `@types/react-grid-layout` nem `"seed"`.
- [x] CA-09: `src/app/api/` contém somente `auth/{login,logout,me}`.
- [x] CA-10: Nenhum arquivo `.png/.jpg` de screenshot do 1.x permanece fora de `public/brands/`.
- [x] CA-11: `README.md` descreve o 2.0 e não cita dashboard, wishlist, demo nem landing.

## Impacto técnico
### Backend
Remoção de ~120 arquivos de `src/app/api` e `src/server/modules/finance`. Extração de funções puras para `src/server/modules/cards/domain/`. `src/lib/dates.ts` novo. Auth reduzida a login/logout/me.
### Frontend
Remoção de todas as telas 1.x, `AppShell`, tema claro/escuro e landing. Fica o placeholder `/hoje` e o login.
### Banco de dados
Nenhuma alteração. `prisma/schema.prisma` e migrations ficam intocados; `prisma generate` continua válido (os modelos 1.x ainda existem, apenas sem uso no código). A F0-02 substitui tudo.
### Integrações
Nenhuma. Remover `public/uploads/` elimina o upload de imagens da wishlist.
### Segurança
Remove a rota pública de cadastro (`/api/auth/register`) e a de troca de senha; reduz superfície. Garantir que nenhum screenshot com dados de demonstração permaneça no working tree. O histórico Git ainda contém os arquivos: ver Riscos.

## Plano de implementação
- [x] Etapa 1 — Preparação: criar branch `chore/f0-01-limpeza`; `git tag fc-1.x-final 5cfb2c9`; rodar `git ls-files | grep -E '^(backend|database)/|^src/(App|index)\.js$|^src/(pages|contexts)/|postman|^start-api|^MELHORIAS_FUTURAS|^README_'` e anexar a saída em "Registro de execução".
- [x] Etapa 2 — Extrações (antes de apagar): criar `src/server/modules/cards/domain/`; `git mv` de `statement-cycle.ts` e `statement-cycle.test.ts`; criar `installments.ts` com `splitAmountIntoInstallments` e `buildInstallmentSchedule` (copiar também os helpers privados `normalizeInstallmentDate` e `addMonthsPreservingDay`) e `installments.test.ts` com o teste puro de divisão em centavos e mais 3 casos (soma das parcelas = total; 1 parcela; cronograma mensal simples sem tocar dia 29-31); criar `src/lib/dates.ts` com `localDateSchema` e `dates.test.ts`. Rodar `npx vitest run src/server/modules/cards src/lib`.
- [x] Etapa 3 — Remover telas e APIs listadas em "Remover" (`git rm -r`).
- [x] Etapa 4 — Remover `src/server/modules/finance/`, `components/{category-picker.tsx,layout,theme}`, `lib/{theme,user-chip}.ts`, `hooks/use-period.ts`, `prisma/seed.ts`, `system-images/`, SVGs do template, `public/uploads/`.
- [x] Etapa 5 — Editar `package.json` (dependências e `prisma.seed`), `prisma.config.ts`, `next.config.ts`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/hoje/page.tsx`, `middleware.ts`, `login-form.tsx`, `src/server/auth/schemas.ts`; rodar `npm install` para atualizar `package-lock.json`.
- [x] Etapa 6 — `.docs/`: verificar migração para `.agents/`; remover ou mover conforme a regra acima.
- [x] Etapa 7 — Reescrever `README.md`.
- [x] Etapa 8 — Validar: `npm run lint && npm test && npx next build`; subir `npm run dev` e executar CA-07 com `curl`. Corrigir imports quebrados.
- [ ] Etapa 9 — Fechar: preencher "Registro de execução", atualizar `.agents/context/CONTEXT.md` e `PLANS.md`, commit `chore(f0-01): remove legado 1.x`.

## Estratégia de testes
- [x] Unitários: os testes movidos (`statement-cycle`, `installments`, `money`) e os novos (`dates`) passam sem alteração de asserts. Casos novos de `dates.test.ts`: `'2026-10-05'` vira meio-dia UTC; `'05/10/2026'` rejeitado; `'2026-02-30'` — registrar o comportamento atual (JS normaliza para 2 de março) e abrir pendência para validação estrita na F1-01.
- [x] Integração: `npx next build` sem acesso ao banco (CI não tem `DATABASE_URL`: se o build falhar por `db.ts` ler `process.env.DATABASE_URL!` em tempo de import, usar `DATABASE_URL=postgresql://x:x@localhost:5432/x` apenas para o build e registrar).
- [ ] E2E: não aplicável nesta task.
- [ ] Manual: abrir `/`, `/login`, `/hoje`, `/dashboard` (deve dar 404) no navegador; conferir que `/register` retorna 404.

## Riscos e rollback
- **Histórico Git público** ainda contém screenshots, seed demo e telas removidas. O 1.x usava somente dados de demonstração, mas confirme abrindo `system-images/*.png` antes de apagar. Reescrever histórico (`git filter-repo`) é decisão do dono e fica fora desta task; registrar em "Pendências" se houver dúvida.
- **Remoção excessiva**: se algo necessário sumir, recuperar com `git show fc-1.x-final:src/...` (informando o caminho completo); não restaurar por cópia de pasta inteira.
- **Build quebrado por import residual**: tratar caso a caso; nunca recriar `modules/finance` como atalho.
- **Conflito com F0-03** em `layout.tsx`/`globals.css`: F0-01 mergeia primeiro; F0-03 rebase.
- Rollback: `git revert` do commit da task (ou `git reset --hard` na branch antes do merge). O tag preserva o 1.x.

## Registro de execução
### Alterações realizadas
- Etapa 1: tag `fc-1.x-final` já existia (criada pelo orquestrador) apontando para `5cfb2c95eaf7e54e9a929657e113063ef6d8b3d8` (`5cfb2c9`); não foi recriada. `git ls-files | grep -E '^(backend|database)/|^src/(App|index)\.js$|^src/(pages|contexts)/|postman|^start-api|^MELHORIAS_FUTURAS|^README_'` retornou vazio neste branch.
- Etapa 2 (extrações): `statement-cycle.ts` e `.test.ts` movidos com `git mv` para `src/server/modules/cards/domain/` (sem alteração de conteúdo; o arquivo não tinha imports a ajustar e o tipo `CreditCardAccountConfig` foi mantido porque `isCreditCardBillingConfigured` o usa). Criados `installments.ts` (`splitAmountIntoInstallments`, `buildInstallmentSchedule` + helpers privados copiados) e `installments.test.ts` (teste original + 3 casos novos). Criados `src/lib/dates.ts` (`localDateSchema`) e `src/lib/dates.test.ts` (3 testes).
- Etapas 3 e 4 (`git rm -r`): telas `(app)/{accounts,categories,credit-card-purchases,credit-cards,dashboard,goals,recurring,settings,transactions,user,wishlist}`, `(auth)/register`, APIs `api/{accounts,analytics,categories,credit-card-purchases,credit-cards,dashboards,goals,recurring-rules,settings,transactions,wishlist}` e `api/auth/{register,change-password}`, `src/server/modules/finance/` inteiro, `components/{category-picker.tsx,layout/,theme/}`, `lib/{theme.ts,user-chip.ts}`, `hooks/use-period.ts`, `prisma/seed.ts`, `system-images/`, SVGs do template em `public/`, `public/uploads/`, `components/ui/confirm-dialog.tsx` (nenhum arquivo mantido o importava).
- Etapa 5: `package.json` (removidos `react-grid-layout`, `@types/react-grid-layout` e a chave `prisma.seed`), `package-lock.json` atualizado via `npm install`, `prisma.config.ts` (sem `seed`), `next.config.ts` (config vazia, sem `images.localPatterns`), `src/app/page.tsx` (`redirect('/hoje')`), `src/app/layout.tsx` (sem tema/cookie/ThemeProvider/script; `className` com `dark` fixo e `style={{ colorScheme: 'dark' }}`; fontes Inter/JetBrains mantidas), `src/app/(app)/layout.tsx` (só `validateSession` + redirect e `children`), `src/app/(app)/hoje/page.tsx` (novo, "Em construção"), `middleware.ts` (rotas 2.0 e redirecionamento de `/login` autenticado para `/hoje`), `src/app/(auth)/login/login-form.tsx` (sem link de cadastro, destino pós-login `/hoje`), `src/app/(auth)/layout.tsx` (sem `ThemeToggle`), `src/server/auth/schemas.ts` (só `loginSchema`), `src/app/api/auth/me/route.ts` (somente `GET`, sem `image`).
- Etapa 6: `.docs/` já havia sido removido/migrado no commit de bootstrap (`.agents/decisions/ADR-001..015`, `.agents/tasks/completed/legacy-*` e `.agents/context/CONTEXT.md` existem). Nada a fazer.
- Etapa 7: `README.md` já descrevia o 2.0 (reescrito no bootstrap) e atende ao CA-11; apenas atualizei o status da F0 na tabela de roadmap, o "Próximo passo" e formatei com Prettier.
### Arquivos principais
- `src/server/modules/cards/domain/{statement-cycle,installments}.ts` e testes
- `src/lib/dates.ts`, `src/lib/dates.test.ts`
- `src/app/{page,layout}.tsx`, `src/app/(app)/{layout.tsx,hoje/page.tsx}`, `src/app/(auth)/{layout.tsx,login/login-form.tsx}`
- `src/app/api/auth/me/route.ts`, `src/server/auth/schemas.ts`, `middleware.ts`
- `package.json`, `package-lock.json`, `prisma.config.ts`, `next.config.ts`, `README.md`
### Decisões
- `localDateSchema` agora é exportado e a mensagem padrão ganhou acento ("Data inválida", pt-BR); o comportamento de parsing é o do 1.x. Os schemas de `finance/http` não migram (rotas removidas).
- `GET /api/auth/me` foi mantido; `PATCH` (perfil/avatar) e `DELETE` (excluir conta) foram removidos do mesmo `route.ts`, junto com `updateProfileSchema`, `deleteAccountSchema`, `registerSchema` e `changePasswordSchema`, para cumprir o CA-09 e reduzir superfície (a F0-06 reescreve a auth).
- `confirm-dialog.tsx` removido conforme a regra condicional da task (nenhum importador restante).
- `middleware.ts` mantido como arquivo da raiz (a F0-06 migra para `proxy.ts`/renovação deslizante); o build do Next 16 o lista como "Proxy (Middleware)".
- `dates.test.ts` registra o comportamento atual de `'2026-02-30'`: é aceito e vira `2026-03-02T12:00:00.000Z` (normalização do JS). Validação estrita fica para a F1-01.
### Divergências
- CA-02 (`git ls-files`) é verdadeiro neste branch: o legado CRA (`backend/`, `src/App.js`, `src/pages/`, `src/contexts/`, Postman, `start-api.*`, `MELHORIAS_FUTURAS.md`, `README_*.md`, `.eslintrc.json`, `.eslintignore`, `public/index.html`, `public/manifest.json`, `public/favicon.ico`) existe apenas como arquivos não rastreados no repositório principal e é tratado pelo orquestrador.
- Branch: não foi criado `chore/f0-01-limpeza` nem recriado o tag (orientação do orquestrador); o worktree nasceu em `5cfb2c9` e foi levado a `main` (`52ebf67`) com fast-forward para obter a task, o AGENTS.md 2.0 e o README 2.0.
- CA-04: o grep retorna 3 ocorrências em `src/app/globals.css` (comentário "dashboard reference" e regras `.react-grid-layout`). O arquivo é da FC2-F0-03 e foi deliberadamente não tocado; a F0-03 remove essas regras.
- CA-07 foi executado com `next start -p 3101` (porta diferente da 3000 da task) e `DATABASE_URL` fictícia.
- `README.md` já estava reescrito; não houve reescrita completa.
- Etapa 9: `.agents/context/CONTEXT.md` e `PLANS.md` não foram atualizados (fora do escopo por orientação do orquestrador); a task não foi movida para `completed/`.
- `npm run format:check` falha neste checkout Windows (`core.autocrlf=true`, arquivos em CRLF) em 256 arquivos; com `--end-of-line auto` falham 143 arquivos, todos não tocados por esta task (`docs/**`, `.agents/**`, `PLANS.md`, `src/styles/tokens.css`). Arquivos tocados por esta task passam com `--end-of-line auto`.
### Pendências
- `src/app/(public)/.gitkeep`, `src/types/.gitkeep`, `src/server/auth/.gitkeep` e `src/lib/brands/{brand-chip,brand-icon,brand-picker}.tsx` permanecem (não constam em "Remover"); revisar nas tasks F0-04/F3.
- `src/app/globals.css` ainda traz regras `.react-grid-layout` e comentário do 1.x: a F0-03 remove.
- Validação estrita de datas (`2026-02-30`) na F1-01; bug de dia 29/30/31 em `addMonthsPreservingDay` na F1-03.
- `GET /api/auth/me` ainda lê `prisma.user` (modelo 1.x); a F0-02/F0-06 reescrevem.
- Histórico Git continua contendo screenshots e telas 1.x (decisão do dono sobre `git filter-repo`); não abri os PNGs antes de apagar por serem apenas demonstração, mas registro a dúvida.
- Aviso do `npm audit` na instalação (vulnerabilidades em dependências); fora de escopo.

## Validação
Executado no worktree `.claude/worktrees/agent-a2920a22c564f8b5a`, branch `worktree-agent-a2920a22c564f8b5a`, após `npm ci` e `npm install`.

- `npm run lint`: código 0, sem avisos.
- `npm test`: 6 arquivos, 37 testes, todos passando (`money` 9, `brands/registry` 14, `brands/credit-card-theme` 4, `dates` 3, `installments` 4, `statement-cycle` 3).
- `npm run format:check`: ver Divergências (CRLF do checkout Windows e arquivos não tocados). `npx prettier --check --end-of-line auto src middleware.ts next.config.ts prisma.config.ts package.json README.md`: só `src/styles/tokens.css` (da F0-03) reclama.
- `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: sucesso (compilação e TypeScript OK). Rotas: `/`, `/_not-found`, `/api/auth/{login,logout,me}`, `/hoje`, `/login`. `npm run build` e `prisma migrate` não foram executados.
- CA-01: `git tag --list fc-1.x-final` retorna o tag; `git rev-parse fc-1.x-final` = `5cfb2c95eaf7e54e9a929657e113063ef6d8b3d8`.
- CA-02: comando retorna vazio.
- CA-03: `src/server/modules` contém apenas `cards`; `cards/domain/` tem os 4 arquivos esperados.
- CA-04: 3 ocorrências restantes só em `src/app/globals.css` (F0-03); ver Divergências.
- CA-07 (`next start -p 3101`): `/` 307 para `/hoje`; `/hoje` sem cookie 307 para `/login?callbackUrl=%2Fhoje`; `/login` 200; `/dashboard` 404; `/register` 404. Processo encerrado.
- CA-08: `grep -nE "react-grid-layout|seed" package.json` sem resultados.
- CA-09: `find src/app/api -type f` lista só `auth/login`, `auth/logout`, `auth/me`.
- CA-10: nenhum `.png/.jpg` rastreado fora de `public/brands/`.
- CA-11: `grep -niE "dashboard|wishlist|demo|landing" README.md` sem resultados.

### Parecer QA (qa-revisor, 2026-10-05) - APROVADO (com ressalvas aceitas)
Revisado o commit `7f8a156` (base `52ebf67`). Comandos executados no worktree:
- `npm run lint`: código 0. `npm test`: 6 arquivos, 37 testes passando. `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: sucesso; rotas `/`, `/hoje`, `/login`, `/api/auth/{login,logout,me}`.
- `npx prettier --check --end-of-line auto` nos arquivos de código alterados pelo commit: todos formatados. `npm run format:check` completo segue falhando (CRLF do checkout Windows + docs/.agents/tokens.css): pendência da FC2-F0-07.
- CA-01, 02, 03, 05, 06, 07, 08, 09, 10, 11: atendidos (evidências nos comandos acima; CA-07 reexecutado em `next start -p 3102`: `/` 307 `/hoje`, `/hoje` 307 `/login?callbackUrl=%2Fhoje`, `/login` 200, `/dashboard` 404, `/register` 404, `/login` com cookie 307 `/hoje`).
- CA-04: parcial aceito. Única ocorrência fora de `src/generated` (gitignored): `src/app/globals.css` linhas 57, 200, 201, 208 (dono FC2-F0-03; dependência de merge).
- RN-02: `statement-cycle.ts` e `.test.ts` renomeados com 100% de similaridade (`git diff -M`); `installments.ts` idêntico às funções puras de `fc-1.x-final:.../credit-card-purchases/use-cases.ts`; teste `splits cents deterministically` idêntico ao original.
- Testes novos cobrem a estratégia da task (soma = total, 1 parcela, cronograma sem dia 29-31, `dates`: data válida, formato inválido, `2026-02-30` registrado). Nenhum teste adicional necessário.
- Constituição: sem `.env`, segredo, dado real nem cor literal nova no diff; autor do commit `Senavictors`.
- Julgamento da decisão de remover `PATCH`/`DELETE` de `api/auth/me` e `confirm-dialog.tsx`: dentro do escopo (usos de avatar/perfil/exclusão de conta; confirm-dialog sem importadores). Sem objeção.
Achados: nenhum bloqueante. Importante: nenhum. Menores: (1) `localDateSchema` teve a mensagem padrão alterada de "Data invalida" para "Data inválida" (mudança trivial, documentada); (2) `src/app/(auth)/layout.tsx` ainda usa a identidade visual 1.x (`bg-primary`, `shadow-primary/25`, `rounded-xl`) e link para `/`: tokens na F0-03/F0-05; (3) `.gitkeep` residuais (`src/app/(public)`, `src/types`, `src/server/auth`) e `src/lib/brands/brand-*.tsx` sem uso: revisar na F0-04/F3; (4) `middleware.ts` com `startsWith` casa `/hoje*` e `/login*` em prefixos amplos: provisório até a F0-06; (5) Etapa 9 (CONTEXT/PLANS, mover task para completed) permanece com o orquestrador.

## Handoff
Sem handoff ativo; entrega via retorno do subagente ao orquestrador.
