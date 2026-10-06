---
id: FC2-F0-09
title: Endurecer o guard de cores/estilos literais (achados da revisão da F0-04)
status: backlog
type: chore
phase: F0
wave: 4
owner: ui-design-system
depends_on: [FC2-F0-04]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [tests-guards, components-ui]
related_use_cases: []
related_adrs: [ADR-018]
---

# FC2-F0-09 — Endurecer o guard de cores/estilos literais

## Contexto
Criada pelo orquestrador em 2026-10-05 a partir da revisão QA da FC2-F0-04 (achado I-2 e menores M-1, M-2, M-8). O guard `tests/guards/no-literal-colors.test.ts` (+ `literal-colors.ts`) protege a Constituição ("Design system único"), mas deixa passar padrões que hoje não aparecem no código e podem aparecer nas telas das fases seguintes.

## Problema
Passam sem detecção: nomes de cor CSS (`color: red`, `bg-[red]`, `style={{background:'red'}}`), `white`/`black` fora de `bg-white`/`text-white` (`border: 1px solid white`, `box-shadow: 0 0 4px black`, `boxShadow` inline), `color-mix(in srgb, white 20%, ...)`, `color(display-p3 ...)`, atributos SVG `fill="white"`/`stroke="white"`. Além disso: `border-fc-void/0` usado como "transparent disfarçado"; durações literais `duration-100/150/200` no shadcn herdado (`src/components/ui/*`); nenhum teste afirma que cores de marca ficam só em `src/lib/brands/**`.

## Objetivo
Cobrir esses padrões no guard (com testes positivos e negativos montados em runtime), corrigir as ocorrências existentes em `src/components/ui/*` (durações → `duration-(--fc-dur-*)`; avaliar `border-fc-void/0`) e acrescentar teste de que hex de marca só existe em `src/lib/brands/**` e `tokens.css`.

## Fora de escopo
Novos primitivos, telas, tokens novos (se faltar token de duração, registrar pendência).

## Critérios de aceitação
- [ ] CA-01: cada padrão listado em "Problema" tem teste positivo (detecta) e o guard falha com arquivo:linha.
- [ ] CA-02: falsos positivos controlados: `href="#abc"` decidido e documentado; `transparent` em CSS puro continua permitido (decisão da F0-04) ou é substituído por token — registrar.
- [ ] CA-03: zero durações Tailwind literais (`duration-[0-9]`) em `src/components/**`.
- [ ] CA-04: teste garante que hex de cor só aparece em `src/styles/tokens.css`, `src/lib/brands/**`, manifest/ícones (allowlist por caminho, com motivo).
- [ ] CA-05: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.

## Registro de execução
### Alterações realizadas
### Decisões
### Pendências

## Validação
