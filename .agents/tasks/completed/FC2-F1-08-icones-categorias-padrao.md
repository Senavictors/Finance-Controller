---
id: FC2-F1-08
title: Cobrir os ícones das categorias padrão no CategoryIcon
status: completed
type: chore
phase: F1
wave: 2
owner: ui-design-system
depends_on: [FC2-F1-07]
created_at: 2026-10-06
updated_at: 2026-10-06
affected_modules: [components-fc, categories]
related_use_cases: []
related_adrs: [ADR-018, ADR-022]
---

# FC2-F1-08 — Ícones das categorias padrão no CategoryIcon

## Contexto
Criada pelo orquestrador em 2026-10-06 a partir da entrega da FC2-F1-07. A árvore padrão (`src/server/modules/categories/domain/default-categories.ts`, 80 categorias) usa nomes de ícones do `lucide-react` (kebab-case), mas o conjunto curado `CATEGORY_ICONS` de `src/components/fc/category-icon.tsx` (FC2-F0-04) cobre poucos deles: os demais caem em `tag`, e há divergência de nome (`home` no conjunto, `house` na árvore). Sem isso, Lançamentos (F2-05), Hoje (F3-04) e Planejar (F3-05) mostrariam `tag` para a maioria das categorias.

## Objetivo
`CategoryIcon` renderiza o ícone correto para **todas** as categorias padrão, mantendo bundle enxuto (import nomeado por ícone, sem importar o pacote inteiro) e fallback `tag` para chaves desconhecidas.

## Fora de escopo
Alterar a árvore de categorias (F1-07), telas.

## Critérios de aceitação
- [x] CA-01: teste que percorre `DEFAULT_CATEGORIES` e falha se algum `icon` não estiver mapeado em `CATEGORY_ICONS`.
- [x] CA-02: nomes divergentes resolvidos (`house` etc.); aliases documentados.
- [x] CA-03: build não importa o `lucide-react` inteiro (import nomeado; conferir tamanho do chunk da galeria `/ui` antes/depois e registrar).
- [x] CA-04: galeria `/ui` mostra uma grade com todos os ícones de categoria (dev only).
- [x] CA-05: `npm run lint`, `npm run typecheck`, `npm test`, `npm run guard:data`, `npx next build` passam; guard de cores verde.

## Registro de execução
### Alterações realizadas
- `src/components/fc/category-icon.tsx`: `CATEGORY_ICONS` passou de 32 para 85 ícones, todos por import nomeado de `lucide-react` (sem `import * as`), chaves = nome lucide canônico em kebab-case, em ordem alfabética. Cobre os 79 nomes distintos usados por `DEFAULT_CATEGORIES` (80 categorias) mais extras já existentes (`banknote`, `dumbbell`, `film`, `phone`, `piggy-bank`, `pizza`). Novos exports: `CATEGORY_ICON_ALIASES`, `resolveCategoryIconName`, `resolveCategoryIcon` (também reexportados em `src/components/fc/index.ts`). Fallback `tag` mantido.
- `src/components/fc/category-icon.test.ts` (novo, 5 testes): CA-01 (todo `icon` de `DEFAULT_CATEGORIES` mapeado; nenhum cai no fallback exceto `tag`), CA-02 (aliases apontam para canônicos existentes e não duplicam chave), fallback (inclui `constructor`/`toString`), render com `aria-hidden` e `data-color`. Importa `DEFAULT_CATEGORIES` direto de `domain/default-categories` (puro; o `index.ts` do módulo reexporta infra Prisma).
- `src/app/(dev)/ui/gallery.tsx`: nova seção "CategoryIcon: todos os ícones" com grade 4 colunas (ícone + nome), cores `cat-1..10` em rodízio.
- `docs/ui/componentes.md`: seção CategoryIcon com conjunto, aliases e como adicionar ícone; `ultima-revisao` atualizada.
### Decisões
- Chave canônica = nome lucide atual. Divergências resolvidas por alias, não por mudança na árvore: `home` -> `house` e `gamepad` -> `gamepad-2` (nomes legados da F0-04, ainda usados na galeria). As chaves `home` e `gamepad` saíram de `CATEGORY_ICONS` e vivem só em `CATEGORY_ICON_ALIASES`.
- O componente indexa `CATEGORY_ICONS[resolveCategoryIconName(icon)]` em vez de `const Icon = resolveCategoryIcon(icon)`: a regra `react-hooks/static-components` acusa componente criado durante o render quando o resolvedor é uma função.
- Tamanho do chunk (CA-03), medido pelo manifesto de referências do cliente de `/ui` em `.next` (4 chunks JS da rota), antes -> depois (raw / gzip):
  - chunk da galeria: 14.902 B / 4.517 B -> 15.355 B / 4.647 B
  - chunk do vendor com lucide: 142.664 B / 46.037 B -> 159.830 B / 51.615 B (+17,2 KB raw, +5,6 KB gzip pelos 55 ícones novos)
  - total da rota: 215.592 B / 64.893 B -> 233.211 B / 70.601 B (+17,6 KB raw, +5,7 KB gzip)
  - O pacote inteiro (milhares de ícones) seria uma ordem de grandeza maior; o crescimento confirma tree-shaking por import nomeado.
### Pendências
- Nenhuma. Todos os 79 nomes da árvore existem no `lucide-react` instalado (1.8.0); nenhuma correção de nome foi necessária em `src/server/**`.

## Validação
- `npm run lint`: ok.
- `npm run typecheck`: ok.
- `npm test`: 40 arquivos passaram, 1 ignorado; 590 testes passaram, 7 ignorados (inclui `category-icon.test.ts` e o guard `no-literal-colors`).
- `npm run guard:data`: 3 arquivos, 154 testes ok.
- `npx prettier --check --end-of-line auto .`: ok.
- `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: compilou, TypeScript ok, `/ui` gerada como estática.
- Primeira rodada do teste CA-01 falhou por `pill` (farmácia) ausente do mapa; o teste fez o papel previsto e o ícone foi adicionado.

### Revisão QA (qa-revisor, 2026-10-06) — APROVADO
- Reexecutado no worktree (commit `0dde5b8`): `npm run lint` ok; `npm run typecheck` ok; `npm test` 40 arquivos/590 testes ok (7 ignorados); `npm run guard:data` 154 testes ok; `npx prettier --check --end-of-line auto .` ok; `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build` ok (`/ui` estática).
- CA-01: atendido. Prova negativa: removido `pill` de `CATEGORY_ICONS`, o teste falhou (`farmacia -> pill`, 2 testes falhando); restaurado com `git checkout`.
- CA-02: atendido. `home`/`gamepad` só em `CATEGORY_ICON_ALIASES`; únicos usos em `src/` são as amostras da galeria (`gallery.tsx:42,45`), que resolvem via alias; teste cobre os aliases.
- CA-03: atendido. Nenhum `import * as` de `lucide-react` em `src/` (só `import * as React`); chunk do vendor com lucide em `.next/static/chunks` = 159.830 B, igual ao registrado. Crescimento coerente com imports nomeados.
- CA-04: atendido por leitura do código (grade 4 colunas em `gallery.tsx`); `/ui` em build de produção gera `ui.meta` com `status: 404` (notFound da F0-04). Galeria não aberta no navegador.
- CA-05: atendido (comandos acima; guard de cores verde dentro de `npm test`).
- Achados: nenhum bloqueante ou importante. Menor: o CA-01 só valida `DEFAULT_CATEGORIES`; ícones extras (`banknote`, `dumbbell` etc.) não têm teste de existência, sem impacto.
