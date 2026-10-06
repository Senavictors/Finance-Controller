---
id: FC2-F0-09
title: Endurecer o guard de cores/estilos literais (achados da revisão da F0-04)
status: completed
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
- [x] CA-01: cada padrão listado em "Problema" tem teste positivo (detecta) e o guard falha com arquivo:linha.
- [x] CA-02: falsos positivos controlados: `href="#abc"` decidido e documentado; `transparent` em CSS puro continua permitido (decisão da F0-04) ou é substituído por token — registrar.
- [x] CA-03: zero durações Tailwind literais (`duration-[0-9]`) em `src/components/**`.
- [x] CA-04: teste garante que hex de cor só aparece em `src/styles/tokens.css`, `src/lib/brands/**`, manifest/ícones (allowlist por caminho, com motivo).
- [x] CA-05: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.

## Registro de execução
### Alterações realizadas
- `tests/guards/literal-colors.ts` reescrito (continua puro): regras agora são funções `find(linha)`; `ALLOWED_PATHS` com `{prefix, reason}` (e `ALLOWED_PATH_PREFIXES` derivado); novos `ViolationKind` `named-color`, `zero-alpha`, `literal-duration`; `scanHexOnly()` para o teste de propriedade das cores.
- Padrões novos detectados (CA-01): cores nomeadas CSS (lista CSS Color 4) em declaração CSS/JS (`color: red`, `border: 1px solid white`, `box-shadow ... black`, `boxShadow`/`filter: drop-shadow` inline, custom property `--x: ...`), em valor arbitrário Tailwind (`bg-[red]`, `shadow-[0_0_4px_black]`, `[color:red]`), dentro de `color-mix()` (em ou fora de declaração), `color(display-p3 ...)`, atributos SVG/ícone (`fill`, `stroke`, `stopColor`, `color`...), `transparent` em string de estilo JS e em atributo, alfa zero em token (`bg-fc-iris/0`), durações literais (`duration-*`/`delay-*` numéricos ou arbitrários, `animate-[..1s..]`, `transition`/`animation` com ms/s em CSS ou estilo inline; `0s` aceito).
- `tests/guards/no-literal-colors.test.ts`: tabela de 36 casos positivos e 25 negativos montados em runtime (padrões como strings), teste de `arquivo:linha`, marcador com/sem motivo, decisões de `href="#abc"`, e o teste CA-04 (hex só em `tokens.css`, `src/lib/brands/**`, manifest/ícones, `public/brands|icons`, com motivo por entrada; varre `src/**` e `public/**`). A fixture sintética existente não foi editada (só o rename da F0-07, já na base após `git merge --ff-only main`).
- `src/components/ui/{date-picker,dialog,dropdown-menu,select,sheet}.tsx`: `duration-100/150/200` trocados por `duration-(--fc-dur-fast)` (CA-03: `grep -rE "duration-[0-9\[]" src/components` = 0). Aparência: 100/150/200 ms viram 180 ms (fast); com `prefers-reduced-motion` o token vira 1 ms, o que o shadcn herdado antes não respeitava.
- `docs/ui/componentes.md` (seção "Regra anti-cor-literal" reescrita) e `docs/ui/design-system.md` (aponta para ela); `ultima-revisao: FC2-F0-09`.
### Decisões
- `transparent` em CSS puro (paradas de gradiente, `border-right-color`, tap highlight, final de `color-mix()`) continua permitido (decisão da F0-04 mantida); como utilitário Tailwind, em string de estilo JS (`background: 'transparent'`, `border: '1px solid transparent'`) ou em atributo SVG (`fill="transparent"`) continua proibido.
- `href="#abc"`: âncoras e referências (`href|to|src|action|xlinkHref="#.."`, `url(#id)`, entidades `&#add;`) NÃO são hex e ficam fora. `#abc` em qualquer outro contexto (inclusive na mesma linha de um `href`) segue sendo hex. Documentado em `componentes.md`.
- `border-fc-void/0`: mantido como a única forma aceita de "borda invisível" (reserva 1px de layout para `focus-visible:border-ring` em ui/badge, ui/button, ui/scroll-area e fc/button ghost; trocar por `border-0` mudaria o layout em 1px e `border-transparent` é proibido). O guard passou a acusar qualquer outro alfa zero em token (`bg-fc-iris/0`, `text-fc-void/0`...), então o idioma não vira porta dos fundos. Pendência: token de "sem cor" (ver Pendências).
- Durações: `--fc-dur-fast` (180 ms) escolhido para as 4 durações herdadas (100/150/200 ms); `--fc-dur-base` (380 ms) deixaria o dialog/sheet lento.
### Pendências
- Token de "sem cor" (ex.: `--fc-clear: transparent` + utilitário `border-fc-clear`) em `src/styles/tokens.css` para substituir o idioma `border-fc-void/0` (não toquei em `tokens.css`; propor ao orquestrador/ADR-018).
- O guard não cobre `rounded-lg`/`shadow-lg`/`shadow-xl`/`rounded-xl` herdados do shadcn em `ui/*` (raio/sombra literais do Tailwind; QA M-2). Fora do escopo desta task (exigiria remapear a escala do Tailwind para tokens em `globals.css`).
- Nada acusado em `src/app/**`: o guard novo passa limpo nele.
- Após `git merge --ff-only main` (F0-07) o worktree já tem a fixture renomeada; o teste referencia `sintetico-violations.tsx.txt`.
- `npm run format:check` (sem `--end-of-line auto`) falha neste checkout Windows (CRLF do autocrlf, 295 arquivos, pré-existente); com `--end-of-line auto` os arquivos tocados passam, exceto `docs/ui/design-system.md`, que já falhava em `HEAD` (verificado) e cuja única mudança minha é uma frase.
- Em checkouts com os arquivos legados untracked do CRA (`src/components/*.css`, `src/App.css`...) o guard (antigo e novo) falha neles; não existe no worktree/CI.

