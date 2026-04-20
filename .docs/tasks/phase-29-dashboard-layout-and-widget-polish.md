# Task: Phase 29 - Dashboard Layout And Widget Polish

## Status

- [ ] Todo
- [ ] In Progress
- [ ] Done

## Context

O dashboard customizavel ja esta em producao com `react-grid-layout`, persistencia em `DashboardWidget` e 10 tipos de widget registrados.

O feedback de uso trouxe tres sinais bem concretos nesta superficie:

- adicionar widget sempre joga o card para baixo da pilha atual, exigindo rearranjo manual;
- o placeholder visual do drag usa o vermelho padrao da lib, que conflita com a paleta azul/teal/green do produto;
- o widget `Ultimas Transacoes` nao contem a propria lista quando o conteudo extrapola a altura disponivel.

Referencias principais:

- `src/app/(app)/dashboard/dashboard-grid.tsx`
- `src/app/(app)/dashboard/add-widget-dialog.tsx`
- `src/app/(app)/dashboard/widgets/registry.ts`
- `src/app/(app)/dashboard/widgets/recent-transactions-widget.tsx`
- `src/app/api/dashboards/route.ts`
- `src/app/api/dashboards/widgets/route.ts`

## Objective

Melhorar a experiencia de edicao do dashboard para que a grade se comporte de forma mais inteligente, visualmente coerente com a marca e sem overflow nos widgets de lista.

## Scope

- Implementar auto-posicionamento de novos widgets sem sempre iniciar em `x=0` e no ultimo `y`.
- Garantir que a grade compacte ou reflow de forma previsivel depois de adicionar ou remover widgets.
- Substituir o placeholder/vermelho padrao do drag por um neutro coerente com a plataforma, como `#d4d4d4` ou token equivalente.
- Conter o widget `Ultimas Transacoes` com `overflow` interno e scroll dedicado quando o conteudo ultrapassar a altura do card.
- Validar comportamento em desktop e mobile, em light e dark mode.

## Out of Scope

- Criar novos widgets.
- Redesenhar completamente a pagina de dashboard.
- Migrar layouts antigos para um novo schema de banco.
- Introduzir analytics novos ou mexer na logica de dados dos widgets.

## Decisions

- O contrato persistido de layout continua baseado em `x`, `y`, `w`, `h`.
- O algoritmo de encaixe pode nascer no client ou no server, mas deve produzir uma posicao deterministica e sem sobreposicao.
- O feedback visual de drag deve usar tons neutros ou tokens do tema, nunca o vermelho default da lib.

## Contracts

Contrato atual a preservar:

- `DashboardWidget` continua persistindo `type`, `x`, `y`, `w`, `h`.
- `PUT /api/dashboards` continua recebendo um array de widgets com coordenadas finais.

Possivel evolucao interna, se simplificar a implementacao:

- `POST /api/dashboards/widgets` pode deixar `x` e `y` opcionais para permitir auto-placement no server, sem quebrar callers atuais.

## Migrations

- Nenhuma migration de banco e obrigatoria.

## UI

Superficies afetadas:

- edicao da grade em `/dashboard`;
- estado de drag and drop;
- fluxo de adicionar widget;
- widget `Ultimas Transacoes`.

Pontos de validacao visual:

- novo widget aparece em area livre ou em posicao compactada logica;
- placeholder de drag nao parece erro/destructive state;
- lista longa dentro de `Ultimas Transacoes` nao vaza do card;
- alcas e affordances de edicao continuam legiveis.

## Tests

- Unitarios
  - testar helper de auto-placement/compactacao, se extraido.
- Componentes
  - garantir que o widget `Ultimas Transacoes` mantem scroll interno e nao estoura o card.
- Manual
  - adicionar/remover widgets em sequencias diferentes;
  - arrastar e redimensionar cards;
  - validar em light/dark/mobile.

## Checklist

- [ ] Auto-placement de widget implementado
- [ ] Placeholder de drag alinhado ao tema
- [ ] `Ultimas Transacoes` com scroll interno
- [ ] Testes passando
- [ ] `.docs/CONTEXT.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Comecar pelo problema de menor risco e maior clareza visual:

1. corrigir o overflow de `Ultimas Transacoes`;
2. sobrescrever o estilo do placeholder da grid;
3. extrair um helper de auto-placement com testes antes de plugar no fluxo de `addWidget`.
