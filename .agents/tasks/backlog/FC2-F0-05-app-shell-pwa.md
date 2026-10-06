---
id: FC2-F0-05
title: App shell mobile-first + 5 destinos + PWA (iPhone 13 Pro)
status: backlog
type: feature
phase: F0
wave: 3
owner: telas-produto
depends_on: [FC2-F0-04]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [app-shell, pwa, navigation, public]
related_use_cases: []
related_adrs: [ADR-017, ADR-018]
---

# FC2-F0-05 — App shell mobile-first + 5 destinos + PWA

## Contexto
O dono usa o app quase só no iPhone 13 Pro (viewport 390x844, notch, Dynamic Island não, home indicator, 120 Hz), instalado como PWA pelo Safari. A arquitetura de informação do ADR-017 é: tab bar de vidro com **Hoje, Lançamentos, + (captura global), Planejar, Cartões** e uma área **Mais** (relatórios, contas, categorias, regras, importar, integrações, conta) acessada fora da tab bar. Esta task cria a moldura (shell) e a instalabilidade; o conteúdo de cada aba vem nas fases seguintes. Critério de saída da F0: o app abre no iPhone instalado como PWA, com as abas vazias e tokens aplicados.

## Problema
Não existe shell mobile: o 1.x tem sidebar/topbar de desktop (removidos na F0-01). Faltam manifest, ícones, meta tags do iOS, tratamento de safe area, tab bar e o ponto de entrada da captura global.

## Objetivo
1. Shell em `src/app/(app)/layout.tsx` com tab bar fixa de vidro, safe areas e área de conteúdo rolável.
2. Cinco páginas vazias (empty state) em `src/app/(app)/{hoje,lancamentos,planejar,cartoes,mais}/page.tsx`.
3. PWA instalável no iOS: manifest, ícones (incluindo apple-touch-icon), meta tags, `viewport-fit=cover`, `theme-color`, status bar translucent.
4. Botão central `+` abre um sheet de captura **stub** (a captura real é a F2-04).
5. Verificação em 390x844.

## Fora de escopo
- Conteúdo das telas (F2/F3), captura real (F2-04), atalho de teclado `/` e ⌘K (F2-04).
- Service worker, cache offline e push (fora da F0; no iOS a instalação não exige SW). Registrar como pendência de F6.
- Layout desktop elaborado: nesta fase o desktop mostra a mesma coluna central (largura máxima 520px).
- Splash screens `apple-touch-startup-image` por dispositivo (opcional na F6).

## Comportamento atual
Após F0-01/F0-03/F0-04: `/` redireciona para `/hoje`; `(app)/layout.tsx` valida a sessão e renderiza `children`; `(app)/hoje/page.tsx` é um placeholder; não há manifest, ícones nem tab bar. `src/app/layout.tsx` tem fontes Geist e `<html class="dark">` sem `viewport` customizado.

## Comportamento esperado
### Navegação (fonte única em `src/components/shell/nav-items.ts`)
```ts
export const TAB_ITEMS = [
  { key: 'hoje',        href: '/hoje',        label: 'Hoje',        icon: 'Sun'            },
  { key: 'lancamentos', href: '/lancamentos', label: 'Lançamentos', icon: 'ReceiptText'    },
  { key: 'capturar',    href: null,           label: 'Novo',        icon: 'Plus'           }, // FAB central, abre o sheet
  { key: 'planejar',    href: '/planejar',    label: 'Planejar',    icon: 'Target'         },
  { key: 'cartoes',     href: '/cartoes',     label: 'Cartões',     icon: 'CreditCard'     },
] as const
export const MORE_ITEM = { key: 'mais', href: '/mais', label: 'Mais', icon: 'Menu' } as const
export function activeTabKey(pathname: string): TabKey | 'mais' | null // prefixo; '/hoje/x' => 'hoje'
```
`Mais` não está na tab bar: é um `IconButton` fixo no canto superior direito do cabeçalho de cada aba (e a própria rota `/mais` mantém a tab bar sem aba ativa).

