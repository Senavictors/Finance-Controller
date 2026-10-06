---
id: FC2-F0-03
title: Tokens dark glass no Tailwind v4/shadcn + fontes
status: completed
type: refactor
phase: F0
wave: 1
owner: ui-design-system
depends_on: []
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [styles, app-layout, components-ui]
related_use_cases: []
related_adrs: [ADR-018, ADR-017]
---

# FC2-F0-03 — Tokens dark glass no Tailwind v4/shadcn + fontes

## Contexto
`src/styles/tokens.css` já define o design system "Dark Glass" (ADR-018): superfícies, texto, acento, semântica financeira, aura, paleta categórica, tipografia, espaço, raio, vidro, motion e z-index, tudo como variáveis `--fc-*`. O cabeçalho do arquivo diz "Integração com Tailwind v4 (@theme) e shadcn: task FC2-F0-03". Hoje `src/app/globals.css` ainda carrega o tema "Apex" do 1.x (claro + escuro, oklch azul/teal, classes `.fc-panel*`, CSS do `react-grid-layout`) e `src/app/layout.tsx` usa Inter + JetBrains Mono, tema por cookie e `ThemeProvider`.

Roda na onda 1 em paralelo com FC2-F0-01. A F0-01 faz o merge primeiro e remove `ThemeProvider`/cookie de tema de `layout.tsx`; esta task é dona de `globals.css` e das fontes.

## Problema
- Dois sistemas de tema coexistem (Apex claro/escuro vs. tokens `--fc-*`), com cores literais oklch em `globals.css`.
- Os componentes shadcn (`src/components/ui/*`) leem variáveis shadcn (`--background`, `--primary`...) que hoje apontam para o tema Apex.
- Utilitários Tailwind não enxergam os tokens `--fc-*` (não há `bg-fc-glass`, `text-fc-text-2`...).
- O app é **somente dark** (decisão de produto), mas existe alternância claro/escuro.
- Fontes: o design usa fonte do sistema Apple com Geist de fallback; hoje carrega Inter/JetBrains.

## Objetivo
Uma única fonte de verdade: `tokens.css`. Tailwind v4 e shadcn passam a consumir os tokens; o tema Apex e o modo claro são removidos; Geist/Geist Mono entram via `next/font` como fallback do stack Apple.

## Fora de escopo
- Primitivos novos `src/components/fc/*` (FC2-F0-04).
- Shell, tab bar, PWA, viewport/theme-color (FC2-F0-05).
- Reescrever os componentes shadcn: só garantir que herdam os tokens (sem tocar em cores literais dentro deles; se houver, anotar para F0-04).
- Alterar valores de tokens existentes, exceto o ajuste de pilhas de fonte descrito abaixo.

## Comportamento atual
- `src/app/globals.css`: `@import 'tailwindcss'; @import 'tw-animate-css'; @import 'shadcn/tailwind.css'; @custom-variant dark (&:is(.dark *));` + `@theme inline` mapeando `--color-*` shadcn para `--background`, `--primary` etc. + blocos `:root` (claro, oklch) e `.dark` + `@layer base` + `@layer components` com `.fc-panel`, `.fc-panel-subtle`, `.fc-panel-strong`, `.fc-panel-danger` + regras `react-grid-layout`.
- `src/app/layout.tsx` (após F0-01): `Inter` (`--font-inter`) e `JetBrains_Mono` (`--font-jetbrains-mono`) em `next/font/google`; `<html lang="pt-BR" className="... dark">`.
- `src/styles/tokens.css`: pilhas `--fc-font-ui`, `--fc-font-display`, `--fc-font-num`, `--fc-font-mono` com `"Geist"` por nome literal (não casa com o nome gerado por `next/font`).
- `components.json`: `style: base-nova`, `css: src/app/globals.css`, `baseColor: neutral`.

