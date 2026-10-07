---
id: FC2-F1-08
title: Cobrir os ícones das categorias padrão no CategoryIcon
status: active
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
- [ ] CA-01: teste que percorre `DEFAULT_CATEGORIES` e falha se algum `icon` não estiver mapeado em `CATEGORY_ICONS`.
- [ ] CA-02: nomes divergentes resolvidos (`house` etc.); aliases documentados.
- [ ] CA-03: build não importa o `lucide-react` inteiro (import nomeado; conferir tamanho do chunk da galeria `/ui` antes/depois e registrar).
- [ ] CA-04: galeria `/ui` mostra uma grade com todos os ícones de categoria (dev only).
- [ ] CA-05: `npm run lint`, `npm run typecheck`, `npm test`, `npm run guard:data`, `npx next build` passam; guard de cores verde.

## Registro de execução
### Alterações realizadas
### Decisões
### Pendências

## Validação