### Componentes (`src/components/shell/`)
- `AppShell` (server): estrutura `<div class="fc-shell">` com `<main>` rolável + `<TabBar/>` + `<CaptureProvider>`. Aplica `Aura` suave no topo apenas em `/hoje` (a F3-04 controla o estado).
- `TabBar` (client): `GlassCard variant="bar"` fixa na base, altura `--fc-tabbar-h` + `env(safe-area-inset-bottom)`, 5 slots iguais; o slot central é o FAB circular (56px) elevado 14px, cor `--fc-iris`, sombra `--fc-glow-iris`; item ativo com cor `--fc-iris-hi` e indicador; rótulos com `fc-text-caption`/11px; `aria-current="page"` no ativo; `<Link prefetch>` para as 4 abas.
- `ScreenHeader` (server): título da tela (`fc-text-title`), slot de ações e o botão Mais; respeita `env(safe-area-inset-top)`.
- `CaptureProvider`/`useCapture()` (client): estado `open/close`; `CaptureSheetStub` usa `Sheet` do F0-04 com título "Novo lançamento" e texto "A captura chega na F2-04".
- Páginas: cada uma com `ScreenHeader` + `EmptyState` (ícone, título "Em breve", descrição do que a aba terá). `mais/page.tsx` lista (como `ListRow`) os itens futuros desabilitados: Relatórios, Contas, Categorias, Regras, Importar, Integrações, Conta.

### Layout e safe area
- `src/app/(app)/layout.tsx` usa `min-height: 100dvh`; conteúdo com `padding: 0 var(--fc-gutter)`; `main` com `padding-bottom: calc(var(--fc-tabbar-h) + env(safe-area-inset-bottom) + var(--fc-space-4))`; cabeçalho com `padding-top: calc(env(safe-area-inset-top) + var(--fc-space-3))`.
- Utilitários em `src/components/shell/shell.css` (importado em `globals.css`): `.fc-shell`, `.pt-safe`, `.pb-safe`, `.px-gutter`. Valores só via tokens/`env()`.
- Rolagem do corpo (não de contêiner interno) para preservar o comportamento de barra de status do iOS; `overscroll-behavior-y: none` já está no `body` (F0-03).
- Coluna central `max-width: 520px; margin-inline: auto` em telas largas; a tab bar acompanha a mesma largura.

### Metadados e PWA (`src/app/layout.tsx` e arquivos de convenção)
```ts
export const metadata: Metadata = {
  applicationName: 'Finance Controller',
  title: { default: 'Finance Controller', template: '%s · FC' },
  description: 'Finanças pessoais, no seu bolso.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'FC', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icons/icon-192.png', sizes: '192x192' }, { url: '/icons/icon-512.png', sizes: '512x512' }], apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }] },
  formatDetection: { telephone: false },
  other: { 'apple-mobile-web-app-capable': 'yes' },
}
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: '#04060b', colorScheme: 'dark',
}
```
- `themeColor` e `background_color` usam o valor de `--fc-void`; é a única cor literal permitida (arquivo na allowlist do guard, com `// fc-allow-literal-color: valor de --fc-void exigido pelo manifest/viewport`). Um teste compara o valor com o token em `tokens.css`.
- **Não** usar `userScalable: false` nem `maximumScale` (acessibilidade); o zoom de foco do iOS é evitado com fonte de input >= 16px (F0-03).
- `src/app/manifest.ts`:
```ts
{ name: 'Finance Controller', short_name: 'FC', description: '...', start_url: '/hoje', scope: '/',
  display: 'standalone', orientation: 'portrait', background_color: '#04060b', theme_color: '#04060b',
  lang: 'pt-BR', categories: ['finance'],
  icons: [ {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png'},
           {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png'},
           {src:'/icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'} ] }
```
- Ícones PNG em `public/icons/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (arte com 20% de margem segura), `apple-touch-icon.png` (180x180, **sem transparência**, o iOS preenche transparência com preto). Fonte vetorial `public/icons/source.svg` (glifo "FC" ou moeda estilizada sobre fundo `--fc-void`) e `scripts/generate-icons.mjs` (usa `sharp` como devDependency) para regenerar. Arte original simples, sem marca de terceiros.
- Verificar que o HTML final contém `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, `<link rel="apple-touch-icon" ...>` e `<meta name="viewport" ... viewport-fit=cover>`. Se o Next 16 emitir só `mobile-web-app-capable`, o campo `other` acima garante a tag da Apple.
- Com `black-translucent` o conteúdo passa por baixo da status bar: o cabeçalho obrigatoriamente usa `env(safe-area-inset-top)`.

