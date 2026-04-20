# Task: Phase 33 - Dark Theme And Theme Toggle

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

O projeto ja possui uma fundacao parcial para dark mode, mas ainda nao oferece essa funcionalidade de forma real para o usuario.

Hoje:

- `src/app/globals.css` ja define a variante `.dark` e tokens escuros para `background`, `card`, `popover`, `sidebar`, `border`, `input`, `ring` e charts;
- componentes base em `src/components/ui/` e utilitarios como `src/lib/user-chip.ts` ja usam classes `dark:*`;
- `src/app/layout.tsx` nao aplica `.dark` em `<html>`;
- nao existe provider, hook, script de bootstrap ou toggle de tema;
- varias telas seguem acopladas a superficies claras hardcoded (`bg-white`, `text-gray-*`, `border-white/50`, `from-white`, `to-gray-*`), especialmente em dashboard widgets, `/user`, `/settings`, landing page, contas, transacoes, recorrencias, metas, cartoes e `BrandPicker`.

O resultado atual e um sistema "preparado no CSS", mas nao entregue como feature de produto.

Referencias principais:

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/topbar.tsx`
- `src/components/layout/sidebar.tsx`
- `src/app/page.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/register/page.tsx`
- `src/app/(app)/user/page.tsx`
- `src/app/(app)/settings/page.tsx`
- `src/app/(app)/dashboard/widgets/*`
- `src/lib/brands/brand-picker.tsx`

## Objective

Implementar dark theme de ponta a ponta no Finance Controller e oferecer um toggle simples para alternar entre `light` e `dark`, com persistencia da preferencia e cobertura visual consistente em todo o sistema.

## Scope

- Introduzir infraestrutura global de tema na raiz da aplicacao.
- Aplicar a classe/estado de tema antes da renderizacao visivel, evitando flash incorreto sempre que possivel.
- Persistir a preferencia explicita do usuario entre reloads e navegacoes.
- Adicionar um toggle acessivel de `light/dark` na experiencia principal do produto, com prioridade para o `Topbar` do shell autenticado.
- Garantir que as rotas publicas e de auth respeitem a preferencia persistida, mesmo que o controle principal fique na area autenticada.
- Auditar superfices com estilos hardcoded claros e migrar para tokens semanticos (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, etc.).
- Revisar dashboards, dialogs, formularios, badges, dropdowns, placeholders, charts, logos e hover states para legibilidade no dark.
- Validar a experiencia em desktop, mobile, light e dark.

## Out of Scope

- Persistir a preferencia de tema no banco de dados do usuario.
- Expor uma terceira opcao `system` no toggle visivel desta fase.
- Redesenhar a identidade visual completa do produto.
- Criar temas personalizados por marca, workspace ou usuario.
- Ajustar PDFs, exportacoes ou emails para dark mode.

## Decisions

- A estrategia de tema deve continuar baseada na classe `.dark`, porque ela ja esta alinhada ao Tailwind custom variant existente.
- O toggle desta fase deve expor apenas dois estados explicitos: `Light` e `Dark`.
- Quando nao houver preferencia salva, o sistema pode usar o tema do SO/navegador apenas como fallback inicial.
- O caminho preferencial e substituir cores hardcoded por tokens semanticos, nao adicionar uma segunda pilha de classes ad-hoc por tela.
- O controle principal de alternancia deve ficar em uma superficie global do app, e `src/components/layout/topbar.tsx` e o candidato natural.

## Contracts

- Nenhuma rota de API nova e obrigatoria para o MVP.
- Nenhuma alteracao de payload HTTP e necessaria para liberar a feature.
- Se a persistencia usar cookie, a chave e o comportamento SSR devem ser documentados na implementacao.
- Se a persistencia usar `localStorage`, a implementacao precisa mitigar flash de tema e divergencia entre server/client.

## Migrations

- Nenhuma migration de banco e obrigatoria.

## UI

Superficies afetadas:

- `Topbar` e shell autenticado
- landing page
- login e register
- dashboard e widgets
- contas
- categorias
- transacoes
- recorrencias
- metas
- cartoes/faturas
- `/user`
- `/settings`
- componentes compartilhados (`BrandPicker`, dialogs, inputs, buttons, badges, dropdowns)

Pontos de validacao visual:

- contraste suficiente entre fundo, texto, borda e estados interativos;
- logos rasterizados e icones continuam legiveis;
- charts e barras mantem leitura no dark;
- gradientes e cards nao viram manchas escuras indistintas;
- estado inicial nao pisca entre light e dark;
- toggle deixa claro qual tema esta ativo.

## Tests

- Unitarios
  - helpers/provider de tema, se extraidos.
- Componentes
  - toggle com estado inicial coerente;
  - persistencia da preferencia;
  - ausencia de regressao nos componentes compartilhados mais usados, se houver cobertura local.
- Manual
  - alternar tema em dashboard, navegar entre modulos e recarregar a pagina;
  - validar landing, login e register respeitando a preferencia ativa;
  - revisar `/user`, `/settings`, contas, categorias, transacoes, recorrencias, metas e cartoes;
  - validar dialogs destrutivos, dropdowns, sidebars e sheets;
  - revisar mobile e desktop;
  - observar contraste de charts, logos e textos secundarios.

## Checklist

- [x] Infraestrutura global de tema implementada
- [x] Toggle `light/dark` adicionado ao shell principal
- [x] Preferencia persistida entre reloads e navegacao
- [x] Superficies hardcoded claras migradas para tokens do tema
- [ ] Validacao visual em light/dark/mobile executada
- [x] Testes passando
- [x] `.docs/CONTEXT.md` updated
- [x] `README.md` updated (roadmap/backlog/phases/proximo passo when applicable)
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Result

- Nova infraestrutura de tema em `src/lib/theme.ts` + `src/components/theme/theme-provider.tsx` centraliza `Theme`, cookie/localStorage, script de bootstrap e sincronizacao da classe `.dark` no `<html>`.
- `src/app/layout.tsx` passou a ler a preferencia persistida no server via cookie, aplicar `data-theme`, `colorScheme`, `suppressHydrationWarning` e injetar um script de inicializacao para reduzir flash de tema incorreto.
- Novo `ThemeToggle` em `src/components/theme/theme-toggle.tsx` foi plugado no `Topbar`, na landing page e no layout de auth, permitindo alternancia `light/dark` em areas autenticadas e publicas.
- O visual de superficies claras hardcoded foi migrado para tokens semanticos e classes compartilhadas (`.fc-panel`, `.fc-panel-subtle`, `.fc-panel-danger`) em `src/app/globals.css`, cobrindo `/user`, `/settings`, dashboard widgets, transacoes, recorrencias, metas, contas, cartoes/faturas e `BrandPicker`.
- Widgets do dashboard tiveram ajuste de contraste em badges, estados vazios, divisores, mini cards e charts/tooltips para melhorar leitura no dark sem romper a identidade azul/teal/green do produto.
- Checks executados com sucesso: `npm run format`, `npm run format:check`, `npm run lint`, `npm test` e `npm run build`.
- A validacao visual automatizada em browser real ficou parcial: o projeto do usuario ja estava rodando em `localhost:3000`, mas a automacao por `Computer Use` nao tinha permissao concedida neste ambiente.

## Notes for AI (next step)

Prioridade imediata depois desta entrega:

1. fazer uma rodada manual em browser real cobrindo landing, auth, dashboard, `/user`, `/settings`, contas, transacoes, recorrencias, metas e cartoes/faturas;
2. observar contraste fino de charts, badges, overlays, logos rasterizados e estados hover/focus no dark;
3. so depois disso decidir se vale abrir uma subfase para `system` mode visivel ou persistencia da preferencia no perfil do usuario.