## Comportamento esperado
### 1. Ordem e estrutura de `globals.css`
```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';
@import '../styles/tokens.css';

@custom-variant dark (&:is(.dark *));  /* mantido por compatibilidade com shadcn; <html> sempre tem class="dark" */
```
`@theme inline { ... }` expõe os tokens como utilitários e mapeia shadcn. Remover: blocos `:root` claro e `.dark` do Apex, `@layer components .fc-panel*`, CSS do `react-grid-layout`.

### 2. Utilitários Tailwind a partir dos tokens (`@theme inline`)
- **Cores** (`--color-fc-*` → `var(--fc-*)`): `void`, `ink`, `ink-raised`, `glass`, `glass-strong`, `glass-bar`, `glass-sheet`, `rim`, `divider`, `scrim`, `text`, `text-2`, `text-3`, `text-on-accent`, `iris`, `iris-hi`, `iris-lo`, `iris-soft`, `in`, `out`, `pend`, `info`, `debt`, `cat-1`..`cat-10`. Resultado: `bg-fc-glass`, `border-fc-rim`, `text-fc-text-2`, `text-fc-in`, `bg-fc-cat-3`.
- **Raios**: `--radius-fc-xs|sm|md|lg|xl|sheet|pill` → `var(--fc-radius-*)` (`rounded-fc-lg`...). Manter `--radius-sm/md/lg/xl...` derivados de `--radius` para o shadcn.
- **Fontes**: `--font-sans: var(--fc-font-ui)`, `--font-heading: var(--fc-font-display)`, `--font-mono: var(--fc-font-mono)`, `--font-num: var(--fc-font-num)` (`font-num`).
- **Espaço/sombras/blur**: sombras como utilitários `shadow-fc-float|card|glow` (`--shadow-fc-*`). `backdrop-blur` customizado via `@utility fc-blur-card|bar|sheet { backdrop-filter: var(--fc-blur-*); -webkit-backdrop-filter: var(--fc-blur-*); }`.
- **Tipografia** (`font` shorthand não mapeia em `@theme`): `@utility fc-text-hero|title|h2|body|sub|label|caption|amount { font: var(--fc-text-*); }`; `fc-text-hero` e `fc-text-title` aplicam o `letter-spacing` indicado nos comentários do token (-0.035em e -0.025em); `fc-text-caption` aplica `text-transform: uppercase; letter-spacing: 0.06em`; `fc-text-amount` e `fc-text-hero` aplicam `font-variant-numeric: tabular-nums`. Utilitário auxiliar `fc-tabular`.
- **Motion**: `--ease-fc` e `--ease-fc-spring`; `--animate-*` ficam para a F0-04/F6.

### 3. Variáveis shadcn mapeadas para tokens (um único bloco `:root`, sem `.dark` separado)
| shadcn | token |
|---|---|
| `--background` | `var(--fc-void)` |
| `--foreground` | `var(--fc-text)` |
| `--card` / `--popover` | `var(--fc-ink-raised)` |
| `--card-foreground` / `--popover-foreground` | `var(--fc-text)` |
| `--primary` | `var(--fc-iris)` |
| `--primary-foreground` | `var(--fc-text-on-accent)` |
| `--secondary` | `var(--fc-glass-strong)` |
| `--secondary-foreground` | `var(--fc-text)` |
| `--muted` | `var(--fc-glass)` |
| `--muted-foreground` | `var(--fc-text-2)` |
| `--accent` | `var(--fc-iris-soft)` |
| `--accent-foreground` | `var(--fc-iris-hi)` |
| `--destructive` | `var(--fc-out)` |
| `--success` / `--success-foreground` | `var(--fc-in)` / `var(--fc-text-on-accent)` |
| `--warning` / `--warning-foreground` | `var(--fc-pend)` / `var(--fc-text-on-accent)` |
| `--border` | `var(--fc-rim)` |
| `--input` | `var(--fc-rim)` |
| `--ring` | `var(--fc-iris)` |
| `--chart-1..5` | `var(--fc-cat-1..5)` |
| `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring` | `--fc-ink`, `--fc-text`, `--fc-iris`, `--fc-text-on-accent`, `--fc-glass-strong`, `--fc-text`, `--fc-rim`, `--fc-iris` |
| `--radius` | `1rem` (= `--fc-radius-md`) |