## Regras de negócio
- RN-01: A tab bar tem exatamente 5 slots na ordem Hoje, Lançamentos, + , Planejar, Cartões (ADR-017). `Mais` fica fora da tab bar.
- RN-02: O `+` nunca navega; sempre abre o sheet de captura (global em qualquer tela).
- RN-03: Todos os alvos de toque >= 44px; a tab bar não cobre conteúdo (padding de fim de página compensa altura + safe area).
- RN-04: O app inicia em `/hoje` (`start_url`) e é somente retrato.
- RN-05: Sem cores literais, exceto `--fc-void` espelhado no manifest/viewport e nos ícones (allowlist do guard).
- RN-06: Nenhum dado financeiro, real ou fictício, aparece nas páginas vazias.
- RN-07: Rotas do grupo `(app)` exigem sessão (proteção formal na F0-06; aqui continua a checagem do layout).

## Critérios de aceitação
- [ ] CA-01: `/hoje`, `/lancamentos`, `/planejar`, `/cartoes`, `/mais` respondem 200 autenticado e mostram `ScreenHeader` + empty state; `/` redireciona para `/hoje`.
- [ ] CA-02: A tab bar mostra 5 slots na ordem correta; o item da rota atual tem `aria-current="page"`; tocar no `+` abre o sheet em qualquer das 5 rotas.
- [ ] CA-03: `curl -s localhost:3000/hoje` (com cookie) contém: `apple-mobile-web-app-capable`, `black-translucent`, `rel="apple-touch-icon"`, `viewport-fit=cover`, `theme-color` com valor igual ao de `--fc-void`.
- [ ] CA-04: `GET /manifest.webmanifest` retorna JSON válido com `display: standalone`, `start_url: /hoje`, 3 ícones (um `maskable`), `theme_color` e `background_color` iguais a `--fc-void`; todos os arquivos de `public/icons/*` existem; `apple-touch-icon.png` mede 180x180 e não tem canal alfa transparente (verificar com `file`/`sips`).
- [ ] CA-05: No Chrome DevTools, 390x844 DPR 3, a tab bar não cobre o último item de conteúdo (rolar até o fim em `/mais`) e o cabeçalho não fica sob a área segura simulada (inset-top 47px, inset-bottom 34px via DevTools Sensors/`env()` override ou verificação do CSS computado).
- [ ] CA-06: Lighthouse (aba PWA/installability do Chrome DevTools) reporta manifest instalável sem erros.
- [ ] CA-07: Em iPhone real (ou registrado como pendência com justificativa): "Compartilhar > Adicionar à Tela de Início" instala com o ícone correto, abre em tela cheia (sem barra do Safari), status bar translucent com o conteúdo abaixo dela, e a aba `Hoje` ativa.
- [ ] CA-08: `activeTabKey('/hoje')='hoje'`, `('/lancamentos/abc')='lancamentos'`, `('/mais')='mais'`, `('/login')=null` (teste unitário).
- [ ] CA-09: Teste que lê `tokens.css` e `manifest.ts` falha se `theme_color`/`background_color`/`themeColor` divergirem de `--fc-void`.
- [ ] CA-10: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam; `no-literal-colors` continua verde (com a allowlist documentada).

