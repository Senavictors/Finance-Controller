# Dark Theme And Theme Toggle

## Objetivo

Entregar um tema dark real para todo o Finance Controller e expor um controle simples para alternar entre `light` e `dark`, sem depender de hacks locais nem de estilos soltos por tela.

O objetivo nao e apenas "pintar o fundo de escuro", mas consolidar uma estrategia de tema global, persistente e coerente com a paleta azul/teal/green ja adotada no produto.

## Dependencia

Depende do estado atual documentado em [CONTEXT](../CONTEXT.md), da fundacao visual em `src/app/globals.css` e da task executavel em [Phase 33 - Dark Theme And Theme Toggle](../tasks/phase-33-dark-theme-and-theme-toggle.md).

Tambem conversa diretamente com a recente reorganizacao de settings/profile da [Phase 32](../tasks/phase-32-settings-profile-and-confirmation-ux.md), porque `/user`, `/settings` e o `Topbar` passaram a ser superficies centrais de identidade e configuracao.

## Leitura do sistema atual

- `src/app/globals.css` ja define a variante `.dark` e um conjunto completo de tokens escuros (`--background`, `--card`, `--sidebar`, `--ring`, etc.).
- Varios componentes de base ja usam classes `dark:*`, especialmente em `src/components/ui/`.
- `src/app/layout.tsx` ainda nao aplica `.dark` em `<html>` e nao existe provider, hook ou script de inicializacao do tema.
- A busca no codigo nao encontrou `ThemeProvider`, `next-themes`, `setTheme`, leitura de `prefers-color-scheme` nem toggle visivel para o usuario.
- Muitas superficies ainda estao acopladas a tons claros com classes como `bg-white`, `text-gray-*`, `border-white/50`, `from-white` e `to-gray-*`, inclusive em dashboard widgets, `/user`, `/settings`, landing page, contas, transacoes, recorrencias, metas e cartoes.
- `src/components/layout/topbar.tsx` e o ponto natural para um controle global dentro da area autenticada, porque ja concentra navegacao contextual, conta do usuario e logout.

## Principio central

Tema precisa ser tratado como infraestrutura de produto, nao como ajuste cosmetico por componente.

Isso implica:

- um estado global unificado;
- persistencia da escolha do usuario;
- ativacao previsivel antes do paint inicial;
- uso consistente de tokens semanticos (`bg-background`, `text-foreground`, `border-border`, `bg-card`, etc.);
- auditoria sistematica das telas que hoje dependem de cinzas e brancos hardcoded.

## Recomendacao arquitetural

1. Manter a estrategia baseada em classe `.dark`, porque ela ja esta embutida na custom variant do Tailwind em `src/app/globals.css`.
2. Introduzir uma camada central de tema na raiz da app para controlar o atributo/classe em `<html>`.
3. Persistir a preferencia explicita `light|dark`; quando nao houver escolha salva, o sistema pode usar `prefers-color-scheme` apenas como fallback inicial.
4. Expor um toggle acessivel e de baixo atrito nas superficies principais do produto, com prioridade para o `Topbar` do shell autenticado.
5. Migrar gradualmente os estilos hardcoded claros para tokens do design system, evitando duplicacao de classes por tela.
6. Validar comportamento em light/dark/mobile, incluindo hover, focus, overlays, dialogs, charts, logos e estados destrutivos.

## Decisoes recomendadas

- A UI desta fase deve expor apenas `Light` e `Dark` como estados explicitos do toggle.
- `System` pode existir apenas como comportamento implicito de primeira carga, e nao como terceira opcao visivel no MVP.
- A preferencia nao precisa ir para o banco nesta fase; persistencia local ou via cookie e suficiente para liberar o fluxo.
- O tema dark deve preservar a identidade azul/teal/green do produto; nao e uma autorizacao para redesenho total da marca.

## Ponto de integracao no codigo atual

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

## Output esperado desta fase

- Infraestrutura de tema global funcionando na aplicacao inteira.
- Toggle de alternancia `light/dark` acessivel ao usuario.
- Preferencia persistida entre navegacoes e reload.
- Superficies principais migradas para tokens semanticos em vez de cores claras hardcoded.
- Checklist de validacao manual cobrindo telas publicas, auth e area autenticada.

## Fora de escopo

- Persistir preferencia de tema em tabela `User`.
- Introduzir um terceiro tema visual ou editor de paleta.
- Refazer o design system completo ou trocar tipografia base.
- Trabalhar temas de impressao, exportacao PDF ou emails.

## Riscos e cuidados

- Flash de tema incorreto na primeira renderizacao.
- Hydration mismatch ao alternar entre server/client.
- Contraste insuficiente em textos cinza, badges, cards e placeholders.
- Graficos, logos claros e assets rasterizados perdendo legibilidade no dark.
- Paginas parcialmente migradas exibindo mistura de tokens semanticos e classes fixas.

## Ordem recomendada de implementacao

1. Resolver a infraestrutura de tema na raiz.
2. Adicionar o toggle principal.
3. Auditar e migrar superfices com estilos hardcoded claros.
4. Revisar graficos, logos, dialogs e estados interativos.
5. Fechar a fase com validacao manual em light/dark/mobile.

## Valor para portfolio

Essa fase eleva a maturidade do produto: mostra consistencia de design system, cuidado com UX real de uso continuo e capacidade de tratar tema como concern transversal de plataforma, nao como detalhe visual isolado.
