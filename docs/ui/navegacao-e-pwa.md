---
estado: vigente (shell, tab bar e PWA da F0-05 implementados; teste em iPhone real e Lighthouse pendentes)
fonte: src/components/shell/, src/app/layout.tsx, src/app/manifest.ts
ultima-revisao: FC2-F0-05 2026-10-05
---

# Navegação, app shell e PWA

Decisão: ADR-017 (4 abas mais captura global). Alvo: iPhone 13 Pro, 390x844, instalado como PWA pelo Safari.

## Destinos

Fonte única: `src/components/shell/nav-items.ts`.

| Slot          | Rota           | Rótulo                       | Ícone (lucide) |
| ------------- | -------------- | ---------------------------- | -------------- |
| 1             | `/hoje`        | Hoje                         | `Sun`          |
| 2             | `/lancamentos` | Lançamentos                  | `ReceiptText`  |
| 3             | (sem rota)     | `+` (FAB, "Novo lançamento") | `Plus`         |
| 4             | `/planejar`    | Planejar                     | `Target`       |
| 5             | `/cartoes`     | Cartões                      | `CreditCard`   |
| fora da barra | `/mais`        | Mais                         | `Menu`         |

- `activeTabKey(pathname)` resolve a aba ativa por segmento (`/hoje/x` é `hoje`; `/hojexyz`, `/login` e `/` são `null`). Em `/mais` a tab bar fica sem aba ativa.
- O `+` nunca navega: `useCapture().open()` abre o sheet de captura em qualquer rota. Hoje é um stub ("A captura chega na F2-04"); a captura real (campo único, chips, `/` e ⌘K) é a F2-04.
- `Mais` é o botão (`Button asChild` com `Link`) no canto direito do `ScreenHeader` de cada aba. `/mais` lista Relatórios, Contas, Categorias, Regras, Importar, Integrações e Conta como itens "Em breve", sem rota.

## Componentes do shell (`src/components/shell/`)

| Arquivo                                          | Papel                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-shell.tsx` (server)                         | `<div class="fc-shell">` com `main`, `TabBar`, `ShellAura`, `CaptureSheetStub` e `Toaster` (montado uma vez aqui), dentro de `CaptureProvider`. Usado por `src/app/(app)/layout.tsx`, que mantém `validateSession()` + `redirect('/login')`.                                                                   |
| `tab-bar.tsx` (client)                           | `GlassCard variant="bar"` com 5 slots iguais; FAB circular de 56px elevado 14px (`--fc-iris`, `--fc-glow-iris`); ativo em `--fc-iris-hi` com indicador e `aria-current="page"`; `Link prefetch`. Esconde-se quando o teclado virtual abre (`use-keyboard-open.ts`, `visualViewport` encolhendo mais de 150px). |
| `screen-header.tsx` (server)                     | `h1` (`fc-text-title`), slot `actions`, botão Mais (`showMore={false}` em `/mais`); topo com `.pt-safe`.                                                                                                                                                                                                       |
| `capture-provider.tsx`, `capture-sheet-stub.tsx` | Estado `open/close/setOpen` e o `Sheet` do F0-04 com título "Novo lançamento".                                                                                                                                                                                                                                 |
| `shell-aura.tsx` (client)                        | `Aura calm` suave no topo apenas em `/hoje`; a F3-04 passa a controlar o estado.                                                                                                                                                                                                                               |
| `shell.css`                                      | `.fc-shell`, `.fc-shell-main`, `.fc-shell-bar`, `.fc-tab-label`, utilitários `.pt-safe`, `.pb-safe`, `.px-gutter`. Só `var(--fc-*)` e `env()`; importado por `globals.css`.                                                                                                                                    |

## Layout e safe area

- Rola o corpo da página (não um contêiner interno), para preservar o comportamento da status bar do iOS; `overscroll-behavior-y: none` já está no `body`.
- Coluna central de no máximo 520px (`--fc-shell-max`, local ao shell); em telas largas a tab bar acompanha a mesma largura. Layout desktop expandido fica para uma fase posterior.
- `main`: `padding-bottom: calc(var(--fc-tabbar-h) + env(safe-area-inset-bottom) + var(--fc-space-4))`, de modo que a barra (flutuante, 8px acima da safe area) não cobre o fim do conteúdo.
- Cabeçalho: `padding-top: calc(env(safe-area-inset-top) + var(--fc-space-3))`. Com `black-translucent` o conteúdo passa sob a status bar, então todo cabeçalho novo usa `ScreenHeader` ou `.pt-safe`.
- Rótulo das abas: `.fc-tab-label` usa o tamanho de `--fc-text-caption` (11px), mas em fonte sans e sem caixa alta, para "Lançamentos" caber no slot de cerca de 70px.

## PWA

- `src/app/layout.tsx`: `metadata` (`applicationName`, `title` com template "%s · FC", `manifest`, `appleWebApp` com `black-translucent`, ícones, `formatDetection`, `other: { 'apple-mobile-web-app-capable': 'yes' }`) e `viewport` (`viewportFit: 'cover'`, `themeColor`, `colorScheme: 'dark'`). Sem `maximumScale`/`userScalable`: o zoom não é bloqueado.
- O Next 16 emite apenas `mobile-web-app-capable`; o campo `other` garante a tag `apple-mobile-web-app-capable` que o iOS lê.
- `src/app/manifest.ts` serve `/manifest.webmanifest`: `start_url: /hoje`, `scope: /`, `display: standalone`, `orientation: portrait`, `lang: pt-BR`, 3 ícones (um `maskable`).
- Ícones em `public/icons/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180x180, sem canal alfa) e a fonte vetorial `source.svg` (moeda em "C" aberto com "F"; arte original). Regenere com `node scripts/generate-icons.mjs` (usa `sharp`, dependência transitiva do Next).
- Única cor literal permitida: o valor de `--fc-void` (`#04060b`) em `manifest.ts` (isento por caminho no guard), em `themeColor` do layout (uma exceção `fc-allow-literal-color`) e em `source.svg`/`generate-icons.mjs` (fora do escopo do guard). `src/app/pwa.test.ts` falha se algum divergir de `--fc-void` em `tokens.css`.
- Manifest e ícones são públicos: `src/proxy.ts` (F0-06) libera `/manifest.webmanifest`, `/icons/*`, `/apple-touch-icon.png` e `/favicon.ico` sem sessão, pela lista pública de `src/server/auth/proxy-rules.ts` (verificado com curl sem cookie na revisão da F0-05).
- Fora da F0: service worker, cache offline, push e `apple-touch-startup-image` (F6). No iOS a instalação não exige service worker.

## Teste em iPhone real (CA-07)

1. Abra a URL de produção no Safari do iPhone e faça login.
2. Compartilhar, depois "Adicionar à Tela de Início"; confirme o ícone (moeda "C" com "F") e o nome "FC".
3. Abra pelo ícone: tela cheia, sem barra do Safari; status bar translucent com o título abaixo dela (não sob o relógio) e a aba Hoje ativa.
4. Alterne as quatro abas e o `+` (abre o sheet em todas), role `/mais` até o fim (a barra não cobre o último item), volte do app switcher.
5. A PWA instalada guarda cookies separados do Safari: será preciso entrar de novo dentro dela. Para ver um ícone novo, remova e reinstale.