`@layer base`: `* { @apply border-border outline-ring/50; }`; `html { background: var(--fc-void); color-scheme: dark; }`; `body { background: var(--fc-void); color: var(--fc-text); font: var(--fc-text-body); -webkit-font-smoothing: antialiased; overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }`; `button, a { touch-action: manipulation; }`; `input, select, textarea { font-size: max(16px, 1em); }` (evita zoom automático do iOS ao focar).

### 4. Remoção do tema Apex e do modo claro
- `<html lang="pt-BR" class="dark ..." style="color-scheme: dark">` fixo; nenhuma leitura de cookie/`localStorage` para tema.
- Nenhum `ThemeProvider`, `ThemeToggle`, `getThemeScript` (já removidos pela F0-01; conferir).
- `rg "oklch\(|#[0-9a-fA-F]{3,8}\b" src/app/globals.css` retorna vazio (nenhuma cor literal no CSS global).

### 5. Fontes
- `src/app/layout.tsx`: `Geist` e `Geist_Mono` de `next/font/google` com `variable: '--font-geist-sans'` / `'--font-geist-mono'`, `subsets: ['latin']`, `display: 'swap'`, **`preload: false`** (no iPhone a fonte do sistema vem primeiro; Geist só é baixada se for realmente usada). Aplicar as duas classes `.variable` no `<html>`.
- Ajustar as pilhas em `tokens.css` para casar com o nome gerado pelo `next/font` (único ajuste permitido neste arquivo):
```css
--fc-font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-geist-sans), system-ui, sans-serif;
--fc-font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", var(--font-geist-sans), system-ui, sans-serif;
--fc-font-num: ui-rounded, "SF Pro Rounded", -apple-system, var(--font-geist-sans), system-ui, sans-serif;
--fc-font-mono: var(--font-geist-mono), "SF Mono", ui-monospace, monospace;
```
(`ui-rounded` é a forma que o Safari aceita para SF Pro Rounded; nomear "SF Pro Rounded" diretamente não funciona em web.)
- `metadata.title` = "Finance Controller", `description` curta; `lang="pt-BR"` mantido. Viewport/theme-color ficam para a F0-05.

## Regras de negócio
- RN-01: `tokens.css` é a **única** fonte de cor, raio, sombra, blur, tipografia e motion (ADR-018). `globals.css` só referencia `var(--fc-*)`; não declara valores literais de cor.
- RN-02: O app é somente dark. Não existe tema claro, toggle nem preferência salva.
- RN-03: Nenhum valor de token existente muda; só as pilhas de fonte são ajustadas (RN de compatibilidade com `next/font`).
- RN-04: Inputs e selects têm fonte >= 16px (evita zoom do iOS).
- RN-05: Utilitários de tipografia sempre usam `tabular-nums` para valores monetários.

## Critérios de aceitação
- [x] CA-01: `rg -n "oklch\(|#[0-9a-fA-F]{3,8}\b|rgba?\(" src/app/globals.css` não retorna linhas.
- [x] CA-02: `rg -n "fc-panel|react-grid|\.dark \{|:root \{ *--background: oklch" src/app/globals.css` não retorna linhas; existe um único bloco com as variáveis shadcn.
- [x] CA-03: Uma página de teste temporária (ou o build do Tailwind) com as classes `bg-fc-glass border border-fc-rim text-fc-text-2 rounded-fc-lg fc-text-hero font-num` gera CSS para todas (verificar no `.next/static/css/*.css` com `grep`).
- [x] CA-04: `<html>` renderizado contém `class` com `dark`, `--font-geist-sans` e `--font-geist-mono`; não existe `<script>` de tema nem cookie `fc_theme`.
- [x] CA-05: `getComputedStyle(document.body).backgroundColor` no navegador equivale a `rgb(4, 6, 11)` (valor de `--fc-void`) e `getComputedStyle(document.documentElement).colorScheme` é `dark`.
- [x] CA-06: Os componentes `Button`, `Input`, `Select`, `Dialog`, `Sheet`, `Card`, `Badge` de `src/components/ui` renderizam legíveis (contraste de texto >= 4.5:1 sobre o fundo) em uma página de verificação temporária (não commitar) — registrar capturas/medições em "Validação".
- [x] CA-07: Em um iPhone (ou emulação 390x844 com Safari/WebKit), focar um `<input>` não dá zoom (fonte computada >= 16px).
- [x] CA-08: `npm run lint`, `npm test`, `npx next build` e `npm run format:check` passam.
- [x] CA-09: `src/styles/tokens.css` difere do original **apenas** nas 4 linhas `--fc-font-*` (verificar com `git diff --stat` e `git diff`).