## Validação
Worktree `agent-a8bc8b5ca76b19001` (Node do ambiente, `DATABASE_URL` sintética, sem `npm run build`/prisma):
- `npm run lint`: limpo. `npx tsc --noEmit`: limpo. `npm test`: 21 arquivos / 311 testes OK (após merge com a F0-07; guard: 3 -> 79 testes). `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: OK.
- `npx prettier --check --end-of-line auto` em `tests/guards/*.ts`, `src/components/ui/*.tsx`, `docs/ui/componentes.md`: OK.
- Provas negativas (arquivo temporário em `src/components/fc/`, revertido): `duration-150`, `bg-[red]`, `shadow-[0_0_4px_black]`, `border: '1px solid white'`, `boxShadow: '0 0 4px black'`, `fill="white"`, `color-mix(in srgb, white ...)`, `bg-fc-iris/0` => guard falhou com `arquivo:linha` para cada um. Hex `#8A05BE` em `src/lib/zz-proof.ts` => teste CA-04 falhou com `src/lib/zz-proof.ts:1`. Arquivos removidos; suíte voltou a 228/228.

### Revisão QA (qa-revisor, 2026-10-05)
Parecer: APROVADO com achados importantes de falso positivo (não bloqueantes; ver abaixo).
- Comandos reexecutados no worktree: `npm run lint` limpo; `npm run typecheck` limpo; `npm test` 21 arquivos / 311 testes OK em ~3,4 s (guard ~1,5 s para 125 testes dos 3 arquivos de guards); `npm run guard:data` OK; `npx prettier --check --end-of-line auto .` OK; `DATABASE_URL=<sintetica> npx next build` OK. O CSS gerado traz `.duration-(--fc-dur-fast){transition-duration:var(--fc-dur-fast)}`.
- Provas negativas próprias (arquivo temporário em `src/components/fc/`, removido): `bg-[red]`, `duration-150`/`duration-200`, `border: '1px solid white'`, `boxShadow ... black`, `fill="white"`/`stroke="black"`, `color-mix(in srgb, white ...)`, `bg-fc-iris/0`, `[color:red]`, `color(display-p3 ...)`, `shadow-[0_0_4px_black]` => todos acusados com `arquivo:linha`. CA-04: hex sintético em `src/lib/` acusado com `src/lib/<arquivo>:1`. Arquivos removidos; árvore limpa.
- Falsos positivos medidos (sondas descartadas): texto pt-BR/UI e comentários soltos NÃO geram falso positivo (`aria-label="Saldo em white list"`, `// cor red do alerta`, `"Black Friday"`, `title="Gold member"`, `href="#id"`, `url(#grad)`, `mask-image: linear-gradient(black, transparent)`, `className` com `bg-[url(/red.png)]`/`border-[color:var(--fc-rim)]`). Geram falso positivo (achados I-1, M-1, M-2 abaixo): comentário na mesma linha de uma propriedade de cor e outras chaves/textos na mesma linha após uma propriedade de cor.

## Registro de execução (ciclo 1, correção dos achados da revisão QA)
- I-1 (comentário na mesma linha): `stripComments()` (exportada, em `tests/guards/literal-colors.ts`) troca `//…` e `/*…*/` por espaços de mesmo tamanho, respeitando strings e URLs (`https://`, `url(//cdn…)`: `//` só abre comentário no início da linha ou depois de espaço/`;`/`,`/`{`/`}`/`)`/`]`). As regras por região (cor nomeada em declaração, `color-mix()`, SVG/atributos, transição/animação) avaliam a linha sem comentários; as regras simples (hex, `rgb(`, classes de paleta, `duration-*`) continuam na linha inteira, então hex ou `bg-red-500` em comentário seguem acusados (decisão: comentário com cor literal ainda é dívida; o marcador `fc-allow-literal-color` continua lendo a linha original).
- M-1 (duas chaves na linha): o valor da declaração agora é limitado à chave (`limitToKey`): com aspas, só o literal (e os concatenados com `+`); sem aspas, até a próxima chave da linha (`, label:`). Vírgulas de CSS (`transition: a 1s, b 2s`, gradientes) não cortam. A declaração passou a usar lookahead, então a próxima propriedade da linha (`{ color: 'var(--a)', borderColor: 'white' }`) continua sendo encontrada. `color-mix(` é limitado ao parêntese que fecha.
- M-2 (`{ color: user.green }`): resolvido naturalmente; nome de cor não casa quando antecedido por `.`/`$` nem quando seguido de `.identificador` (`user.green`, `green.main`).
- M-3 (duplicados): achados deduplicados por posição do token na linha (o mais longo fica: `[color:red`, `--x: color-mix(in srgb, white`).
- Testes: guard passou de 125 para 154 testes (suíte total 311 -> 340). Novos: 9 negativos de comentário (`// vermelho (red)`, `/* red when overdue */`, `// gold`, `// 200ms antes`, bloco no meio, URL), 11 negativos de chaves/texto/propriedade (`name: 'Coral'`, `label: 'Red Bull'`, Peru, Gold, Tan, Linen, Magenta, `user.green`, `green.main`...), positivos que continuam acusados (`color: 'red', // comentário`, `'white' /* branco */`, segunda chave da linha, `transitionDelay: '50ms'` depois de transição com token, concatenação, ternário, gradiente CSS), hex/paleta em comentário, marcador com cor antes do comentário, deduplicação, e 3 testes de `stripComments`.
- Limites conhecidos: comentário de bloco multilinha (` * texto`) não é rastreado entre linhas (só `//` e `/*…*/` na própria linha); valor sem aspas contendo outra chave que não comece depois de vírgula não é cortado.
- Validação: `npm run lint`, `npm run typecheck`, `npm test` (21 arquivos / 340 testes), `npm run guard:data`, `npx prettier --check --end-of-line auto tests docs/ui/componentes.md`: todos OK.