## Impacto técnico
### Backend
Nenhum (apenas `manifest.ts` como rota de metadados).
### Frontend
Novos `src/components/shell/*`, cinco páginas, `shell.css`, metadados/viewport em `src/app/layout.tsx`, `src/app/manifest.ts`, `public/icons/*`, `scripts/generate-icons.mjs` (+ `sharp` em devDependencies).
### Banco de dados
Nenhum.
### Integrações
Nenhuma. Vercel serve os estáticos de `public/`.
### Segurança
Manifest e ícones são públicos (devem passar pelo proxy da F0-06 como exceção); nenhuma informação do usuário no manifest. O `start_url` não carrega token.

## Plano de implementação
- [ ] Etapa 1 — Ler ADR-017, `tokens.css`, `src/components/fc/*` (F0-04) e a documentação Next 16 sobre `metadata`, `viewport` e `manifest.ts`.
- [ ] Etapa 2 — `src/components/shell/nav-items.ts` + `nav-items.test.ts` (CA-08).
- [ ] Etapa 3 — `TabBar`, `ScreenHeader`, `CaptureProvider`, `CaptureSheetStub`, `AppShell`, `shell.css`.
- [ ] Etapa 4 — Cinco páginas em `src/app/(app)/*/page.tsx` e `(app)/layout.tsx` usando `AppShell`.
- [ ] Etapa 5 — Ícones: criar `public/icons/source.svg`, `scripts/generate-icons.mjs`, gerar e commitar os 4 PNGs.
- [ ] Etapa 6 — `src/app/manifest.ts`, metadados e `viewport` em `src/app/layout.tsx`; teste `src/app/pwa.test.ts` (CA-09).
- [ ] Etapa 7 — Verificar o HTML (`curl`) e o manifest (CA-03/CA-04); ajustar `other` se necessário.
- [ ] Etapa 8 — Verificação visual em 390x844 (Chrome DevTools, DPR 3) das 5 telas, com sheet aberto; capturar telas **sem dados** e guardar fora do repositório (nunca commitar capturas).
- [ ] Etapa 9 — Teste em iPhone real (CA-07) ou registrar pendência com o passo a passo para o dono.
- [ ] Etapa 10 — Atualizar `docs/ui/` (navegação e PWA), `.agents/context/CONTEXT.md`, `PLANS.md`, `README.md`; commit `feat(f0-05): app shell, tab bar e pwa`.

## Estratégia de testes
- [ ] Unitários: `nav-items.test.ts` (ordem das abas, `href: null` só no `+`, `activeTabKey` com: `/hoje`, `/hoje/`, `/lancamentos/abc`, `/mais`, `/login`, `/`, string vazia); `pwa.test.ts` (manifest: `start_url`, `display`, presença de `maskable`, cores = token).
- [ ] Integração: `npx next build` e requisições `curl` de CA-03/CA-04 contra `next start`.
- [ ] E2E: não há runner; usar roteiro manual abaixo.
- [ ] Manual (390x844): (1) abrir cada aba pela tab bar; (2) tocar `+` em cada aba; (3) rotacionar para paisagem: layout não quebra (app só retrato, sem bloquear); (4) rolar `/mais` até o fim; (5) tab bar com VoiceOver/teclado (Tab percorre 5 itens); (6) iPhone real: instalar, abrir, alternar abas, voltar do app switcher.

## Riscos e rollback
- **Quirks do iOS PWA**: status bar `black-translucent` exige safe area em todo cabeçalho; o armazenamento da PWA instalada é separado do Safari (será preciso logar de novo dentro da PWA — tratar na F0-06). Cache do manifest/ícones: reinstalar para ver o novo ícone.
- **`backdrop-filter` na tab bar** pode causar jank em listas longas: manter o blur só na barra; medir nas telas reais (F6-01).
- **Tab bar sobre teclado**: ao focar input, o teclado do iOS empurra o `visualViewport`; a tab bar `fixed` pode ficar flutuando — esconder a tab bar quando o `visualViewport.height` encolher > 150px (hook `useKeyboardOpen`).
- **Allowlist de cor literal** para `#04060b`: se `--fc-void` mudar, o teste CA-09 acusa.
- Rollback: `git revert`; rotas voltam ao placeholder da F0-01.

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