## Impacto técnico
### Backend
Nenhum.
### Frontend
Reescrita de `src/app/globals.css`; edição de `src/app/layout.tsx` (fontes, `<html>`); ajuste de 4 linhas em `src/styles/tokens.css`. Componentes shadcn passam a herdar a nova paleta sem edição; se algum tiver cor literal (`bg-white`, `text-black`, `slate-*`, `#...`), listar em "Pendências" para a F0-04.
### Banco de dados
Nenhum.
### Integrações
`next/font/google` (build baixa as fontes; sem chamada em runtime).
### Segurança
Nenhum impacto.

## Plano de implementação
- [ ] Etapa 1 — Ler `src/styles/tokens.css`, `src/app/globals.css` e `src/app/layout.tsx` (já editado pela F0-01) e as docs do Tailwind v4 sobre `@theme inline`/`@utility`.
- [ ] Etapa 2 — Reescrever `src/app/globals.css` conforme as seções 1 a 4. Conferir que `tw-animate-css` e `shadcn/tailwind.css` continuam importados.
- [ ] Etapa 3 — Ajustar as 4 pilhas de fonte em `src/styles/tokens.css`.
- [ ] Etapa 4 — Editar `src/app/layout.tsx` (Geist/Geist Mono, `preload: false`, classe `dark`, `colorScheme`).
- [ ] Etapa 5 — Criar página temporária `src/app/(dev)/tokens/page.tsx` (não commitar) com amostras de todos os tokens e dos componentes shadcn; conferir no navegador (CA-03 a CA-07).
- [ ] Etapa 6 — Varrer `src/components/ui/*` por cores literais e registrar achados.
- [ ] Etapa 7 — `npm run lint && npm run format:check && npm test && npx next build`.
- [ ] Etapa 8 — Atualizar `docs/ui/` (tabela de mapeamento shadcn -> tokens) e `.agents/context/CONTEXT.md`; commit `refactor(f0-03): tokens dark glass no tailwind v4 e fontes geist`.

## Estratégia de testes
- [ ] Unitários: teste Vitest `src/styles/tokens.test.ts` que lê `tokens.css` e `globals.css` como texto e falha se: (a) `globals.css` contiver cor literal (`#hex`, `rgb(`, `rgba(`, `hsl(`, `oklch(`); (b) algum `--color-fc-*` do `@theme` apontar para um token `--fc-*` inexistente; (c) algum `var(--fc-*)` usado em `globals.css` não estiver definido em `tokens.css`; (d) existir um mapeamento shadcn obrigatório ausente (`--background`, `--foreground`, `--primary`, `--border`, `--ring`).
- [ ] Integração: `npx next build` e inspeção do CSS gerado (CA-03).
- [ ] E2E: não aplicável.
- [ ] Manual: página temporária no Chrome (390x844) e, se possível, em Safari/iPhone real: aparência dos tokens, foco sem zoom, fundo sem flash branco no overscroll.

## Riscos e rollback
- **Utilitário não gerado** por erro de sintaxe do `@theme inline`: mitigado por CA-03 e pelo teste (b).
- **Contraste insuficiente** de componentes shadcn com `--muted-foreground: var(--fc-text-2)` (66% de opacidade): medir e, se falhar, ajustar o mapeamento (não o token) e registrar.
- **Geist não carrega em build offline**: `next/font/google` precisa de rede no build; a Vercel tem. Em ambientes sem rede, usar `next/font/local` com o pacote `geist` (decisão a registrar).
- **Conflito de merge com F0-01** em `layout.tsx`: F0-01 entra primeiro; rebase local.
- Rollback: `git revert` do commit (volta o Apex); nenhum dado é afetado.