### Re-revisão QA (qa-revisor, 2026-10-05, HEAD 06294ab)
Parecer: APROVADO. I-1, M-1, M-2 e M-3 fechados; sem regressão.
- Comandos reexecutados no worktree: `npm run lint` limpo; `npm run typecheck` limpo; `npm test` 21 arquivos / 340 testes OK; `npm run guard:data` OK (exit 0); `npx prettier --check --end-of-line auto .` OK; `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build` OK.
- Sondas próprias (teste temporário de 32 casos via `scanContent`, apagado): 15 negativos sem violação (`color: 'var(--fc-out)', // vermelho (red)`; `/* red when overdue */`; `// gold`; `/* 200ms antes */` após `transition` com token; `{ color: 'var(--fc-cat-1)', name: 'Coral' }`; `{ borderWidth: 1, label: 'Red Bull' }`; `name: 'Coral'`; `label: 'Red Bull'`; `'https://example.com/red'`; `href: 'https://white.com'` após cor com token; `url(//cdn...)`; `{ color: user.green }`; comentário antes/depois de `color: var(--fc-ink)`; `label: "Tan"`, `title: 'Gold member'`) e 17 positivos acusados (`color: 'red', // x`; `{ color: 'var(--a)', borderColor: 'white' }`; `'red' /* x */`; ternário; concatenação com `'red'`; `color: white; // https://x`; `https://a` seguido de estilo literal; gradiente com `// grad`; `boxShadow ... black, // sombra`; duas declarações com comentário no meio; chave de rótulo antes da cor; `#abc`, `bg-red-500` e `transition: ... 200ms` com comentário na linha).
- Regressão: o diff do arquivo de teste tem 0 linhas removidas; os 36 positivos e 25 negativos originais seguem na tabela e passam.
- Decisão "hex/paleta em comentário continuam acusados": aceitável (hex e classes de paleta são buscados na linha inteira, comentário com cor literal é dívida e há o marcador `fc-allow-literal-color` com motivo; documentado em `docs/ui/componentes.md`).
- Achados menores (não bloqueantes, já documentados como limites conhecidos): (m-1) comentário de bloco multilinha não é rastreado entre linhas; um ` * color: red` dentro de bloco seria acusado, improvável na prática. (m-2) valor sem aspas com outra chave que não começa depois de vírgula não é cortado.