## Registro de execução
### Alterações realizadas
- `src/app/globals.css` reescrito: imports (`tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`, `../styles/tokens.css`), `@custom-variant dark`, `@theme inline` (cores shadcn, cores `--color-fc-*` para todos os tokens de superfície/texto/acento/semântica/`cat-1..10`, raios shadcn + `--radius-fc-*`, fontes, `--shadow-fc-*`, `--spacing-fc-gutter/tabbar/touch`, `--ease-fc*`), bloco `:root` único com as variáveis shadcn mapeadas para `var(--fc-*)`, `@layer base` e `@utility` para `fc-blur-*`, `fc-text-*` e `fc-tabular`. Removidos: tema Apex claro/escuro, `.fc-panel*` e CSS do `react-grid-layout`.
- `src/styles/tokens.css`: apenas as 4 pilhas `--fc-font-*` (casam com `--font-geist-sans`/`--font-geist-mono` do `next/font`; `ui-rounded` na pilha numérica).
- `src/app/layout.tsx`: somente fontes; `Geist`/`Geist_Mono` (`display: 'swap'`, `preload: false`) no lugar de Inter/JetBrains Mono. `ThemeProvider`, cookie e `getThemeScript` NÃO foram tocados (F0-01 remove).
- `src/styles/tokens.test.ts` (novo, 7 testes): sem cor literal em `globals.css`; todo `var(--fc-*)` usado existe em `tokens.css`; todo `--color-fc-*` aponta para o token homônimo; todas as cores esperadas estão expostas; mapeamentos shadcn obrigatórios em bloco `:root` único e sem `.dark`; sem resquício `fc-panel`/`react-grid`; pilhas de fonte casam com `next/font`.
- `docs/ui/design-system.md`: nova seção "Integração com Tailwind v4 e shadcn" (utilitários, tabela shadcn -> tokens, contraste medido, base e fontes).
### Arquivos principais
`src/app/globals.css`, `src/styles/tokens.css`, `src/app/layout.tsx`, `src/styles/tokens.test.ts`, `docs/ui/design-system.md`.
### Decisões
- `--radius: var(--fc-radius-md)` (16px, equivale ao `1rem` da task) para não declarar valor literal.
- Extras além da task, todos derivados de tokens: `--spacing-fc-gutter|tabbar|touch` (`p-fc-gutter`, `h-fc-tabbar`, `min-h-fc-touch`).
- Nos `@utility fc-blur-*`, `-webkit-backdrop-filter` vem ANTES de `backdrop-filter`: com a ordem inversa o Lightning CSS (minificador do Next) descartou a declaração sem prefixo no build.
- `.agents/context/CONTEXT.md` não foi alterado (instrução do orquestrador; a etapa 8 fica para o orquestrador).
### Divergências
- O worktree estava num commit anterior ao bootstrap; foi feito `git merge --ff-only main` (branch sem commits próprios) para obter `.agents/` e `src/styles/tokens.css`.
- CA-04 só fecha após o merge da F0-01: no worktree o `<html>` ainda renderiza `data-theme="light"`, `style="color-scheme:light"` e o `<script>` de tema do 1.x (as classes `geist_*__variable` das duas fontes estão presentes).
- CA-06 foi medido numericamente (contraste WCAG calculado a partir dos tokens), sem página de verificação no navegador, que exigiria sessão autenticada; uma página temporária `(dev)/tokens` serviu só para gerar as classes no build e foi apagada.
### Pendências
- Cores literais em `src/components/ui/*` (para a F0-04): `button.tsx` (linhas 22-27: `#38BDF8`, `#29ABE2`, `#10B981`, `#0EA572`, `text-white`, `text-sky-700/800/200`), `confirm-dialog.tsx` (65: `bg-red-100`, `text-red-600`, `bg-red-950/40`, `text-red-400`), `date-picker.tsx` (150, 157, 208-212: `text-sky-*`, `#38BDF8`, `#29ABE2`, `text-white`), `dialog.tsx` (31) e `sheet.tsx` (31): `bg-black/10` no overlay. Há também 20 ocorrências de `dark:`/`bg|text-white|black` em 9 arquivos (inócuas, pois o app é sempre dark).
- `prettier --check` já falha em `src/styles/tokens.css` (comentários alinhados) e `docs/ui/design-system.md` (tabelas) na versão original; e em ~418 arquivos neste checkout Windows por CRLF (`core.autocrlf=true` vs. `endOfLine` padrão `lf`). Não é regressão desta task; sugerir `endOfLine: 'auto'`/`.gitattributes` ou `.prettierignore` para `tokens.css` em task de tooling.
- Medir no iPhone real: foco sem zoom e fundo sem flash no overscroll (CA-05/CA-07 foram verificados em Chrome headless, não em Safari).

## Validação
- `npm run lint`: 0 erros, 1 warning pré-existente (`MoreVertical` não usado em `src/app/(app)/categories/category-list-card.tsx`, código 1.x).
- `npm test`: 18 arquivos, 131 testes passam (inclui os 7 de `src/styles/tokens.test.ts`).
- `npm run format:check`: falha por arquivos fora do escopo (CRLF do checkout Windows em ~418 arquivos; `tokens.css` e `design-system.md` já falhavam antes). `globals.css` e `tokens.test.ts` passam; `layout.tsx` só difere por CRLF (`--end-of-line auto` passa).
- `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: compilou (Geist baixado do Google Fonts) e gerou todas as rotas.
- CA-01: `grep -n -E "oklch\(|#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\("` em `globals.css` -> nenhuma linha.
- CA-02: `grep -n -E "fc-panel|react-grid|\.dark \{|:root \{ *--background: oklch"` -> nenhuma linha; um único `:root`.
- CA-03: em `.next/static/chunks/*.css` existem `.bg-fc-glass{background-color:var(--fc-glass)}`, `.border-fc-rim`, `.text-fc-text-2`, `.rounded-fc-lg{border-radius:var(--fc-radius-lg)}`, `.fc-text-hero{font:var(--fc-text-hero);letter-spacing:-.035em;font-variant-numeric:tabular-nums}`, `.font-num{font-family:var(--fc-font-num)}`, `.shadow-fc-card`, `.fc-blur-card{-webkit-backdrop-filter:...;backdrop-filter:...}`, `.bg-fc-cat-3`, `.text-fc-in`, `.rounded-fc-pill`, `.fc-text-caption`, `.fc-text-amount`, `.fc-text-title`, `.fc-tabular`, `.h-fc-tabbar`, `.min-h-fc-touch`, `.p-fc-gutter`, `.ease-fc`. O CSS de `react-grid-layout` que ainda aparece no build vem do import de CSS de componentes 1.x (some com a F0-01), não de `globals.css`.
- CA-04: PARCIAL. `curl /login` (next start): `<html>` com `geist_..._variable` e `geist_mono_..._variable`; ainda traz `data-theme="light"`, sem `dark`, e o `<script>` de tema, porque `layout.tsx` 1.x foi preservado a pedido. Fecha após o merge da F0-01.
- CA-05: Chrome headless (HTML estático com o CSS buildado, `class="dark"`): `body` `backgroundColor = rgb(4, 6, 11)`, `html` idem, `colorScheme = dark`, `color = rgb(238, 242, 255)`, `bg-primary = rgb(140, 155, 255)`. Com `--font-geist-sans` definida, `body` resolve para `-apple-system, BlinkMacSystemFont, "SF Pro Text", <geist>, system-ui, sans-serif`.
- CA-06 (contraste WCAG calculado dos tokens, alfa composto): foreground/background 18,13; card-fg/card 16,41; muted-fg/background 7,20; muted-fg/card 6,92; muted-fg/muted 7,03; primary-fg/primary 7,52; secondary-fg/secondary 15,81; accent-fg/accent 10,56; destructive/background 8,16; success/background 12,63; warning/background 13,52; ring/background 7,96. Todos >= 4,5:1 (ring >= 3:1). `--fc-text-3`/background = 3,44, não usado nos mapeamentos shadcn e documentado como texto não essencial. Limitação: `Button`, `ConfirmDialog` e `DatePicker` ainda têm cores literais próprias (ver Pendências); medido só nos pares de token.
- CA-07: `input` com `class="h-8"` tem `font-size` computado 16px no Chrome headless (regra `max(16px, 1em)`).
- CA-09: `git diff src/styles/tokens.css` altera apenas as 4 linhas `--fc-font-*`.

### Parecer QA (qa-revisor) — APROVADO
Estado revisado: `c3c3d2d` (F0-03 + merge da F0-01). Comandos executados no worktree:
- `npm run lint`: 0 erros/warnings. `npm test`: 7 arquivos, 62 testes passam (25 em `tokens.test.ts`, 18 novos escritos na revisão). `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: compilou, TypeScript ok, 9 páginas.
- `npx prettier --check --end-of-line auto` em `globals.css`, `layout.tsx`, `tokens.test.ts`: passam. `tokens.css` e `docs/ui/design-system.md` falham, e `tokens.css` já falhava em `52ebf67` (pré-existente) -> pendência para FC2-F0-07 (tooling).
- CA-01: nenhuma cor literal em `globals.css`/`layout.tsx`. CA-02: um único `:root`, sem `.dark`/`fc-panel`/`react-grid`/Apex.
- CA-03: `.next/static/chunks/*.css` contém `bg-fc-glass`, `border-fc-rim`, `text-fc-text-2`, `rounded-fc-lg`, `fc-text-hero` (font + letter-spacing -.035em + tabular-nums), `font-num`, `fc-blur-card` (com `-webkit-` antes), `fc-text-caption` (uppercase, .06em). Observação: o Tailwind v4 detecta classes também em comentários de `globals.css` e em `.md` (docs/tasks), então a presença no CSS não prova uso real; o utilitário em si gera corretamente.
- CA-04: `next start -p 3103` + `curl /login`: `<html lang="pt-BR" class="geist_..variable geist_mono_..variable dark h-full antialiased" style="color-scheme:dark">`; 0 ocorrências de `fc_theme`/`data-theme`/script de tema; sem Set-Cookie.
- CA-09: `git diff 52ebf67..HEAD -- src/styles/tokens.css` altera só as 4 linhas `--fc-font-*`.
- Tabela shadcn -> tokens conferida linha a linha em `globals.css:121-163`: conforme (`--radius` usa `var(--fc-radius-md)` = 16px em vez do literal `1rem`, equivalente e sem literal).
- Achados menores: (1) pilhas de fonte usam `var(--font-geist-*)` sem fallback; se a variável não existir (ex.: `global-error`, que renderiza o próprio `<html>`, ou teste/storybook sem a classe) a declaração `--fc-font-*` fica inválida e o `font` shorthand cai no padrão do navegador; sugestão `var(--font-geist-sans, system-ui)` (desvia da redação literal da task, decidir no orquestrador). (2) cores literais em `src/components/ui/*` (button, date-picker, confirm-dialog, dialog, sheet) seguem como pendência da F0-04.
- Testes adicionados na revisão (`src/styles/tokens.test.ts`): ordem `-webkit-backdrop-filter` -> `backdrop-filter` nos 3 `fc-blur-*`; shorthand `font` das 8 `fc-text-*`; letter-spacing de hero/title/caption e uppercase; tabular-nums (RN-05); base (16px, color-scheme, overscroll, body); fontes/raios/sombras/ease no `@theme`; `layout.tsx` (classe `dark`, `colorScheme`, sem ThemeProvider/cookie/script, Geist com `preload: false`).

## Handoff
Link para o handoff ativo, quando aplicável.
